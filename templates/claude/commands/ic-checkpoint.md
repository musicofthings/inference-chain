---
description: Capture an Inference Chain interaction-level checkpoint (small memory-evolution event).
allowed-tools: Write, Read
---

# /ic-checkpoint — Inference Chain Checkpoint

Generate an **Interaction Update** for the current Claude Code session.

**Purpose:** capture a meaningful change in the agentic context without
producing a full session handoff. This drives interaction-level memory
evolution.

## Do NOT include
- raw chain-of-thought
- private reasoning
- transcript text
- tool calls
- terminal logs
- code diffs
- file-by-file summaries

## Capture
- what changed since the previous checkpoint
- new information
- confirmed beliefs (with evidence)
- weakened beliefs (with reason)
- rejected beliefs (with reason)
- superseded beliefs (old → new, with reason)
- next-action delta
- do-not-repeat delta
- new blockers / risks (if any)

## Output

Write **valid YAML** matching the `InteractionUpdate` schema below, then
save it to `.inference-chain/inbox/latest-update.yml`.

```yaml
kind: interaction_update
schema_version: "1.0.0"
id: upd_<short-id>
project_id: "<project name>"
iteration: <current iteration>
created_at: "<ISO-8601 timestamp>"
trigger: manual_checkpoint   # or precompact | user_correction | failed_attempt | successful_attempt | new_blocker | new_hypothesis | other
what_changed: "<one or two sentence summary>"
new_information:
  - "<short, operational fact>"
confirmed:
  - belief: "<belief>"
    evidence: "<concrete observation>"
weakened:
  - belief: "<belief>"
    reason: "<why weakened>"
rejected:
  - belief: "<belief>"
    reason: "<why rejected>"
superseded:
  - old_belief: "<previous>"
    new_belief: "<replacement>"
    reason: "<why>"
next_action_delta:
  - "<single next best action>"
do_not_repeat_delta:
  - "<concrete anti-pattern>"
new_blockers: []
new_risks: []
human_note: ""
```

## After writing the file, tell the user

```text
Run:
  ic ingest .inference-chain/inbox/latest-update.yml
  ic evolve
```
