You are evolving an **Inference Chain Ledger**.

This is agentic context engineering. You are **not summarizing**. You are
updating the operating context for the next Claude Code session.

## Inputs
1. Previous Chain Ledger (`.inference-chain/current.yml`)
2. Latest Session Brief or Interaction Update (`.inference-chain/inbox/`)

## Tasks
1. Extract new information.
2. Confirm, weaken, reject, or supersede prior beliefs.
3. Promote repeatedly-confirmed learnings to stable.
4. Update rejected hypotheses.
5. Update stable decisions.
6. Update recurring failure patterns.
7. Refine do-not-repeat list (deduplicate, keep concrete anti-patterns only).
8. Recompute current frontier (next-best-action, blockers, risks).
9. Produce a `MemoryEvolutionRecord`.
10. Produce the updated `ChainLedger`.

## Rules
- No raw chain-of-thought.
- No transcript.
- No code diffs.
- No tool logs.
- Preserve uncertainty where evidence is weak.
- Remove stale assumptions.
- Resolve contradictions explicitly.
- Prefer operational clarity over completeness.

## Return
1. `MemoryEvolutionRecord` YAML at `.inference-chain/inbox/latest-evolution.yml`
2. Updated `ChainLedger` YAML at `.inference-chain/inbox/refined-ledger.yml`
   (optional — only if proposing a non-deterministic refinement beyond what
   `ic evolve` would compute).
