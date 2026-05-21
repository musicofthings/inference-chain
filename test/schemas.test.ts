import { describe, expect, it } from 'vitest';
import {
  InteractionUpdateSchema,
  MemoryEvolutionRecordSchema,
  SessionBriefSchema,
} from '../src/core/schemas.js';

describe('schemas', () => {
  it('rejects invalid confidence on SessionBrief', () => {
    expect(() =>
      SessionBriefSchema.parse({
        kind: 'session_brief',
        id: 'b1',
        project_id: 'p',
        iteration: 0,
        created_at: '2026-01-01T00:00:00Z',
        session_intent: { primary_goal: 'g', what_agent_was_doing: 'w' },
        working_theory: { summary: 's', confidence: 'sky-high' },
        unresolved_state: '',
        human_handoff_summary: '',
      }),
    ).toThrow();
  });

  it('rejects InteractionUpdate with bad trigger', () => {
    expect(() =>
      InteractionUpdateSchema.parse({
        kind: 'interaction_update',
        id: 'u1',
        project_id: 'p',
        iteration: 0,
        created_at: '2026-01-01T00:00:00Z',
        trigger: 'because_i_said_so',
        what_changed: 'x',
      }),
    ).toThrow();
  });

  it('accepts minimal valid InteractionUpdate and fills defaults', () => {
    const parsed = InteractionUpdateSchema.parse({
      id: 'u1',
      project_id: 'p',
      iteration: 0,
      created_at: '2026-01-01T00:00:00Z',
      trigger: 'manual_checkpoint',
      what_changed: 'x',
    });
    expect(parsed.kind).toBe('interaction_update');
    expect(parsed.confirmed).toEqual([]);
    expect(parsed.do_not_repeat_delta).toEqual([]);
  });

  it('accepts a valid MemoryEvolutionRecord', () => {
    const r = MemoryEvolutionRecordSchema.parse({
      id: 'evo_1',
      project_id: 'p',
      from_iteration: 0,
      to_iteration: 1,
      created_at: '2026-01-01T00:00:00Z',
      source: 'session_brief',
      frontier_update: {
        previous_next_action: ['a'],
        new_next_action: ['b'],
        why_changed: 'progress',
      },
      evolution_summary: 'moved forward',
    });
    expect(r.kind).toBe('memory_evolution_record');
    expect(r.promoted_to_stable).toEqual([]);
  });
});
