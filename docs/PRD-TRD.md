# Inference Chain — PRD / TRD

> Canonical product + technical requirements for Inference Chain.
> Source of truth for scope decisions. If implementation drifts, this document wins
> unless explicitly superseded by a later revision committed to this file.

This document is the revised PRD/TRD incorporating: memory evolution after every
interaction, agentic context engineering framing, and the finalized product title
**Inference Chain — A Forward Inference Ledger for Claude Code**.

---

## Codex Build Prompt

```text
Build an open-source local-first developer tool called:
Inference Chain — A Forward Inference Ledger for Claude Code

Goal:
Build a lean TypeScript CLI that gives Claude Code session-to-session continuity
through a forward-only n+1 inference ledger.

Inference Chain is not generic memory, not RAG, not transcript search, and not a
repo documentation tool.

It captures the bird's-eye inference state of a Claude Code session:
- what the agent was trying to accomplish
- what it inferred
- what it tried
- what worked
- what failed
- what was disproven
- what remains unresolved
- what the next agent should do first
- what the next agent must not repeat

Core principle:
Use agentic context engineering. Each session updates the operating context for
the next session. The context is not static; it evolves after every interaction
or meaningful checkpoint.

The n+1 loop:
Session n
→ Session Brief n
→ Memory Evolution Record n
→ Chain Ledger n+1
→ Resume Brief n+1
→ Session n+1 starts sharper

Borrow public ideas conceptually:
- Reflexion-style verbal reinforcement: learn from outcomes without model fine-tuning.
- Episodic memory: each session becomes a structured episode.
- Agentic context engineering: contexts evolve through generation, reflection,
  curation, and execution feedback.
- Memory evolution after every interaction: each meaningful interaction can
  refine the ledger, not just final session close.

Do not copy code from public projects.
Do not add bloat.

Do not build:
- blockchain
- vector database
- web dashboard
- SaaS backend
- MCP server in v1
- LangChain
- LlamaIndex
- Prisma
- Docker
- telemetry
- Electron
- AST/code-indexing engine
- transcript archive
- code-diff tracker

Use:
- TypeScript
- Node.js 20+
- pnpm
- Commander
- Zod
- YAML
- better-sqlite3
- JSONL append-only hash-chained ledger
- Node crypto SHA-256
- Vitest
- Biome
- Apache-2.0 license

Primary target:
Claude Code via hooks and custom slash commands.
```

---

## PRD

### 1. Product title
**Inference Chain — A Forward Inference Ledger for Claude Code**

### 2. Tagline
**Every Claude Code session continues sharper than the last.**

### 3. Product category
**Agentic context engineering for coding agents.**

Inference Chain is not merely memory. It is a local-first system for *evolving
the operating context* of Claude Code across sessions. Aligned with recent work
on agentic context engineering, which treats context as an evolving playbook
updated through generation, reflection, curation, and execution feedback rather
than through model weight updates.

### 4. Product thesis
Claude Code and similar coding agents are powerful within a session but weak
across sessions. When context compacts, resets, or gets copied into a new chat,
the agent loses continuity.

Existing solutions usually fall into one of four categories:
1. Static memory files
2. Transcript summaries
3. Generic memory retrieval
4. Manual copy-paste handoffs

These help, but they do not solve the deeper problem:

> The next agent does not just need memory. It needs the latest operating model of the work.

Inference Chain solves this by maintaining a **forward-only n+1 inference ledger**.
Each session produces a structured handoff. The ledger then evolves:

```text
Ledger n + Session Brief n + Interaction Updates n
= Ledger n+1
```

The next Claude Code session starts with a better context than the previous one.

### 5. Borrowed public ideas

#### 5.1 Reflexion-style verbal learning
Reflexion showed agents can improve from feedback by generating verbal
reflections and storing them in episodic memory rather than updating model
weights. We do not fine-tune; we store structured, verbal, operational learnings:
failed hypotheses, successful fixes, changed assumptions, do-not-repeat items,
next-action frontier.

#### 5.2 Episodic memory
Each Claude Code session becomes a structured **Session Brief**, acting as an
episode: `Goal → attempted actions → observations → outcomes → unresolved state`.

#### 5.3 Agentic context engineering
The context itself is a self-improving artifact. We maintain a **Chain Ledger**
that becomes the evolving context playbook for Claude Code.

