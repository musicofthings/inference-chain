#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { Command } from 'commander';
import { nanoid } from 'nanoid';
import YAML from 'yaml';
import { scoreLedger } from './core/evolve.js';
import { renderResumeBrief } from './core/resume.js';
import {
  ChainLedgerSchema,
  InteractionUpdateSchema,
  MemoryEvolutionRecordSchema,
  SessionBriefSchema,
  type ChainLedger,
} from './core/schemas.js';
import { installClaude } from './integrations/claude/install.js';
import { installTeams } from './integrations/teams/install.js';
import { ensureLedgerFile } from './storage/jsonl.js';
import { TEMPLATE } from './storage/packageAssets.js';
import { IC_DIR, PATHS, SUBDIRS, ic, p } from './storage/paths.js';
import {
  appendChainEvent,
  resolveInboxSource,
  runEvolution,
  verifyLedger,
} from './storage/persist.js';
import {
  type DB,
  eventCount,
  insertBrief,
  insertEvolution,
  insertUpdate,
  openDb,
  upsertChainState,
} from './storage/sqlite.js';

const now = () => new Date().toISOString();

function ensureDirs(): void {
  mkdirSync(p(IC_DIR), { recursive: true });
  for (const d of SUBDIRS) mkdirSync(ic(d), { recursive: true });
}

function loadCurrent(): ChainLedger {
  if (!existsSync(PATHS.currentYml())) {
    throw new Error(`Missing ${PATHS.currentYml()}. Run "ic init" first.`);
  }
  return ChainLedgerSchema.parse(YAML.parse(readFileSync(PATHS.currentYml(), 'utf8')));
}

function saveCurrent(ledger: ChainLedger): string {
  const yaml = YAML.stringify(ledger);
  writeFileSync(PATHS.currentYml(), yaml);
  return yaml;
}

function openProjectDb(): DB {
  return openDb(PATHS.db());
}

function copyPromptTemplates(): void {
  const targets: [string, string][] = [
    [TEMPLATE.promptCaptureUpdate(), ic('prompts', 'capture-interaction-update.md')],
    [TEMPLATE.promptCaptureBrief(), ic('prompts', 'capture-session-brief.md')],
    [TEMPLATE.promptEvolveLedger(), ic('prompts', 'evolve-ledger.md')],
    [TEMPLATE.promptResumeSession(), ic('prompts', 'resume-session.md')],
  ];
  for (const [src, dst] of targets) {
    if (existsSync(src)) copyFileSync(src, dst);
  }
}

// ───────────────────────── CLI ─────────────────────────

const program = new Command();
program.name('ic').description('Inference Chain — forward-only n+1 inference ledger.');

program
  .command('init')
  .requiredOption('--project-name <name>')
  .action(({ projectName }: { projectName: string }) => {
    ensureDirs();
    ensureLedgerFile(PATHS.ledgerJsonl());
    copyPromptTemplates();

    const initial: ChainLedger = ChainLedgerSchema.parse({
      project_id: projectName,
      iteration: 0,
      updated_at: now(),
      global_objective: projectName,
      current_operating_model: { summary: 'Initial project state.', confidence: 'medium' },
      stable_learnings: [],
      active_hypotheses: [],
      rejected_hypotheses: [],
      stable_decisions: [],
      recurring_failure_patterns: [],
      open_questions: [],
      current_frontier: { next_best_action: ['Define first milestone'], blockers: [], risks: [] },
      do_not_repeat: [],
      continuity_summary: 'Project initialized.',
    });
    const ledgerYaml = saveCurrent(initial);
    writeFileSync(
      PATHS.projectYml(),
      YAML.stringify({ project_name: projectName, created_at: now() }),
    );

    const db = openProjectDb();
    upsertChainState(db, initial, ledgerYaml);
    appendChainEvent(db, {
      projectId: initial.project_id,
      iteration: initial.iteration,
      type: 'project_initialized',
      payload: { project_name: projectName },
    });
    db.close();

    console.log(`Initialized Inference Chain at ${PATHS.root()}`);
  });

program
  .command('install-claude')
  .option('--overwrite', 'Overwrite existing .claude files')
  .action((opts: { overwrite?: boolean }) => {
    const res = installClaude({ overwrite: opts.overwrite });
    console.log(
      `Installed Claude commands: ${
        res.installedCommands.length ? res.installedCommands.join(', ') : '(none; existing files preserved)'
      }`,
    );
    console.log(`Merged hook config into ${res.settingsPath}`);
    if (res.pluginInstalled) {
      console.log('Installed Claude Code Plugin scaffold at .claude/plugins/inference-chain/');
    }
  });

