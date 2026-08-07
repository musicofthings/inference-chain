import { resolveIcLaunch } from "./mcp.js";

/**
 * Hook command bodies, shared so the four hook-capable hosts (claude, codex,
 * grok, chatgpt) cannot drift apart the way their command bodies once did.
 */

/**
 * Same portability rule as the MCP configs: hook files get committed, so they
 * invoke `ic` from PATH unless the install explicitly pinned this machine.
 */
function icCommand(pin?: boolean): string {
	if (!pin) return "ic";
	const launch = resolveIcLaunch();
	return [launch.command, ...launch.prefixArgs]
		.map((part) => (part.includes(" ") ? JSON.stringify(part) : part))
		.join(" ");
}

export const RESUME_BRIEF_PATH = ".inference-chain/resumes/resume_latest.md";

/** Print the last resume brief into the new session's context. */
export function sessionStartHookCommand(): string {
	return `test -f ${RESUME_BRIEF_PATH} && cat ${RESUME_BRIEF_PATH} || true`;
}

/**
 * Apply whatever the agent left in the inbox and refresh the resume brief.
 *
 * Trailing `|| true` because a hook must never take the session down with it:
 * `ic` may not be on PATH, and the repo may have no ledger at all. `ic sync
 * --quiet` is silent in both cases and leaves a failed artifact in the inbox
 * for the next run.
 */
export function syncHookCommand(pin?: boolean): string {
	return `${icCommand(pin)} sync --quiet || true`;
}

/**
 * Compaction is about to discard the working context, so flush first and then
 * nudge — unlike Stop, PreCompact is rare enough for a reminder to be signal.
 */
export function preCompactHookCommand(
	pin?: boolean,
	checkpointHint?: string,
): string {
	const hint =
		checkpointHint ??
		"Consider /ic-checkpoint before compaction to preserve operating context.";
	return `${syncHookCommand(pin)}; echo "[inference-chain] ${hint}"`;
}
