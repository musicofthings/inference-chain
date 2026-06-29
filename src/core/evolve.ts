import { nanoid } from 'nanoid';
import type {
  ActiveHypothesis,
  ChainLedger,
  InteractionUpdate,
  MemoryEvolutionRecord,
  SessionBrief,
} from './schemas.js';

export type Source =
	| { kind: "interaction"; value: InteractionUpdate }
	| { kind: "session"; value: SessionBrief };

export type EvolutionResult = {
  evolutionRecord: MemoryEvolutionRecord;
  updatedLedger: ChainLedger;
};

const DEFAULT_STABLE_PROMOTION_THRESHOLD = (() => {
  const env = Number(process.env.IC_STABLE_THRESHOLD);
  return Number.isFinite(env) && env >= 1 ? Math.floor(env) : 2;
})();

export type EvolveOptions = {
  /** Number of supporting-evidence items before a hypothesis is promoted to stable. */
  stablePromotionThreshold?: number;
};

const norm = (s: string) => s.trim().toLowerCase();

function uniqueAppend(target: string[], incoming: string[]): string[] {
  const seen = new Set(target.map(norm));
  const out = [...target];
  for (const item of incoming) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = norm(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function findHypothesisIndex(
  list: ActiveHypothesis[],
  belief: string,
): number {
  const k = norm(belief);
  return list.findIndex((h) => norm(h.hypothesis) === k);
}

function bumpConfidence(c: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
  return c === 'low' ? 'medium' : 'high';
}

function dropConfidence(
  c: 'low' | 'medium' | 'high',
): 'low' | 'medium' | 'high' {
  return c === 'high' ? 'medium' : 'low';
}

export function scoreLedger(ledger: ChainLedger): number {
  // Reward resolved knowledge (stable learnings, decisions, rejected
  // hypotheses) more than in-flight beliefs. Frontier size is intentionally
  // *not* rewarded — a ledger that piles up "next best actions" without
  // resolving them should not score higher. The simulate harness measures
  // frontier_convergence separately and expects it to shrink, so scoring
  // had to agree with that direction.
  const resolved =
    ledger.stable_learnings.length * 3 +
    ledger.stable_decisions.length * 3 +
    ledger.rejected_hypotheses.length * 2 +
    ledger.do_not_repeat.length * 1;
  const inFlight = ledger.active_hypotheses.length * 1;
  const drag =
    ledger.open_questions.length * 1 +
    ledger.current_frontier.blockers.length * 2;
  return resolved + inFlight - drag;
}

export function evolveLedger(
  previous: ChainLedger,
  source: Source,
  advance: boolean,
  opts: EvolveOptions = {},
): EvolutionResult {
  const stablePromotionThreshold =
    opts.stablePromotionThreshold ?? DEFAULT_STABLE_PROMOTION_THRESHOLD;
  const next: ChainLedger = structuredClone(previous);
  const fromIteration = previous.iteration;
  next.updated_at = new Date().toISOString();

  const newInformation: string[] = [];
  const confirmedRecords: { belief: string; evidence: string }[] = [];
  const weakenedRecords: { belief: string; reason: string }[] = [];
  const rejectedRecords: { belief: string; reason: string }[] = [];
  const supersededRecords: {
    old_belief: string;
    new_belief: string;
    reason: string;
  }[] = [];
  const promoted: { learning: string; reason: string }[] = [];
  const antiRepeatAdded: string[] = [];
  const previousFrontier = [...next.current_frontier.next_best_action];

  const applyConfirmed = (belief: string, evidence: string) => {
    // Already promoted to stable? Re-confirmation is a no-op; do not
    // re-add the belief to active_hypotheses (which would cause it to
    // appear in both sections of the resume brief).
    if (next.stable_learnings.some((l) => norm(l) === norm(belief))) {
      confirmedRecords.push({ belief, evidence });
      return;
    }
    const idx = findHypothesisIndex(next.active_hypotheses, belief);
    if (idx >= 0) {
      const h = next.active_hypotheses[idx];
      h.supporting_evidence = uniqueAppend(h.supporting_evidence, [evidence]);
      h.confidence = bumpConfidence(h.confidence);
      if (h.supporting_evidence.length >= stablePromotionThreshold) {
        promoted.push({
          learning: h.hypothesis,
          reason: `Confirmed ${h.supporting_evidence.length}× across iterations`,
        });
        next.stable_learnings = uniqueAppend(next.stable_learnings, [
          h.hypothesis,
        ]);
        next.active_hypotheses.splice(idx, 1);
      }
    } else {
      // Treat the confirmed belief as a candidate hypothesis being
      // promoted directly to evidence-backed knowledge.
      next.active_hypotheses.push({
        hypothesis: belief,
        confidence: 'medium',
        supporting_evidence: [evidence],
        contradicting_evidence: [],
        first_seen_at_iteration: fromIteration,
      });
    }
    confirmedRecords.push({ belief, evidence });
  };

  const applyWeakened = (belief: string, reason: string) => {
    const idx = findHypothesisIndex(next.active_hypotheses, belief);
    if (idx >= 0) {
      const h = next.active_hypotheses[idx];
      h.contradicting_evidence = uniqueAppend(h.contradicting_evidence, [
        reason,
      ]);
      h.confidence = dropConfidence(h.confidence);
    }
    weakenedRecords.push({ belief, reason });
  };

  const applyRejected = (belief: string, reason: string) => {
    const idx = findHypothesisIndex(next.active_hypotheses, belief);
    if (idx >= 0) next.active_hypotheses.splice(idx, 1);
    // A rejected belief is a resolved problem, not an open blocker. Drop any
    // matching frontier blocker so resolved issues stop resurfacing in the
    // resume brief (and in both sections at once).
    next.current_frontier.blockers = next.current_frontier.blockers.filter(
      (b) => norm(b) !== norm(belief),
    );
    const already = next.rejected_hypotheses.some(
      (r) => norm(r.hypothesis) === norm(belief),
    );
    if (!already) {
      next.rejected_hypotheses.push({
        hypothesis: belief,
        reason_rejected: reason,
        rejected_at_iteration: next.iteration,
      });
    }
    rejectedRecords.push({ belief, reason });
  };

  const applySuperseded = (
    oldBelief: string,
    newBelief: string,
    reason: string,
  ) => {
    applyRejected(oldBelief, `Superseded by "${newBelief}": ${reason}`);
    const idx = findHypothesisIndex(next.active_hypotheses, newBelief);
    if (idx < 0) {
      next.active_hypotheses.push({
        hypothesis: newBelief,
        confidence: 'medium',
        supporting_evidence: [reason],
        contradicting_evidence: [],
        first_seen_at_iteration: fromIteration,
      });
    }
    supersededRecords.push({
      old_belief: oldBelief,
      new_belief: newBelief,
      reason,
    });
  };

  const applyDoNotRepeat = (items: string[]) => {
    const before = next.do_not_repeat.length;
    next.do_not_repeat = uniqueAppend(next.do_not_repeat, items);
    const after = next.do_not_repeat.length;
    if (after > before) {
      antiRepeatAdded.push(...items);
    }
  };

  if (source.kind === 'session') {
    const brief = source.value;
    next.iteration += 1;
    next.current_operating_model = brief.working_theory;

    if (brief.next_best_action.length > 0) {
      next.current_frontier.next_best_action = brief.next_best_action;
    }

    newInformation.push(
      ...brief.outcomes_observed,
      ...brief.worked,
      ...brief.partially_worked,
    );

    // worked → stable learnings (durable wins)
    next.stable_learnings = uniqueAppend(next.stable_learnings, brief.worked);

    // partially_worked → candidate active hypotheses
    for (const pw of brief.partially_worked) {
      if (findHypothesisIndex(next.active_hypotheses, pw) < 0) {
        next.active_hypotheses.push({
          hypothesis: pw,
          confidence: 'medium',
          supporting_evidence: ['Partially worked in session brief'],
          contradicting_evidence: [],
          first_seen_at_iteration: next.iteration,
        });
      }
    }

    // did_not_work → rejected
    for (const fail of brief.did_not_work) {
      applyRejected(fail, 'Marked as did_not_work in session brief');
    }

    // issues_identified → blockers + recurring_failure_patterns
    next.current_frontier.blockers = uniqueAppend(
      next.current_frontier.blockers,
      [...brief.issues_identified, ...brief.new_blockers],
    );
    for (const issue of brief.issues_identified) {
      const existing = next.recurring_failure_patterns.find(
        (p) => norm(p.pattern) === norm(issue),
      );
      if (existing) {
        existing.evidence = uniqueAppend(existing.evidence, [
          `Iteration ${next.iteration}`,
        ]);
      } else {
        next.recurring_failure_patterns.push({
          pattern: issue,
          evidence: [`First observed at iteration ${next.iteration}`],
        });
      }
    }

    next.current_frontier.risks = uniqueAppend(
      next.current_frontier.risks,
      brief.new_risks,
    );

    // fixes_attempted → stable_decisions (each fix is a decision worth tracking)
    for (const fix of brief.fixes_attempted) {
      const existing = next.stable_decisions.find(
        (d) => norm(d.decision) === norm(fix),
      );
      if (existing) {
        existing.last_confirmed_at_iteration = next.iteration;
      } else {
        next.stable_decisions.push({
          decision: fix,
          rationale: 'Attempted as a fix in session brief',
          confidence: 'medium',
          first_introduced_at_iteration: next.iteration,
          last_confirmed_at_iteration: next.iteration,
        });
      }
    }

    // user_constraints → do_not_repeat (constraints are anti-repeat rules)
    applyDoNotRepeat([...brief.do_not_repeat, ...brief.user_constraints]);

    if (brief.unresolved_state.trim()) {
      next.open_questions = uniqueAppend(next.open_questions, [
        brief.unresolved_state,
      ]);
    }

    next.continuity_summary = brief.human_handoff_summary;
  } else {
    const upd = source.value;
    if (advance) next.iteration += 1;

    if (upd.next_action_delta.length > 0) {
      next.current_frontier.next_best_action = upd.next_action_delta;
    }

    applyDoNotRepeat(upd.do_not_repeat_delta);

    next.current_frontier.blockers = uniqueAppend(
      next.current_frontier.blockers,
      upd.new_blockers,
    );
    next.current_frontier.risks = uniqueAppend(
      next.current_frontier.risks,
      upd.new_risks,
    );

    newInformation.push(...upd.new_information);
    // Note: new_information no longer auto-creates active hypotheses.
    // Raw observations bloated active_hypotheses on every interaction.
    // Only confirmed/superseded/partially_worked items create hypotheses.

    for (const c of upd.confirmed) applyConfirmed(c.belief, c.evidence);
    for (const w of upd.weakened) applyWeakened(w.belief, w.reason);
    for (const r of upd.rejected) applyRejected(r.belief, r.reason);
    for (const s of upd.superseded)
      applySuperseded(s.old_belief, s.new_belief, s.reason);

    next.continuity_summary = upd.what_changed;
  }

  const evolutionRecord: MemoryEvolutionRecord = {
    kind: 'memory_evolution_record',
    schema_version: '1.0.0',
    id: `evo_${nanoid(10)}`,
    project_id: next.project_id,
    from_iteration: fromIteration,
    to_iteration: next.iteration,
    created_at: next.updated_at,
    source:
      source.kind === 'session' ? 'session_brief' : 'interaction_update',
    new_information: Array.from(new Set(newInformation.map((s) => s.trim()))).filter(
      Boolean,
    ),
    confirmed: confirmedRecords,
    weakened: weakenedRecords,
    rejected: rejectedRecords,
    superseded: supersededRecords,
    promoted_to_stable: promoted,
    frontier_update: {
      previous_next_action: previousFrontier,
      new_next_action: next.current_frontier.next_best_action,
      why_changed:
        source.kind === 'session'
          ? 'Session brief produced new next-best-action set'
          : 'Interaction update produced next-action delta',
    },
    anti_repeat_update: Array.from(new Set(antiRepeatAdded.map((s) => s.trim()))).filter(
      Boolean,
    ),
    evolution_summary: next.continuity_summary,
  };

  return { evolutionRecord, updatedLedger: next };
}
