import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initProject } from "../../src/core/bootstrap.js";
import { formatDoctorReport, runDoctor } from "../../src/doctor.js";
import { installAgent } from "../../src/integrations/registry.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { PATHS, ic } from "../../src/storage/paths.js";
import { verifyLedger } from "../../src/storage/persist.js";
import { openDb } from "../../src/storage/sqlite.js";

/**
 * Phase 4 acceptance evals:
 * - ic doctor (init, wiring, verify)
 * - MCP chain_ingest_evolution (idempotent)
 * - Install warns when ledger missing (covered via doctor fail without init)
 */

let tmp: string;
let cwd: string;

beforeEach(() => {
	cwd = process.cwd();
	tmp = realpathSync(mkdtempSync(join(tmpdir(), "ic-phase4-")));
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
	const client = new Client({ name: "phase4-eval", version: "0.0.0" });
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

describe("phase4 eval: doctor", () => {
	it("fails when project is not initialized", () => {
		const report = runDoctor();
		expect(report.healthy).toBe(false);
		expect(
			report.checks.some((c) => c.id === "project" && c.status === "fail"),
		).toBe(true);
		expect(formatDoctorReport(report)).toContain("ic init");
	});

	it("reports healthy after init + wired cursor install", () => {
		initProject({ projectName: "Phase4" });
		mkdirSync(".cursor", { recursive: true });
		installAgent("cursor", { withMcp: true });

		const report = runDoctor();
		expect(report.healthy).toBe(true);
		expect(report.detected).toContain("cursor");
		expect(report.wired).toContain("cursor");
		expect(report.unwired).not.toContain("cursor");
		expect(
			report.checks.some((c) => c.id === "verify" && c.status === "ok"),
		).toBe(true);
	});

	it("warns when host is present but IC wiring is missing", () => {
		initProject({ projectName: "Phase4" });
		mkdirSync(".cursor/rules", { recursive: true });

		const report = runDoctor({ strict: true });
		expect(report.detected).toContain("cursor");
		expect(report.unwired).toContain("cursor");
		expect(report.healthy).toBe(false);
		expect(
			report.checks.some(
				(c) => c.id === "wiring:cursor" && c.status === "warn",
			),
		).toBe(true);
	});

	it("supports --json shape fields", () => {
		initProject({ projectName: "Phase4" });
		const report = runDoctor();
		expect(report).toMatchObject({
			cwd: tmp,
			healthy: true,
		});
		expect(Array.isArray(report.checks)).toBe(true);
	});
});

describe("phase4 eval: MCP evolution ingest", () => {
	it("lists chain_ingest_evolution and ingests idempotently", async () => {
		initProject({ projectName: "Phase4" });

		const evoYaml = [
			"kind: memory_evolution_record",
			'schema_version: "1.0.0"',
			'id: "evo_phase4"',
			'project_id: "Phase4"',
			"from_iteration: 0",
			"to_iteration: 0",
			'created_at: "2026-08-04T00:00:00.000Z"',
			"source: manual_refinement",
			"frontier_update:",
			"  previous_next_action: []",
			'  new_next_action: ["ship doctor"]',
			'  why_changed: "phase4"',
			'evolution_summary: "phase4 mcp evolution ingest"',
		].join("\n");

		await withMcpClient(async (client) => {
			const tools = await client.listTools();
			expect(tools.tools.map((t) => t.name)).toContain(
				"chain_ingest_evolution",
			);

			const first = await client.callTool({
				name: "chain_ingest_evolution",
				arguments: { body: evoYaml },
			});
			expect(toolText(first as never)).toContain("evo_phase4");
			expect(toolText(first as never)).not.toContain("already present");

			const second = await client.callTool({
				name: "chain_ingest_evolution",
				arguments: { body: evoYaml },
			});
			expect(toolText(second as never)).toContain("already present");
		});

		expect(existsSync(ic("evolutions", "evo_phase4.yml"))).toBe(true);
		expect(readFileSync(ic("evolutions", "evo_phase4.yml"), "utf8")).toContain(
			"phase4 mcp evolution ingest",
		);

		const db = openDb(PATHS.db());
		try {
			const v = verifyLedger(db);
			expect(v.ok).toBe(true);
		} finally {
			db.close();
		}
	});
});
