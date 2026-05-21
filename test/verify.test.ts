import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeEvent } from '../src/core/events.js';
import { appendEvent, verifyChain } from '../src/storage/jsonl.js';

function tmpLedger(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ic-jsonl-'));
  const path = join(dir, 'ledger.jsonl');
  writeFileSync(path, '');
  return path;
}

describe('hash chain verify', () => {
  it('a properly chained ledger verifies clean', () => {
    const path = tmpLedger();
    const e1 = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'project_initialized',
      payload: {},
    });
    appendEvent(path, e1);
    const e2 = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'interaction_update_captured',
      payload: { id: 'u1' },
      parent: { id: e1.id, hash: e1.hash },
    });
    appendEvent(path, e2);

    const report = verifyChain(path);
    expect(report.ok).toBe(true);
    expect(report.total).toBe(2);
    expect(report.errors).toHaveLength(0);
  });

  it('a tampered event is detected', () => {
    const path = tmpLedger();
    const e1 = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'project_initialized',
      payload: {},
    });
    // Write a hand-tampered event whose payload changed after the hash was computed.
    const tampered = { ...e1, payload: { hacked: true } };
    writeFileSync(path, `${JSON.stringify(tampered)}\n`);
    const report = verifyChain(path);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.reason.includes('hash mismatch'))).toBe(true);
  });

  it('a broken parent link is detected', () => {
    const path = tmpLedger();
    const e1 = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'project_initialized',
      payload: {},
    });
    appendEvent(path, e1);
    // Append a second event with no parent set (illegal for non-first event).
    const orphan = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'session_brief_captured',
      payload: { id: 'b1' },
    });
    appendEvent(path, orphan);
    const report = verifyChain(path);
    expect(report.ok).toBe(false);
    expect(
      report.errors.some(
        (e) =>
          e.reason.includes('parentEventId') ||
          e.reason.includes('parentHash'),
      ),
    ).toBe(true);
  });
});
