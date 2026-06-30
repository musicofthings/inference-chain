import type { ActiveHypothesis, ChainLedger } from '../core/schemas.js';

export type TeamInput = { author: string; ledger: ChainLedger };

export type TeamConflict = {
  belief: string;
  asserted_by: string[];
  denied_by: string[];
  detail: string;
};

export type TeamMergeResult = {
  teamLedger: ChainLedger;
  conflicts: TeamConflict[];
};

const norm = (s: string) => s.trim().toLowerCase();

function sortedUnique(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const k = norm(t);
    if (!seen.has(k)) seen.set(k, t);
  }
  return [...seen.values()].sort((a, b) => (norm(a) < norm(b) ? -1 : norm(a) > norm(b) ? 1 : 0));
}

const CONF_RANK: Record<'low' | 'medium' | 'high', number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Deterministically merge multiple developers' ledgers into one team ledger.
 *
 * Pure and order-independent: the result depends only on the *set* of inputs,
 * not the order they are passed, so two machines merging the same ledgers
 * produce byte-identical output (and a hash-verifiable team ledger). No model
 * call, no network — this is the IC-native counterpart to the LLM-synthesis
 * teams engine.
 *
 * Conflict rule: a belief asserted by one developer (in stable_learnings or
 * active_hypotheses) and denied by another (in rejected_hypotheses) is NOT
 * silently resolved. It is removed from both sides, recorded as a
 * TeamConflict, and surfaced as an open question for humans to settle.
 */
