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
import { installAgent } from "../../src/integrations/registry.js";
import {
	mcpDesktopConfigSnippet,
	mcpStdioBlock,
	resolveIcLaunch,
} from "../../src/integrations/shared/mcp.js";
import { AGENTS_MD_START } from "../../src/integrations/shared/merge.js";

/**
 * Phase 1 acceptance evals:
 * - --target generic writes AGENTS.md + printable MCP JSON
 * - --target desktop writes project-local Desktop snippet
 * - resolveIcLaunch falls back to `ic` outside the CLI process
 */

let tmp: string;
let cwd: string;

beforeEach(() => {
	cwd = process.cwd();
	tmp = realpathSync(mkdtempSync(join(tmpdir(), "ic-phase1-")));
	process.chdir(tmp);
	mkdirSync(join(tmp, ".inference-chain", "prompts"), { recursive: true });
});

afterEach(() => {
	process.chdir(cwd);
	rmSync(tmp, { recursive: true, force: true });
});

describe("phase1 eval: portable contract", () => {
	it("installs generic AGENTS.md and emits MCP notes", () => {
		const res = installAgent("generic", { withMcp: true });
		expect(existsSync("AGENTS.md")).toBe(true);
		expect(readFileSync("AGENTS.md", "utf8")).toContain(AGENTS_MD_START);
		expect(res.notes.some((n) => n.includes("mcpServers"))).toBe(true);
		expect(res.notes.join("\n")).toContain("--cwd");
	});

	it("installs desktop snippet under .inference-chain/", () => {
		const res = installAgent("desktop", { withMcp: true });
		expect(existsSync(".inference-chain/mcp-desktop.json")).toBe(true);
		const snippet = readFileSync(".inference-chain/mcp-desktop.json", "utf8");
		const parsed = JSON.parse(snippet);
		expect(parsed.mcpServers["inference-chain"].args).toContain(resolve(tmp));
		expect(res.notes.some((n) => n.includes("claude_desktop_config"))).toBe(
			true,
		);
	});

	it("mcpStdioBlock pins absolute cwd and uses ic outside CLI argv", () => {
		const launch = resolveIcLaunch();
		// Under vitest, argv is not cli.js/ts → fall back to `ic`.
		expect(launch.command).toBe("ic");
		expect(launch.prefixArgs).toEqual([]);

		const block = mcpStdioBlock(tmp);
		expect(block.command).toBe("ic");
		expect(block.args).toEqual(["mcp", "--cwd", tmp]);

		const desktop = JSON.parse(mcpDesktopConfigSnippet(tmp));
		expect(desktop.mcpServers["inference-chain"].args[2]).toBe(tmp);
	});

	it("respects --no-with-mcp for generic (still writes AGENTS.md)", () => {
		const res = installAgent("generic", { withMcp: false });
		expect(existsSync("AGENTS.md")).toBe(true);
		expect(res.notes.some((n) => n.includes("mcpServers"))).toBe(false);
	});
});
