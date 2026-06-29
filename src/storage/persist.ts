import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
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
  InteractionUpdateSchema,
  MemoryEvolutionRecordSchema,
  SCHEMA_VERSION,
  SessionBriefSchema,
  type ChainLedger,
} from '../core/schemas.js';
import {
  appendEvent,
  ensureLedgerFile,
  lastEvent,
  readEvents,
  verifyChain,
  type VerifyReport,
} from './jsonl.js';
import { PATHS, ic } from './paths.js';
import { withLock } from './lock.js';
import {
  type DB,
  eventCount,
  eventHashes,
  hasBrief,
  hasUpdate,
  insertBrief,
  insertEvent,
  insertEvolution,
  insertUpdate,
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
  return withLock(PATHS.ledgerLock(), () => {
    const prev = lastEvent(ledgerPath);
    const [event] = buildEventChain(prev, [draft]);
    const tx = db.transaction(() => {
      insertEvent(db, event);
    });
    tx();
    appendEvent(ledgerPath, event);
    return event;
  });
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

  // The whole chain-mutating section runs under the ledger lock so a
  // concurrent process cannot read the same parent event and fork the chain.
  const events = withLock(PATHS.ledgerLock(), () => {
    const prev = lastEvent(PATHS.ledgerJsonl());
    const built = buildEventChain(prev, drafts);

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
      for (const e of built) insertEvent(inputs.db, e);
    });
    tx();

    appendEventsAtomic(PATHS.ledgerJsonl(), built);

    writeFileSync(PATHS.currentYml(), ledgerYaml);
    const evoPath = join(PATHS.root(), 'evolutions', `${record.id}.yml`);
    mkdirSync(dirname(evoPath), { recursive: true });
    writeFileSync(evoPath, recordYaml);
    return built;
  });

  inputs.archiveInbox();

  return {
    validated,
    record,
    events,
    scoreBefore,
    scoreAfter: scoreLedger(validated),
  };
}

export type ResolvedInbox = {
  source: Source;
  sourceId: string;
  /** Whether evolving this source advances the iteration by default. */
  advance: boolean;
  /** Move the consumed inbox file into its archive folder. */
  archive: () => void;
  /**
   * Record the source artifact (sqlite row + *_captured event) if it was not
   * already ingested. Lets a bare `ic evolve` over a hand-authored inbox file
   * stay consistent with the `ic ingest` / MCP path, which record up front.
   */
  ensureCaptured: (db: DB, via?: string) => void;
};

/**
 * Resolve whichever inbox artifact is present (brief takes precedence over
 * update). Shared by the CLI `evolve` command and the MCP `chain_evolve`
 * tool so the two front ends cannot drift. Throws if the inbox is empty.
 */
export function resolveInboxSource(opts: { advance?: boolean } = {}): ResolvedInbox {
  const briefPath = PATHS.inboxBrief();
  const updatePath = PATHS.inboxUpdate();

  if (existsSync(briefPath)) {
    const brief = SessionBriefSchema.parse(
      YAML.parse(readFileSync(briefPath, 'utf8')),
    );
    return {
      source: { kind: 'session', value: brief },
      sourceId: brief.id,
      advance: true,
      archive: () => archiveInboxFile(briefPath, ic('briefs'), brief.id),
      ensureCaptured: (db, via) => {
        if (hasBrief(db, brief.id)) return;
        insertBrief(db, {
          id: brief.id,
          projectId: brief.project_id,
          iteration: brief.iteration,
          yaml: YAML.stringify(brief),
          createdAt: new Date().toISOString(),
        });
        appendChainEvent(db, {
          projectId: brief.project_id,
          iteration: brief.iteration,
          type: 'session_brief_captured',
          payload: {
            id: brief.id,
            primary_goal: brief.session_intent.primary_goal,
            ...(via ? { via } : {}),
          },
        });
      },
    };
  }

  if (existsSync(updatePath)) {
    const upd = InteractionUpdateSchema.parse(
      YAML.parse(readFileSync(updatePath, 'utf8')),
    );
    return {
      source: { kind: 'interaction', value: upd },
      sourceId: upd.id,
      advance: Boolean(opts.advance),
      archive: () => archiveInboxFile(updatePath, ic('updates'), upd.id),
      ensureCaptured: (db, via) => {
        if (hasUpdate(db, upd.id)) return;
        insertUpdate(db, {
          id: upd.id,
          projectId: upd.project_id,
          iteration: upd.iteration,
          yaml: YAML.stringify(upd),
          createdAt: new Date().toISOString(),
        });
        appendChainEvent(db, {
          projectId: upd.project_id,
          iteration: upd.iteration,
          type: 'interaction_update_captured',
          payload: {
            id: upd.id,
            trigger: upd.trigger,
            ...(via ? { via } : {}),
          },
        });
      },
    };
  }

  throw new Error(
    'No inbox artifact found. Expected .inference-chain/inbox/latest-brief.yml or latest-update.yml.',
  );
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

export type LedgerVerification = VerifyReport & {
  sqliteEventCount: number;
  inSync: boolean;
  hashMismatches: { eventId: string; reason: string }[];
};

/**
 * Full integrity check: replay the jsonl hash chain AND cross-check every
 * event id+hash against the sqlite mirror. Count parity alone misses the
 * case where sqlite and jsonl have the same number of events but a row's
 * content has silently drifted.
 */
export function verifyLedger(db: DB): LedgerVerification {
  const report = verifyChain(PATHS.ledgerJsonl());
  const events = readEvents(PATHS.ledgerJsonl());
  const sqliteEventCount = eventCount(db);
  const sqliteHashes = eventHashes(db);

  const hashMismatches: { eventId: string; reason: string }[] = [];
  for (const e of events) {
    const h = sqliteHashes.get(e.id);
    if (h === undefined) {
      hashMismatches.push({
        eventId: e.id,
        reason: 'present in jsonl but missing from sqlite',
      });
    } else if (h !== e.hash) {
      hashMismatches.push({
        eventId: e.id,
        reason: `hash differs (jsonl ${e.hash}, sqlite ${h})`,
      });
    }
  }

  const inSync =
    sqliteEventCount === report.total && hashMismatches.length === 0;
  return { ...report, sqliteEventCount, inSync, hashMismatches };
}