#### 5.4 Memory evolution after every interaction
First-class requirement. The ledger updates not only when a session ends, but
after every meaningful interaction: user correction, failed build, successful
test, rejected fix, confirmed hypothesis, compaction event, manual checkpoint,
session stop. MVP supports manual + lifecycle-triggered updates; schema must
support interaction-level evolution.

### 6. What Inference Chain is
- a local-first Claude Code continuity harness
- a forward inference ledger
- an n+1 session refinement system
- an agentic context engineering layer
- a structured senior-developer handoff engine
- a lightweight alternative to stale `memory.md` workflows

### 7. What Inference Chain is not
- raw chain-of-thought capture
- transcript storage
- code-diff documentation
- Git replacement
- vector memory
- blockchain
- SaaS
- task manager
- Claude Code replacement

> v1.1 adds an `ic mcp` MCP server so Claude Desktop (and any other
> MCP-aware client) can drive the same operations as the CLI. The PRD
> originally excluded MCP from v1 to keep the build lean — that exclusion
> is lifted in v1.1.

> **v2.0 — Teams mode (opt-in, isolated).** The `ic teams` module deliberately
> crosses several v1 lines — but only inside an opt-in `.inference/` team layer
> that is entirely separate from the deterministic solo core (`.inference-chain/`,
> the hash-chained ledger, `ic verify`). Specifically, teams mode adds:
> *transcript distillation* (Prompt Engine 1 reads raw session logs), *model API
> calls* (client-side semantic merge in a Git `pre-commit` hook), *team sync* (a
> shared `masterplan.md` carried in Git), and *GitHub integration* (a PR-merge
> Action that distills third-party review-bot feedback into `bot_ledger.md`).
> These are intentional trade-offs for collaborative teams and do NOT alter the
> solo engine: the deterministic ledger, pure `evolveLedger`, and hash-chain
> integrity guarantees remain unchanged. See `docs/teams.md`.

### 8. Core design principle
Git answers: *what changed in the code?*
Claude Code memory answers: *what stable project rules should Claude know?*
Inference Chain answers: *where did the last agent leave the work, what is the
latest operating theory, and what should the next agent do without repeating
failed paths?*

### 9. Primary user
Initial target: Claude Code users; solo developers; AI-native builders; vibe
coders building serious software; developers hitting compaction/context-loss
problems.

**First-class install targets** (via `ic install --target`): Claude Code,
Codex CLI, Gemini CLI, Grok Build, Cursor, OpenHands. Portable / Desktop:
`generic`, `desktop`. Thin IDE adapters: `copilot`, `vscode`, `opencode`,
`chatgpt`, `windsurf`, `continue`. OpenClaw uses the same MCP stdio pattern as
OpenHands (documented under that target). Small engineering teams use the
opt-in `ic teams` module.

See `docs/agents.md` for per-target paths and the adapter contract.

### 10. MVP promise
```bash
ic init --project-name "My Project"
ic install --target claude   # or codex | gemini | grok | cursor | openhands | …
# alias: ic install-claude
```
Then in the agent: `/ic-checkpoint` (mid-session) or `/ic-stop` (near end)
(or the host’s equivalent — AGENTS.md / skills / MCP tools).
Then:
```bash
ic ingest .inference-chain/inbox/latest-brief.yml
ic evolve
ic resume
```
The next coding-agent session starts with the refined operating context.

### 11. Core n+1 loop
```text
1. Claude Code Session n begins.
2. Inference Chain injects Resume Brief n.
3. Agent works.
4. Meaningful interaction occurs.
5. User or hook triggers a checkpoint.
6. Session Brief or Interaction Update is generated.
7. Inference Chain evolves the Chain Ledger.
8. Ledger n becomes Ledger n+1.
9. Resume Brief n+1 is generated.
10. Next Claude Code session starts sharper.
```

### 12. Memory evolution model

#### 12.1 Session-level
Triggered at `/ic-stop`, `Stop`, `SessionEnd`, manual end-of-work checkpoint.
Broad handoff.

#### 12.2 Interaction-level
Triggered at `/ic-checkpoint`, `PreCompact`, major failed attempt, successful
test, user says "that worked", user says "don't repeat this", agent identifies a
new blocker. Small but important deltas.

MVP can implement manually first; schema + CLI ready for automatic hooks later.

