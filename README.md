# Inference Chain — A Forward Inference Ledger for Claude Code

> Every Claude Code session continues sharper than the last.

Inference Chain is a **local-first agentic context engineering layer for
Claude Code**. It turns isolated coding sessions into a forward-moving
inference chain by capturing session handoffs, evolving the operating
context after meaningful interactions, and generating sharper resume briefs
for the next session.

It is **not** RAG, not a vector DB, not a transcript archive, not
blockchain, not a SaaS, and not a Claude Code replacement.

It answers: *where did the last agent leave the work, what is the latest
operating theory, and what should the next agent do without repeating failed
paths?*

Full spec: [docs/PRD-TRD.md](docs/PRD-TRD.md).

## Why
Claude Code is powerful within a session but weak across sessions. When
context compacts, resets, or gets copied into a new chat, the agent loses
continuity. Inference Chain maintains a **forward-only n+1 inference ledger**
that evolves with each session:

```text
Ledger n + Session Brief n + Interaction Updates n  =  Ledger n+1
```

## The n+1 loop
```text
Session n
  → Session Brief n
  → Memory Evolution Record n
  → Chain Ledger n+1
  → Resume Brief n+1
  → Session n+1 starts sharper
```

## Quickstart

Requires **Node.js ≥ 20** and **pnpm**.

```bash
pnpm install
pnpm build
pnpm link --global

cd /path/to/your/project
ic init --project-name "My Project"
ic install-claude
```

`ic install-claude` will:
1. Copy slash commands to `.claude/commands/ic-*.md` (skips files that
   already exist unless `--overwrite`).
2. Merge `SessionStart` / `PreCompact` / `Stop` hooks into
   `.claude/settings.json` without clobbering your existing settings.
3. Drop a Claude Code Plugin scaffold into
   `.claude/plugins/inference-chain/` so the project can be enabled with
   `/plugin` if your Claude Code version supports plugins.

## Daily use

**Mid-session checkpoint (interaction-level evolution):**

In Claude Code:
```text
/ic-checkpoint
```

In your terminal:
```bash
ic ingest .inference-chain/inbox/latest-update.yml
ic evolve
```

**End of session (session-level handoff):**

In Claude Code:
```text
/ic-stop
```

In your terminal:
```bash
ic ingest .inference-chain/inbox/latest-brief.yml
ic evolve
ic resume
```

**Resume next time** — `/ic-resume` reads
`.inference-chain/resumes/resume_latest.md` and continues from the current
frontier without rediscovering rejected hypotheses.

## Commands
| Command                    | What it does                                              |
| -------------------------- | --------------------------------------------------------- |
| `ic init --project-name`   | Initialize `.inference-chain/`, SQLite, JSONL, templates  |
| `ic install-claude`        | Install slash commands, merge hooks, install plugin scaffold |
| `ic ingest <file>`         | Validate + store an artifact (routes by `kind`)           |
| `ic evolve [--advance]`    | Apply latest brief/update; emit MemoryEvolutionRecord     |
| `ic resume [--silent]`     | Generate `resumes/resume_latest.md`                        |
| `ic status`                | Show iteration, event count, ledger sizes, score          |
| `ic verify`                | Replay hash chain; compare against SQLite event count     |
| `ic mcp [--cwd <dir>]`     | Start an MCP stdio server for Claude Desktop              |
| `ic simulate <dir>`        | Replay session artifacts and print n+1 sharpness metrics  |

## Claude Desktop (v1.1)
Add an entry to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "inference-chain": {
      "command": "ic",
      "args": ["mcp", "--cwd", "/abs/path/to/your/project"]
    }
  }
}
```

Tools exposed: `chain_status`, `chain_resume_brief`, `chain_ingest_update`,
`chain_ingest_brief`, `chain_evolve`, `chain_verify`. The MCP server
resolves `.inference-chain/` from `--cwd`, so multiple Desktop projects can
each have their own ledger — as long as each session starts in the same
folder, the ledger is the key.

## Validate the n+1 hypothesis on a demo

```bash
cd /tmp && mkdir ic-demo && cd ic-demo
ic simulate /path/to/inference-chain/examples/demo-project/build-task-api/sessions \
  --reset --project-name "task-api"
```

Prints per-step deltas (stable+, rejected+, do-not-repeat+, frontier) and a
final report with six metrics that quantify whether the ledger actually
carried useful signal forward. See `docs/PRD-TRD.md` §22 for what each
metric means.

## Tuning (environment variables)
- `IC_STABLE_THRESHOLD` (default `2`) — how many confirmations promote an
  active hypothesis to `stable_learnings`.
- `IC_RESUME_TOP_K` (default `12`) — cap on items per section in the
  resume brief (full ledger always lives in `current.yml`).

## What gets stored
```text
.inference-chain/
  chain.db                # SQLite (events, briefs, updates, evolutions, chain_state)
  ledger.jsonl            # Append-only hash-chained event log
  current.yml             # Current ChainLedger (the operating model)
  project.yml             # Project metadata
  inbox/                  # Drop new YAML artifacts here
  briefs/ updates/ evolutions/ resumes/ prompts/ locks/
```

Each ledger event includes `parentEventId` + `parentHash`, and a `hash` of
`sha256(canonicalJson(event-without-hash))`. `ic verify` recomputes the
chain and exits non-zero on any tamper.

## Privacy
**100% local.** Nothing leaves your machine. No telemetry. No model API
calls. The entire workflow runs against your filesystem.

## What we deliberately do not build
Per PRD §7: blockchain, vector search, cloud sync, dashboards, MCP server,
transcript archive, code-diff tracking, AST indexing, telemetry. If a
proposed feature fits one of those, it does not belong here.

## Development
```bash
pnpm test       # 29 tests across canonicalJson, hash, verify, schemas, evolve transitions
pnpm build
pnpm lint
pnpm format
```

See [CLAUDE.md](CLAUDE.md) for the contributor / agent guide and the
invariants that must not be broken.

## License
Apache-2.0
