import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from 'node:fs';
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

/**
 * Read only the final JSONL record instead of parsing the whole ledger.
 * Appends happen on every chain event, so an O(n) full-file parse here made
 * the append path O(n^2) over the life of an append-only ledger. We read the
 * tail in growing chunks until a complete last line is isolated.
 */
export function lastEvent(path: string): LedgerEvent | null {
  if (!existsSync(path)) return null;
  const fd = openSync(path, 'r');
  try {
    let size = fstatSync(fd).size;
    while (size > 0 && isNewlineAt(fd, size - 1)) size -= 1; // ignore trailing newlines
    if (size === 0) return null;

    let chunk = 4096;
    for (;;) {
      const start = Math.max(0, size - chunk);
      const buf = Buffer.alloc(size - start);
      readSync(fd, buf, 0, buf.length, start);
      const text = buf.toString('utf8');
      const nl = text.lastIndexOf('\n');
      if (nl >= 0) {
        const line = text.slice(nl + 1).trim();
        if (line) return JSON.parse(line) as LedgerEvent;
      } else if (start === 0) {
        const line = text.trim();
        return line ? (JSON.parse(line) as LedgerEvent) : null;
      }
      if (start === 0) return null;
      chunk *= 2;
    }
  } finally {
    closeSync(fd);
  }
}

function isNewlineAt(fd: number, pos: number): boolean {
  const b = Buffer.alloc(1);
  readSync(fd, b, 0, 1, pos);
  return b[0] === 0x0a || b[0] === 0x0d;
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