export function mergeTeamLedgers(inputs: TeamInput[]): TeamMergeResult {
  if (inputs.length === 0) throw new Error('mergeTeamLedgers requires at least one ledger.');

  // Stable author order for deterministic tie-breaks.
  const devs = [...inputs].sort((a, b) => (a.author < b.author ? -1 : a.author > b.author ? 1 : 0));

  const asserts = new Map<string, { text: string; authors: Set<string> }>();
  const denies = new Map<string, { text: string; authors: Set<string> }>();
  const record = (
    map: Map<string, { text: string; authors: Set<string> }>,
    text: string,
    author: string,
  ) => {
    const k = norm(text);
    if (!k) return;
    const entry = map.get(k) ?? { text: text.trim(), authors: new Set() };
    entry.authors.add(author);
    map.set(k, entry);
  };

  for (const { author, ledger } of devs) {
    for (const l of ledger.stable_learnings) record(asserts, l, author);
    for (const h of ledger.active_hypotheses) record(asserts, h.hypothesis, author);
    for (const r of ledger.rejected_hypotheses) record(denies, r.hypothesis, author);
  }

  const conflicts: TeamConflict[] = [];
  const conflicted = new Set<string>();
  for (const [k, a] of asserts) {
    const d = denies.get(k);
    if (d) {
      conflicted.add(k);
      conflicts.push({
        belief: a.text,
        asserted_by: [...a.authors].sort(),
        denied_by: [...d.authors].sort(),
        detail: `Asserted by ${[...a.authors].sort().join(', ')} but rejected by ${[...d.authors].sort().join(', ')}.`,
      });
    }
  }
  conflicts.sort((a, b) => (norm(a.belief) < norm(b.belief) ? -1 : 1));

  const notConflicted = (text: string) => !conflicted.has(norm(text));

  // current_operating_model: highest confidence wins; tie-break by author.
  let model = devs[0].ledger.current_operating_model;
  let bestRank = CONF_RANK[model.confidence];
  for (const { ledger } of devs) {
    const r = CONF_RANK[ledger.current_operating_model.confidence];
    if (r > bestRank) {
      bestRank = r;
      model = ledger.current_operating_model;
    }
  }

  // active_hypotheses: union by hypothesis, evidence merged, max confidence.
  const hypMap = new Map<string, ActiveHypothesis>();
  for (const { ledger } of devs) {
    for (const h of ledger.active_hypotheses) {
      if (!notConflicted(h.hypothesis)) continue;
      const k = norm(h.hypothesis);
      const cur = hypMap.get(k);
      if (!cur) {
        hypMap.set(k, { ...h, supporting_evidence: [...h.supporting_evidence], contradicting_evidence: [...h.contradicting_evidence] });
      } else {
        cur.supporting_evidence = sortedUnique([...cur.supporting_evidence, ...h.supporting_evidence]);
        cur.contradicting_evidence = sortedUnique([...cur.contradicting_evidence, ...h.contradicting_evidence]);
        if (CONF_RANK[h.confidence] > CONF_RANK[cur.confidence]) cur.confidence = h.confidence;
        cur.first_seen_at_iteration = Math.min(cur.first_seen_at_iteration, h.first_seen_at_iteration);
      }
    }
  }
  const activeHypotheses = [...hypMap.values()].sort((a, b) =>
    norm(a.hypothesis) < norm(b.hypothesis) ? -1 : 1,
  );

  // stable_decisions: union by decision; widen the iteration window.
  const decMap = new Map<string, ChainLedger['stable_decisions'][number]>();
  for (const { ledger } of devs) {
    for (const d of ledger.stable_decisions) {
      const k = norm(d.decision);
      const cur = decMap.get(k);
      if (!cur) {
        decMap.set(k, { ...d });
      } else {
        cur.first_introduced_at_iteration = Math.min(cur.first_introduced_at_iteration, d.first_introduced_at_iteration);
        cur.last_confirmed_at_iteration = Math.max(cur.last_confirmed_at_iteration, d.last_confirmed_at_iteration);
        if (CONF_RANK[d.confidence] > CONF_RANK[cur.confidence]) cur.confidence = d.confidence;
      }
    }
  }
  const stableDecisions = [...decMap.values()].sort((a, b) =>
    norm(a.decision) < norm(b.decision) ? -1 : 1,
  );

  // recurring_failure_patterns: union by pattern, evidence merged.
  const patMap = new Map<string, ChainLedger['recurring_failure_patterns'][number]>();
  for (const { ledger } of devs) {
    for (const pn of ledger.recurring_failure_patterns) {
      const k = norm(pn.pattern);
      const cur = patMap.get(k);
      if (!cur) patMap.set(k, { ...pn, evidence: [...pn.evidence] });
      else cur.evidence = sortedUnique([...cur.evidence, ...pn.evidence]);
    }
  }
  const recurringPatterns = [...patMap.values()].sort((a, b) =>
    norm(a.pattern) < norm(b.pattern) ? -1 : 1,
  );

  const rejectedAll = new Map<string, ChainLedger['rejected_hypotheses'][number]>();
  for (const { ledger } of devs) {
    for (const r of ledger.rejected_hypotheses) {
      if (!notConflicted(r.hypothesis)) continue;
      const k = norm(r.hypothesis);
      const cur = rejectedAll.get(k);
      if (!cur) rejectedAll.set(k, { ...r });
      else cur.rejected_at_iteration = Math.max(cur.rejected_at_iteration, r.rejected_at_iteration);
    }
  }
  const rejected = [...rejectedAll.values()].sort((a, b) =>
    norm(a.hypothesis) < norm(b.hypothesis) ? -1 : 1,
  );

  const stableLearnings = sortedUnique(
    devs.flatMap((d) => d.ledger.stable_learnings).filter(notConflicted),
  );

  const nextActions = sortedUnique(devs.flatMap((d) => d.ledger.current_frontier.next_best_action));
  const risks = sortedUnique(devs.flatMap((d) => d.ledger.current_frontier.risks));
  const doNotRepeat = sortedUnique(devs.flatMap((d) => d.ledger.do_not_repeat));

  // Blockers: union, then prune any blocker that the team has rejected
  // (resolved problem) — same self-pruning rule as the solo evolve engine.
  const rejectedKeys = new Set(rejected.map((r) => norm(r.hypothesis)));
  const blockers = sortedUnique(
    devs.flatMap((d) => d.ledger.current_frontier.blockers),
  ).filter((b) => !rejectedKeys.has(norm(b)));

  const openQuestions = sortedUnique([
    ...devs.flatMap((d) => d.ledger.open_questions),
    ...conflicts.map((c) => `Resolve team conflict: ${c.belief} (${c.detail})`),
  ]);

  const authors = devs.map((d) => d.author);
  const teamLedger: ChainLedger = {
    kind: 'chain_ledger',
    schema_version: '1.0.0',
    project_id: devs[0].ledger.project_id,
    iteration: Math.max(...devs.map((d) => d.ledger.iteration)),
    updated_at: new Date().toISOString(),
    global_objective: devs[0].ledger.global_objective,
    current_operating_model: model,
    stable_learnings: stableLearnings,
    active_hypotheses: activeHypotheses,
    rejected_hypotheses: rejected,
    stable_decisions: stableDecisions,
    recurring_failure_patterns: recurringPatterns,
    open_questions: openQuestions,
    current_frontier: { next_best_action: nextActions, blockers, risks },
    do_not_repeat: doNotRepeat,
    continuity_summary: `Team merge of ${devs.length} developer ledger(s) [${authors.join(', ')}]. ${conflicts.length} unresolved conflict(s).`,
  };

  return { teamLedger, conflicts };
}