const teams = program
  .command('teams')
  .description('Team mode — shared .inference/ masterplan synthesized via Git hooks.');

teams
  .command('init')
  .description('Scaffold .inference/, the Husky pre-commit hook, and the bot-distillation GitHub Action into this repo.')
  .option('--overwrite', 'Overwrite existing teams files')
  .action((opts: { overwrite?: boolean }) => {
    const res = installTeams({ overwrite: opts.overwrite });
    console.log(`Installed team mode into ${res.inferenceDir}`);
    console.log(
      `  files: ${res.installedFiles.length ? `${res.installedFiles.length} written` : '(none; existing files preserved — use --overwrite)'}`,
    );
    console.log(`  husky pre-commit: ${res.huskyInstalled ? 'installed' : 'skipped (exists)'}`);
    console.log(`  bot-distill workflow: ${res.workflowInstalled ? 'installed' : 'skipped (exists)'}`);
    if (res.packageJsonPatched) console.log('  package.json: added "prepare": "husky"');
    console.log('Next: pnpm add -D husky && pnpm install, export ANTHROPIC_API_KEY, then author .inference/dev_<name>.md');
  });

program
  .command('ingest')
  .argument('<file>')
  .action((file: string) => {
    const raw = YAML.parse(readFileSync(p(file), 'utf8')) as { kind?: string };
    const kind = raw?.kind;
    if (!kind) {
      throw new Error(
        `Artifact at ${file} is missing a top-level "kind" field. Expected one of: interaction_update, session_brief, memory_evolution_record, chain_ledger.`,
      );
    }
    const db = openProjectDb();
    const createdAt = now();
    try {
      if (kind === 'interaction_update') {
        const parsed = InteractionUpdateSchema.parse(raw);
        const dest = ic('updates', `${parsed.id}.yml`);
        copyFileSync(p(file), dest);
        insertUpdate(db, {
          id: parsed.id,
          projectId: parsed.project_id,
          iteration: parsed.iteration,
          yaml: YAML.stringify(parsed),
          createdAt,
        });
        appendChainEvent(db, {
          projectId: parsed.project_id,
          iteration: parsed.iteration,
          type: 'interaction_update_captured',
          payload: { id: parsed.id, trigger: parsed.trigger },
        });
        console.log(`Ingested InteractionUpdate ${parsed.id}`);
      } else if (kind === 'session_brief') {
        const parsed = SessionBriefSchema.parse(raw);
        const dest = ic('briefs', `${parsed.id}.yml`);
        copyFileSync(p(file), dest);
        insertBrief(db, {
          id: parsed.id,
          projectId: parsed.project_id,
          iteration: parsed.iteration,
          yaml: YAML.stringify(parsed),
          createdAt,
        });
        appendChainEvent(db, {
          projectId: parsed.project_id,
          iteration: parsed.iteration,
          type: 'session_brief_captured',
          payload: { id: parsed.id, primary_goal: parsed.session_intent.primary_goal },
        });
        console.log(`Ingested SessionBrief ${parsed.id}`);
      } else if (kind === 'memory_evolution_record') {
        const parsed = MemoryEvolutionRecordSchema.parse(raw);
        const dest = ic('evolutions', `${parsed.id}.yml`);
        copyFileSync(p(file), dest);
        insertEvolution(db, {
          id: parsed.id,
          projectId: parsed.project_id,
          fromIteration: parsed.from_iteration,
          toIteration: parsed.to_iteration,
          yaml: YAML.stringify(parsed),
          createdAt,
        });
        appendChainEvent(db, {
          projectId: parsed.project_id,
          iteration: parsed.to_iteration,
          type: 'memory_evolution_created',
          payload: { id: parsed.id, source: parsed.source },
        });
        console.log(`Ingested MemoryEvolutionRecord ${parsed.id}`);
      } else if (kind === 'chain_ledger') {
        const parsed = ChainLedgerSchema.parse(raw);
        const snapshotId = `ledger-${parsed.iteration}-${nanoid(6)}`;
        const dest = ic('evolutions', `${snapshotId}.yml`);
        copyFileSync(p(file), dest);
        appendChainEvent(db, {
          projectId: parsed.project_id,
          iteration: parsed.iteration,
          // Snapshot ingest still belongs in the chain: re-use ledger_evolved
          // so verify counts stay coherent with the artifact set on disk.
          type: 'ledger_evolved',
          payload: { snapshot: snapshotId, iteration: parsed.iteration, source: 'snapshot' },
        });
        console.log(`Ingested ChainLedger snapshot for iteration ${parsed.iteration}`);
      } else {
        throw new Error(`Unknown kind: ${kind}`);
      }
    } finally {
      db.close();
    }
  });

