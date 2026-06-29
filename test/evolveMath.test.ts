import { describe, expect, it } from 'vitest';
import { evolveLedger, scoreLedger } from '../src/core/evolve.js';
import type {
  ChainLedger,
  InteractionUpdate,
  SessionBrief,
} from '../src/core/schemas.js';

const baseLedger = (): ChainLedger => ({
  kind: 'chain_ledger',
  schema_version: '1.0.0',
  project_id: 'p1',
  iteration: 0,
  updated_at: '2026-01-01T00:00:00Z',
  global_objective: 'Ship MVP',
  current_operating_model: { summary: 'Initial', confidence: 'medium' },
  stable_learnings: [],
  active_hypotheses: [],
  rejected_hypotheses: [],
  stable_decisions: [],
  recurring_failure_patterns: [],
  open_questions: [],
  current_frontier: { next_best_action: ['setup'], blockers: [], risks: [] },
  do_not_repeat: [],
  continuity_summary: 'init',
});

const update = (over: Partial<InteractionUpdate> = {}): InteractionUpdate => ({
  kind: 'interaction_update',
  schema_version: '1.0.0',
  id: 'u1',
  project_id: 'p1',
  iteration: 0,
  created_at: '2026-01-01T00:00:00Z',
  trigger: 'manual_checkpoint',
  what_changed: 'something',
  new_information: [],
  confirmed: [],
  weakened: [],
  rejected: [],
  superseded: [],
  next_action_delta: [],
  do_not_repeat_delta: [],
  new_blockers: [],
  new_risks: [],
  human_note: '',
  ...over,
});

const brief = (over: Partial<SessionBrief> = {}): SessionBrief => ({
  kind: 'session_brief',
  schema_version: '1.0.0',
  id: 'b1',
  project_id: 'p1',
  iteration: 0,
  created_at: '2026-01-01T00:00:00Z',
  session_intent: { primary_goal: 'g', what_agent_was_doing: 'w' },
  working_theory: { summary: 'theory', confidence: 'medium' },
  actions_attempted: [],
  outcomes_observed: [],
  worked: [],
  did_not_work: [],
  partially_worked: [],
  issues_identified: [],
  fixes_attempted: [],
  unresolved_state: '',
  next_best_action: [],
  do_not_repeat: [],
  user_constraints: [],
  new_blockers: [],
  new_risks: [],
  human_handoff_summary: 'handoff',
  ...over,
});

