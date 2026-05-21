#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { nanoid } from 'nanoid';
import YAML from 'yaml';
import { type LedgerEvent, type LedgerEventType, makeEvent } from './core/events.js';
import { evolveLedger, scoreLedger } from './core/evolve.js';
import { renderResumeBrief } from './core/resume.js';
import {
  ChainLedgerSchema,
  InteractionUpdateSchema,
  MemoryEvolutionRecordSchema,
  SCHEMA_VERSION,
  SessionBriefSchema,
  type ChainLedger,
} from './core/schemas.js';
import { installClaude } from './integrations/claude/install.js';
import {
  appendEvent,
  ensureLedgerFile,
  lastEvent,
  verifyChain,
} from './storage/jsonl.js';
import { TEMPLATE } from './storage/packageAssets.js';
import { IC_DIR, PATHS, SUBDIRS, ic, p } from './storage/paths.js';
import {
  type DB,
  eventCount,
  insertBrief,
  insertEvent,
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

function appendChainEvent(
  db: DB,
  args: {
    projectId: string;
    iteration: number;
    type: LedgerEventType;
    payload: unknown;
  },
): LedgerEvent {
  const prev = lastEvent(PATHS.ledgerJsonl());
  const event = makeEvent({
    projectId: args.projectId,
    iteration: args.iteration,
    type: args.type,
    payload: args.payload,
    schemaVersion: SCHEMA_VERSION,
    parent: prev ? { id: prev.id, hash: prev.hash } : null,
  });
  appendEvent(PATHS.ledgerJsonl(), event);
  insertEvent(db, event);
  return event;
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

function archiveInbox(inboxPath: string, archiveDir: string, id: string): void {
  const dest = join(archiveDir, `${id}.yml`);
  mkdirSync(archiveDir, { recursive: true });
  renameSync(inboxPath, dest);
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
        const dest = ic('evolutions', `ledger-${parsed.iteration}-${nanoid(6)}.yml`);
        copyFileSync(p(file), dest);
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
    const briefPath = PATHS.inboxBrief();
    const updatePath = PATHS.inboxUpdate();
    const beforeScore = scoreLedger(ledger);

    let result: ReturnType<typeof evolveLedger>;
    let sourceKind: 'session' | 'interaction';
    let sourceId: string;
    let archive: () => void;

    if (existsSync(briefPath)) {
      const brief = SessionBriefSchema.parse(YAML.parse(readFileSync(briefPath, 'utf8')));
      result = evolveLedger(ledger, { kind: 'session', value: brief }, true);
      sourceKind = 'session';
      sourceId = brief.id;
      archive = () => archiveInbox(briefPath, ic('briefs'), brief.id);
    } else if (existsSync(updatePath)) {
      const upd = InteractionUpdateSchema.parse(YAML.parse(readFileSync(updatePath, 'utf8')));
      result = evolveLedger(ledger, { kind: 'interaction', value: upd }, Boolean(opts.advance));
      sourceKind = 'interaction';
      sourceId = upd.id;
      archive = () => archiveInbox(updatePath, ic('updates'), upd.id);
    } else {
      throw new Error(
        'No inbox artifact found. Expected .inference-chain/inbox/latest-brief.yml or latest-update.yml.',
      );
    }

    const validated = ChainLedgerSchema.parse(result.updatedLedger);
    const validatedRecord = MemoryEvolutionRecordSchema.parse(result.evolutionRecord);
    const ledgerYaml = saveCurrent(validated);
    const recordYaml = YAML.stringify(validatedRecord);
    writeFileSync(ic('evolutions', `${validatedRecord.id}.yml`), recordYaml);

    const db = openProjectDb();
    try {
      insertEvolution(db, {
        id: validatedRecord.id,
        projectId: validatedRecord.project_id,
        fromIteration: validatedRecord.from_iteration,
        toIteration: validatedRecord.to_iteration,
        yaml: recordYaml,
        createdAt: validatedRecord.created_at,
      });
      upsertChainState(db, validated, ledgerYaml);
      appendChainEvent(db, {
        projectId: validated.project_id,
        iteration: validatedRecord.to_iteration,
        type: 'memory_evolution_created',
        payload: { id: validatedRecord.id, source: validatedRecord.source, from: sourceId },
      });
      appendChainEvent(db, {
        projectId: validated.project_id,
        iteration: validated.iteration,
        type: 'ledger_evolved',
        payload: {
          from: validatedRecord.from_iteration,
          to: validatedRecord.to_iteration,
          source: sourceKind,
        },
      });
    } finally {
      db.close();
    }

    archive();

    const afterScore = scoreLedger(validated);
    console.log(
      `Ledger evolved (iteration ${validatedRecord.from_iteration} -> ${validatedRecord.to_iteration}). score: ${beforeScore} -> ${afterScore}`,
    );
  });

program
  .command('resume')
  .option('--silent', 'Do not print to stdout')
  .option('--target <agent>', 'Resume target agent (default: claude-code)', 'claude-code')
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
  const report = verifyChain(PATHS.ledgerJsonl());
  const db = openProjectDb();
  const sqliteCount = eventCount(db);
  db.close();
  if (!report.ok) {
    console.error(`Chain integrity FAILED. ${report.errors.length} error(s):`);
    for (const e of report.errors) {
      console.error(`  [${e.index}] ${e.eventId}: ${e.reason}`);
    }
    process.exit(1);
  }
  if (sqliteCount !== report.total) {
    console.error(`Event count mismatch: jsonl=${report.total} sqlite=${sqliteCount}`);
    process.exit(1);
  }
  console.log(`OK: ${report.total} events, hash chain valid, sqlite in sync.`);
});

program.parse();
