import { nanoid } from 'nanoid';
import { hashEvent } from './hash.js';

export const LEDGER_EVENT_TYPES = [
  'project_initialized',
  'interaction_update_captured',
  'session_brief_captured',
  'memory_evolution_created',
  'ledger_evolved',
  'resume_brief_generated',
  'ledger_verified',
] as const;

export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number];

export type LedgerEvent = {
  id: string;
  projectId: string;
  iteration: number;
  type: LedgerEventType;
  timestamp: string;
  parentEventId: string | null;
  parentHash: string | null;
  hash: string;
  payload: unknown;
  schemaVersion: string;
};

export type NewEventInput = {
  projectId: string;
  iteration: number;
  type: LedgerEventType;
  payload: unknown;
  schemaVersion?: string;
  parent?: { id: string; hash: string } | null;
  timestamp?: string;
};

export function makeEvent(input: NewEventInput): LedgerEvent {
  const base = {
    id: `evt_${nanoid(12)}`,
    projectId: input.projectId,
    iteration: input.iteration,
    type: input.type,
    timestamp: input.timestamp ?? new Date().toISOString(),
    parentEventId: input.parent?.id ?? null,
    parentHash: input.parent?.hash ?? null,
    payload: input.payload,
    schemaVersion: input.schemaVersion ?? '1.0.0',
  };
  const hash = hashEvent(base);
  return { ...base, hash };
}

export function recomputeHash(event: LedgerEvent): string {
  const {
    id,
    projectId,
    iteration,
    type,
    timestamp,
    parentEventId,
    parentHash,
    payload,
    schemaVersion,
  } = event;
  return hashEvent({
    id,
    projectId,
    iteration,
    type,
    timestamp,
    parentEventId,
    parentHash,
    payload,
    schemaVersion,
  });
}
