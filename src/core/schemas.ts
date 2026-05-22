import { z } from 'zod';

export const SCHEMA_VERSION = '1.0.0';

export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const InteractionUpdateSchema = z.object({
  kind: z.literal('interaction_update').default('interaction_update'),
  schema_version: z.string().default(SCHEMA_VERSION),
  id: z.string(),
  project_id: z.string(),
  iteration: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  trigger: z.enum([
    'manual_checkpoint',
    'precompact',
    'user_correction',
    'failed_attempt',
    'successful_attempt',
    'new_blocker',
    'new_hypothesis',
    'other',
  ]),
  what_changed: z.string(),
  new_information: z.array(z.string()).default([]),
  confirmed: z
    .array(z.object({ belief: z.string(), evidence: z.string() }))
    .default([]),
  weakened: z
    .array(z.object({ belief: z.string(), reason: z.string() }))
    .default([]),
  rejected: z
    .array(z.object({ belief: z.string(), reason: z.string() }))
    .default([]),
  superseded: z
    .array(
      z.object({
        old_belief: z.string(),
        new_belief: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
  next_action_delta: z.array(z.string()).default([]),
  do_not_repeat_delta: z.array(z.string()).default([]),
  new_blockers: z.array(z.string()).default([]),
  new_risks: z.array(z.string()).default([]),
  human_note: z.string().default(''),
});

export const SessionBriefSchema = z.object({
  kind: z.literal('session_brief').default('session_brief'),
  schema_version: z.string().default(SCHEMA_VERSION),
  id: z.string(),
  project_id: z.string(),
  iteration: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  session_intent: z.object({
    primary_goal: z.string(),
    what_agent_was_doing: z.string(),
  }),
  working_theory: z.object({
    summary: z.string(),
    confidence: ConfidenceSchema,
  }),
  actions_attempted: z.array(z.string()).default([]),
  outcomes_observed: z.array(z.string()).default([]),
  worked: z.array(z.string()).default([]),
  did_not_work: z.array(z.string()).default([]),
  partially_worked: z.array(z.string()).default([]),
  issues_identified: z.array(z.string()).default([]),
  fixes_attempted: z.array(z.string()).default([]),
  unresolved_state: z.string(),
  next_best_action: z.array(z.string()).default([]),
  do_not_repeat: z.array(z.string()).default([]),
  user_constraints: z.array(z.string()).default([]),
  new_blockers: z.array(z.string()).default([]),
  new_risks: z.array(z.string()).default([]),
  human_handoff_summary: z.string(),
});

export const MemoryEvolutionRecordSchema = z.object({
  kind: z.literal('memory_evolution_record').default('memory_evolution_record'),
  schema_version: z.string().default(SCHEMA_VERSION),
  id: z.string(),
  project_id: z.string(),
  from_iteration: z.number().int().nonnegative(),
  to_iteration: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  source: z.enum(['interaction_update', 'session_brief', 'manual_refinement']),
  new_information: z.array(z.string()).default([]),
  confirmed: z
    .array(z.object({ belief: z.string(), evidence: z.string() }))
    .default([]),
  weakened: z
    .array(z.object({ belief: z.string(), reason: z.string() }))
    .default([]),
  rejected: z
    .array(z.object({ belief: z.string(), reason: z.string() }))
    .default([]),
  superseded: z
    .array(
      z.object({
        old_belief: z.string(),
        new_belief: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
  promoted_to_stable: z
    .array(z.object({ learning: z.string(), reason: z.string() }))
    .default([]),
  frontier_update: z.object({
    previous_next_action: z.array(z.string()).default([]),
    new_next_action: z.array(z.string()).default([]),
    why_changed: z.string().default(''),
  }),
  anti_repeat_update: z.array(z.string()).default([]),
  evolution_summary: z.string(),
});

export const ActiveHypothesisSchema = z.object({
  hypothesis: z.string(),
  confidence: ConfidenceSchema,
  supporting_evidence: z.array(z.string()).default([]),
  contradicting_evidence: z.array(z.string()).default([]),
  first_seen_at_iteration: z.number().int().nonnegative().default(0),
});

export const ChainLedgerSchema = z.object({
  kind: z.literal('chain_ledger').default('chain_ledger'),
  schema_version: z.string().default(SCHEMA_VERSION),
  project_id: z.string(),
  iteration: z.number().int().nonnegative(),
  updated_at: z.string().datetime({ offset: true }),
  global_objective: z.string(),
  current_operating_model: z.object({
    summary: z.string(),
    confidence: ConfidenceSchema,
  }),
  stable_learnings: z.array(z.string()).default([]),
  active_hypotheses: z.array(ActiveHypothesisSchema).default([]),
  rejected_hypotheses: z
    .array(
      z.object({
        hypothesis: z.string(),
        reason_rejected: z.string(),
        rejected_at_iteration: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  stable_decisions: z
    .array(
      z.object({
        decision: z.string(),
        rationale: z.string(),
        confidence: ConfidenceSchema,
        first_introduced_at_iteration: z.number().int().nonnegative(),
        last_confirmed_at_iteration: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  recurring_failure_patterns: z
    .array(
      z.object({
        pattern: z.string(),
        evidence: z.array(z.string()).default([]),
        // Optional — currently never written by evolve, but kept for
        // human-authored snapshots and future automation.
        mitigation: z.string().optional(),
      }),
    )
    .default([]),
  open_questions: z.array(z.string()).default([]),
  current_frontier: z.object({
    next_best_action: z.array(z.string()).default([]),
    blockers: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
  }),
  do_not_repeat: z.array(z.string()).default([]),
  continuity_summary: z.string(),
});

export type InteractionUpdate = z.infer<typeof InteractionUpdateSchema>;
export type SessionBrief = z.infer<typeof SessionBriefSchema>;
export type MemoryEvolutionRecord = z.infer<typeof MemoryEvolutionRecordSchema>;
export type ChainLedger = z.infer<typeof ChainLedgerSchema>;
export type ActiveHypothesis = z.infer<typeof ActiveHypothesisSchema>;
