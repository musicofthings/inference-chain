import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { type LedgerEvent, recomputeHash } from '../core/events.js';

export function ensureLedgerFile(path: string): void {
  if (!existsSync(path)) writeFileSync(path, '');
}

export function appendEvent(path: string, event: LedgerEvent): void {
  ensureLedgerFile(path);
  appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8');
}

export function readEvents(path: string): LedgerEvent[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  if (!raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LedgerEvent);
}

export function lastEvent(path: string): LedgerEvent | null {
  const events = readEvents(path);
  return events.length === 0 ? null : events[events.length - 1];
}

export type VerifyReport = {
  ok: boolean;
  total: number;
  errors: { index: number; eventId: string; reason: string }[];
};

export function verifyChain(path: string): VerifyReport {
  const events = readEvents(path);
  const errors: VerifyReport['errors'] = [];
  let prev: LedgerEvent | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const expected = recomputeHash(e);
    if (expected !== e.hash) {
      errors.push({
        index: i,
        eventId: e.id,
        reason: `hash mismatch (expected ${expected}, got ${e.hash})`,
      });
    }
    if (i === 0) {
      if (e.parentEventId !== null || e.parentHash !== null) {
        errors.push({
          index: i,
          eventId: e.id,
          reason: 'first event must have null parent',
        });
      }
    } else if (prev) {
      if (e.parentEventId !== prev.id) {
        errors.push({
          index: i,
          eventId: e.id,
          reason: `parentEventId ${e.parentEventId} does not match previous ${prev.id}`,
        });
      }
      if (e.parentHash !== prev.hash) {
        errors.push({
          index: i,
          eventId: e.id,
          reason: 'parentHash does not match previous event hash',
        });
      }
    }
    prev = e;
  }
  return { ok: errors.length === 0, total: events.length, errors };
}