### 13. Core artifacts
- **Session Brief** — high-level session summary
- **Interaction Update** — small memory-evolution event
- **Memory Evolution Record** — explicit ledger delta (confirmed / weakened /
  rejected / superseded / promoted / anti-repeat / frontier)
- **Chain Ledger** — cumulative operating model
- **Resume Brief** — prompt injected into the next session

### 14. Differentiation
Most tools: `store → retrieve → inject`.
Inference Chain: `observe → reflect → evolve → resume`.

### 15. User stories

**1. Initialize.** `ic init --project-name "My Project"` creates
`.inference-chain/`, SQLite db, append-only `ledger.jsonl`, `project.yml`,
`current.yml`, folder structure, initial Chain Ledger, appends
`project_initialized` event.

**2. Install an agent adapter.** `ic install --target <agent>` (or
`ic install-claude`) copies host-specific commands/hooks/skills, merges MCP
config by default (`--no-with-mcp` to skip), and never clobbers existing host
keys unless `--overwrite`. Claude remains the reference adapter; other targets
share `templates/common/prompts/` and the same inbox/evolve/resume loop.

**3. Generate a checkpoint.** `/ic-checkpoint` → Claude writes
`InteractionUpdate` to `.inference-chain/inbox/latest-update.yml`. User runs
`ic ingest` + `ic evolve`.

**4. Generate final session brief.** `/ic-stop` → Claude writes `SessionBrief`
to `.inference-chain/inbox/latest-brief.yml`. User runs `ic ingest` + `ic
evolve` + `ic resume`.

**5. Evolve ledger.** `ic evolve` reads previous ledger + latest brief/update,
creates `MemoryEvolutionRecord`, updates ledger; explicitly records new
information, confirmed/weakened/rejected/superseded beliefs, promoted stable
learnings, frontier changes, do-not-repeat updates; appends `ledger_evolved`
event; updates `current.yml`.

**6. Generate resume brief.** `ic resume` writes
`.inference-chain/resumes/resume_latest.md`; prints unless `--silent`; appends
`resume_brief_generated`.

**7. Verify integrity.** `ic verify` reads `ledger.jsonl`, recomputes hashes,
verifies parent chain, reports corruption, exits non-zero on failure.

### 16. MVP scope

**In scope:** `ic init`, `ic install --target …` (alias `ic install-claude`),
`ic ingest <file>`, `ic evolve`, `ic resume`, `ic status`, `ic verify`,
`ic doctor`.
Optional: `ic export`, `ic reset --confirm`.

**In scope (v1.1):** `ic mcp` — local MCP server for Claude Desktop and any
MCP-aware agent. See §20.
`ic simulate <dir>` — sequential replay of pre-authored session artifacts with
n+1 metrics output, for research and validation.

**Out of scope (solo core):** cloud sync, team sync, vector search, model API
calls, dashboard, GitHub integration, AST indexing, file-read interception,
automatic transcript parsing, blockchain. Team sync, model API calls, GitHub
integration, and transcript distillation are reintroduced ONLY in the opt-in
v2.0 `ic teams` module (see §7 note and `docs/teams.md`); the solo core keeps
all of these out of scope.

### 17. Success criteria
1. A Claude Code session can produce a structured brief.
2. The brief can be ingested locally.
3. The Chain Ledger evolves from iteration n to n+1.
4. A new Claude Code session receives a useful resume brief.
5. The next agent avoids repeating a failed path.
6. The entire flow works without cloud services or heavy infrastructure.

---

## TRD

### 1. System architecture
```text
Claude Code
  │
  ├── Custom slash commands
  ├── Hooks: SessionStart / PreCompact / Stop
  ▼
Inference Chain CLI
  │
  ├── Ingest Session Briefs
  ├── Ingest Interaction Updates
  ├── Create Memory Evolution Records
  ├── Evolve Chain Ledger
  ├── Generate Resume Brief
  ├── Append hash-chained JSONL events
  └── Store current state in SQLite/YAML
```

### 2. Tech stack
Language TypeScript • Runtime Node.js 20+ • pnpm • Commander • Zod • yaml •
better-sqlite3 • JSONL ledger • `node:crypto` SHA-256 • nanoid • Vitest • Biome
• Apache-2.0.

Avoid: Prisma, LangChain, LlamaIndex, Express, Next.js, React, Docker, Redis,
Postgres, Vector DB, MCP SDK, Blockchain libraries, Telemetry SDKs.

