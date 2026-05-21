import type { ChainLedger } from './schemas.js';

const RESUME_TOP_K = (() => {
  const env = Number(process.env.IC_RESUME_TOP_K);
  return Number.isFinite(env) && env >= 1 ? Math.floor(env) : 12;
})();

function cap<T>(items: T[], k = RESUME_TOP_K): { shown: T[]; hidden: number } {
  // Most-recent-first: ledger arrays grow append-only, so the tail is newest.
  if (items.length <= k) return { shown: [...items].reverse(), hidden: 0 };
  const shown = items.slice(items.length - k).reverse();
  return { shown, hidden: items.length - k };
}

function bullets(items: string[], empty = '_none_'): string {
  if (items.length === 0) return empty;
  const { shown, hidden } = cap(items);
  const lines = shown.map((i) => `- ${i}`);
  if (hidden > 0) lines.push(`- _…and ${hidden} older items in current.yml_`);
  return lines.join('\n');
}

export function renderResumeBrief(ledger: ChainLedger): string {
  const renderActive = () => {
    if (ledger.active_hypotheses.length === 0) return '_none_';
    const { shown, hidden } = cap(ledger.active_hypotheses);
    const lines = shown.map(
      (h) =>
        `- (${h.confidence}) ${h.hypothesis}` +
        (h.supporting_evidence.length
          ? `\n  - supporting: ${h.supporting_evidence.join('; ')}`
          : '') +
        (h.contradicting_evidence.length
          ? `\n  - contradicting: ${h.contradicting_evidence.join('; ')}`
          : ''),
    );
    if (hidden > 0) lines.push(`- _…and ${hidden} older hypotheses in current.yml_`);
    return lines.join('\n');
  };

  const renderRejected = () => {
    if (ledger.rejected_hypotheses.length === 0) return '_none_';
    const { shown, hidden } = cap(ledger.rejected_hypotheses);
    const lines = shown.map(
      (r) =>
        `- ${r.hypothesis} — rejected@${r.rejected_at_iteration}: ${r.reason_rejected}`,
    );
    if (hidden > 0) lines.push(`- _…and ${hidden} older rejections in current.yml_`);
    return lines.join('\n');
  };

  const renderStableDecisions = () => {
    if (ledger.stable_decisions.length === 0) return '_none_';
    const { shown, hidden } = cap(ledger.stable_decisions);
    const lines = shown.map(
      (d) =>
        `- (${d.confidence}) ${d.decision} — ${d.rationale} [first@${d.first_introduced_at_iteration}, last_confirmed@${d.last_confirmed_at_iteration}]`,
    );
    if (hidden > 0) lines.push(`- _…and ${hidden} older decisions in current.yml_`);
    return lines.join('\n');
  };

  const ah = renderActive();
  const rh = renderRejected();
  const sd = renderStableDecisions();

  return `# Inference Chain Resume Brief

You are continuing this project at Inference Chain iteration ${ledger.iteration}.

## Global objective
${ledger.global_objective}

## Current operating model
${ledger.current_operating_model.summary}

Confidence: ${ledger.current_operating_model.confidence}

## Stable learnings
${bullets(ledger.stable_learnings)}

## Active hypotheses
${ah}

## Rejected hypotheses
${rh}

## Stable decisions
${sd}

## Current frontier
**Next best actions:**
${bullets(ledger.current_frontier.next_best_action)}

**Blockers:**
${bullets(ledger.current_frontier.blockers)}

**Risks:**
${bullets(ledger.current_frontier.risks)}

## Open questions
${bullets(ledger.open_questions)}

## Do not repeat
${bullets(ledger.do_not_repeat)}

## Continuity summary
${ledger.continuity_summary}

## Instruction for this session
Continue from this state. Do not rediscover rejected hypotheses unless new evidence appears. Prioritize the current frontier. Use this ledger as the current operating model, not as a transcript. Preserve continuity with the previous agent's work.
`;
}
