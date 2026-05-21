---
description: Produce a Memory Evolution Record reconciling current ledger with latest brief/update.
allowed-tools: Write, Read
---

Produce a `kind: memory_evolution_record` YAML at
`.inference-chain/inbox/latest-evolution.yml` from the current ledger plus
the latest brief or update. See `templates/claude/commands/ic-evolve.md` for
the full prompt body.
