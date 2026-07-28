import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initProject } from "../src/core/bootstrap.js";
import { InteractionUpdateSchema } from "../src/core/schemas.js";
import { IC_DIR, PATHS, SUBDIRS, ic } from "../src/storage/paths.js";
import {
	captureUpdate,
	evolveFromInbox,
	verifyLedger,
} from "../src/storage/persist.js";
import { eventCount, openDb } from "../src/storage/sqlite.js";

let tmp: string;
let originalCwd: string;

beforeEach(() => {
	originalCwd = process.cwd();
	tmp = mkdtempSync(join(tmpdir(), "ic-bootstrap-"));
	process.chdir(tmp);
});

afterEach(() => {
	process.chdir(originalCwd);
	rmSync(tmp, { recursive: true, force: true });
});

describe("initProject", () => {
	it("creates a fresh project and refuses a second init without --force", () => {
		initProject({ projectName: "Demo" });
		expect(existsSync(PATHS.currentYml())).toBe(true);
		expect(() => initProject({ projectName: "Demo" })).toThrow(
			/already initialized/,
		);
		initProject({ projectName: "Demo2", force: true });
		const db = openDb(PATHS.db());
		// Force wipe means a single project_initialized on a new chain.
		expect(eventCount(db)).toBe(1);
		db.close();
	});
});

describe("evolveFromInbox + project_id guard", () => {
	it("rejects an inbox whose project_id does not match the ledger", () => {
		initProject({ projectName: "Demo" });
		for (const d of SUBDIRS) mkdirSync(ic(d), { recursive: true });
		writeFileSync(
			PATHS.inboxUpdate(),
			[
				"kind: interaction_update",
				'id: "u-wrong"',
				'project_id: "Other"',
				"iteration: 0",
				'created_at: "2026-05-21T00:00:00.000Z"',
				'trigger: "manual_checkpoint"',
				'what_changed: "x"',
				'next_action_delta: ["n"]',
			].join("\n"),
		);
		const db = openDb(PATHS.db());
		try {
			expect(() => evolveFromInbox({ db })).toThrow(
				/does not match ledger project_id/,
			);
		} finally {
			db.close();
		}
	});

	it("evolves under lock and leaves verify clean", () => {
		initProject({ projectName: "Demo" });
		writeFileSync(
			PATHS.inboxUpdate(),
			[
				"kind: interaction_update",
				'id: "u-ok"',
				'project_id: "Demo"',
				"iteration: 0",
				'created_at: "2026-05-21T00:00:00.000Z"',
				'trigger: "manual_checkpoint"',
				'what_changed: "checkpoint"',
				"confirmed:",
				'  - belief: "schema first"',
				'    evidence: "review"',
				"next_action_delta:",
				'  - "write tests"',
			].join("\n"),
		);
		const db = openDb(PATHS.db());
		try {
			const outcome = evolveFromInbox({ db });
			expect(outcome.record.to_iteration).toBe(0);
			expect(existsSync(PATHS.inboxUpdate())).toBe(false);
			const v = verifyLedger(db);
			expect(v.ok).toBe(true);
			expect(v.inSync).toBe(true);
			expect(v.currentYmlOk).toBe(true);
		} finally {
			db.close();
		}
	});
});

describe("captureUpdate idempotency", () => {
	it("does not append a second capture event for the same id", () => {
		initProject({ projectName: "Demo" });
		const parsed = InteractionUpdateSchema.parse({
			kind: "interaction_update",
			id: "u-dup",
			project_id: "Demo",
			iteration: 0,
			created_at: "2026-05-21T00:00:00.000Z",
			trigger: "manual_checkpoint",
			what_changed: "x",
		});
		const db = openDb(PATHS.db());
		try {
			const first = captureUpdate(db, parsed);
			const countAfterFirst = eventCount(db);
			const second = captureUpdate(db, parsed);
			expect(first.alreadyPresent).toBe(false);
			expect(second.alreadyPresent).toBe(true);
			expect(eventCount(db)).toBe(countAfterFirst);
		} finally {
			db.close();
		}
	});
});

// silence unused IC_DIR import guard if tree-shaken — keep for clarity of layout
void IC_DIR;