### 3. Repository structure
```text
inference-chain/
  package.json
  tsconfig.json
  biome.json
  vitest.config.ts
  src/
    cli.ts
    commands/                  # one file per CLI verb
    core/                      # schemas, hash, evolve, resume, etc.
    storage/                   # paths, files, sqlite, jsonl
    integrations/              # registry + per-agent adapters + shared helpers
  templates/
    common/prompts/            # agent-neutral capture/evolve/resume prompts
    claude|codex|gemini|grok|cursor|openhands|generic|desktop|copilot|vscode|opencode|chatgpt|windsurf|continue/
    plugin/                    # Claude Code Plugin manifest + assets
  test/
  docs/PRD-TRD.md              # this file
  docs/agents.md               # multi-agent install matrix
```

Note: the flat `src/core/*` layout from v0 remains acceptable while the surface
area is small. Split into the deeper structure once any single file exceeds
~300 lines or a clear seam appears.

### 4. Local project structure (`ic init` creates)
```text
.inference-chain/
  chain.db            # SQLite
  ledger.jsonl        # append-only hash chain
  project.yml
  current.yml
  inbox/ briefs/ updates/ evolutions/ resumes/ prompts/ locks/
```

### 5. Storage model
Three layers:
- **SQLite** — queryable operational state (events, briefs, updates,
  evolutions, chain_state).
- **JSONL** — append-only hash-chained ledger.
- **YAML/Markdown** — human-readable artifacts.

| Artifact                | Format   |
| ----------------------- | -------- |
| Event ledger            | JSONL    |
| Current Chain Ledger    | YAML     |
| Session Brief           | YAML     |
| Interaction Update      | YAML     |
| Memory Evolution Record | YAML     |
| Resume Brief            | Markdown |
| Config                  | YAML     |

### 6. SQLite schema
```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  parent_event_id TEXT,
  parent_hash TEXT,
  hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  brief_yaml TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interaction_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  update_yaml TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evolutions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_iteration INTEGER NOT NULL,
  to_iteration INTEGER NOT NULL,
  evolution_yaml TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chain_state (
  project_id TEXT PRIMARY KEY,
  current_iteration INTEGER NOT NULL,
  current_ledger_yaml TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 7. Ledger event types
```ts
export type LedgerEventType =
  | "project_initialized"
  | "interaction_update_captured"
  | "session_brief_captured"
  | "memory_evolution_created"
  | "ledger_evolved"
  | "resume_brief_generated"
  | "ledger_verified";

