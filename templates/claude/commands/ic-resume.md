---
description: Resume a Claude Code session from the latest Inference Chain resume brief.
allowed-tools: Read
---

# /ic-resume — Inference Chain Resume

Read **`.inference-chain/resumes/resume_latest.md`** and adopt it as the
operating context for this Claude Code session.

## Rules
- Continue from the **current frontier**.
- **Do not repeat rejected hypotheses** unless new evidence appears.
- Respect the **do-not-repeat** list.
- Treat the ledger as the **operating model**, not a transcript.
- Preserve continuity with the previous agent's work.

If the file does not exist, ask the user to run:

```text
ic resume
```