program
  .command('evolve')
  .option('--advance', 'Increment iteration even when evolving from an InteractionUpdate')
  .action((opts: { advance?: boolean }) => {
    const ledger = loadCurrent();
    const resolved = resolveInboxSource({ advance: opts.advance });

    const db = openProjectDb();
    try {
      resolved.ensureCaptured(db);
      const outcome = runEvolution({
        db,
        ledger,
        source: resolved.source,
        advance: resolved.advance,
        sourceId: resolved.sourceId,
        archiveInbox: resolved.archive,
      });
      console.log(
        `Ledger evolved (iteration ${outcome.record.from_iteration} -> ${outcome.record.to_iteration}). score: ${outcome.scoreBefore} -> ${outcome.scoreAfter}`,
      );
    } finally {
      db.close();
    }
  });

program
  .command('resume')
  .option('--silent', 'Do not print to stdout')
  .action(({ silent }: { silent?: boolean }) => {
    const ledger = loadCurrent();
    const text = renderResumeBrief(ledger);
    writeFileSync(PATHS.resumeLatest(), text);

    const db = openProjectDb();
    try {
      appendChainEvent(db, {
        projectId: ledger.project_id,
        iteration: ledger.iteration,
        type: 'resume_brief_generated',
        payload: { iteration: ledger.iteration },
      });
    } finally {
      db.close();
    }

    if (!silent) console.log(text);
  });

program.command('status').action(() => {
  const ledger = loadCurrent();
  const db = openProjectDb();
  const count = eventCount(db);
  db.close();
  console.log(`project        ${ledger.project_id}`);
  console.log(`iteration      ${ledger.iteration}`);
  console.log(`events         ${count}`);
  console.log(`stable         ${ledger.stable_learnings.length}`);
  console.log(`active_hyp     ${ledger.active_hypotheses.length}`);
  console.log(`rejected_hyp   ${ledger.rejected_hypotheses.length}`);
  console.log(`do_not_repeat  ${ledger.do_not_repeat.length}`);
  console.log(`next           ${ledger.current_frontier.next_best_action.length}`);
  console.log(`blockers       ${ledger.current_frontier.blockers.length}`);
  console.log(`score          ${scoreLedger(ledger)}`);
});

program
  .command('mcp')
  .description('Start an MCP stdio server (for Claude Desktop and other MCP clients).')
  .option('--cwd <dir>', 'Project directory (overrides process cwd)')
  .action(async (opts: { cwd?: string }) => {
    if (opts.cwd) process.chdir(opts.cwd);
    const { startMcpServer } = await import('./mcp/server.js');
    await startMcpServer();
  });

program
  .command('simulate')
  .description(
    'Replay a directory of session/update YAML artifacts sequentially, capturing n+1 metrics.',
  )
  .argument('<dir>', 'Directory containing session-*.yml files (lexicographic order)')
  .option('--reset', 'Wipe .inference-chain/ and re-init before running')
  .option('--project-name <name>', 'Project name to use on --reset', 'simulation')
  .option('--json', 'Emit final report as JSON only')
  .action(async (dir: string, opts: { reset?: boolean; projectName: string; json?: boolean }) => {
    const { runSimulation } = await import('./simulate.js');
    await runSimulation({
      dir,
      reset: Boolean(opts.reset),
      projectName: opts.projectName,
      jsonOnly: Boolean(opts.json),
    });
  });

program.command('verify').action(() => {
  if (!existsSync(PATHS.ledgerJsonl())) {
    console.error('Missing ledger.jsonl');
    process.exit(1);
  }
  const db = openProjectDb();
  let v: ReturnType<typeof verifyLedger>;
  try {
    v = verifyLedger(db);
  } finally {
    db.close();
  }
  if (!v.ok) {
    console.error(`Chain integrity FAILED. ${v.errors.length} error(s):`);
    for (const e of v.errors) {
      console.error(`  [${e.index}] ${e.eventId}: ${e.reason}`);
    }
    process.exit(1);
  }
  if (!v.inSync) {
    if (v.sqliteEventCount !== v.total) {
      console.error(
        `Event count mismatch: jsonl=${v.total} sqlite=${v.sqliteEventCount}`,
      );
    }
    for (const m of v.hashMismatches) {
      console.error(`  ${m.eventId}: ${m.reason}`);
    }
    process.exit(1);
  }
  console.log(`OK: ${v.total} events, hash chain valid, sqlite in sync.`);
});

program.parseAsync(process.argv).catch((err: unknown) => {
  // Boundary errors (missing project, malformed inbox YAML, schema failures)
  // should read as a one-line message, not a raw stack trace.
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`ic: ${msg}`);
  process.exit(1);
});