export type LedgerEvent = {
  id: string;
  projectId: string;
  iteration: number;
  type: LedgerEventType;
  timestamp: string;
  parentEventId?: string | null;
  parentHash?: string | null;
  hash: string;
  payload: unknown;
  schemaVersion: string;
};
```

### 8. Hash-chain design
Local hash chaining, not blockchain. Hash input *excludes* the event's own
`hash`.

```ts
hash = sha256(canonicalJson({
  id, projectId, iteration, type, timestamp,
  parentEventId, parentHash, payload, schemaVersion
}));
```

Canonical JSON: recursively sort object keys, preserve array order, stable
UTF-8, deterministic.

### 9. Zod schemas
See `src/core/schemas.ts`. Required schemas: `ConfidenceSchema`,
`InteractionUpdateSchema`, `SessionBriefSchema`, `MemoryEvolutionRecordSchema`,
`ChainLedgerSchema`.

Each artifact must carry a discriminating field (`kind` or equivalent) so
`ic ingest` can route deterministically rather than try/catch through schemas.

### 10. CLI commands

**`ic init --project-name "..."`** — create `.inference-chain/`, SQLite,
JSONL, prompt templates, initial `current.yml`, append `project_initialized`.

**`ic install --target <agent[,…]> | --all | --detect`** — install host
adapter(s) (see `AGENT_TARGETS` in `src/integrations/types.ts`). Copies
commands/skills/hooks as applicable, upserts an `AGENTS.md` marker block where
used, merges project MCP for `ic mcp` by default. `--all` installs the curated
multi-host set; `--detect` installs adapters for hosts already present in the
repo (falls back to `generic`). Command bodies are single-sourced from
`templates/common/commands/`. Capability matrix:
`src/integrations/capabilities.ts`. `ic install-claude` is a thin alias for
`--target claude`. Details: `docs/agents.md`.

Project-scoped MCP config is written as portable `ic mcp` (no node path, CLI
path, or absolute `--cwd`) because those files are committed and shared;
`--pin-launch` opts into the machine-local absolute form. Desktop snippets are
always pinned. A failing adapter in a multi-target plan is reported and exits
non-zero without aborting the remaining targets.

Claude hooks (also mirrored conceptually on Codex/Grok):

| Hook           | Behavior                                  |
| -------------- | ----------------------------------------- |
| `SessionStart` | Print or inject latest resume brief       |
| `PreCompact`   | Remind user/agent to run `/ic-checkpoint` |
| `Stop`         | Remind user/agent to run `/ic-stop`       |

**`ic ingest <file>`** — read YAML, detect artifact type, validate with Zod,
store in SQLite, copy canonical file to `updates/|briefs/|evolutions/`, append
JSONL event.

**`ic evolve`** — read current ledger + latest InteractionUpdate or
SessionBrief; produce or ingest `MemoryEvolutionRecord`; update ledger; for
SessionBrief-driven evolution increment iteration; for small InteractionUpdate
preserve iteration unless `--advance`; append `memory_evolution_created` +
`ledger_evolved`; *move processed inbox file to its archive folder so re-runs
don't double-apply*.

**`ic resume [--silent]`** — read current ledger,
generate resume markdown to `resumes/resume_latest.md`, print unless silent,
append `resume_brief_generated`.

**`ic status`** — project name, current iteration, event count, latest
brief/update, current frontier, do-not-repeat count, verification status.

**`ic doctor [--json] [--strict]`** — operator health check: project init,
ledger verify, MCP launch resolution, detected coding-agent hosts, and whether
Inference Chain wiring (commands/MCP/AGENTS) is present for each. Exit
non-zero on failures; `--strict` also fails on warnings. See
`src/doctor.ts`.

**`ic verify`** — parse `ledger.jsonl`, recompute hash of every event, verify
parent hashes, compare count with SQLite, return non-zero on corruption.

### 11. Claude Code slash commands
Files installed by `ic install --target claude` are generated from
`templates/common/commands/` with Claude frontmatter (also written into the
plugin pack):
- `/ic-checkpoint` — produce InteractionUpdate YAML
- `/ic-stop` — produce SessionBrief YAML
- `/ic-evolve` — produce MemoryEvolutionRecord YAML
- `/ic-resume` — consume `resumes/resume_latest.md`

Equivalent wraps exist for Gemini (`.toml`), Cursor (`.cursor/commands`), and
Grok (`.grok/skills`). Codex/OpenHands and thin IDE targets use `AGENTS.md` + MCP.

### 12. Prompt templates
Stored in `templates/common/prompts/` (agent-neutral), copied into
`.inference-chain/prompts/` by `ic init` and adapter installs:
- `capture-interaction-update.md`
- `capture-session-brief.md`
- `evolve-ledger.md`
- `resume-session.md`

### 13. Resume brief format
See `templates/common/prompts/resume-session.md` and the rendering in
`src/core/resume.ts` (or equivalent). Must surface: current operating model
(with confidence), stable learnings, active hypotheses, rejected hypotheses,
stable decisions, current frontier (next/blockers/risks), do-not-repeat,
continuity summary, instruction-for-this-session footer.

### 14. Evolution algorithm
Implement `evolveLedger()`:

```ts
{ evolutionRecord: MemoryEvolutionRecord; updatedLedger: ChainLedger }
  = evolveLedger(previousLedger, source)
```

MVP deterministic rules:
1. Append new information to candidate learning pool.
2. Add confirmed beliefs as supporting evidence to matching hypotheses;
   promote to `stable_learnings` after configurable confirmation count.
3. Move rejected beliefs into `rejected_hypotheses`, and drop any
   `current_frontier.blockers` entry whose text matches the rejected
   belief (case-insensitive). A rejected belief is a resolved problem,
   not an open blocker — keeping it in both sections double-lists it in
   the resume brief. Applies to `rejected`, session `did_not_work`, and
   the old belief in a `superseded` pair.
4. Move superseded old beliefs into rejected / weakened state.
5. Merge `do_not_repeat_delta` into ledger `do_not_repeat` (set semantics).
6. Replace `current_frontier.next_best_action` if source has a non-empty
   `next_action_delta` / `next_best_action`.
7. Update `current_frontier.blockers` and `risks` from
   `issues_identified` / explicit fields.
8. Update `continuity_summary`.
9. Increment iteration on SessionBrief-driven evolution.
10. Preserve iteration on InteractionUpdate unless `--advance`.

### 15. Error handling
Actionable errors. Example:
```text
Could not ingest latest-update.yml.
Reason: trigger must be one of:
  manual_checkpoint, precompact, user_correction, failed_attempt,
  successful_attempt, new_blocker, new_hypothesis, other
