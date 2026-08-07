import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getAdapter,
	installAgent,
	installAgents,
} from "../src/integrations/registry.js";
import { AGENTS_MD_START } from "../src/integrations/shared/merge.js";

/**
 * Review fixes: generated project config must stay machine-independent,
 * hand-authored instruction files must survive --overwrite, and a single
 * failing adapter must not sink a multi-target install.
 */

let tmp: string;
let cwd: string;

beforeEach(() => {
	cwd = process.cwd();
	tmp = realpathSync(mkdtempSync(join(tmpdir(), "ic-harden-")));
	process.chdir(tmp);
	mkdirSync(join(tmp, ".inference-chain", "prompts"), { recursive: true });
});

afterEach(() => {
	vi.restoreAllMocks();
	process.chdir(cwd);
	rmSync(tmp, { recursive: true, force: true });
});

const PROJECT_MCP_FILES = [
	".mcp.json",
	".cursor/mcp.json",
	".vscode/mcp.json",
	"opencode.json",
	".continue/config.json",
	".windsurf/mcp.json",
	".openhands/mcp.json",
	".gemini/settings.json",
	".codex/config.toml",
	".grok/config.toml",
];

describe("project MCP config portability", () => {
	it("embeds no machine-specific paths by default", () => {
		installAgents(
			[
				"claude",
				"cursor",
				"vscode",
				"opencode",
				"continue",
				"windsurf",
				"openhands",
				"gemini",
				"codex",
				"grok",
			],
			{ withMcp: true },
		);

		for (const file of PROJECT_MCP_FILES) {
			expect(existsSync(file), `${file} should exist`).toBe(true);
			const text = readFileSync(file, "utf8");
			expect(text, `${file} leaks a home directory`).not.toContain(
				process.env.HOME ?? "/Users/",
			);
			expect(text, `${file} leaks the project path`).not.toContain(tmp);
			expect(text, `${file} leaks the node binary`).not.toContain(
				process.execPath,
			);
		}
	});

	it("--pin-launch opts into the absolute launch", () => {
		installAgent("cursor", { withMcp: true, pinLaunch: true });
		const mcp = JSON.parse(readFileSync(".cursor/mcp.json", "utf8"));
		expect(mcp.mcpServers["inference-chain"].args).toEqual([
			"mcp",
			"--cwd",
			tmp,
		]);
	});
});

describe("hand-authored instruction files", () => {
	it("survive --overwrite via marker-block upsert", () => {
		mkdirSync(".github", { recursive: true });
		writeFileSync(
			".github/copilot-instructions.md",
			"# House rules\n\nKeep.\n",
		);
		writeFileSync(".windsurfrules", "# Cascade rules\n\nKeep.\n");

		installAgent("copilot", { withMcp: false, overwrite: true });
		installAgent("windsurf", { withMcp: false, overwrite: true });

		for (const file of [".github/copilot-instructions.md", ".windsurfrules"]) {
			const text = readFileSync(file, "utf8");
			expect(text, `${file} clobbered user content`).toContain("Keep.");
			expect(text).toContain(AGENTS_MD_START);
		}
	});

	it("re-upserting is idempotent", () => {
		installAgent("copilot", { withMcp: false });
		const first = readFileSync(".github/copilot-instructions.md", "utf8");
		installAgent("copilot", { withMcp: false });
		expect(readFileSync(".github/copilot-instructions.md", "utf8")).toBe(first);
	});
});

describe("desktop snippet flags", () => {
	it("skips the snippet under --no-with-mcp", () => {
		installAgent("desktop", { withMcp: false });
		expect(existsSync(".inference-chain/mcp-desktop.json")).toBe(false);

		installAgent("chatgpt", { withMcp: false });
		expect(existsSync(".inference-chain/mcp-chatgpt-desktop.json")).toBe(false);
	});

	it("does not rewrite an edited snippet without --overwrite", () => {
		installAgent("desktop", { withMcp: true });
		writeFileSync(".inference-chain/mcp-desktop.json", "EDITED\n");

		const res = installAgent("desktop", { withMcp: true });
		expect(readFileSync(".inference-chain/mcp-desktop.json", "utf8")).toBe(
			"EDITED\n",
		);
		expect(res.installed).not.toContain(".inference-chain/mcp-desktop.json");

		installAgent("desktop", { withMcp: true, overwrite: true });
		expect(readFileSync(".inference-chain/mcp-desktop.json", "utf8")).toContain(
			"mcpServers",
		);
	});
});

describe("multi-install failure isolation", () => {
	it("keeps installing after one adapter throws", () => {
		vi.spyOn(getAdapter("vscode"), "install").mockImplementation(() => {
			throw new Error("adapter exploded");
		});

		const multi = installAgents(["cursor", "vscode", "generic"], {
			withMcp: true,
		});

		expect(multi.succeeded).toEqual(["cursor", "generic"]);
		expect(multi.failures).toEqual([
			{ target: "vscode", error: "adapter exploded" },
		]);
		expect(existsSync(".cursor/commands/ic-resume.md")).toBe(true);
		expect(existsSync("AGENTS.md")).toBe(true);
	});
});
