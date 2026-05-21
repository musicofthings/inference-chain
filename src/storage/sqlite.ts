import Database from 'better-sqlite3';
import type { LedgerEvent } from '../core/events.js';
import type { ChainLedger } from '../core/schemas.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  parent_event_id TEXT,
  parent_hash TEXT,
  hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  schema_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_iteration ON events(iteration);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  brief_yaml TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interaction_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  update_yaml TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evolutions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_iteration INTEGER NOT NULL,
  to_iteration INTEGER NOT NULL,
  evolution_yaml TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chain_state (
  project_id TEXT PRIMARY KEY,
  current_iteration INTEGER NOT NULL,
  current_ledger_yaml TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export type DB = Database.Database;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  return db;
}

export function insertEvent(db: DB, event: LedgerEvent): void {
  db.prepare(
    `INSERT INTO events
     (id, project_id, iteration, type, timestamp, parent_event_id, parent_hash, hash, payload_json, schema_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.projectId,
    event.iteration,
    event.type,
    event.timestamp,
    event.parentEventId,
    event.parentHash,
    event.hash,
    JSON.stringify(event.payload),
    event.schemaVersion,
  );
}

export function eventCount(db: DB): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number };
  return row.n;
}

export function insertBrief(
  db: DB,
  args: { id: string; projectId: string; iteration: number; yaml: string; createdAt: string },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO briefs (id, project_id, iteration, brief_yaml, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(args.id, args.projectId, args.iteration, args.yaml, args.createdAt);
}

export function insertUpdate(
  db: DB,
  args: { id: string; projectId: string; iteration: number; yaml: string; createdAt: string },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO interaction_updates (id, project_id, iteration, update_yaml, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(args.id, args.projectId, args.iteration, args.yaml, args.createdAt);
}

export function insertEvolution(
  db: DB,
  args: {
    id: string;
    projectId: string;
    fromIteration: number;
    toIteration: number;
    yaml: string;
    createdAt: string;
  },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO evolutions (id, project_id, from_iteration, to_iteration, evolution_yaml, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    args.id,
    args.projectId,
    args.fromIteration,
    args.toIteration,
    args.yaml,
    args.createdAt,
  );
}

export function upsertChainState(
  db: DB,
  ledger: ChainLedger,
  ledgerYaml: string,
): void {
  db.prepare(
    `INSERT INTO chain_state (project_id, current_iteration, current_ledger_yaml, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       current_iteration = excluded.current_iteration,
       current_ledger_yaml = excluded.current_ledger_yaml,
       updated_at = excluded.updated_at`,
  ).run(ledger.project_id, ledger.iteration, ledgerYaml, ledger.updated_at);
}
