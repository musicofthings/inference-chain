## Inference Chain

This project uses a local forward-only inference ledger under `.inference-chain/`.

### Session start
1. If `.inference-chain/resumes/resume_latest.md` exists, read it and continue from the **current frontier**.
2. Do not rediscover rejected hypotheses unless new evidence appears.
3. Respect the **do-not-repeat** list.

### Mid-session checkpoint
When something meaningful changes (failed/successful attempt, new blocker, user correction, before compaction):
1. Write an Interaction Update YAML to `.inference-chain/inbox/latest-update.yml` (see `.inference-chain/prompts/capture-interaction-update.md`).
2. Run `ic sync` (or let the Stop hook do it, where one is installed).

### End of session
1. Write a Session Brief YAML to `.inference-chain/inbox/latest-brief.yml` (see `.inference-chain/prompts/capture-session-brief.md`).
2. Run `ic sync` (or let the Stop hook do it, where one is installed).

Writing the artifact is the only step that needs judgement. `ic sync` applies
whatever is in the inbox, advances the ledger, and regenerates the resume brief;
it is a no-op when the inbox is empty, so it is always safe to run.

### MCP (optional)
If the `inference-chain` MCP server is configured, prefer `chain_ingest_update` / `chain_ingest_brief` + `chain_evolve` + `chain_resume_brief` over shelling out.
