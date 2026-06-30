# Inference Chain — Teams Mode (`ic teams`)

> **Status:** v2.0, opt-in. Teams mode is a separate `.inference/` layer that
> lives alongside — and never modifies — the deterministic solo core
> (`.inference-chain/`, the hash-chained ledger, `ic verify`).

## Why it exists

Two kinds of hard-won knowledge evaporate on a team:

1. **Human architectural decisions** made inside isolated AI chat sessions.
2. **Machine review feedback** (CodeRabbit, SonarQube, Snyk, Codex, …) that is
   trapped in the PR thread and never reaches the next local AI session.

Teams mode captures both as co-equal inputs and synthesizes them into one
Git-tracked `masterplan.md` the whole team (and their AI assistants) reads.

## Design philosophy

- **File-over-app.** All state is flat Markdown under `.inference/`. It travels
  with the codebase and inherits branching, merging, and access control.
- **PKM-native.** Every ledger carries YAML frontmatter, so the files double as
  queryable nodes in tools like Obsidian.
- **Zero-server.** Synthesis runs locally in a Git `pre-commit` hook. The only
  network call is to the Claude API.
- **Omnivorous loop.** Human decisions and automated bot feedback both feed the
  global context.

## Layout (installed by `ic teams init`)

```
.husky/pre-commit                 # binds the local synthesis gate
.github/workflows/ic-teams-bot-distill.yml
.inference/
  masterplan.md                   # single source of truth (AI's primary context)
  archive.md                      # garbage-collected stale context
  overrides.md                    # human rules that silence noisy bot findings
  bot_ledger.md                   # distilled insights from PR review bots
  dev_<name>.md                   # per-developer session ledger (you author these)
  prompts/
    01-human-distillation.md      # Prompt Engine 1
    02-semantic-merge.md          # Prompt Engine 2
    03-bot-distillation.md        # Prompt Engine 3
  scripts/
    pre-commit.sh                 # prerequisite checks + runs the merge engine
    _ic_common.py                 # shared model config / IO / frontmatter
    local_merge.py                # client-side human synthesis (Engine 2)
    distill_bots.py               # cloud-side bot parser (Engine 3)
```

## Data flow

```
[AI chat session] --(distill)--> .inference/dev_<name>.md
        |
   git commit (pre-commit hook fires)
        |
        v
.inference/masterplan.md  <-- local_merge.py merges staged dev ledgers
        |        (conflict? -> CONFLICT block + commit aborts)
   git push -> PR -> review bots comment -> PR merged
        |
        v
.inference/bot_ledger.md  <-- distill_bots.py (GitHub Action) distills bot feedback
```

## The three engines

1. **Human Session Distillation** (`prompts/01`) — compresses a raw chat log
   into a declarative ledger of architectural decisions, rejected approaches,
   core logic, and hard constraints. Run this when a session ends to produce
   your `dev_<name>.md`.
2. **Semantic Merge & GC** (`prompts/02`, `local_merge.py`) — runs in
   `pre-commit`. Merges staged dev ledgers into `masterplan.md`, dedupes,
   overwrites superseded decisions, injects a `> [!WARNING] CONFLICT:` block on
   mutually-exclusive patterns (aborting the commit), and offloads stale nodes
   to `archive.md`.
3. **Bot Review Distillation** (`prompts/03`, `distill_bots.py`) — runs in CI on
   PR merge. Filters lint/format noise, honors `overrides.md`, and merges real
   security/structural constraints into `bot_ledger.md`, deduplicating against
   what is already recorded (the whole file is rewritten, not appended, so the
   ledger does not accumulate duplicates across PRs).

## Setup

```bash
ic teams init                 # scaffold the .inference/ tree + hook + workflow
pnpm add -D husky && pnpm install   # bind the pre-commit hook (prepare: husky)
pip install anthropic               # local synthesis dependency
export ANTHROPIC_API_KEY="sk-..."   # add to ~/.zshrc or ~/.bashrc
```

In CI, add `ANTHROPIC_API_KEY` as a repository secret so the bot-distillation
workflow can run. Each developer authors `.inference/dev_<name>.md` and commits
it; the hook does the rest.

## Configuration

| Env var               | Default              | Purpose                              |
| --------------------- | -------------------- | ------------------------------------ |
| `ANTHROPIC_API_KEY`   | — (required)         | Auth for client/CI synthesis         |
| `IC_TEAMS_MODEL`      | `claude-sonnet-4-6`  | Model used for synthesis             |
| `IC_TEAMS_MAX_TOKENS` | `8000`               | Max output tokens per synthesis call |

## Edge cases

| Scenario              | Reaction                          | Resolution                                            |
| --------------------- | --------------------------------- | ----------------------------------------------------- |
| Missing hook          | `npm install` re-binds via Husky  | Run `pnpm install` after `ic teams init`              |
| Semantic collision    | `local_merge.py` exits 1          | `git commit` fails; resolve the `CONFLICT:` block      |
| Context bloat         | GC moves stale nodes to archive   | Automatic; `masterplan.md` stays lean                 |
| Bot false positives   | Engine 3 matches `overrides.md`   | Add the rule id / path to `overrides.md`              |
| No API key / SDK      | `pre-commit.sh` exits 1 early     | Install `anthropic`, export `ANTHROPIC_API_KEY`       |

## Validation status

The spec engine has been validated end-to-end on Windows (PowerShell, Git for
Windows, Python 3.14) against a real Git repository. Confirmed working:

- **Clean merge** — a single developer ledger synthesizes into a fresh
  `masterplan.md` and the commit completes with the merge staged in.
- **Supersession (Rule 2)** — a later ledger that explicitly abandons a prior
  decision overwrites it and moves the old one to *Rejected Approaches*, no
  conflict raised.
- **Conflict (Rule 3)** — two developers asserting mutually exclusive choices
  for the same step in one commit inject a `> [!WARNING] CONFLICT:` block and
  abort the commit for human resolution.
- **Prerequisite guards** — missing Python, missing `anthropic` SDK, and a
  blank `ANTHROPIC_API_KEY` each fail fast with an actionable message and block
  the commit.
- **Conflict detection** does not false-positive on prose mentions of the
  marker (driven by an explicit `<has_conflict>` flag plus a line-anchored
  check), and frontmatter timestamps use the real system date injected by
  `local_merge.py`.

The CI bot-distillation Action (`distill_bots.py`) can be smoke-tested locally
with a hand-written comments file (`--comments-file`) without a GitHub round-trip.

## Relationship to the solo core

Teams mode does not touch `.inference-chain/`, `evolveLedger`, the JSONL hash
chain, or `ic verify`. The two systems are independent: a team can run both, or
either alone. The deterministic integrity guarantees of the solo core are
unchanged.
