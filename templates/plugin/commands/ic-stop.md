---
description: Capture an Inference Chain session-level handoff (final Session Brief).
allowed-tools: Write, Read
---

Produce a `kind: session_brief` YAML at
`.inference-chain/inbox/latest-brief.yml` following the SessionBrief schema.
Then prompt the user to run:

```text
ic ingest .inference-chain/inbox/latest-brief.yml
ic evolve
ic resume
```

See `templates/claude/commands/ic-stop.md` for the full prompt body.
