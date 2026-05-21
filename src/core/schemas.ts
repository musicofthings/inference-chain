import { z } from 'zod';
export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);
export const InteractionUpdateSchema = z.object({
  id: z.string(), project_id: z.string(), iteration: z.number().int().nonnegative(), created_at: z.string(),
  trigger: z.enum(['manual_checkpoint','precompact','user_correction','failed_attempt','successful_attempt','new_blocker','new_hypothesis','other']),
  what_changed: z.string(),
  new_information: z.array(z.string()).default([]),
  confirmed: z.array(z.object({ belief: z.string(), evidence: z.string() })).default([]),
  weakened: z.array(z.object({ belief: z.string(), reason: z.string() })).default([]),
  rejected: z.array(z.object({ belief: z.string(), reason: z.string() })).default([]),
  superseded: z.array(z.object({ old_belief: z.string(), new_belief: z.string(), reason: z.string() })).default([]),
  next_action_delta: z.array(z.string()).default([]), do_not_repeat_delta: z.array(z.string()).default([]), human_note: z.string().default('')
});
export const SessionBriefSchema = z.object({
  id: z.string(), project_id: z.string(), iteration: z.number().int().nonnegative(), created_at: z.string(),
  session_intent: z.object({ primary_goal: z.string(), what_agent_was_doing: z.string() }),
  working_theory: z.object({ summary: z.string(), confidence: ConfidenceSchema }),
  actions_attempted: z.array(z.string()).default([]), outcomes_observed: z.array(z.string()).default([]),
  worked: z.array(z.string()).default([]), did_not_work: z.array(z.string()).default([]), partially_worked: z.array(z.string()).default([]),
  issues_identified: z.array(z.string()).default([]), fixes_attempted: z.array(z.string()).default([]), unresolved_state: z.string(),
  next_best_action: z.array(z.string()).default([]), do_not_repeat: z.array(z.string()).default([]), user_constraints: z.array(z.string()).default([]), human_handoff_summary: z.string()
});
export const ChainLedgerSchema = z.object({
  project_id: z.string(), iteration: z.number().int().nonnegative(), updated_at: z.string(), global_objective: z.string(),
  current_operating_model: z.object({ summary: z.string(), confidence: ConfidenceSchema }),
  stable_learnings: z.array(z.string()).default([]),
  active_hypotheses: z.array(z.object({ hypothesis: z.string(), confidence: ConfidenceSchema, supporting_evidence: z.array(z.string()).default([]), contradicting_evidence: z.array(z.string()).default([]) })).default([]),
  rejected_hypotheses: z.array(z.object({ hypothesis: z.string(), reason_rejected: z.string(), rejected_at_iteration: z.number().int().nonnegative() })).default([]),
  stable_decisions: z.array(z.object({ decision: z.string(), rationale: z.string(), confidence: ConfidenceSchema, first_introduced_at_iteration: z.number().int().nonnegative(), last_confirmed_at_iteration: z.number().int().nonnegative() })).default([]),
  recurring_failure_patterns: z.array(z.object({ pattern: z.string(), evidence: z.array(z.string()).default([]), mitigation: z.string() })).default([]),
  open_questions: z.array(z.string()).default([]),
  current_frontier: z.object({ next_best_action: z.array(z.string()).default([]), blockers: z.array(z.string()).default([]), risks: z.array(z.string()).default([]) }),
  do_not_repeat: z.array(z.string()).default([]), continuity_summary: z.string()
});
export type InteractionUpdate = z.infer<typeof InteractionUpdateSchema>;
export type SessionBrief = z.infer<typeof SessionBriefSchema>;
export type ChainLedger = z.infer<typeof ChainLedgerSchema>;
