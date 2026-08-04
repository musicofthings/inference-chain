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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initProject } from "../../src/core/bootstrap.js";
import { installClaude } from "../../src/integrations/claude/install.js";
import { installAgent } from "../../src/integrations/registry.js";
import {
	COMMON_COMMANDS,
	readCommandBody,
} from "../../src/integrations/shared/commands.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { PATHS } from "../../src/storage/paths.js";

/**
 * Phase 0 acceptance evals:
 * - MCP round-trip (ingest → evolve → resume → verify)
 * - Claude hooks honor --overwrite; project .mcp.json merge
 * - Common command bodies are the single source; plugin pack is full (not stubs)
 */

let tmp: string;
let cwd: string;

beforeEach(() => {
	cwd = process.cwd();
	tmp = mkdtempSync(join(tmpdir(), "ic-phase0-"));
	process.chdir(tmp);
	mkdirSync(join(tmp, ".inference-chain", "prompts"), { recursive: true });
});

afterEach(() => {
	process.chdir(cwd);
	rmSync(tmp, { recursive: true, force: true });
});

async function withMcpClient<T>(
	fn: (client: Client) => Promise<T>,
): Promise<T> {
	const { server, close } = createMcpServer();
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "phase0-eval", version: "0.0.0" });
	await Promise.all([
		server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	try {
		return await fn(client);
	} finally {
		await client.close();
		await server.close();
		close();
	}
}

function toolText(result: {
	content: Array<{ type: string; text?: string }>;
}): string {
	const part = result.content.find((c) => c.type === "text");
	return part?.text ?? "";
}

describe("phase0 eval: MCP e2e", () => {
	it("ingests, evolves, resumes, and verifies via MCP tools", async () => {
		initProject({ projectName: "Phase0" });

		await withMcpClient(async (client) => {
			const tools = await client.listTools();
			const names = tools.tools.map((t) => t.name).sort();
			expect(names).toEqual(
				[
					"chain_evolve",
					"chain_ingest_brief",
					"chain_ingest_evolution",
					"chain_ingest_update",
					"chain_resume_brief",
					"chain_status",
					"chain_verify",
				].sort(),
			);

			const updateYaml = [
				"kind: interaction_update",
				'schema_version: "1.0.0"',
				'id: "upd_phase0"',
				'project_id: "Phase0"',
				"iteration: 0",
				'created_at: "2026-08-04T00:00:00.000Z"',
				'trigger: "manual_checkpoint"',
				'what_changed: "phase0 mcp eval"',
				"confirmed:",
				'  - belief: "mcp loop works"',
				'    evidence: "tool round-trip"',
				"next_action_delta:",
				'  - "ship adapters"',
			].join("\n");

			const ingest = await client.callTool({
				name: "chain_ingest_update",
				arguments: { body: updateYaml },
			});
			expect(toolText(ingest as never)).toContain("upd_phase0");

			const evolved = await client.callTool({
				name: "chain_evolve",
				arguments: {},
			});
			const evo = JSON.parse(toolText(evolved as never));
			expect(evo.source).toBe("interaction");
			expect(evo.to).toBe(0);

			const resume = await client.callTool({
				name: "chain_resume_brief",
				arguments: {},
			});
			expect(toolText(resume as never)).toMatch(/frontier|next/i);
			expect(existsSync(PATHS.resumeLatest())).toBe(true);

			const verify = await client.callTool({
				name: "chain_verify",
				arguments: {},
			});
			const v = JSON.parse(toolText(verify as never));
			expect(v.ok).toBe(true);
			expect(v.overall_ok).toBe(true);
		});
	});

	it("errors clearly when project is not initialized", async () => {
		await withMcpClient(async (client) => {
			const result = (await client.callTool({
				name: "chain_status",
				arguments: {},
			})) as { isError?: boolean; content: Array<{ text?: string }> };
			expect(result.isError).toBe(true);
			expect(toolText(result)).toMatch(/ic init/);
		});
	});
});

describe("phase0 eval: Claude install parity", () => {
	it("merges .mcp.json and honors --overwrite for hooks", () => {
		installClaude({ overwrite: false, withMcp: true });
		expect(existsSync(".mcp.json")).toBe(true);
		const mcp = JSON.parse(readFileSync(".mcp.json", "utf8"));
		expect(mcp.mcpServers["inference-chain"].args).toContain("--cwd");

		const settingsPath = ".claude/settings.json";
		const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
		settings.hooks.Stop = [{ hooks: [{ type: "command", command: "OLD" }] }];
		writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

		installClaude({ overwrite: false, withMcp: true });
		const kept = JSON.parse(readFileSync(settingsPath, "utf8"));
		expect(kept.hooks.Stop[0].hooks[0].command).toBe("OLD");

		installClaude({ overwrite: true, withMcp: true });
		const refreshed = JSON.parse(readFileSync(settingsPath, "utf8"));
		expect(refreshed.hooks.Stop[0].hooks[0].command).toContain("ic-stop");
	});

	it("writes full plugin command bodies (not stubs)", () => {
		installClaude({ overwrite: true });
		const pluginCmd = readFileSync(
			".claude/plugins/inference-chain/commands/ic-checkpoint.md",
			"utf8",
		);
		expect(pluginCmd).toContain("kind: interaction_update");
		expect(pluginCmd).not.toContain("see source repo");
		expect(pluginCmd).toContain(
			readCommandBody("ic-checkpoint").trim().slice(0, 40),
		);
	});
});

describe("phase0 eval: single-source commands", () => {
	it("claude/cursor/gemini/grok install bodies match common/commands", () => {
		installAgent("claude", { overwrite: true });
		installAgent("cursor", { overwrite: true });
		installAgent("gemini", { overwrite: true });
		installAgent("grok", { overwrite: true });

		for (const name of COMMON_COMMANDS) {
			const body = readCommandBody(name).trim();
			expect(readFileSync(`.claude/commands/${name}.md`, "utf8")).toContain(
				body.slice(0, 80),
			);
			expect(readFileSync(`.cursor/commands/${name}.md`, "utf8")).toContain(
				body.slice(0, 80),
			);
			expect(readFileSync(`.gemini/commands/${name}.toml`, "utf8")).toContain(
				body.slice(0, 80),
			);
			expect(readFileSync(`.grok/skills/${name}/SKILL.md`, "utf8")).toContain(
				body.slice(0, 80),
			);
		}
	});
});