Fix: edit .inference-chain/inbox/latest-update.yml and rerun
  ic ingest .inference-chain/inbox/latest-update.yml
```

### 16. Tests (required)
- **Canonical JSON** — key-order independence, array order preservation,
  nested sort.
- **Hash chain** — append creates valid parent hash; tampered event fails
  verification; missing parent hash fails verification.
- **Schemas** — valid SessionBrief / InteractionUpdate /
  MemoryEvolutionRecord pass; invalid confidence fails; missing required
  fields fail.
- **Evolution** — rejected belief → rejected_hypotheses; confirmed belief
  updates active hypothesis; do-not-repeat deltas merge without dupes;
  frontier updates correctly; SessionBrief increments iteration;
  InteractionUpdate does not increment unless requested.
- **Blocker pruning** — rejecting a belief (via `rejected`,
  `did_not_work`, or `superseded`) removes a matching
  `current_frontier.blockers` entry; match is case-insensitive.
- **CLI smoke** — `ic init` / `ingest` / `evolve` / `resume` / `verify`.

### 17. Package scripts
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "bin": { "ic": "./dist/cli.js" }
}
```

### 18. README requirements
Must include: what IC is, what it is not, why agentic context engineering
matters, how the n+1 loop works, Claude Code setup, commands, example
workflow, local-first privacy note, ledger integrity explanation, license.

### 19. Definition of done
1. `ic init` creates a valid Inference Chain project.
2. `ic install --target claude` (or `ic install-claude`) installs slash
   commands safely; other `--target` values install their host packs.
3. `/ic-checkpoint` can create an Interaction Update.
4. `/ic-stop` can create a Session Brief.
5. `ic ingest` validates and stores both artifacts.
6. `ic evolve` creates or applies a Memory Evolution Record.
7. The Chain Ledger updates from n to n+1.
8. `ic resume` generates a strong Claude Code continuation brief.
9. `ic verify` validates the JSONL hash chain.
10. Tests pass.
11. README documents the full loop.
12. No out-of-scope bloat is added.

### 20. Claude Desktop via MCP (v1.1)

Claude Desktop has no slash commands or `.claude/commands/` surface — its
only extension point is the **Model Context Protocol** via
`claude_desktop_config.json`. To support Desktop, IC ships an MCP server.

**Subcommand:** `ic mcp` — starts an MCP stdio server. Designed to be
spawned by Claude Desktop (or any MCP client) and run for the lifetime of
the client connection.

**Transport:** stdio (the only transport Desktop supports today).

**Working directory:** the MCP server resolves `.inference-chain/` relative
to its **process cwd**. This honors the user's core constraint: *"as long
as each session is started in the same folder, the ledger is the key."*
Desktop config snippet pins cwd via `args: ["mcp", "--cwd", "<project>"]`.

**Tools exposed:**

| Tool                        | Inputs                              | Effect / output                                                              |
| --------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `chain_status`              | none                                | JSON: project, iteration, sizes, score, last event                           |
| `chain_resume_brief`        | none                                | markdown resume brief for the current ledger (also writes resume_latest.md)  |
| `chain_ingest_update`       | `body: <InteractionUpdate YAML or JSON>` | Validates + persists; appends `interaction_update_captured`           |
| `chain_ingest_brief`        | `body: <SessionBrief YAML or JSON>`       | Validates + persists; appends `session_brief_captured`                |
| `chain_ingest_evolution`    | `body: <MemoryEvolutionRecord YAML or JSON>` | Archives under evolutions/; appends `memory_evolution_created` (idempotent on id; does not rewrite current.yml) |
| `chain_evolve`              | `advance?: boolean`                 | Reads inbox, calls `evolveLedger`, writes record + updates ledger; returns `{from, to, score_before, score_after}` |
| `chain_verify`              | none                                | Runs hash-chain verification; returns `{ok, total, errors}`                  |

**Failure mode:** if `.inference-chain/` does not exist in cwd, the server
starts but every tool returns a structured error advising the user to run
`ic init` first. The server never auto-creates state.

