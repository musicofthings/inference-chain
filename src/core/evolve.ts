import type {
	ChainLedger,
	InteractionUpdate,
	SessionBrief,
} from "./schemas.js";

export type Source =
	| { kind: "interaction"; value: InteractionUpdate }
	| { kind: "session"; value: SessionBrief };

export function scoreLedger(ledger: ChainLedger): number {
	return (
		ledger.stable_learnings.length * 3 +
		ledger.active_hypotheses.length * 2 +
		ledger.current_frontier.next_best_action.length +
		ledger.do_not_repeat.length
	);
}

export function evolveLedger(
	previous: ChainLedger,
	source: Source,
	advance: boolean,
): ChainLedger {
	const next: ChainLedger = structuredClone(previous);
	next.updated_at = new Date().toISOString();

	if (source.kind === "session") {
		const brief = source.value;
		next.iteration += 1;
		next.current_operating_model = brief.working_theory;
		next.current_frontier.next_best_action =
			brief.next_best_action.length > 0
				? brief.next_best_action
				: next.current_frontier.next_best_action;
		next.do_not_repeat = Array.from(
			new Set([...next.do_not_repeat, ...brief.do_not_repeat]),
		);

		// Treat "worked" outcomes as reinforcement-style stable learnings.
		next.stable_learnings = Array.from(
			new Set([
				...next.stable_learnings,
				...brief.worked,
				...brief.outcomes_observed,
			]),
		);

		// Convert explicit failures to rejected hypotheses.
		for (const fail of brief.did_not_work) {
			next.rejected_hypotheses.push({
				hypothesis: fail,
				reason_rejected: "Marked as did_not_work in session brief",
				rejected_at_iteration: next.iteration,
			});
		}

		next.continuity_summary = brief.human_handoff_summary;
		return next;
	}

	const upd = source.value;
	if (advance) next.iteration += 1;

	if (upd.next_action_delta.length > 0) {
		next.current_frontier.next_best_action = upd.next_action_delta;
	}
	next.do_not_repeat = Array.from(
		new Set([...next.do_not_repeat, ...upd.do_not_repeat_delta]),
	);

	// Reinforcement-like accumulation from interaction evidence.
	next.stable_learnings = Array.from(
		new Set([
			...next.stable_learnings,
			...upd.new_information,
			...upd.confirmed.map((c) => `${c.belief} :: ${c.evidence}`),
		]),
	);

	for (const r of upd.rejected) {
		next.rejected_hypotheses.push({
			hypothesis: r.belief,
			reason_rejected: r.reason,
			rejected_at_iteration: next.iteration,
		});
	}

	next.continuity_summary = upd.what_changed;
	return next;
}
