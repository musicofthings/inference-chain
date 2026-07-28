import { existsSync, readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import YAML from "yaml";
import { z } from "zod";
import { scoreLedger } from "../core/evolve.js";
import { renderResumeBrief } from "../core/resume.js";
import {
	type ChainLedger,
	ChainLedgerSchema,
	InteractionUpdateSchema,
	SessionBriefSchema,
} from "../core/schemas.js";
import { writeFileAtomic } from "../storage/atomicWrite.js";
import { lastEvent } from "../storage/jsonl.js";
import { PATHS, ic } from "../storage/paths.js";
import {
	appendChainEvent,
	captureBrief,
	captureUpdate,
	evolveFromInbox,
	verifyLedger,
} from "../storage/persist.js";
import { type DB, eventCount, openDb } from "../storage/sqlite.js";

function requireProject(): ChainLedger {
	if (!existsSync(PATHS.currentYml())) {
		throw new Error(
			`No .inference-chain/ project found in cwd (${process.cwd()}). Run "ic init --project-name <name>" first.`,
		);
	}
	return ChainLedgerSchema.parse(
		YAML.parse(readFileSync(PATHS.currentYml(), "utf8")),
	);
}

function parseArtifact<T>(schema: z.ZodSchema<T>, raw: string): T {
	// Accept YAML or JSON — both deserialize through YAML.parse.
	return schema.parse(YAML.parse(raw));
}

export async function startMcpServer(): Promise<void> {
	const server = new McpServer({
		name: "inference-chain",
		version: "0.2.0",
	});

	// One sqlite handle reused for the lifetime of the stdio server; avoids
	// open/close per tool call (which would WAL-checkpoint every event).
	let db: DB | null = null;
	const getDb = (): DB => {
		if (!db) db = openDb(PATHS.db());
		return db;
	};

	server.tool(
		"chain_status",
		"Get the current Inference Chain status for the project rooted at the server cwd. Returns iteration, sizes, score, last event.",
		{},
		async () => {
			const ledger = requireProject();
			const count = eventCount(getDb());
			const payload = {
				project: ledger.project_id,
				iteration: ledger.iteration,
				events: count,
				stable_learnings: ledger.stable_learnings.length,
				active_hypotheses: ledger.active_hypotheses.length,
				rejected_hypotheses: ledger.rejected_hypotheses.length,
				do_not_repeat: ledger.do_not_repeat.length,
				next_best_action: ledger.current_frontier.next_best_action.length,
				blockers: ledger.current_frontier.blockers.length,
				score: scoreLedger(ledger),
				last_event: lastEvent(PATHS.ledgerJsonl())?.type ?? null,
			};
			return {
				content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
			};
		},
	);

	server.tool(
		"chain_resume_brief",
		"Render and return the resume brief markdown for the current ledger. Also persists to .inference-chain/resumes/resume_latest.md.",
		{},
		async () => {
			const ledger = requireProject();
			const text = renderResumeBrief(ledger);
			writeFileAtomic(PATHS.resumeLatest(), text);
			appendChainEvent(getDb(), {
				projectId: ledger.project_id,
				iteration: ledger.iteration,
				type: "resume_brief_generated",
				payload: { iteration: ledger.iteration, via: "mcp" },
			});
			return { content: [{ type: "text", text }] };
		},
	);

	server.tool(
		"chain_ingest_update",
		"Validate and persist an InteractionUpdate. Body may be YAML or JSON matching the InteractionUpdate schema (kind: interaction_update).",
		{ body: z.string().describe("YAML or JSON text of an InteractionUpdate") },
		async ({ body }) => {
			requireProject();
			const parsed = parseArtifact(InteractionUpdateSchema, body);
			writeFileAtomic(ic("inbox", "latest-update.yml"), YAML.stringify(parsed));
			const { alreadyPresent } = captureUpdate(getDb(), parsed, "mcp");
			const note = alreadyPresent ? " (already captured; inbox refreshed)" : "";
			return {
				content: [
					{
						type: "text",
						text: `Ingested InteractionUpdate ${parsed.id}${note}. Call chain_evolve to apply.`,
					},
				],
			};
		},
	);

	server.tool(
		"chain_ingest_brief",
		"Validate and persist a SessionBrief. Body may be YAML or JSON matching the SessionBrief schema (kind: session_brief).",
		{ body: z.string().describe("YAML or JSON text of a SessionBrief") },
		async ({ body }) => {
			requireProject();
			const parsed = parseArtifact(SessionBriefSchema, body);
			writeFileAtomic(ic("inbox", "latest-brief.yml"), YAML.stringify(parsed));
			const { alreadyPresent } = captureBrief(getDb(), parsed, "mcp");
			const note = alreadyPresent ? " (already captured; inbox refreshed)" : "";
			return {
				content: [
					{
						type: "text",
						text: `Ingested SessionBrief ${parsed.id}${note}. Call chain_evolve to apply.`,
					},
				],
			};
		},
	);

	server.tool(
		"chain_evolve",
		"Apply the inbox brief or update to the current ledger. Emits a MemoryEvolutionRecord and advances iteration for SessionBriefs.",
		{
			advance: z
				.boolean()
				.optional()
				.describe("Force iteration advance for InteractionUpdates"),
		},
		async ({ advance }) => {
			requireProject();
			const outcome = evolveFromInbox({
				db: getDb(),
				advance,
				via: "mcp",
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								from: outcome.record.from_iteration,
								to: outcome.record.to_iteration,
								source: outcome.record.source,
								score_before: outcome.scoreBefore,
								score_after: outcome.scoreAfter,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"chain_verify",
		"Replay the JSONL hash chain and cross-check against SQLite event count.",
		{},
		async () => {
			if (!existsSync(PATHS.ledgerJsonl())) {
				throw new Error("Missing ledger.jsonl");
			}
			const v = verifyLedger(getDb());
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								ok: v.ok && v.inSync && v.currentYmlOk,
								total: v.total,
								errors: v.errors,
								sqlite_event_count: v.sqliteEventCount,
								hash_mismatches: v.hashMismatches,
								in_sync: v.inSync,
								current_yml_ok: v.currentYmlOk,
								current_yml_errors: v.currentYmlErrors,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	const transport = new StdioServerTransport();
	await server.connect(transport);

	// Close the shared db handle when the transport detaches so file locks
	// release cleanly. transport.onclose is part of the SDK contract.
	const closeDb = () => {
		if (db) {
			db.close();
			db = null;
		}
	};
	transport.onclose = closeDb;
}
