import { describe, expect, it } from 'vitest';
import { makeEvent, recomputeHash } from '../src/core/events.js';

describe('event hashing', () => {
  it('hash is deterministic for the same payload + parent', () => {
    const e1 = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'project_initialized',
      payload: { a: 1, b: 2 },
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    // Same input must recompute to the same hash.
    expect(recomputeHash(e1)).toBe(e1.hash);
  });

  it('tampering payload breaks the hash', () => {
    const e1 = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'project_initialized',
      payload: { a: 1 },
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const tampered = { ...e1, payload: { a: 2 } };
    expect(recomputeHash(tampered)).not.toBe(e1.hash);
  });

  it('child event references parent id and hash', () => {
    const parent = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'project_initialized',
      payload: {},
    });
    const child = makeEvent({
      projectId: 'p',
      iteration: 0,
      type: 'interaction_update_captured',
      payload: { id: 'u1' },
      parent: { id: parent.id, hash: parent.hash },
    });
    expect(child.parentEventId).toBe(parent.id);
    expect(child.parentHash).toBe(parent.hash);
    expect(recomputeHash(child)).toBe(child.hash);
  });
});
