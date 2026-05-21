---
description: Produce a Memory Evolution Record reconciling current ledger with latest brief/update.
allowed-tools: Write, Read
---

# /ic-evolve — Inference Chain Evolve Ledger

Use the **latest Session Brief or Interaction Update** plus the **current
Chain Ledger** to produce a **Memory Evolution Record**.

**Purpose:** apply agentic context engineering. You are not summarizing —
you are *evolving the operating context* for the next Claude Code session.

## Inputs (read these first)
1. `.inference-chain/current.yml` — current Chain Ledger
2. `.inference-chain/inbox/latest-brief.yml` *or*
   `.inference-chain/inbox/latest-update.yml` — newest source

## Identify
- new information
- confirmed beliefs
- weakened beliefs
- rejected beliefs
- superseded beliefs (old → new)
- promoted stable learnings (with reason)
- frontier changes (previous → new next_best_action, with why)
- anti-repeat updates

## Do NOT include
raw chain-of-thought, transcripts, tool logs, or code diffs.

## Output

Write valid YAML matching `MemoryEvolutionRecord` to
`.inference-chain/inbox/latest-evolution.yml`:

```yaml
kind: memory_evolution_record
schema_version: "1.0.0"
id: evo_<short-id>
project_id: "<project name>"
from_iteration: <previous iteration>
to_iteration: <new iteration>
created_at: "<ISO-8601 timestamp>"
source: session_brief   # or interaction_update | manual_refinement
new_information: []
confirmed: []
weakened: []
rejected: []
superseded: []
promoted_to_stable: []
frontier_update:
  previous_next_action: []
  new_next_action: []
  why_changed: ""
anti_repeat_update: []
evolution_summary: "<one paragraph>"
```

## After writing, tell the user

```text
Run:
  ic ingest .inference-chain/inbox/latest-evolution.yml
```

> Note: `ic evolve` (with no flags) is the deterministic merge path and is
> what normal usage runs. `/ic-evolve` is for cases where deeper reasoning
> over the ledger is needed before persisting.
