You are generating a **Session Brief** for Inference Chain.

**Purpose:** preserve high-level continuity so the next Claude Code session
can continue like a human developer taking over.

## Do not include
- raw chain-of-thought
- private reasoning
- full transcript
- code diffs
- file-by-file documentation
- tool calls
- terminal logs
- MCP/tool noise

## Include only
1. What the agent was trying to accomplish
2. The current working theory (with confidence)
3. Actions attempted
4. Outcomes observed
5. Issues identified
6. Fixes attempted
7. What worked
8. What did not work
9. What partially worked
10. Current unresolved state
11. Next best action
12. Things the next agent should not repeat
13. User constraints that matter
14. New blockers / risks (if any)
15. A short human-readable handoff summary

Write like a **senior developer handoff**.

Return **valid YAML** matching the `SessionBrief` schema. Save it to
`.inference-chain/inbox/latest-brief.yml`.
