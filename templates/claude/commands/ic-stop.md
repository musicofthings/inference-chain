---
description: Capture an Inference Chain session-level handoff (final Session Brief).
allowed-tools: Write, Read
---

# /ic-stop — Inference Chain Stop Brief

Generate the **final Session Brief** for this Claude Code session.

**Purpose:** preserve high-level continuity for the next agent session. Write
like a senior developer handing off to another senior developer.

## Do NOT include
- raw chain-of-thought
- private reasoning
- transcript text
- tool calls
- terminal logs
- code diffs
- MCP/tool noise
- generic project documentation

## Capture
- what you were trying to accomplish
- current working theory (with confidence)
- actions attempted
- outcomes observed
- what worked / did not work / partially worked
- issues identified, fixes attempted
- unresolved state
- next best action
- do-not-repeat list
- user constraints that matter
- new blockers / risks (if any)
- a human-readable handoff summary

## Output

Write **valid YAML** matching the `SessionBrief` schema, then save it to
`.inference-chain/inbox/latest-brief.yml`.

```yaml
kind: session_brief
schema_version: "1.0.0"
id: brf_<short-id>
project_id: "<project name>"
iteration: <current iteration>
created_at: "<ISO-8601 timestamp>"
session_intent:
  primary_goal: "<one line>"
  what_agent_was_doing: "<one or two sentences>"
working_theory:
  summary: "<current operating theory>"
  confidence: medium   # low | medium | high
actions_attempted:
  - "<action>"
outcomes_observed:
  - "<observation>"
worked:
  - "<thing that worked>"
did_not_work:
  - "<thing that failed>"
partially_worked:
  - "<thing that partially worked>"
issues_identified:
  - "<issue / blocker>"
fixes_attempted:
  - "<fix>"
unresolved_state: "<what is still open>"
next_best_action:
  - "<single next step>"
do_not_repeat:
  - "<anti-pattern>"
user_constraints:
  - "<constraint to respect>"
new_blockers: []
new_risks: []
human_handoff_summary: "<3-6 sentences a senior dev would write in a handoff>"
```

## After writing the file, tell the user

```text
Run:
  ic ingest .inference-chain/inbox/latest-brief.yml
  ic evolve
  ic resume
```
