import {
	closeSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeSync,
} from "node:fs";
import { dirname } from "node:path";

export type LockOptions = {
	/** Max time to wait for the lock before giving up. */
	timeoutMs?: number;
	/** A held lock older than this is treated as abandoned and broken. */
	staleMs?: number;
	/** Poll interval while the lock is contended. */
	pollMs?: number;
};

const DEFAULTS: Required<LockOptions> = {
	timeoutMs: 10_000,
	staleMs: 30_000,
	pollMs: 25,
};

// Same-process re-entrancy: ensureCaptured → appendChainEvent and
// evolveFromInbox → runEvolution nest under one logical critical section.
const heldLocks = new Set<string>();

// Busy-sleep without spawning timers — withLock is synchronous and runs
// inside a CLI process, so blocking the event loop briefly is acceptable
// and keeps the critical section purely synchronous.
function sleepSync(ms: number): void {
	const shared = new Int32Array(new SharedArrayBuffer(4));
	Atomics.wait(shared, 0, 0, ms);
}

/** True if `pid` still exists (signal 0). */
function pidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Break an abandoned lock via atomic rename so only one waiter wins the
 * race. Never steals from a still-living holder (even if mtime is stale).
 */
function tryBreakStaleLock(lockPath: string): void {
	let holderPid: number | undefined;
	try {
		const raw = readFileSync(lockPath, "utf8").split(/\s/)[0] ?? "";
		const parsed = Number.parseInt(raw, 10);
		if (Number.isFinite(parsed)) holderPid = parsed;
	} catch {
		// Unreadable lock — treat as abandoned.
	}
	if (holderPid !== undefined && pidAlive(holderPid)) return;

	const stolen = `${lockPath}.stale.${process.pid}.${Date.now()}`;
	try {
		renameSync(lockPath, stolen);
		rmSync(stolen, { force: true });
	} catch {
		// Another waiter won the rename race — retry open(wx).
	}
}

/**
 * Run `fn` while holding an exclusive cross-process lock backed by an
 * O_EXCL lockfile. Serializes the read-build-append critical section so two
 * `ic` processes (CLI, hooks, the long-lived MCP server) cannot fork the
 * hash chain by reading the same parent event concurrently.
 *
 * Re-entrant within a single process: nested withLock calls for the same
 * path run `fn` immediately without re-acquiring (needed so evolveFromInbox
 * can hold the lock across ensureCaptured + runEvolution).
 */
export function withLock<T>(
	lockPath: string,
	fn: () => T,
	options: LockOptions = {},
): T {
	if (heldLocks.has(lockPath)) {
		return fn();
	}

	const opts = { ...DEFAULTS, ...options };
	mkdirSync(dirname(lockPath), { recursive: true });
	const deadline = Date.now() + opts.timeoutMs;

	for (;;) {
		let fd: number | null = null;
		try {
			fd = openSync(lockPath, "wx");
			writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
			try {
				const age = Date.now() - statSync(lockPath).mtimeMs;
				if (age > opts.staleMs) tryBreakStaleLock(lockPath);
			} catch {
				// Lock vanished between open and stat — fine, just retry.
			}
			if (Date.now() >= deadline) {
				throw new Error(
					`Timed out after ${opts.timeoutMs}ms waiting for lock ${lockPath}.`,
				);
			}
			sleepSync(opts.pollMs);
			continue;
		}

		heldLocks.add(lockPath);
		try {
			return fn();
		} finally {
			heldLocks.delete(lockPath);
			closeSync(fd);
			rmSync(lockPath, { force: true });
		}
	}
}
