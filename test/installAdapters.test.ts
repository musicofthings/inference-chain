import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installClaude } from "../src/integrations/claude/install.js";
import {
	AGENT_TARGETS,
	installAgent,
	isAgentTarget,
} from "../src/integrations/registry.js";
import {
	mcpStdioBlock,
	mcpTomlSectionBody,
} from "../src/integrations/shared/mcp.js";
import {
	AGENTS_MD_END,
	AGENTS_MD_START,
	mergeJsonKeyAbsent,
	mergeTomlSectionAbsent,
	upsertAgentsMdBlock,
} from "../src/integrations/shared/merge.js";

let tmp: string;
let cwd: string;

beforeEach(() => {
	cwd = process.cwd();
	tmp = mkdtempSync(join(tmpdir(), "ic-install-"));
	process.chdir(tmp);
	mkdirSync(join(tmp, ".inference-chain", "prompts"), { recursive: true });
});

afterEach(() => {
	process.chdir(cwd);
	rmSync(tmp, { recursive: true, force: true });
});

describe("shared merge helpers", () => {
	it("mergeJsonKeyAbsent does not clobber existing keys", () => {
		writeFileSync(
			"cfg.json",
			JSON.stringify({ mcpServers: { other: { command: "x" } } }),
		);
		mergeJsonKeyAbsent("cfg.json", {
			mcpServers: { "inference-chain": { command: "ic" } },
		});
		const parsed = JSON.parse(readFileSync("cfg.json", "utf8"));
		expect(parsed.mcpServers.other.command).toBe("x");
		expect(parsed.mcpServers["inference-chain"].command).toBe("ic");

		mergeJsonKeyAbsent("cfg.json", {
			mcpServers: { "inference-chain": { command: "nope" } },
		});
		const again = JSON.parse(readFileSync("cfg.json", "utf8"));
		expect(again.mcpServers["inference-chain"].command).toBe("ic");
	});

	it("mergeTomlSectionAbsent is idempotent", () => {
		const body = mcpTomlSectionBody(tmp);
		expect(
			mergeTomlSectionAbsent("c.toml", "mcp_servers.inference-chain", body),
		).toBe(true);
		expect(
			mergeTomlSectionAbsent("c.toml", "mcp_servers.inference-chain", body),
		).toBe(false);
		const text = readFileSync("c.toml", "utf8");
		expect(text).toContain("[mcp_servers.inference-chain]");
		expect(text).toContain('command = "ic"');
	});

	it("upsertAgentsMdBlock replaces marker block idempotently", () => {
		writeFileSync("AGENTS.md", "# Project\n\nHello\n");
		expect(upsertAgentsMdBlock("AGENTS.md", "## Inference Chain\nv1")).toBe(
			true,
		);
		expect(upsertAgentsMdBlock("AGENTS.md", "## Inference Chain\nv1")).toBe(
			false,
		);
		expect(upsertAgentsMdBlock("AGENTS.md", "## Inference Chain\nv2")).toBe(
			true,
		);
		const text = readFileSync("AGENTS.md", "utf8");
		expect(text).toContain("Hello");
		expect(text).toContain(AGENTS_MD_START);
		expect(text).toContain("v2");
		expect(text).not.toContain("v1");
		expect(text).toContain(AGENTS_MD_END);
		expect(text.indexOf(AGENTS_MD_START)).toBeLessThan(
			text.indexOf(AGENTS_MD_END),
		);
	});

	it("mcpStdioBlock pins absolute cwd", () => {
		const block = mcpStdioBlock(tmp);
		expect(block.command).toBe("ic");
		expect(block.args).toEqual(["mcp", "--cwd", tmp]);
	});
});

describe("installAgent adapters", () => {
	it("recognizes all planned targets", () => {
		for (const t of AGENT_TARGETS) {
			expect(isAgentTarget(t)).toBe(true);
		}
		expect(isAgentTarget("nope")).toBe(false);
	});

	it("installs claude commands and hooks", () => {
		const res = installClaude({ overwrite: false });
		expect(existsSync(".claude/commands/ic-checkpoint.md")).toBe(true);
		expect(existsSync(".claude/settings.json")).toBe(true);
		const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
		expect(settings.hooks.SessionStart).toBeTruthy();
		expect(res.installedCommands.length).toBeGreaterThan(0);

		writeFileSync(".claude/commands/ic-checkpoint.md", "KEEP\n");
		installClaude({ overwrite: false });
		expect(readFileSync(".claude/commands/ic-checkpoint.md", "utf8")).toBe(
			"KEEP\n",
		);
	});

	it("installs codex hooks, AGENTS.md, and MCP toml", () => {
		const res = installAgent("codex", { withMcp: true });
		expect(existsSync("AGENTS.md")).toBe(true);
		expect(readFileSync("AGENTS.md", "utf8")).toContain(AGENTS_MD_START);
		expect(existsSync(".codex/hooks.json")).toBe(true);
		expect(existsSync(".codex/config.toml")).toBe(true);
		expect(readFileSync(".codex/config.toml", "utf8")).toContain(
			"[mcp_servers.inference-chain]",
		);
		expect(res.installed.length).toBeGreaterThan(0);

		const before = readFileSync("AGENTS.md", "utf8");
		installAgent("codex", { withMcp: true });
		expect(readFileSync("AGENTS.md", "utf8")).toBe(before);
	});

	it("installs gemini commands and settings MCP", () => {
		installAgent("gemini", { withMcp: true });
		expect(existsSync(".gemini/commands/ic-checkpoint.toml")).toBe(true);
		expect(existsSync(".gemini/commands/ic-stop.toml")).toBe(true);
		const settings = JSON.parse(readFileSync(".gemini/settings.json", "utf8"));
		expect(settings.mcpServers["inference-chain"].command).toBe("ic");
	});

	it("installs cursor commands, rule, and mcp.json", () => {
		installAgent("cursor", { withMcp: true });
		expect(existsSync(".cursor/commands/ic-resume.md")).toBe(true);
		expect(existsSync(".cursor/rules/inference-chain.mdc")).toBe(true);
		const mcp = JSON.parse(readFileSync(".cursor/mcp.json", "utf8"));
		expect(mcp.mcpServers["inference-chain"].args).toContain("--cwd");
	});

	it("installs grok skills, hooks, and config.toml", () => {
		const res = installAgent("grok", { withMcp: true });
		expect(existsSync(".grok/skills/ic-checkpoint/SKILL.md")).toBe(true);
		expect(existsSync(".grok/hooks/inference-chain.json")).toBe(true);
		expect(existsSync(".grok/config.toml")).toBe(true);
		expect(res.notes.some((n) => n.includes("hooks-trust"))).toBe(true);
	});

	it("installs openhands AGENTS.md and mcp.json", () => {
		const res = installAgent("openhands", { withMcp: true });
		expect(existsSync("AGENTS.md")).toBe(true);
		expect(existsSync(".openhands/mcp.json")).toBe(true);
		expect(res.notes.some((n) => n.toLowerCase().includes("openclaw"))).toBe(
			true,
		);
	});

	it("respects --no-with-mcp by skipping MCP files", () => {
		installAgent("gemini", { withMcp: false });
		expect(existsSync(".gemini/commands/ic-checkpoint.toml")).toBe(true);
		expect(existsSync(".gemini/settings.json")).toBe(false);

		installAgent("codex", { withMcp: false });
		expect(existsSync(".codex/hooks.json")).toBe(true);
		expect(existsSync(".codex/config.toml")).toBe(false);
	});
});
