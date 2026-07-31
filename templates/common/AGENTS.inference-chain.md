## Inference Chain

This project uses a local forward-only inference ledger under `.inference-chain/`.

### Session start
1. If `.inference-chain/resumes/resume_latest.md` exists, read it and continue from the **current frontier**.
2. Do not rediscover rejected hypotheses unless new evidence appears.
3. Respect the **do-not-repeat** list.

### Mid-session checkpoint
When something meaningful changes (failed/successful attempt, new blocker, user correction, before compaction):
1. Write an Interaction Update YAML to `.inference-chain/inbox/latest-update.yml` (see `.inference-chain/prompts/capture-interaction-update.md`).
2. Tell the user to run:
   `ic ingest .inference-chain/inbox/latest-update.yml && ic evolve`

### End of session
1. Write a Session Brief YAML to `.inference-chain/inbox/latest-brief.yml` (see `.inference-chain/prompts/capture-session-brief.md`).
2. Tell the user to run:
   `ic ingest .inference-chain/inbox/latest-brief.yml && ic evolve && ic resume`

### MCP (optional)
If the `inference-chain` MCP server is configured, prefer `chain_ingest_update` / `chain_ingest_brief` + `chain_evolve` + `chain_resume_brief` over shelling out.
