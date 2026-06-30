import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import type { ChainLedger } from '../src/core/schemas.js';
import { mergeTeamLedgersFromDir } from '../src/teams/mergeFromDir.js';

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

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ic-teamdir-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, l: ChainLedger) => writeFileSync(join(dir, name), YAML.stringify(l));

describe('mergeTeamLedgersFromDir', () => {
  it('merges dev_*.yml ledgers, derives authors, and surfaces conflicts', () => {
    write('dev_shibi.yml', ledger({ iteration: 2, stable_learnings: ['Shard GLnexus by chromosome'] }));
    write(
      'dev_alex.yml',
      ledger({
        rejected_hypotheses: [
          { hypothesis: 'shard glnexus by chromosome', reason_rejected: 'tie', rejected_at_iteration: 1 },
        ],
      }),
    );

    const { result, teamYaml, resume, authors } = mergeTeamLedgersFromDir(dir);
    expect(authors.sort()).toEqual(['alex', 'shibi']);
    expect(result.conflicts).toHaveLength(1);
    expect(result.teamLedger.iteration).toBe(2);
    expect(teamYaml).toContain('chain_ledger');
    expect(resume).toContain('Inference Chain Resume Brief');
    // conflicted belief quarantined out of stable + rejected
    expect(result.teamLedger.stable_learnings).toHaveLength(0);
  });

  it('ignores non-dev yml files', () => {
    write('dev_shibi.yml', ledger({ stable_learnings: ['A'] }));
    write('team-ledger.yml', ledger({ stable_learnings: ['SHOULD_BE_IGNORED'] }));
    const { authors, result } = mergeTeamLedgersFromDir(dir);
    expect(authors).toEqual(['shibi']);
    expect(result.teamLedger.stable_learnings).toEqual(['A']);
  });

  it('reports an actionable error for a malformed dev ledger', () => {
    writeFileSync(join(dir, 'dev_broken.yml'), 'project_id: x\niteration: not-a-number\n');
    expect(() => mergeTeamLedgersFromDir(dir)).toThrow(/Invalid developer ledger dev_broken\.yml: iteration/);
  });

  it('throws when no developer ledgers are present', () => {
    mkdirSync(join(dir, 'empty'), { recursive: true });
    expect(() => mergeTeamLedgersFromDir(join(dir, 'empty'))).toThrow(/No developer ledgers/);
  });
});
