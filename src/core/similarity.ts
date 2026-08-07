/**
 * Conservative near-duplicate matching for belief strings.
 *
 * The evolution algorithm matched beliefs by exact normalized string, so a
 * belief restated with different wording across sessions became a second
 * hypothesis instead of a second piece of evidence for the first — which
 * suppresses promotion to stable and inflates active_hypotheses forever.
 *
 * The threshold is deliberately high. Competing alternatives share *more*
 * surface tokens than genuine paraphrases do ("use token-bucket for rate
 * limiting" vs "use sliding-window for rate limiting" overlap on half their
 * content words while being opposite beliefs), so any threshold loose enough
 * to merge semantic paraphrase also merges mutually exclusive options. Real
 * semantic matching needs a model, which the solo core deliberately excludes;
 * this catches restatement, not synonymy.
 */

/** Filler that carries no belief content; dropped before comparison. */
const STOPWORDS = new Set([
	"a",
	"an",
	"the",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"to",
	"of",
	"for",
	"in",
	"on",
	"at",
	"by",
	"with",
	"from",
	"into",
	"and",
	"or",
	"as",
	"we",
	"i",
	"it",
	"its",
	"this",
	"that",
	"these",
	"those",
	"there",
	"should",
	"must",
	"can",
	"could",
	"will",
	"would",
	"may",
	"might",
	"do",
	"does",
	"did",
	"use",
	"using",
	"used",
	"when",
	"if",
	"then",
	"than",
	"so",
	"our",
	"you",
	"your",
	"always",
	"just",
]);

/**
 * Differing polarity means opposite beliefs, however similar the wording:
 * "WAL mode fixes the write errors" must never merge with "WAL mode does not
 * fix the write errors".
 */
const NEGATIONS = new Set([
	"not",
	"no",
	"never",
	"without",
	"avoid",
	"cannot",
	"cant",
	"dont",
	"doesnt",
	"isnt",
	"arent",
	"wasnt",
	"werent",
	"wont",
	"shouldnt",
	"unless",
	"fails",
	"fail",
	"failed",
	"broken",
]);

/**
 * Crude suffix normalizer, not a linguistic stemmer. Consistency matters more
 * than correctness here: both sides of a comparison get the same treatment, so
 * "cases"→"cas" is fine as long as "case"→"cas" too. Trailing -e is stripped
 * after -s so the -es plurals land on the same token ("fixes"→"fixe"→"fix").
 * Anything more aggressive (-ing, -ed) starts merging distinct technical terms.
 */
function stem(word: string): string {
	let s = word;
	if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
	if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
	return s;
}

function words(s: string): string[] {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
}

/** Deduplicated content tokens, stopwords removed, plurals collapsed. */
export function contentTokens(s: string): Set<string> {
	const out = new Set<string>();
	for (const w of words(s)) {
		if (STOPWORDS.has(w)) continue;
		out.add(stem(w));
	}
	return out;
}

function isNegated(s: string): boolean {
	return words(s).some((w) => NEGATIONS.has(w));
}

/**
 * Sørensen–Dice coefficient over content tokens, in [0, 1]. Returns 0 when
 * polarity differs so a negated restatement can never match its opposite.
 */
export function beliefSimilarity(a: string, b: string): number {
	if (isNegated(a) !== isNegated(b)) return 0;
	const ta = contentTokens(a);
	const tb = contentTokens(b);
	if (ta.size === 0 || tb.size === 0) return 0;
	let shared = 0;
	for (const t of ta) if (tb.has(t)) shared += 1;
	return (2 * shared) / (ta.size + tb.size);
}

export const DEFAULT_MATCH_THRESHOLD = (() => {
	const env = Number(process.env.IC_MATCH_THRESHOLD);
	// 1 disables fuzzy matching entirely (exact-after-normalization only).
	return Number.isFinite(env) && env > 0 && env <= 1 ? env : 0.82;
})();

const normalized = (s: string) => s.trim().toLowerCase();

/**
 * Index of the entry matching `target`, or -1. Exact-after-normalization wins
 * outright; otherwise the highest-scoring entry at or above `threshold`, with
 * ties broken by position so the result never depends on iteration order.
 */
export function matchIndexBy<T>(
	list: readonly T[],
	target: string,
	key: (item: T) => string,
	threshold: number = DEFAULT_MATCH_THRESHOLD,
): number {
	const exact = normalized(target);
	for (let i = 0; i < list.length; i++) {
		if (normalized(key(list[i])) === exact) return i;
	}
	if (threshold >= 1) return -1;

	let bestIdx = -1;
	let bestScore = 0;
	for (let i = 0; i < list.length; i++) {
		const score = beliefSimilarity(key(list[i]), target);
		if (score >= threshold && score > bestScore) {
			bestScore = score;
			bestIdx = i;
		}
	}
	return bestIdx;
}

export function matchIndex(
	list: readonly string[],
	target: string,
	threshold?: number,
): number {
	return matchIndexBy(list, target, (s) => s, threshold);
}
