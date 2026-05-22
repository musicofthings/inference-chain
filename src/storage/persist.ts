import { appendFileSync, renameSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
import { type LedgerEvent, type LedgerEventType, makeEvent } from '../core/events.js';
import {
  evolveLedger,
  scoreLedger,
  type EvolveOptions,
  type Source,
} from '../core/evolve.js';
import {
  ChainLedgerSchema,
  MemoryEvolutionRecordSchema,
  SCHEMA_VERSION,
  type ChainLedger,
} from '../core/schemas.js';
import { appendEvent, ensureLedgerFile, lastEvent } from './jsonl.js';
import { PATHS } from './paths.js';
import {
  type DB,
  insertEvent,
  insertEvolution,
  upsertChainState,
} from './sqlite.js';

export type ChainEventDraft = {
  projectId: string;
  iteration: number;
  type: LedgerEventType;
  payload: unknown;
};

function buildEventChain(
  prev: LedgerEvent | null,
  drafts: ChainEventDraft[],
): LedgerEvent[] {
  const out: LedgerEvent[] = [];
  let parent = prev;
  for (const d of drafts) {
    const ev = makeEvent({
      ...d,
      schemaVersion: SCHEMA_VERSION,
      parent: parent ? { id: parent.id, hash: parent.hash } : null,
    });
    out.push(ev);
    parent = ev;
  }
  return out;
}

function appendEventsAtomic(path: string, events: LedgerEvent[]): void {
  if (events.length === 0) return;
  ensureLedgerFile(path);
  // One write for all events so a failure can't leave a torn record between them.
  const text = events.map((e) => `${JSON.stringify(e)}\n`).join('');
  appendFileSync(path, text, 'utf8');
}

/**
 * Append one chain event. SQLite write happens first; jsonl append only
 * runs after the SQLite insert commits, so a failed sqlite write leaves no
 * trace in the jsonl ledger. The reverse (jsonl ok, sqlite fails) can be
 * rebuilt because sqlite is derivable from jsonl.
 */
export function appendChainEvent(db: DB, draft: ChainEventDraft): LedgerEvent {
  const ledgerPath = PATHS.ledgerJsonl();
  const prev = lastEvent(ledgerPath);
  const [event] = buildEventChain(prev, [draft]);
  const tx = db.transaction(() => {
    insertEvent(db, event);
  });
  tx();
  appendEvent(ledgerPath, event);
  return event;
}

export type EvolutionInputs = {
  db: DB;
  ledger: ChainLedger;
  source: Source;
  advance: boolean;
  sourceId: string;
  /** Called after the evolution is committed so the caller can archive its inbox file. */
  archiveInbox: () => void;
  /** Optional metadata for ledger_evolved event payload (e.g. via: 'mcp'). */
  via?: string;
  /** Forwarded to evolveLedger — primarily for tests. */
  evolveOptions?: EvolveOptions;
};

export type EvolutionOutcome = {
  validated: ChainLedger;
  record: ReturnType<typeof evolveLedger>['evolutionRecord'];
  events: LedgerEvent[];
  scoreBefore: number;
  scoreAfter: number;
};

/**
 * Apply an evolution end-to-end with transactional sqlite writes and only
 * one jsonl batch append. Order is:
 *   1) compute next ledger + record (pure)
 *   2) sqlite tx: insertEvolution + upsertChainState + insertEvent[]
 *   3) append all events to jsonl in a single write
 *   4) write current.yml + evolutions/<id>.yml
 *   5) archive inbox
 * A failure in (2) leaves everything untouched. A failure in (3) leaves
 * sqlite ahead of jsonl, which `ic verify` will flag; sqlite can be
 * rebuilt from jsonl when that happens.
 */
export function runEvolution(inputs: EvolutionInputs): EvolutionOutcome {
  const scoreBefore = scoreLedger(inputs.ledger);
  const raw = evolveLedger(
    inputs.ledger,
    inputs.source,
    inputs.advance,
    inputs.evolveOptions,
  );
  const validated = ChainLedgerSchema.parse(raw.updatedLedger);
  const record = MemoryEvolutionRecordSchema.parse(raw.evolutionRecord);
  const ledgerYaml = YAML.stringify(validated);
  const recordYaml = YAML.stringify(record);

  const sourceKind: 'session' | 'interaction' =
    inputs.source.kind === 'session' ? 'session' : 'interaction';

  const eventPayloadSuffix = inputs.via ? { via: inputs.via } : {};
  const drafts: ChainEventDraft[] = [
    {
      projectId: validated.project_id,
      iteration: record.to_iteration,
      type: 'memory_evolution_created',
      payload: {
        id: record.id,
        source: record.source,
        from: inputs.sourceId,
        ...eventPayloadSuffix,
      },
    },
    {
      projectId: validated.project_id,
      iteration: validated.iteration,
      type: 'ledger_evolved',
      payload: {
        from: record.from_iteration,
        to: record.to_iteration,
        source: sourceKind,
        ...eventPayloadSuffix,
      },
    },
  ];

  const prev = lastEvent(PATHS.ledgerJsonl());
  const events = buildEventChain(prev, drafts);

  const tx = inputs.db.transaction(() => {
    insertEvolution(inputs.db, {
      id: record.id,
      projectId: record.project_id,
      fromIteration: record.from_iteration,
      toIteration: record.to_iteration,
      yaml: recordYaml,
      createdAt: record.created_at,
    });
    upsertChainState(inputs.db, validated, ledgerYaml);
    for (const e of events) insertEvent(inputs.db, e);
  });
  tx();

  appendEventsAtomic(PATHS.ledgerJsonl(), events);

  writeFileSync(PATHS.currentYml(), ledgerYaml);
  const evoPath = join(PATHS.root(), 'evolutions', `${record.id}.yml`);
  mkdirSync(dirname(evoPath), { recursive: true });
  writeFileSync(evoPath, recordYaml);

  inputs.archiveInbox();

  return {
    validated,
    record,
    events,
    scoreBefore,
    scoreAfter: scoreLedger(validated),
  };
}

/** Move an inbox file into its archive folder. No-op if the source is gone. */
export function archiveInboxFile(
  inboxPath: string,
  archiveDir: string,
  id: string,
): void {
  if (!existsSync(inboxPath)) return;
  mkdirSync(archiveDir, { recursive: true });
  renameSync(inboxPath, join(archiveDir, `${id}.yml`));
}
