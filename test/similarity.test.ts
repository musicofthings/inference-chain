import { describe, expect, it } from "vitest";
import { createInitialLedger } from "../src/core/bootstrap.js";
import { evolveLedger } from "../src/core/evolve.js";
import { InteractionUpdateSchema } from "../src/core/schemas.js";
import type { ChainLedger, InteractionUpdate } from "../src/core/schemas.js";
import {
	DEFAULT_MATCH_THRESHOLD,
	beliefSimilarity,
	contentTokens,
	matchIndex,
} from "../src/core/similarity.js";

// Built through the real constructors so field defaults stay in one place.
const emptyLedger = (): ChainLedger =>
	createInitialLedger("sim", "2026-01-01T00:00:00Z");

const confirm = (belief: string, evidence: string): InteractionUpdate =>
	InteractionUpdateSchema.parse({
		id: `upd_${belief.slice(0, 6).replace(/\W/g, "")}_${evidence.length}`,
		project_id: "sim",
		iteration: 0,
		created_at: "2026-01-01T00:00:00Z",
		trigger: "successful_attempt",
		what_changed: "test",
		confirmed: [{ belief, evidence }],
	});

describe("belief similarity", () => {
	it("drops stopwords and collapses inflection", () => {
		expect([...contentTokens("we should use the WAL modes")].sort()).toEqual(
			["mod", "wal"].sort(),
		);
	});

	it("scores a restatement above the default threshold", () => {
		const score = beliefSimilarity(
			"connection pooling fixes the concurrency stalls",
			"pooling connections fixes concurrency stall",
		);
		expect(score).toBeGreaterThanOrEqual(DEFAULT_MATCH_THRESHOLD);
	});

	// The whole risk of fuzzy matching: rival options share more surface tokens
	// than paraphrases do, so a threshold loose enough for synonymy silently
	// merges beliefs that contradict each other.
	it("keeps competing alternatives apart", () => {
		const score = beliefSimilarity(
			"use token-bucket per API key for rate limiting",
			"use sliding-window per IP for rate limiting",
		);
		expect(score).toBeLessThan(DEFAULT_MATCH_THRESHOLD);
	});

	it("never matches across a polarity flip", () => {
		expect(
			beliefSimilarity(
				"WAL mode fixes the concurrent write errors",
				"WAL mode does not fix the concurrent write errors",
			),
		).toBe(0);
	});

	it("prefers an exact match over a higher-scoring neighbour", () => {
		const list = [
			"pooling connections fixes concurrency stall",
			"exact belief",
		];
		expect(matchIndex(list, "exact belief")).toBe(1);
	});

	it("is order independent", () => {
		const a = "the retry budget must be bounded per request";
		const b = "retry budget bounded per request";
		expect(beliefSimilarity(a, b)).toBe(beliefSimilarity(b, a));
	});

	it("threshold of 1 restores exact-only matching", () => {
		const list = ["connection pooling fixes the concurrency stalls"];
		expect(
			matchIndex(list, "pooling connections fixes concurrency stall", 1),
		).toBe(-1);
	});
});

describe("evolve with fuzzy matching", () => {
	it("accumulates evidence across restatements and promotes", () => {
		const first = evolveLedger(
			emptyLedger(),
			{
				kind: "interaction",
				value: confirm(
					"connection pooling fixes the concurrency stalls",
					"200 rps load test stopped timing out",
				),
			},
			false,
		);
		expect(first.updatedLedger.active_hypotheses).toHaveLength(1);

		const second = evolveLedger(
			first.updatedLedger,
			{
				kind: "interaction",
				value: confirm(
					"pooling connections fixes concurrency stall",
					"p99 latency flat at 400 rps",
				),
			},
			false,
		);

		// Under exact matching this was two hypotheses with one evidence each,
		// so nothing ever reached the promotion threshold.
		expect(second.updatedLedger.active_hypotheses).toHaveLength(0);
		expect(second.updatedLedger.stable_learnings).toEqual([
			"connection pooling fixes the concurrency stalls",
		]);
	});

	it("does not merge rival options into one hypothesis", () => {
		const first = evolveLedger(
			emptyLedger(),
			{
				kind: "interaction",
				value: confirm(
					"use token-bucket per API key for rate limiting",
					"handles bursts",
				),
			},
			false,
		);
		const second = evolveLedger(
			first.updatedLedger,
			{
				kind: "interaction",
				value: confirm(
					"use sliding-window per IP for rate limiting",
					"simpler to implement",
				),
			},
			false,
		);
		expect(second.updatedLedger.active_hypotheses).toHaveLength(2);
	});

	it("matchThreshold of 1 reproduces pre-fuzzy behaviour", () => {
		const first = evolveLedger(
			emptyLedger(),
			{
				kind: "interaction",
				value: confirm(
					"connection pooling fixes the concurrency stalls",
					"200 rps load test stopped timing out",
				),
			},
			false,
			{ matchThreshold: 1 },
		);
		const second = evolveLedger(
			first.updatedLedger,
			{
				kind: "interaction",
				value: confirm(
					"pooling connections fixes concurrency stall",
					"p99 latency flat at 400 rps",
				),
			},
			false,
			{ matchThreshold: 1 },
		);
		expect(second.updatedLedger.active_hypotheses).toHaveLength(2);
		expect(second.updatedLedger.stable_learnings).toEqual([]);
	});
});
