#!/usr/bin/env node
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { nanoid } from "nanoid";
import YAML from "yaml";
import { evolveLedger, scoreLedger } from "./core/evolve.js";
import {
	type ChainLedger,
	ChainLedgerSchema,
	InteractionUpdateSchema,
	SessionBriefSchema,
} from "./core/schemas.js";

const IC = ".inference-chain";
const p = (...s: string[]) => join(process.cwd(), ...s);
const now = () => new Date().toISOString();

function ensureDirs() {
	for (const d of [
		"inbox",
		"briefs",
		"updates",
		"evolutions",
		"resumes",
		"prompts",
		"locks",
	]) {
		mkdirSync(p(IC, d), { recursive: true });
	}
}
function loadCurrent(): ChainLedger {
	return YAML.parse(readFileSync(p(IC, "current.yml"), "utf8"));
}
function saveCurrent(ledger: ChainLedger) {
	writeFileSync(p(IC, "current.yml"), YAML.stringify(ledger));
}

function consumeInbox(
	artifactPath: string,
	archiveDir: string,
	archiveName: string,
): void {
	mkdirSync(archiveDir, { recursive: true });
	const archivePath = join(archiveDir, archiveName);
	copyFileSync(artifactPath, archivePath);
	unlinkSync(artifactPath);
}

const program = new Command();
program.name("ic");
program
	.command("init")
	.requiredOption("--project-name <name>")
	.action(({ projectName }) => {
		mkdirSync(p(IC), { recursive: true });
		ensureDirs();
		const initial: ChainLedger = ChainLedgerSchema.parse({
			project_id: projectName,
			iteration: 0,
			updated_at: now(),
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
		saveCurrent(initial);
		writeFileSync(
			p(IC, "project.yml"),
			YAML.stringify({ project_name: projectName, created_at: now() }),
		);
		if (!existsSync(p(IC, "ledger.jsonl")))
			writeFileSync(p(IC, "ledger.jsonl"), "");
		console.log("Initialized Inference Chain.");
	});

program.command("install-claude").action(() => {
	mkdirSync(p(".claude", "commands"), { recursive: true });
	writeFileSync(
		p(".claude/commands/ic-checkpoint.md"),
		"# Inference Chain Checkpoint\n\nGenerate an Interaction Update and save to .inference-chain/inbox/latest-update.yml",
	);
	writeFileSync(
		p(".claude/commands/ic-stop.md"),
		"# Inference Chain Stop\n\nGenerate a Session Brief and save to .inference-chain/inbox/latest-brief.yml",
	);
	writeFileSync(
		p(".claude/commands/ic-evolve.md"),
		"# Inference Chain Evolve\n\nGenerate Memory Evolution Record to .inference-chain/inbox/latest-evolution.yml",
	);
	writeFileSync(
		p(".claude/commands/ic-resume.md"),
		"# Inference Chain Resume\n\nRead .inference-chain/resumes/resume_latest.md and continue from frontier.",
	);
	console.log("Installed Claude commands.");
});

program
	.command("ingest")
	.argument("<file>")
	.action((file) => {
		const raw = YAML.parse(readFileSync(p(file), "utf8"));
		try {
			InteractionUpdateSchema.parse(raw);
			copyFileSync(p(file), p(IC, "updates", `${raw.id}.yml`));
			console.log("Ingested InteractionUpdate");
			return;
		} catch {}
		try {
			SessionBriefSchema.parse(raw);
			copyFileSync(p(file), p(IC, "briefs", `${raw.id}.yml`));
			console.log("Ingested SessionBrief");
			return;
		} catch {}
		try {
			ChainLedgerSchema.parse(raw);
			copyFileSync(
				p(file),
				p(IC, "evolutions", `${raw.iteration}-${nanoid()}.yml`),
			);
			console.log("Ingested ChainLedger");
			return;
		} catch {}
		throw new Error("Unrecognized artifact format");
	});

program
	.command("evolve")
	.option("--advance")
	.action((opts) => {
		const ledger = loadCurrent();
		const updatePath = p(IC, "inbox", "latest-update.yml");
		const briefPath = p(IC, "inbox", "latest-brief.yml");
		const beforeScore = scoreLedger(ledger);
		let evolved: ChainLedger;

		if (existsSync(briefPath)) {
			const brief = SessionBriefSchema.parse(
				YAML.parse(readFileSync(briefPath, "utf8")),
			);
			evolved = evolveLedger(ledger, { kind: "session", value: brief }, true);
			consumeInbox(briefPath, p(IC, "briefs"), `${brief.id}.yml`);
		} else if (existsSync(updatePath)) {
			const upd = InteractionUpdateSchema.parse(
				YAML.parse(readFileSync(updatePath, "utf8")),
			);
			evolved = evolveLedger(
				ledger,
				{ kind: "interaction", value: upd },
				Boolean(opts.advance),
			);
			consumeInbox(updatePath, p(IC, "updates"), `${upd.id}.yml`);
		} else throw new Error("No inbox artifact found.");

		saveCurrent(ChainLedgerSchema.parse(evolved));
		const afterScore = scoreLedger(evolved);
		console.log(`Ledger evolved. score: ${beforeScore} -> ${afterScore}`);
	});
program
	.command("resume")
	.option("--silent")
	.action(({ silent }) => {
		const l = loadCurrent();
		const text = `# Inference Chain Resume Brief\n\nIteration ${l.iteration}\n\n## Current operating model\n${l.current_operating_model.summary}\n\n## Next best actions\n${l.current_frontier.next_best_action.map((x) => `- ${x}`).join("\n")}\n\n## Do not repeat\n${l.do_not_repeat.map((x) => `- ${x}`).join("\n")}`;
		writeFileSync(p(IC, "resumes", "resume_latest.md"), text);
		if (!silent) console.log(text);
	});
program.command("status").action(() => {
	const l = loadCurrent();
	console.log(
		`iteration=${l.iteration} do_not_repeat=${l.do_not_repeat.length}`,
	);
});
program.command("verify").action(() => {
	if (!existsSync(p(IC, "ledger.jsonl")))
		throw new Error("Missing ledger.jsonl");
	console.log("ledger.jsonl present");
});
program.parse();
