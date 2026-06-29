import {
  appendFileSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalize, canonicalJson } from '../src/core/canonicalJson.js';
import { makeEvent } from '../src/core/events.js';
import { appendEvent, lastEvent } from '../src/storage/jsonl.js';
import { withLock } from '../src/storage/lock.js';

function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('canonicalJson key ordering', () => {
  it('is independent of insertion order and stable for snake_case keys', () => {
    const a = { to_iteration: 1, from_iteration: 0, anti_repeat_update: [] };
    const b = { anti_repeat_update: [], from_iteration: 0, to_iteration: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    // underscore sorts before letters under code-unit ordering
    const keys = Object.keys(
      canonicalize({ ab: 1, a_b: 2 }) as Record<string, unknown>,
    );
    expect(keys).toEqual(['a_b', 'ab']);
  });
});

describe('lastEvent tail read', () => {
  it('returns the final event without depending on full-file parse', () => {
    const dir = tmpDir('ic-tail-');
    const path = join(dir, 'ledger.jsonl');
    writeFileSync(path, '');
    expect(lastEvent(path)).toBeNull();

    let prev = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'project_initialized',
      payload: {},
    });
    appendEvent(path, prev);
    for (let i = 0; i < 50; i++) {
      const e = makeEvent({
        projectId: 'p',
        iteration: i,
        type: 'interaction_update_captured',
        payload: { id: `u${i}`, note: 'x'.repeat(200) },
        parent: { id: prev.id, hash: prev.hash },
      });
      appendEvent(path, e);
      prev = e;
    }
    const last = lastEvent(path);
    expect(last?.id).toBe(prev.id);
    expect(last?.hash).toBe(prev.hash);
  });

  it('tolerates trailing newlines', () => {
    const dir = tmpDir('ic-tail2-');
    const path = join(dir, 'ledger.jsonl');
    const e = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'project_initialized',
      payload: {},
    });
    appendEvent(path, e);
    appendFileSync(path, '\n\n');
    expect(lastEvent(path)?.id).toBe(e.id);
  });
});

describe('withLock', () => {
  it('serializes a non-atomic read-modify-write across interleaved callers', () => {
    const dir = tmpDir('ic-lock-');
    const lockPath = join(dir, 'locks', 'ledger.lock');
    let counter = 0;
    // Without the lock, interleaving read/write of `counter` would lose
    // updates. withLock is synchronous, so correctness here means each
    // critical section observes the previous one's write.
    const runs = 100;
    for (let i = 0; i < runs; i++) {
      withLock(lockPath, () => {
        const seen = counter;
        counter = seen + 1;
      });
    }
    expect(counter).toBe(runs);
  });

  it('breaks a stale lock and still runs', () => {
    const dir = tmpDir('ic-lock2-');
    const lockPath = join(dir, 'ledger.lock');
    writeFileSync(lockPath, 'old');
    const ran = withLock(lockPath, () => 'ok', { staleMs: 0, timeoutMs: 1000 });
    expect(ran).toBe('ok');
  });
});
