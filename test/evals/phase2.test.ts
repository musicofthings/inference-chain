import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	AGENT_TARGETS,
	installAgent,
	isAgentTarget,
} from "../../src/integrations/registry.js";
import { AGENTS_MD_START } from "../../src/integrations/shared/merge.js";

/**
 * Phase 2 acceptance evals:
 * - Thin adapters for copilot, vscode, opencode, chatgpt, windsurf, continue
 * - Each writes instructions + MCP (when enabled) without touching the ledger
 */

let tmp: string;
let cwd: string;

beforeEach(() => {
	cwd = process.cwd();
	tmp = realpathSync(mkdtempSync(join(tmpdir(), "ic-phase2-")));
	process.chdir(tmp);
	mkdirSync(join(tmp, ".inference-chain", "prompts"), { recursive: true });
});

afterEach(() => {
	process.chdir(cwd);
	rmSync(tmp, { recursive: true, force: true });
});

describe("phase2 eval: thin host adapters", () => {
	it("registers the expanded target set", () => {
		for (const t of [
			"copilot",
			"vscode",
			"opencode",
			"chatgpt",
			"windsurf",
			"continue",
			"generic",
			"desktop",
		]) {
			expect(isAgentTarget(t)).toBe(true);
		}
		expect(AGENT_TARGETS.length).toBeGreaterThanOrEqual(14);
	});

	it("installs copilot instructions + vscode mcp", () => {
		installAgent("copilot", { withMcp: true });
		expect(existsSync(".github/copilot-instructions.md")).toBe(true);
		expect(readFileSync(".github/copilot-instructions.md", "utf8")).toContain(
			"Inference Chain",
		);
		expect(existsSync("AGENTS.md")).toBe(true);
		const mcp = JSON.parse(readFileSync(".vscode/mcp.json", "utf8"));
		expect(mcp.servers["inference-chain"].args).toContain("--cwd");
	});

	it("installs vscode mcp + AGENTS.md", () => {
		installAgent("vscode", { withMcp: true });
		expect(existsSync("AGENTS.md")).toBe(true);
		const mcp = JSON.parse(readFileSync(".vscode/mcp.json", "utf8"));
		expect(mcp.servers["inference-chain"].command).toBeTruthy();
	});

	it("installs opencode.json local MCP entry", () => {
		installAgent("opencode", { withMcp: true });
		const cfg = JSON.parse(readFileSync("opencode.json", "utf8"));
		expect(cfg.mcp["inference-chain"].type).toBe("local");
		expect(cfg.mcp["inference-chain"].command).toEqual(
			expect.arrayContaining(["mcp", "--cwd", resolve(tmp)]),
		);
		expect(readFileSync("AGENTS.md", "utf8")).toContain(AGENTS_MD_START);
	});

	it("installs chatgpt via codex wiring + desktop snippet", () => {
		installAgent("chatgpt", { withMcp: true });
		expect(existsSync("AGENTS.md")).toBe(true);
		expect(existsSync(".codex/hooks.json")).toBe(true);
		expect(existsSync(".inference-chain/mcp-chatgpt-desktop.json")).toBe(true);
	});

	it("installs windsurf rules + mcp", () => {
		installAgent("windsurf", { withMcp: true });
		expect(existsSync(".windsurfrules")).toBe(true);
		expect(existsSync(".windsurf/mcp.json")).toBe(true);
		expect(readFileSync("AGENTS.md", "utf8")).toContain(AGENTS_MD_START);
	});

	it("installs continue config + AGENTS.md", () => {
		installAgent("continue", { withMcp: true });
		const cfg = JSON.parse(readFileSync(".continue/config.json", "utf8"));
		expect(cfg.mcpServers["inference-chain"].args).toContain("--cwd");
		expect(existsSync("AGENTS.md")).toBe(true);
	});

	it("never creates a ledger from adapter install alone", () => {
		for (const t of [
			"copilot",
			"vscode",
			"opencode",
			"chatgpt",
			"windsurf",
			"continue",
		] as const) {
			const dir = mkdtempSync(join(tmpdir(), `ic-p2-${t}-`));
			const prev = process.cwd();
			process.chdir(dir);
			mkdirSync(join(dir, ".inference-chain", "prompts"), { recursive: true });
			try {
				installAgent(t, { withMcp: true });
				expect(existsSync(".inference-chain/ledger.jsonl")).toBe(false);
				expect(existsSync(".inference-chain/current.yml")).toBe(false);
			} finally {
				process.chdir(prev);
				rmSync(dir, { recursive: true, force: true });
			}
		}
	});
});