describe('evolveLedger — interaction transitions', () => {
  it('does not advance iteration on plain InteractionUpdate', () => {
    const l0 = baseLedger();
    const { updatedLedger } = evolveLedger(
      l0,
      { kind: 'interaction', value: update() },
      false,
    );
    expect(updatedLedger.iteration).toBe(0);
  });

  it('advances iteration when --advance is requested', () => {
    const { updatedLedger } = evolveLedger(
      baseLedger(),
      { kind: 'interaction', value: update() },
      true,
    );
    expect(updatedLedger.iteration).toBe(1);
  });

  it('rejected belief moves to rejected_hypotheses (once, not duplicated)', () => {
    const l0 = baseLedger();
    const u = update({ rejected: [{ belief: 'cache works', reason: 'stale reads' }] });
    const { updatedLedger: l1 } = evolveLedger(l0, { kind: 'interaction', value: u }, false);
    const { updatedLedger: l2 } = evolveLedger(l1, { kind: 'interaction', value: u }, false);
    expect(l2.rejected_hypotheses).toHaveLength(1);
    expect(l2.rejected_hypotheses[0].hypothesis).toBe('cache works');
  });

  it('confirmed belief creates an active hypothesis with supporting evidence', () => {
    const u = update({
      confirmed: [{ belief: 'parser strategy', evidence: 'unit pass' }],
    });
    const { updatedLedger } = evolveLedger(
      baseLedger(),
      { kind: 'interaction', value: u },
      false,
    );
    expect(updatedLedger.active_hypotheses).toHaveLength(1);
    expect(updatedLedger.active_hypotheses[0].supporting_evidence).toContain('unit pass');
  });

  it('confirmed twice promotes to stable_learnings', () => {
    const u1 = update({ confirmed: [{ belief: 'X works', evidence: 'A' }] });
    const u2 = update({
      id: 'u2',
      confirmed: [{ belief: 'X works', evidence: 'B' }],
    });
    const { updatedLedger: l1 } = evolveLedger(baseLedger(), { kind: 'interaction', value: u1 }, false);
    const { updatedLedger: l2 } = evolveLedger(l1, { kind: 'interaction', value: u2 }, false);
    expect(l2.stable_learnings).toContain('X works');
    expect(l2.active_hypotheses.find((h) => h.hypothesis === 'X works')).toBeUndefined();
  });

  it('confirming an already-promoted belief is a no-op (no duplicate in active+stable)', () => {
    const u1 = update({ confirmed: [{ belief: 'X works', evidence: 'A' }] });
    const u2 = update({ id: 'u2', confirmed: [{ belief: 'X works', evidence: 'B' }] });
    const u3 = update({ id: 'u3', confirmed: [{ belief: 'X works', evidence: 'C' }] });
    let l = baseLedger();
    l = evolveLedger(l, { kind: 'interaction', value: u1 }, false).updatedLedger;
    l = evolveLedger(l, { kind: 'interaction', value: u2 }, false).updatedLedger;
    l = evolveLedger(l, { kind: 'interaction', value: u3 }, false).updatedLedger;
    expect(l.stable_learnings).toContain('X works');
    expect(l.active_hypotheses.find((h) => h.hypothesis === 'X works')).toBeUndefined();
  });

  it('superseded old belief becomes rejected; new belief becomes active', () => {
    const u = update({
      superseded: [
        { old_belief: 'use REST', new_belief: 'use gRPC', reason: 'latency' },
      ],
    });
    const { updatedLedger } = evolveLedger(baseLedger(), { kind: 'interaction', value: u }, false);
    expect(updatedLedger.rejected_hypotheses.map((r) => r.hypothesis)).toContain('use REST');
    expect(updatedLedger.active_hypotheses.map((h) => h.hypothesis)).toContain('use gRPC');
  });

  it('do_not_repeat_delta merges without duplicates', () => {
    const u1 = update({ do_not_repeat_delta: ['mock DB in integration tests'] });
    const u2 = update({
      id: 'u2',
      do_not_repeat_delta: ['mock DB in integration tests'],
    });
    const { updatedLedger: l1 } = evolveLedger(baseLedger(), { kind: 'interaction', value: u1 }, false);
    const { updatedLedger: l2 } = evolveLedger(l1, { kind: 'interaction', value: u2 }, false);
    expect(l2.do_not_repeat).toEqual(['mock DB in integration tests']);
  });

  it('next_action_delta replaces frontier when non-empty; preserved when empty', () => {
    const l0 = baseLedger();
    const u = update({ next_action_delta: ['write ingest tests'] });
    const { updatedLedger: l1 } = evolveLedger(l0, { kind: 'interaction', value: u }, false);
    expect(l1.current_frontier.next_best_action).toEqual(['write ingest tests']);

    const { updatedLedger: l2 } = evolveLedger(l1, { kind: 'interaction', value: update() }, false);
    expect(l2.current_frontier.next_best_action).toEqual(['write ingest tests']);
  });
});

describe('evolveLedger — session transitions', () => {
  it('SessionBrief always advances iteration', () => {
    const { updatedLedger } = evolveLedger(
      baseLedger(),
      { kind: 'session', value: brief() },
      false,
    );
    expect(updatedLedger.iteration).toBe(1);
  });

  it('did_not_work entries become rejected_hypotheses', () => {
    const b = brief({ did_not_work: ['ad hoc parsing'] });
    const { updatedLedger } = evolveLedger(baseLedger(), { kind: 'session', value: b }, false);
    expect(updatedLedger.rejected_hypotheses.map((r) => r.hypothesis)).toContain('ad hoc parsing');
  });

  it('worked entries land in stable_learnings', () => {
    const b = brief({ worked: ['schema validation'] });
    const { updatedLedger } = evolveLedger(baseLedger(), { kind: 'session', value: b }, false);
    expect(updatedLedger.stable_learnings).toContain('schema validation');
  });

  it('issues_identified populate blockers and recurring_failure_patterns', () => {
    const b = brief({ issues_identified: ['flaky test in CI'] });
    const { updatedLedger } = evolveLedger(baseLedger(), { kind: 'session', value: b }, false);
    expect(updatedLedger.current_frontier.blockers).toContain('flaky test in CI');
    expect(updatedLedger.recurring_failure_patterns.map((p) => p.pattern)).toContain('flaky test in CI');
  });

  it('user_constraints land in do_not_repeat', () => {
    const b = brief({ user_constraints: ['never commit secrets'] });
    const { updatedLedger } = evolveLedger(baseLedger(), { kind: 'session', value: b }, false);
    expect(updatedLedger.do_not_repeat).toContain('never commit secrets');
  });

  it('fixes_attempted populate stable_decisions', () => {
    const b = brief({ fixes_attempted: ['retry with exponential backoff'] });
    const { updatedLedger } = evolveLedger(baseLedger(), { kind: 'session', value: b }, false);
    expect(updatedLedger.stable_decisions.map((d) => d.decision)).toContain('retry with exponential backoff');
  });
});

