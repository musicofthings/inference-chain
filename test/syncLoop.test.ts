import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = process.cwd();
const cliPath = join(root, "dist", "cli.js");
let tmp: string;

function run(args: string[], cwd = tmp) {
	const res = spawnSync("node", [cliPath, ...args], { cwd, encoding: "utf8" });
	return {
		status: res.status ?? 1,
		stdout: res.stdout ?? "",
		stderr: res.stderr ?? "",
	};
}

const brief = (id: string) =>
	[
		'kind: "session_brief"',
		'schema_version: "1.0.0"',
		`id: "${id}"`,
		'project_id: "Demo"',
		"iteration: 0",
		'created_at: "2026-05-21T00:00:00.000Z"',
		"session_intent:",
		'  primary_goal: "ship it"',
		'  what_agent_was_doing: "testing"',
		"working_theory:",
		'  summary: "the loop closes without human commands"',
		"  confidence: high",
		"actions_attempted: []",
		"outcomes_observed: []",
		'worked: ["the stop hook applies the brief"]',
		"did_not_work: []",
		"partially_worked: []",
		"issues_identified: []",
		"fixes_attempted: []",
		'unresolved_state: ""',
		'next_best_action: ["measure it"]',
		"do_not_repeat: []",
		"user_constraints: []",
		'human_handoff_summary: "done"',
		"",
	].join("\n");

beforeEach(() => {
	tmp = join(root, `.tmp-sync-${Math.random().toString(36).slice(2, 8)}`);
	mkdirSync(tmp, { recursive: true });
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

describe("ic sync closes the capture loop", () => {
	it("applies a pending brief and refreshes the resume brief", () => {
		run(["init", "--project-name", "Demo"]);
		writeFileSync(
			join(tmp, ".inference-chain", "inbox", "latest-brief.yml"),
			brief("brf-sync-1"),
		);

		const res = run(["sync", "--quiet"]);

		expect(res.status).toBe(0);
		expect(res.stdout).toContain("iteration 0 → 1");
		expect(
			existsSync(join(tmp, ".inference-chain", "inbox", "latest-brief.yml")),
		).toBe(false);
		const resume = readFileSync(
			join(tmp, ".inference-chain", "resumes", "resume_latest.md"),
			"utf8",
		);
		expect(resume).toContain("the stop hook applies the brief");
	});

	// Runs on every Stop, so silence when idle is the whole point.
	it("is a silent no-op when the inbox is empty", () => {
		run(["init", "--project-name", "Demo"]);
		const res = run(["sync", "--quiet"]);
		expect(res.status).toBe(0);
		expect(res.stdout.trim()).toBe("");
	});

	it("says so when run by hand with an empty inbox", () => {
		run(["init", "--project-name", "Demo"]);
		const res = run(["sync"]);
		expect(res.status).toBe(0);
		expect(res.stdout).toContain("Nothing to sync");
	});

	// Hooks fire in every repo the user opens, not just ledger-backed ones.
	it("stays silent and successful in a project with no ledger", () => {
		const res = run(["sync", "--quiet"]);
		expect(res.status).toBe(0);
		expect(res.stdout.trim()).toBe("");
		expect(res.stderr.trim()).toBe("");
	});

	it("reports an uninitialized project when run by hand", () => {
		const res = run(["sync"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toContain("ic init");
	});

	// A malformed artifact must not take the session down, and must not be
	// swallowed either — it stays in the inbox so the next sync retries it.
	it("keeps a broken artifact in the inbox without failing the hook", () => {
		run(["init", "--project-name", "Demo"]);
		const inboxFile = join(
			tmp,
			".inference-chain",
			"inbox",
			"latest-brief.yml",
		);
		writeFileSync(inboxFile, "kind: session_brief\nid: 12\n");

		const res = run(["sync", "--quiet"]);

		expect(res.status).toBe(0);
		expect(res.stderr).toContain("sync failed");
		// One readable line, not a page of raw schema output.
		expect(res.stderr.trim().split("\n")).toHaveLength(1);
		expect(existsSync(inboxFile)).toBe(true);
	});

	it("leaves the ledger verifiable after a hook-driven sync", () => {
		run(["init", "--project-name", "Demo"]);
		writeFileSync(
			join(tmp, ".inference-chain", "inbox", "latest-brief.yml"),
			brief("brf-sync-2"),
		);
		run(["sync", "--quiet"]);
		expect(run(["verify"]).status).toBe(0);
	});
});
