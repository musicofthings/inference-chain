import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import YAML from 'yaml';
import { evolveLedger, scoreLedger } from './core/evolve.js';
import { type LedgerEvent, makeEvent } from './core/events.js';
import { renderResumeBrief } from './core/resume.js';
import {
  ChainLedgerSchema,
  InteractionUpdateSchema,
  SCHEMA_VERSION,
  SessionBriefSchema,
  type ChainLedger,
} from './core/schemas.js';
import {
  appendEvent,
  ensureLedgerFile,
  lastEvent,
  verifyChain,
} from './storage/jsonl.js';
import { IC_DIR, PATHS, SUBDIRS, ic, p } from './storage/paths.js';
import {
  eventCount,
  insertBrief,
  insertEvent,
  insertEvolution,
  insertUpdate,
  openDb,
  upsertChainState,
} from './storage/sqlite.js';

type StepKind = 'session_brief' | 'interaction_update';

type StepRecord = {
  index: number;
  file: string;
  kind: StepKind;
  iteration_before: number;
  iteration_after: number;
  score_before: number;
  score_after: number;
  added_stable: string[];
  added_rejected: string[];
  added_do_not_repeat: string[];
  frontier_before: string[];
  frontier_after: string[];
  hypotheses_active: number;
  hypotheses_promoted_this_step: number;
};

type SimulationReport = {
  scenario: string;
  steps_run: number;
  iterations_advanced: number;
  final_score: number;
  final_iteration: number;
  metrics: {
    anti_repeat_coverage: number;
    hypothesis_promotion_rate: number;
    frontier_convergence: number;
    rejected_persistence: number;
    score_progression: number;
    final_brief_size_kb: number;
  };
  verdict: {
    n_plus_1_positive: boolean;
    notes: string[];
  };
  per_step: StepRecord[];
};

const norm = (s: string) => s.trim().toLowerCase();

function ensureDirs(): void {
  mkdirSync(p(IC_DIR), { recursive: true });
  for (const d of SUBDIRS) mkdirSync(ic(d), { recursive: true });
}

function loadCurrent(): ChainLedger {
  return ChainLedgerSchema.parse(YAML.parse(readFileSync(PATHS.currentYml(), 'utf8')));
}

function saveCurrent(ledger: ChainLedger): string {
  const yaml = YAML.stringify(ledger);
  writeFileSync(PATHS.currentYml(), yaml);
  return yaml;
}

function appendChainEvent(args: {
  projectId: string;
  iteration: number;
  type: LedgerEvent['type'];
  payload: unknown;
}): LedgerEvent {
  ensureLedgerFile(PATHS.ledgerJsonl());
  const prev = lastEvent(PATHS.ledgerJsonl());
  const event = makeEvent({
    ...args,
    schemaVersion: SCHEMA_VERSION,
    parent: prev ? { id: prev.id, hash: prev.hash } : null,
  });
  appendEvent(PATHS.ledgerJsonl(), event);
  const db = openDb(PATHS.db());
  try {
    insertEvent(db, event);
  } finally {
    db.close();
  }
  return event;
}