describe('evolveLedger — MemoryEvolutionRecord output', () => {
  it('produces an evolution record with correct from/to iteration', () => {
    const { evolutionRecord } = evolveLedger(
      baseLedger(),
      { kind: 'session', value: brief() },
      false,
    );
    expect(evolutionRecord.from_iteration).toBe(0);
    expect(evolutionRecord.to_iteration).toBe(1);
    expect(evolutionRecord.source).toBe('session_brief');
  });

  it('frontier_update records previous and new next_best_action', () => {
    const l0 = baseLedger();
    const b = brief({ next_best_action: ['ship v0.2'] });
    const { evolutionRecord } = evolveLedger(l0, { kind: 'session', value: b }, false);
    expect(evolutionRecord.frontier_update.previous_next_action).toEqual(['setup']);
    expect(evolutionRecord.frontier_update.new_next_action).toEqual(['ship v0.2']);
  });
});

describe('scoreLedger', () => {
  it('penalises uncontrolled open_questions / blockers growth', () => {
    const l0 = baseLedger();
    const baseScore = scoreLedger(l0);
    const noisy: ChainLedger = {
      ...l0,
      open_questions: ['q1', 'q2', 'q3'],
      current_frontier: { ...l0.current_frontier, blockers: ['b1', 'b2'] },
    };
    expect(scoreLedger(noisy)).toBeLessThan(baseScore);
  });

  it('rewards stable_learnings and stable_decisions', () => {
    const l0 = baseLedger();
    const better: ChainLedger = {
      ...l0,
      stable_learnings: ['x', 'y'],
      stable_decisions: [
        {
          decision: 'use Postgres',
          rationale: 'ACID',
          confidence: 'high',
          first_introduced_at_iteration: 0,
          last_confirmed_at_iteration: 1,
        },
      ],
    };
    expect(scoreLedger(better)).toBeGreaterThan(scoreLedger(l0));
  });
});

describe('evolveLedger — blocker resolution pruning', () => {
  it('drops a frontier blocker when the matching belief is rejected', () => {
    const l0 = baseLedger();
    l0.current_frontier.blockers = ['GLnexus OOMs at 64GB on 100-sample cohort'];

    const { updatedLedger } = evolveLedger(
      l0,
      {
        kind: 'interaction',
        value: update({
          rejected: [
            {
              belief: 'GLnexus OOMs at 64GB on 100-sample cohort',
              reason: 'Resolved by chromosome sharding',
            },
          ],
        }),
      },
      false,
    );

    expect(updatedLedger.current_frontier.blockers).not.toContain(
      'GLnexus OOMs at 64GB on 100-sample cohort',
    );
    expect(
      updatedLedger.rejected_hypotheses.some(
        (r) => r.hypothesis === 'GLnexus OOMs at 64GB on 100-sample cohort',
      ),
    ).toBe(true);
  });

  it('prunes a pre-existing blocker resolved via did_not_work in a session brief', () => {
    const l0 = baseLedger();
    l0.current_frontier.blockers = ['flaky integration test'];

    const { updatedLedger } = evolveLedger(
      l0,
      { kind: 'session', value: brief({ did_not_work: ['flaky integration test'] }) },
      true,
    );

    expect(updatedLedger.current_frontier.blockers).not.toContain(
      'flaky integration test',
    );
  });

  it('matches blocker text case-insensitively', () => {
    const l0 = baseLedger();
    l0.current_frontier.blockers = ['OOM in Joint Genotyping'];

    const { updatedLedger } = evolveLedger(
      l0,
      {
        kind: 'interaction',
        value: update({
          rejected: [{ belief: 'oom in joint genotyping', reason: 'sharded' }],
        }),
      },
      false,
    );

    expect(updatedLedger.current_frontier.blockers).toHaveLength(0);
  });
});
