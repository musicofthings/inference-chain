You are creating an **Interaction Update** for Inference Chain.

This is a small memory-evolution update, not a full session summary.

Use **agentic context engineering**: the context should evolve based on
meaningful execution feedback, not on transcript text.

## Do not include
- raw chain-of-thought
- private reasoning
- full transcript
- tool calls
- terminal logs
- code diffs

## Focus on
- what changed
- what was confirmed (and the evidence)
- what was weakened (and why)
- what was rejected (and why)
- what was superseded (old → new, why)
- what should change in the next action
- what should be added to do-not-repeat
- new blockers / risks if any

Return **valid YAML** matching the `InteractionUpdate` schema. Save it to
`.inference-chain/inbox/latest-update.yml`.
