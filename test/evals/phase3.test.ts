import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	HOST_CAPABILITIES,
	formatCapabilities,
} from "../../src/integrations/capabilities.js";
import {
	ALL_INSTALL_TARGETS,
	detectHosts,
	targetsForDetect,
} from "../../src/integrations/detect.js";
import {
	installAgent,
	installAgents,
} from "../../src/integrations/registry.js";
import {
	parseTargetOption,
	planFromFlags,
} from "../../src/integrations/targets.js";
import type { AgentTarget } from "../../src/integrations/types.js";

/**
 * Phase 3 acceptance evals:
 * - --all / --detect / multi --target planning
 * - Host marker detection
 * - Capability matrix (no invented hooks/commands)
 * - Multi-install does not touch the ledger
 */

let tmp: string;
let cwd: string;

beforeEach(() => {
	cwd = process.cwd();
	tmp = realpathSync(mkdtempSync(join(tmpdir(), "ic-phase3-")));
	process.chdir(tmp);
	mkdirSync(join(tmp, ".inference-chain", "prompts"), { recursive: true });
});

afterEach(() => {
	process.chdir(cwd);
	rmSync(tmp, { recursive: true, force: true });
});

describe("phase3 eval: target planning", () => {
	it("parses comma-separated targets and dedupes", () => {
		const plan = parseTargetOption("cursor,claude,cursor");
		expect(plan.mode).toBe("targets");
		if (plan.mode === "targets") {
			expect(plan.targets).toEqual(["cursor", "claude"]);
		}
	});

	it("accepts --target all|detect aliases", () => {
		expect(parseTargetOption("all").mode).toBe("all");
		expect(parseTargetOption("detect").mode).toBe("detect");
	});

	it("rejects combining flags", () => {
		expect(() => planFromFlags({ target: "claude", all: true })).toThrow(
			/only one of/,
		);
		expect(() => planFromFlags({})).toThrow(/Specify --target/);
	});

	it("--all uses the curated multi-host set", () => {
		const plan = planFromFlags({ all: true });
		expect(plan.mode).toBe("all");
		expect(plan.targets).toEqual([...ALL_INSTALL_TARGETS]);
		expect(plan.targets).not.toContain("chatgpt");
		expect(plan.targets).toContain("desktop");
		expect(plan.targets).toContain("generic");
	});
});

describe("phase3 eval: host detection", () => {
	it("detects present host markers", () => {
		mkdirSync(".cursor", { recursive: true });
		mkdirSync(".claude", { recursive: true });
		mkdirSync(".vscode", { recursive: true });
		writeFileSync("opencode.json", "{}\n");

		const detected = detectHosts(tmp);
		const ids = detected.map((d) => d.target).sort();
		expect(ids).toEqual(["claude", "cursor", "opencode", "vscode"].sort());
	});

	it("falls back to generic when nothing is detected", () => {
		const d = targetsForDetect(tmp);
		expect(d.fallback).toBe(true);
		expect(d.targets).toEqual(["generic"]);
	});

	it("install --detect wires only detected hosts", () => {
		mkdirSync(".cursor/rules", { recursive: true });
		writeFileSync(".cursor/rules/x.mdc", "x\n");

		const plan = planFromFlags({ detect: true });
		expect(plan.mode).toBe("detect");
		if (plan.mode === "detect") {
			expect(plan.fallback).toBe(false);
			expect(plan.targets).toEqual(["cursor"]);
		}

		const multi = installAgents(plan.targets, { withMcp: true });
		expect(existsSync(".cursor/commands/ic-checkpoint.md")).toBe(true);
		expect(existsSync(".cursor/mcp.json")).toBe(true);
		expect(existsSync(".claude/commands")).toBe(false);
		expect(multi.targets).toEqual(["cursor"]);
	});
});

describe("phase3 eval: capability parity", () => {
	it("only claims hooks/commands where the host has them", () => {
		const withHooks = (
			Object.entries(HOST_CAPABILITIES) as [
				AgentTarget,
				(typeof HOST_CAPABILITIES)[AgentTarget],
			][]
		)
			.filter(([, c]) => c.hooks)
			.map(([t]) => t);
		expect(withHooks.sort()).toEqual(
			["chatgpt", "claude", "codex", "grok"].sort(),
		);

		const withCommands = (
			Object.entries(HOST_CAPABILITIES) as [
				AgentTarget,
				(typeof HOST_CAPABILITIES)[AgentTarget],
			][]
		)
			.filter(([, c]) => c.commands)
			.map(([t]) => t);
		expect(withCommands.sort()).toEqual(
			["claude", "cursor", "gemini", "grok"].sort(),
		);

		expect(formatCapabilities(HOST_CAPABILITIES.vscode)).toBe("mcp+AGENTS.md");
		expect(formatCapabilities(HOST_CAPABILITIES.cursor)).toBe(
			"commands+rules+mcp",
		);
	});
});

describe("phase3 eval: multi-install safety", () => {
	it("installs multiple targets without creating a ledger", () => {
		const multi = installAgents(["cursor", "vscode", "generic"], {
			withMcp: true,
		});
		expect(multi.installed.length).toBeGreaterThan(0);
		expect(existsSync(".cursor/commands/ic-resume.md")).toBe(true);
		expect(existsSync(".vscode/mcp.json")).toBe(true);
		expect(existsSync("AGENTS.md")).toBe(true);
		expect(existsSync(".inference-chain/ledger.jsonl")).toBe(false);
		expect(existsSync(".inference-chain/current.yml")).toBe(false);
	});

	it("dedupes notes and paths across overlapping adapters", () => {
		const multi = installAgents(["codex", "openhands"], { withMcp: true });
		expect(multi.installed.filter((p) => p === "AGENTS.md").length).toBe(1);
		const noteSet = new Set(multi.notes);
		expect(noteSet.size).toBe(multi.notes.length);
	});

	it("single-target installAgent still works for all ALL_INSTALL_TARGETS", () => {
		for (const t of ALL_INSTALL_TARGETS) {
			const dir = realpathSync(mkdtempSync(join(tmpdir(), `ic-p3-${t}-`)));
			const prev = process.cwd();
			process.chdir(dir);
			mkdirSync(join(dir, ".inference-chain", "prompts"), { recursive: true });
			try {
				const res = installAgent(t, { withMcp: true });
				expect(res.target).toBe(t);
			} finally {
				process.chdir(prev);
				rmSync(dir, { recursive: true, force: true });
			}
		}
	});
});