function initFresh(projectName: string): void {
  if (existsSync(p(IC_DIR))) {
    rmSync(p(IC_DIR), { recursive: true, force: true });
  }
  ensureDirs();
  ensureLedgerFile(PATHS.ledgerJsonl());
  const initial: ChainLedger = ChainLedgerSchema.parse({
    project_id: projectName,
    iteration: 0,
    updated_at: new Date().toISOString(),
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
  const yaml = saveCurrent(initial);
  writeFileSync(
    PATHS.projectYml(),
    YAML.stringify({ project_name: projectName, created_at: new Date().toISOString() }),
  );
  const db = openDb(PATHS.db());
  try {
    upsertChainState(db, initial, yaml);
  } finally {
    db.close();
  }
  appendChainEvent({
    projectId: projectName,
    iteration: 0,
    type: 'project_initialized',
    payload: { project_name: projectName, via: 'simulate' },
  });
}

function detectKind(raw: { kind?: string }): StepKind {
  if (raw.kind === 'session_brief') return 'session_brief';
  if (raw.kind === 'interaction_update') return 'interaction_update';
  throw new Error(
    `simulate: artifact missing or has unsupported kind: ${String(raw.kind)} (expected interaction_update or session_brief)`,
  );
}

function diffStrings(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before.map(norm));
  return after.filter((s) => !beforeSet.has(norm(s)));
}

function diffRejected(
  before: { hypothesis: string }[],
  after: { hypothesis: string }[],
): string[] {
  const beforeSet = new Set(before.map((r) => norm(r.hypothesis)));
  return after.filter((r) => !beforeSet.has(norm(r.hypothesis))).map((r) => r.hypothesis);
}

function color(c: 'green' | 'red' | 'yellow' | 'cyan' | 'dim', s: string): string {
  if (!process.stdout.isTTY) return s;
  const codes = { green: 32, red: 31, yellow: 33, cyan: 36, dim: 2 };
  return `\x1b[${codes[c]}m${s}\x1b[0m`;
}

export async function runSimulation(opts: {
  dir: string;
  reset: boolean;
  projectName: string;
  jsonOnly: boolean;
}): Promise<SimulationReport> {
  const dirAbs = resolve(opts.dir);
  if (!existsSync(dirAbs) || !statSync(dirAbs).isDirectory()) {
    throw new Error(`simulate: directory not found: ${dirAbs}`);
  }
  const files = readdirSync(dirAbs)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();
  if (files.length === 0) {
    throw new Error(`simulate: no .yml/.yaml files in ${dirAbs}`);
  }

  if (opts.reset) {
    initFresh(opts.projectName);
  } else if (!existsSync(PATHS.currentYml())) {
    throw new Error(
      'simulate: no existing .inference-chain/ project found in cwd. Pass --reset to start fresh.',
    );
  }

  const startLedger = loadCurrent();
  const startIteration = startLedger.iteration;
  const startScore = scoreLedger(startLedger);
  let totalPromoted = 0;
  let totalActiveAtPromoteTime = 0;
  const perStep: StepRecord[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullPath = join(dirAbs, file);
    const raw = YAML.parse(readFileSync(fullPath, 'utf8')) as { kind?: string };
    const kind = detectKind(raw);

    const before = loadCurrent();
    const beforeScore = scoreLedger(before);
    let result: ReturnType<typeof evolveLedger>;
    if (kind === 'session_brief') {
      const brief = SessionBriefSchema.parse(raw);
      result = evolveLedger(before, { kind: 'session', value: brief }, true);
      const inboxCopy = ic('inbox', 'latest-brief.yml');
      copyFileSync(fullPath, inboxCopy);
      const db = openDb(PATHS.db());
      try {
        insertBrief(db, {
          id: brief.id,
          projectId: brief.project_id,
          iteration: brief.iteration,
          yaml: YAML.stringify(brief),
          createdAt: new Date().toISOString(),
        });
      } finally {
        db.close();
      }
      appendChainEvent({
        projectId: brief.project_id,
        iteration: brief.iteration,
        type: 'session_brief_captured',
        payload: { id: brief.id, via: 'simulate' },
      });
    } else {
      const upd = InteractionUpdateSchema.parse(raw);
      result = evolveLedger(before, { kind: 'interaction', value: upd }, false);
      copyFileSync(fullPath, ic('inbox', 'latest-update.yml'));
      const db = openDb(PATHS.db());
      try {
        insertUpdate(db, {
          id: upd.id,
          projectId: upd.project_id,
          iteration: upd.iteration,
          yaml: YAML.stringify(upd),
          createdAt: new Date().toISOString(),
        });
      } finally {
        db.close();
      }
      appendChainEvent({
        projectId: upd.project_id,
        iteration: upd.iteration,
        type: 'interaction_update_captured',
        payload: { id: upd.id, trigger: upd.trigger, via: 'simulate' },
      });
    }

    const after = ChainLedgerSchema.parse(result.updatedLedger);
    const afterYaml = saveCurrent(after);
    const recordYaml = YAML.stringify(result.evolutionRecord);
    writeFileSync(ic('evolutions', `${result.evolutionRecord.id}.yml`), recordYaml);
    const db = openDb(PATHS.db());
    try {
      insertEvolution(db, {
        id: result.evolutionRecord.id,
        projectId: result.evolutionRecord.project_id,
        fromIteration: result.evolutionRecord.from_iteration,
        toIteration: result.evolutionRecord.to_iteration,
        yaml: recordYaml,
        createdAt: result.evolutionRecord.created_at,
      });
      upsertChainState(db, after, afterYaml);
    } finally {
      db.close();
    }
    appendChainEvent({
      projectId: after.project_id,
      iteration: result.evolutionRecord.to_iteration,
      type: 'memory_evolution_created',
      payload: { id: result.evolutionRecord.id, source: result.evolutionRecord.source, via: 'simulate' },
    });
    appendChainEvent({
      projectId: after.project_id,
      iteration: after.iteration,
      type: 'ledger_evolved',
      payload: {
        from: result.evolutionRecord.from_iteration,
        to: result.evolutionRecord.to_iteration,
        source: kind === 'session_brief' ? 'session' : 'interaction',
        via: 'simulate',
      },
    });

    const promotedThisStep = result.evolutionRecord.promoted_to_stable.length;
    totalPromoted += promotedThisStep;
    totalActiveAtPromoteTime += before.active_hypotheses.length;

    const step: StepRecord = {
      index: i + 1,
      file,
      kind,
      iteration_before: before.iteration,
      iteration_after: after.iteration,
      score_before: beforeScore,
      score_after: scoreLedger(after),
      added_stable: diffStrings(before.stable_learnings, after.stable_learnings),
      added_rejected: diffRejected(before.rejected_hypotheses, after.rejected_hypotheses),
      added_do_not_repeat: diffStrings(before.do_not_repeat, after.do_not_repeat),
      frontier_before: before.current_frontier.next_best_action,
      frontier_after: after.current_frontier.next_best_action,
      hypotheses_active: after.active_hypotheses.length,
      hypotheses_promoted_this_step: promotedThisStep,
    };
    perStep.push(step);

    if (!opts.jsonOnly) printStep(step);
  }

  // Generate final resume brief and persist
  const finalLedger = loadCurrent();
  const briefText = renderResumeBrief(finalLedger);
  writeFileSync(PATHS.resumeLatest(), briefText);
  appendChainEvent({
    projectId: finalLedger.project_id,
    iteration: finalLedger.iteration,
    type: 'resume_brief_generated',
    payload: { iteration: finalLedger.iteration, via: 'simulate' },
  });

  // Metrics
  const halfwayIteration = Math.floor((finalLedger.iteration + startIteration) / 2);
  const earlyDoNotRepeat = perStep
    .filter((s) => s.iteration_after <= halfwayIteration)
    .flatMap((s) => s.added_do_not_repeat);
  const totalDoNotRepeat = finalLedger.do_not_repeat.length;
  const antiRepeatCoverage =
    totalDoNotRepeat === 0
      ? 0
      : new Set(earlyDoNotRepeat.map(norm)).size / totalDoNotRepeat;

  const hypothesisPromotionRate =
    totalActiveAtPromoteTime === 0
      ? 0
      : totalPromoted / Math.max(1, totalActiveAtPromoteTime);

  const lateFrontierSizes = perStep
    .slice(Math.floor(perStep.length / 2))
    .map((s) => s.frontier_after.length);
  const frontierConvergence =
    lateFrontierSizes.reduce((a, b) => a + b, 0) /
    Math.max(1, lateFrontierSizes.length);

  // Did any rejected belief reappear in active_hypotheses?
  const rejectedSet = new Set(finalLedger.rejected_hypotheses.map((r) => norm(r.hypothesis)));
  const rejectedPersistence = finalLedger.active_hypotheses.filter((h) =>
    rejectedSet.has(norm(h.hypothesis)),
  ).length;

  const finalScore = scoreLedger(finalLedger);
  const iterationsAdvanced = finalLedger.iteration - startIteration;
  const scoreProgression =
    iterationsAdvanced === 0 ? finalScore - startScore : (finalScore - startScore) / iterationsAdvanced;

  const briefSizeKb = Buffer.byteLength(briefText, 'utf8') / 1024;

  const positive =
    antiRepeatCoverage >= 0.5 && rejectedPersistence === 0 && scoreProgression > 0;
  const notes: string[] = [];
  if (antiRepeatCoverage < 0.5)
    notes.push(
      `anti_repeat_coverage ${antiRepeatCoverage.toFixed(2)} < 0.5 — most do-not-repeat items arrived late; scenario may not exercise early lesson capture.`,
    );
  if (rejectedPersistence > 0)
    notes.push(
      `rejected_persistence ${rejectedPersistence} > 0 — a rejected belief reappeared as active; check string-matching fidelity.`,
    );
  if (scoreProgression <= 0)
    notes.push(
      `score_progression ${scoreProgression.toFixed(2)} ≤ 0 — ledger is not accumulating signal over iterations.`,
    );
  if (briefSizeKb > 8)
    notes.push(
      `final_brief_size_kb ${briefSizeKb.toFixed(2)} > 8 — resume brief is getting large; consider lowering IC_RESUME_TOP_K.`,
    );

  // Verify chain integrity at end
  const verify = verifyChain(PATHS.ledgerJsonl());
  const db = openDb(PATHS.db());
  const evtCount = eventCount(db);
  db.close();
  if (!verify.ok) notes.push(`chain verification FAILED with ${verify.errors.length} error(s)`);
  if (evtCount !== verify.total)
    notes.push(`sqlite event count ${evtCount} != jsonl ${verify.total}`);

  const report: SimulationReport = {
    scenario: dirAbs,
    steps_run: perStep.length,
    iterations_advanced: iterationsAdvanced,
    final_score: finalScore,
    final_iteration: finalLedger.iteration,
    metrics: {
      anti_repeat_coverage: Number(antiRepeatCoverage.toFixed(3)),
      hypothesis_promotion_rate: Number(hypothesisPromotionRate.toFixed(3)),
      frontier_convergence: Number(frontierConvergence.toFixed(3)),
      rejected_persistence: rejectedPersistence,
      score_progression: Number(scoreProgression.toFixed(3)),
      final_brief_size_kb: Number(briefSizeKb.toFixed(3)),
    },
    verdict: { n_plus_1_positive: positive, notes },
    per_step: perStep,
  };

  if (opts.jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  return report;
}

function printStep(s: StepRecord): void {
  const arrow = s.iteration_before === s.iteration_after ? '→' : '⇒';
  const scoreDelta = s.score_after - s.score_before;
  const scoreStr =
    scoreDelta > 0
      ? color('green', `+${scoreDelta}`)
      : scoreDelta < 0
        ? color('red', String(scoreDelta))
        : color('dim', '0');
  console.log(
    `\n${color('cyan', `[${s.index}] ${s.file}`)}  ${color('dim', `(${s.kind})`)}  iter ${s.iteration_before}${arrow}${s.iteration_after}  score ${s.score_before}→${s.score_after} ${scoreStr}`,
  );
  if (s.added_stable.length)
    console.log(`  ${color('green', 'stable+')} ${s.added_stable.join(' | ')}`);
  if (s.added_rejected.length)
    console.log(`  ${color('red', 'rejected+')} ${s.added_rejected.join(' | ')}`);
  if (s.added_do_not_repeat.length)
    console.log(`  ${color('yellow', 'do-not-repeat+')} ${s.added_do_not_repeat.join(' | ')}`);
  if (s.hypotheses_promoted_this_step > 0)
    console.log(
      `  ${color('green', `promoted ${s.hypotheses_promoted_this_step}`)} hypothesis/es to stable`,
    );
  if (
    s.frontier_before.join('|') !== s.frontier_after.join('|') &&
    s.frontier_after.length > 0
  ) {
    console.log(`  ${color('cyan', 'frontier:')} ${s.frontier_after.join(' | ')}`);
  }
}

function printReport(r: SimulationReport): void {
  console.log(`\n${color('cyan', '═══ n+1 Sharpness Report ═══')}`);
  console.log(`scenario              ${r.scenario}`);
  console.log(`steps run             ${r.steps_run}`);
  console.log(`iterations advanced   ${r.iterations_advanced}`);
  console.log(`final iteration       ${r.final_iteration}`);
  console.log(`final score           ${r.final_score}`);
  console.log('');
  console.log(`anti_repeat_coverage      ${r.metrics.anti_repeat_coverage}  ${gate(r.metrics.anti_repeat_coverage >= 0.5)}`);
  console.log(`hypothesis_promotion_rate ${r.metrics.hypothesis_promotion_rate}`);
  console.log(`frontier_convergence      ${r.metrics.frontier_convergence}`);
  console.log(`rejected_persistence      ${r.metrics.rejected_persistence}  ${gate(r.metrics.rejected_persistence === 0)}`);
  console.log(`score_progression         ${r.metrics.score_progression}  ${gate(r.metrics.score_progression > 0)}`);
  console.log(`final_brief_size_kb       ${r.metrics.final_brief_size_kb}`);
  console.log('');
  console.log(
    `verdict: ${
      r.verdict.n_plus_1_positive
        ? color('green', 'n+1 POSITIVE — ledger carried useful signal forward')
        : color('red', 'n+1 NOT CONFIRMED — see notes')
    }`,
  );
  if (r.verdict.notes.length) {
    console.log(`notes:`);
    for (const n of r.verdict.notes) console.log(`  - ${n}`);
  }
}

function gate(ok: boolean): string {
  return ok ? color('green', '✓') : color('red', '✗');
}
