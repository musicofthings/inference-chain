import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { writeFileAtomic } from "../storage/atomicWrite.js";
import { ensureLedgerFile } from "../storage/jsonl.js";
import { IC_DIR, PATHS, SUBDIRS, ic, p } from "../storage/paths.js";
import { appendChainEvent } from "../storage/persist.js";
import { openDb, upsertChainState } from "../storage/sqlite.js";
import { type ChainLedger, ChainLedgerSchema } from "./schemas.js";

export type InitProjectOptions = {
	projectName: string;
	/** Wipe an existing .inference-chain/ and start over. */
	force?: boolean;
	/** Recorded on the project_initialized event payload. */
	via?: string;
};

export function createInitialLedger(
	projectName: string,
	now = new Date().toISOString(),
): ChainLedger {
	return ChainLedgerSchema.parse({
		project_id: projectName,
		iteration: 0,
		updated_at: now,
		global_objective: projectName,
		current_operating_model: {
			summary: "Initial project state.",
			confidence: "medium",
		},
		stable_learnings: [],
		active_hypotheses: [],
		rejected_hypotheses: [],
		stable_decisions: [],
		recurring_failure_patterns: [],
		open_questions: [],
		current_frontier: {
			next_best_action: ["Define first milestone"],
			blockers: [],
			risks: [],
		},
		do_not_repeat: [],
		continuity_summary: "Project initialized.",
	});
}

function ensureDirs(): void {
	mkdirSync(p(IC_DIR), { recursive: true });
	for (const d of SUBDIRS) mkdirSync(ic(d), { recursive: true });
}

/**
 * Bootstrap a new Inference Chain project under process.cwd().
 * Refuses to clobber an existing project unless `force` is set.
 */
export function initProject(opts: InitProjectOptions): ChainLedger {
	if (existsSync(PATHS.currentYml()) && !opts.force) {
		throw new Error(
			`Project already initialized at ${PATHS.root()}. Re-run with --force to wipe and re-init.`,
		);
	}

	if (opts.force && existsSync(p(IC_DIR))) {
		rmSync(p(IC_DIR), { recursive: true, force: true });
	}

	ensureDirs();
	ensureLedgerFile(PATHS.ledgerJsonl());

	const now = new Date().toISOString();
	const initial = createInitialLedger(opts.projectName, now);
	const ledgerYaml = YAML.stringify(initial);
	writeFileAtomic(PATHS.currentYml(), ledgerYaml);
	writeFileSync(
		PATHS.projectYml(),
		YAML.stringify({ project_name: opts.projectName, created_at: now }),
	);

	const db = openDb(PATHS.db());
	try {
		upsertChainState(db, initial, ledgerYaml);
		appendChainEvent(db, {
			projectId: initial.project_id,
			iteration: initial.iteration,
			type: "project_initialized",
			payload: {
				project_name: opts.projectName,
				...(opts.via ? { via: opts.via } : {}),
			},
		});
	} finally {
		db.close();
	}

	return initial;
}
