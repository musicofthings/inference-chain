import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureLedgerFile } from "../src/storage/jsonl.js";
import { IC_DIR, PATHS, SUBDIRS, ic } from "../src/storage/paths.js";
import {
	appendChainEvent,
	resolveInboxSource,
	verifyLedger,
} from "../src/storage/persist.js";
import { eventCount, hasUpdate, openDb } from "../src/storage/sqlite.js";

// In-process so it is deterministic across platforms: a single SQLite handle
// means no cross-process WAL visibility timing (which made the previous
// subprocess version flaky on Windows). cwd is swapped because PATHS resolves
// relative to process.cwd().
let tmp: string;
let originalCwd: string;

beforeEach(() => {
	originalCwd = process.cwd();
	tmp = mkdtempSync(join(tmpdir(), "ic-verifyledger-"));
	process.chdir(tmp);
	mkdirSync(IC_DIR, { recursive: true });
	for (const d of SUBDIRS) mkdirSync(ic(d), { recursive: true });
	ensureLedgerFile(PATHS.ledgerJsonl());
});

afterEach(() => {
	process.chdir(originalCwd);
	rmSync(tmp, { recursive: true, force: true });
});

describe("verifyLedger content parity", () => {
	it("ignores snapshot ledger_evolved when checking current.yml tip", () => {
		const db = openDb(PATHS.db());
		appendChainEvent(db, {
			projectId: "p",
			iteration: 0,
			type: "project_initialized",
			payload: {},
		});
		appendChainEvent(db, {
			projectId: "p",
			iteration: 0,
			type: "ledger_evolved",
			payload: { from: 0, to: 0, source: "session" },
		});
		writeFileSync(
			PATHS.currentYml(),
			[
				"kind: chain_ledger",
				'schema_version: "1.0.0"',
				'project_id: "p"',
				"iteration: 0",
				'updated_at: "2026-01-01T00:00:00Z"',
				'global_objective: "x"',
				"current_operating_model:",
				'  summary: "s"',
				"  confidence: medium",
				"stable_learnings: []",
				"active_hypotheses: []",
				"rejected_hypotheses: []",
				"stable_decisions: []",
				"recurring_failure_patterns: []",
				"open_questions: []",
				"current_frontier:",
				"  next_best_action: []",
				"  blockers: []",
				"  risks: []",
				"do_not_repeat: []",
				'continuity_summary: "init"',
				"",
			].join("\n"),
		);
		appendChainEvent(db, {
			projectId: "p",
			iteration: 99,
			type: "ledger_evolved",
			payload: { snapshot: "ledger-99-abc", iteration: 99, source: "snapshot" },
		});
		const v = verifyLedger(db);
		expect(v.ok).toBe(true);
		expect(v.currentYmlOk).toBe(true);
		expect(v.currentYmlErrors).toHaveLength(0);
		db.close();
	});

	it("passes when jsonl and sqlite agree, fails on sqlite hash drift", () => {
		const db = openDb(PATHS.db());
		appendChainEvent(db, {
			projectId: "p",
			iteration: 0,
			type: "project_initialized",
			payload: {},
		});
		const last = appendChainEvent(db, {
			projectId: "p",
			iteration: 0,
			type: "resume_brief_generated",
			payload: { iteration: 0 },
		});

		let v = verifyLedger(db);
		expect(v.ok).toBe(true);
		expect(v.inSync).toBe(true);
		expect(v.hashMismatches).toHaveLength(0);

		// Corrupt only the sqlite mirror; jsonl (the source of truth) stays
		// intact, so the row count still matches but content has drifted. A
		// count-only check would miss this.
		db.prepare("UPDATE events SET hash = ? WHERE id = ?").run(
			"deadbeef",
			last.id,
		);

		v = verifyLedger(db);
		expect(v.ok).toBe(true);
		expect(v.inSync).toBe(false);
		expect(v.hashMismatches.some((m) => m.eventId === last.id)).toBe(true);
		db.close();
	});
});

describe("resolveInboxSource self-recording", () => {
	it("records the capture for a bare evolve and is idempotent", () => {
		const db = openDb(PATHS.db());
		writeFileSync(
			PATHS.inboxUpdate(),
			"kind: interaction_update\n" +
				'id: "u-bare"\n' +
				'project_id: "p"\n' +
				"iteration: 0\n" +
				'created_at: "2026-05-21T00:00:00.000Z"\n' +
				'trigger: "manual_checkpoint"\n' +
				'what_changed: "x"\n' +
				'next_action_delta: ["n"]\n',
		);

		const resolved = resolveInboxSource();
		expect(hasUpdate(db, "u-bare")).toBe(false);

		resolved.ensureCaptured(db);
		expect(hasUpdate(db, "u-bare")).toBe(true);

		const countAfterFirst = eventCount(db);
		resolved.ensureCaptured(db);
		expect(eventCount(db)).toBe(countAfterFirst);
		db.close();
	});
});
