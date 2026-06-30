import { describe, expect, it } from 'vitest';
import { mergeTeamLedgers, type TeamInput } from '../src/teams/merge.js';
import type { ChainLedger } from '../src/core/schemas.js';

const ledger = (over: Partial<ChainLedger> = {}): ChainLedger => ({
  kind: 'chain_ledger',
  schema_version: '1.0.0',
  project_id: 'p1',
  iteration: 0,
  updated_at: '2026-01-01T00:00:00Z',
  global_objective: 'Ship pipeline',
  current_operating_model: { summary: 'baseline', confidence: 'medium' },
  stable_learnings: [],
  active_hypotheses: [],
  rejected_hypotheses: [],
  stable_decisions: [],
  recurring_failure_patterns: [],
  open_questions: [],
  current_frontier: { next_best_action: [], blockers: [], risks: [] },
  do_not_repeat: [],
  continuity_summary: 'init',
  ...over,
});

const stripVolatile = (l: ChainLedger) => ({ ...l, updated_at: 'X', continuity_summary: 'X' });

describe('mergeTeamLedgers', () => {
  it('unions and dedupes stable learnings across developers', () => {
    const inputs: TeamInput[] = [
      { author: 'shibi', ledger: ledger({ stable_learnings: ['Shard GLnexus by chromosome', 'Pin Python 3.11'] }) },
      { author: 'alex', ledger: ledger({ stable_learnings: ['shard glnexus by chromosome', 'Use WGS model'] }) },
    ];
    const { teamLedger, conflicts } = mergeTeamLedgers(inputs);
    expect(conflicts).toHaveLength(0);
    // 3 unique (case-insensitive dedupe of the GLnexus line)
    expect(teamLedger.stable_learnings).toHaveLength(3);
    // sorted case-insensitively (engine's deterministic order)
    const ci = [...teamLedger.stable_learnings].sort((a, b) =>
      a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
    );
    expect(teamLedger.stable_learnings).toEqual(ci);
  });

  it('detects an assert/deny conflict and quarantines the belief', () => {
    const inputs: TeamInput[] = [
      { author: 'shibi', ledger: ledger({ stable_learnings: ['DeepVariant WGS beats WES'] }) },
      {
        author: 'alex',
        ledger: ledger({
          rejected_hypotheses: [
            { hypothesis: 'deepvariant wgs beats wes', reason_rejected: 'tie on our data', rejected_at_iteration: 2 },
          ],
        }),
      },
    ];
    const { teamLedger, conflicts } = mergeTeamLedgers(inputs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].asserted_by).toEqual(['shibi']);
    expect(conflicts[0].denied_by).toEqual(['alex']);
    // Quarantined: absent from BOTH stable and rejected, surfaced as a question.
    expect(teamLedger.stable_learnings).toHaveLength(0);
    expect(teamLedger.rejected_hypotheses).toHaveLength(0);
    expect(teamLedger.open_questions.some((q) => q.startsWith('Resolve team conflict'))).toBe(true);
  });

  it('is order-independent (deterministic regardless of input order)', () => {
    const a: TeamInput = { author: 'shibi', ledger: ledger({ stable_learnings: ['A'], do_not_repeat: ['x'] }) };
    const b: TeamInput = { author: 'alex', ledger: ledger({ stable_learnings: ['B'], do_not_repeat: ['y'] }) };
    const ab = stripVolatile(mergeTeamLedgers([a, b]).teamLedger);
    const ba = stripVolatile(mergeTeamLedgers([b, a]).teamLedger);
    expect(ab).toEqual(ba);
  });

  it('prunes a team blocker that any developer has rejected', () => {
    const inputs: TeamInput[] = [
      { author: 'shibi', ledger: ledger({ current_frontier: { next_best_action: [], blockers: ['GLnexus OOM at 64GB'], risks: [] } }) },
      {
        author: 'alex',
        ledger: ledger({
          rejected_hypotheses: [
            { hypothesis: 'GLnexus OOM at 64GB', reason_rejected: 'fixed by sharding', rejected_at_iteration: 3 },
          ],
        }),
      },
    ];
    const { teamLedger } = mergeTeamLedgers(inputs);
    expect(teamLedger.current_frontier.blockers).not.toContain('GLnexus OOM at 64GB');
    expect(teamLedger.rejected_hypotheses.some((r) => r.hypothesis === 'GLnexus OOM at 64GB')).toBe(true);
  });

  it('takes the highest-confidence operating model', () => {
    const inputs: TeamInput[] = [
      { author: 'shibi', ledger: ledger({ iteration: 1, current_operating_model: { summary: 'low conf view', confidence: 'low' } }) },
      { author: 'alex', ledger: ledger({ iteration: 4, current_operating_model: { summary: 'high conf view', confidence: 'high' } }) },
    ];
    const { teamLedger } = mergeTeamLedgers(inputs);
    expect(teamLedger.current_operating_model.summary).toBe('high conf view');
    expect(teamLedger.iteration).toBe(4);
  });
});
