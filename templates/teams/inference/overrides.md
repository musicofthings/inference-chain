---
type: bot-overrides
updated: 1970-01-01
---

# Bot Override Rules

Rules here silence intentional patterns that automated reviewers
(CodeRabbit, SonarQube, Snyk, Codex, …) flag as problems. The bot
distillation engine drops any finding that matches an override.

Format: one rule per bullet. Match by rule id, file path/glob, or a short
phrase that appears in the bot comment.

## Active Overrides

- (example) rule:typescript:S1192 — duplicated string literals are intentional in test fixtures
- (example) path:src/legacy/** — legacy module, do not flag style here
