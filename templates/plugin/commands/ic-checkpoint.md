---
description: Capture an Inference Chain interaction-level checkpoint (small memory-evolution event).
allowed-tools: Write, Read
---

See `templates/claude/commands/ic-checkpoint.md` in the inference-chain
source repo for the full body. When installed via `ic install-claude`, the
canonical command file is copied into `.claude/commands/ic-checkpoint.md`.

When loaded as a plugin, this command points the agent at the same
behavior: produce a `kind: interaction_update` YAML at
`.inference-chain/inbox/latest-update.yml`, then prompt the user to run
`ic ingest <file> && ic evolve`.