**Security:** no auth — same trust model as a local CLI. Documented in
README. Not exposed over network.

**Desktop config example** (in `claude_desktop_config.json`):

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

### 21. Memory hygiene (research-critical)

The n+1 claim ("sessions get sharper") fails silently if the ledger grows
unbounded. The brief becomes too large to act on, and confidence in
specific items dilutes. v1.1 enforces:

- **Resume brief is rendered top-K per section** (default K=12), most
  recent first. The full ledger remains in `current.yml`; only the *brief*
  caps itself. Configurable via `IC_RESUME_TOP_K` env var.
- **`new_information` no longer auto-creates active hypotheses.** Only
  explicit `confirmed` / `superseded` / `partially_worked` items create
  hypotheses. This was bloating active_hypotheses on every interaction.
- **`STABLE_PROMOTION_THRESHOLD` is configurable** via `IC_STABLE_THRESHOLD`
  env var (default 2).
- **Fuzzy hypothesis matching (v1.2, shipped).** Belief lookup is
  exact-after-normalization first, then Sørensen–Dice similarity over content
  tokens (stopwords dropped, plurals collapsed) at `IC_MATCH_THRESHOLD`,
  default `0.82`. Set to `1` for the pre-v1.2 exact-only behaviour. See
  `src/core/similarity.ts`.

  The threshold is high because the risk is asymmetric. Competing designs
  share more surface tokens than genuine paraphrases do — "write-through
  caching for the session store" and "write-behind caching … for the session
  store" overlap heavily while being mutually exclusive — so any threshold
  loose enough to capture synonymy also merges rival beliefs, and a rejection
  would then silently remove the belief that actually won. Matching also
  refuses to cross a polarity flip (a negation present on one side only).

  This catches restatement, not synonymy: word order, filler, plurals, and
  added qualifiers match; tense changes and true synonyms do not. Real
  semantic matching needs a model call, which the solo core excludes by
  design (§7).

  Measured with `ic simulate` on
  `examples/demo-project/paraphrase-drift/`: exact-only leaves the restated
  belief as a permanently unpromoted duplicate (promotion rate 0); at the
  default threshold it merges and promotes (0.2), while the two rival cache
  designs stay separate under both.

### 22. Simulation harness (`ic simulate`)

**Purpose:** validate the n+1 hypothesis empirically. Researchers can ship
a directory of pre-authored session artifacts representing a scripted
multi-session narrative, run them sequentially, and observe whether the
ledger actually carries useful signal forward.

**Usage:**
```bash
ic simulate examples/demo-project/build-task-api/sessions --reset
```

**Per-step output:** for each session/update file, prints:
- delta in score (before → after)
- iteration before → after
- newly added stable_learnings, rejected_hypotheses, do_not_repeat items
- frontier change (previous next_best_action → new)

**Final report — the n+1 sharpness metrics:**

| Metric                              | What it measures                                                   |
| ----------------------------------- | ------------------------------------------------------------------ |
| `anti_repeat_coverage`              | Of all `do_not_repeat` items, how many appeared by iteration N/2   |
| `hypothesis_promotion_rate`         | Fraction of active hypotheses promoted to stable across the run    |
| `frontier_convergence`              | Average size of `next_best_action` (smaller late = more focused)   |
| `rejected_persistence`              | Did any rejected belief reappear as active? (should be 0)          |
| `score_progression`                 | Slope of score over iterations (should be positive)                |
| `final_brief_size_kb`               | Resume brief size at end (sanity check vs hygiene cap)             |

A scenario is "n+1-positive" if `anti_repeat_coverage` ≥ 0.5,
`rejected_persistence` = 0, and `score_progression` > 0.

---

## Strategic positioning

> Inference Chain is a local-first agentic context engineering layer for Claude
> Code. It turns isolated coding sessions into a forward-moving inference chain
> by capturing session handoffs, evolving the operating context after meaningful
> interactions, and generating sharper resume briefs for the next session.

> Inference Chain does not help Claude remember everything. It helps the next
> Claude session know what matters now.

---

## References
- Claude Code Hooks reference: https://code.claude.com/docs/en/hooks
- Reflexion (Shinn et al., 2023): https://arxiv.org/abs/2303.11366
- Agentic Context Engineering (Zhang et al., 2025): https://arxiv.org/abs/2510.04618
