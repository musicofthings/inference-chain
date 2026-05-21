import { describe, expect, it } from "vitest";
import { evolveLedger, scoreLedger } from "../src/core/evolve.js";
import type {
	ChainLedger,
	InteractionUpdate,
	SessionBrief,
} from "../src/core/schemas.js";

const baseLedger: ChainLedger = {
	project_id: "p1",
	iteration: 0,
	updated_at: new Date().toISOString(),
	global_objective: "Ship MVP",
	current_operating_model: { summary: "Initial", confidence: "medium" },
	stable_learnings: [],
	active_hypotheses: [],
	rejected_hypotheses: [],
	stable_decisions: [],
	recurring_failure_patterns: [],
	open_questions: [],
	current_frontier: { next_best_action: ["setup"], blockers: [], risks: [] },
	do_not_repeat: [],
	continuity_summary: "init",
};

describe("n+1 progression math test", () => {
	it("score is non-decreasing and learnings accumulate across iterations", () => {
		const update1: InteractionUpdate = {
			id: "u1",
			project_id: "p1",
			iteration: 0,
			created_at: new Date().toISOString(),
			trigger: "manual_checkpoint",
			what_changed: "Found a working parser",
			new_information: ["yaml parser valid"],
			confirmed: [{ belief: "parser strategy", evidence: "unit pass" }],
			weakened: [],
			rejected: [],
			superseded: [],
			next_action_delta: ["add ingestion tests"],
			do_not_repeat_delta: ["do not parse raw json as yaml"],
			human_note: "",
		};

		const session1: SessionBrief = {
			id: "s1",
			project_id: "p1",
			iteration: 0,
			created_at: new Date().toISOString(),
			session_intent: {
				primary_goal: "ingest",
				what_agent_was_doing: "implementing cli ingest",
			},
			working_theory: {
				summary: "Schema-first ingest is stable",
				confidence: "high",
			},
			actions_attempted: ["zod validation"],
			outcomes_observed: ["valid files ingest"],
			worked: ["schema validation"],
			did_not_work: ["ad hoc parsing"],
			partially_worked: [],
			issues_identified: [],
			fixes_attempted: [],
			unresolved_state: "need evolution metrics",
			next_best_action: ["add evolution scoring tests"],
			do_not_repeat: ["ad hoc parsing"],
			user_constraints: [],
			human_handoff_summary: "Ingest stable, evolve next.",
		};

		const s0 = scoreLedger(baseLedger);
		const l1 = evolveLedger(
			baseLedger,
			{ kind: "interaction", value: update1 },
			false,
		);
		const s1 = scoreLedger(l1);
		const l2 = evolveLedger(l1, { kind: "session", value: session1 }, true);
		const s2 = scoreLedger(l2);

		expect(s1).toBeGreaterThanOrEqual(s0);
		expect(s2).toBeGreaterThanOrEqual(s1);
		expect(l2.stable_learnings.length).toBeGreaterThan(0);
		expect(l2.do_not_repeat).toContain("ad hoc parsing");
		expect(l2.iteration).toBe(1);
	});
});
