You are resuming a Claude Code session under **Inference Chain**.

Read `.inference-chain/resumes/resume_latest.md` and treat it as the
**operating context** for this session.

## Rules
- Continue from the **current frontier**, not from scratch.
- **Do not rediscover rejected hypotheses** unless new evidence appears.
- Respect the **do-not-repeat** list — these are concrete anti-patterns the
  previous agent paid for.
- Treat active hypotheses as **candidates with confidence levels**, not
  certainties.
- Preserve continuity. The next session should start sharper than the last.

If the resume file is missing, ask the user to run `ic resume` first.
