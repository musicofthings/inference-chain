#!/usr/bin/env node
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
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
	])
		mkdirSync(p(IC, d), { recursive: true });
}
function loadCurrent(): ChainLedger {
	return YAML.parse(readFileSync(p(IC, "current.yml"), "utf8"));
}
function saveCurrent(ledger: ChainLedger) {
	writeFileSync(p(IC, "current.yml"), YAML.stringify(ledger));
}
function loadProject(): Record<string, unknown> {
	const projectPath = p(IC, "project.yml");
	if (!existsSync(projectPath)) return {};
	return YAML.parse(readFileSync(projectPath, "utf8")) as Record<
		string,
		unknown
	>;
}
function saveProject(project: Record<string, unknown>) {
	writeFileSync(p(IC, "project.yml"), YAML.stringify(project));
}

function consumeInbox(
	artifactPath: string,
	archiveDir: string,
	archiveName: string,
): void {
	mkdirSync(archiveDir, { recursive: true });
	copyFileSync(artifactPath, join(archiveDir, archiveName));
	unlinkSync(artifactPath);
}

const program = new Command();
program.name("ic");
program
	.command("init")
	.option("--project-name <name>")
	.action(({ projectName }) => {
		const inferredName = basename(process.cwd());
		const finalName = projectName || inferredName;
		mkdirSync(p(IC), { recursive: true });
		ensureDirs();
		const initial: ChainLedger = ChainLedgerSchema.parse({
			project_id: finalName,
			iteration: 0,
			updated_at: now(),
			global_objective: finalName,
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
		saveProject({
			project_name: finalName,
			created_at: now(),
			goal: null,
			max_iterations: null,
			cwd: process.cwd(),
		});
		if (!existsSync(p(IC, "ledger.jsonl")))
			writeFileSync(p(IC, "ledger.jsonl"), "");
		const claudeDetected = existsSync(p(".claude"));
		console.log(
			`Initialized Inference Chain for '${finalName}' (cwd: ${process.cwd()}).`,
		);
		if (!claudeDetected)
			console.log("Claude Code directory not detected. Run: ic install-claude");
	});

program
	.command("install-claude")
	.option("--force")
	.action(({ force }) => {
		const claudeExists = existsSync(p(".claude"));
		if (claudeExists && !force) {
			console.log(
				"Claude Code already detected (.claude exists). Skipping install. Use --force to overwrite command files.",
			);
			return;
		}
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
		writeFileSync(
			p(".claude/commands/goal.md"),
			'# Goal\n\nSet session goal and loop cap: ic goal --set "..." --max-iterations 5',
		);
		console.log("Installed Claude command templates.");
	});

program
	.command("goal")
	.option("--set <goal>")
	.option("--max-iterations <n>")
	.action(({ set, maxIterations }) => {
		const project = loadProject();
		if (set) project.goal = set;
		if (maxIterations) project.max_iterations = Number(maxIterations);
		saveProject(project);
		console.log(
			`Goal updated. goal=${String(project.goal ?? "")}, max_iterations=${String(project.max_iterations ?? "")}`,
		);
	});

program.command("health").action(() => {
	const checks = [
		["chain dir", existsSync(p(IC))],
		["current ledger", existsSync(p(IC, "current.yml"))],
		["project config", existsSync(p(IC, "project.yml"))],
		["inbox", existsSync(p(IC, "inbox"))],
		[
			"claude installed",
			existsSync(p(".claude", "commands", "ic-checkpoint.md")),
		],
	];
	for (const [name, ok] of checks)
		console.log(`${ok ? "OK" : "MISSING"} - ${name}`);
});

program.command("doctor").action(() => {
	console.log("Inference Chain Doctor");
	console.log(`cwd=${process.cwd()}`);
	console.log(`node=${process.version}`);
	if (!existsSync(p(IC))) console.log("Run: ic init");
	if (!existsSync(p(".claude"))) console.log("Run: ic install-claude");
	if (existsSync(p(IC, "project.yml")))
		console.log(readFileSync(p(IC, "project.yml"), "utf8"));
});

program
	.command("theme")
	.option("--oh-my-posh")
	.action(({ ohMyPosh }) => {
		if (ohMyPosh) {
			const snippet =
				"function ic_prompt(){ ic status 2>/dev/null; }\n# source in your shell profile if needed";
			writeFileSync(p(IC, "prompts", "oh-my-posh-snippet.txt"), snippet);
			console.log(`Wrote ${IC}/prompts/oh-my-posh-snippet.txt`);
			return;
		}
		console.log("Use: ic theme --oh-my-posh");
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
		const project = loadProject();
		const maxIterations = Number(project.max_iterations ?? Number.NaN);
		const ledger = loadCurrent();
		if (Number.isFinite(maxIterations) && ledger.iteration >= maxIterations) {
			console.log(
				`Goal loop cap reached at iteration ${ledger.iteration}. No further evolve performed.`,
			);
			return;
		}
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
		console.log(
			`Ledger evolved. score: ${beforeScore} -> ${scoreLedger(evolved)}`,
		);
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
