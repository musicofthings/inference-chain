# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

## What this project is
Inference Chain — a local-first **forward-only n+1 inference ledger** for
Claude Code. Captures session handoffs, evolves the operating context after
meaningful interactions, generates sharper resume briefs for the next session.

The canonical spec lives in [docs/PRD-TRD.md](docs/PRD-TRD.md). If
implementation drifts from that doc, the doc wins (unless explicitly
superseded by a later revision committed there).

## Architecture (current layout)
```
src/
  cli.ts                       # Commander entrypoint (init/ingest/evolve/resume/status/verify/install-claude)
  core/
    schemas.ts                 # Zod schemas: InteractionUpdate, SessionBrief, MemoryEvolutionRecord, ChainLedger
    evolve.ts                  # evolveLedger(): deterministic merge + MemoryEvolutionRecord emission
    resume.ts                  # renderResumeBrief(): markdown resume output
    canonicalJson.ts           # deterministic JSON for hashing
    hash.ts                    # sha256 + hashEvent
    events.ts                  # LedgerEvent shape, makeEvent, recomputeHash
  storage/
    paths.ts                   # IC_DIR + PATHS resolver
    packageAssets.ts           # templates/ resolver (works from src/ via tsx and from dist/)
    jsonl.ts                   # append-only hash-chained ledger + verifyChain
    sqlite.ts                  # SQLite schema + insert helpers + chain_state upsert
  integrations/
    claude/install.ts          # install-claude: copies templates, merges .claude/settings.json hooks, installs plugin
templates/
  claude/commands/*.md         # slash command bodies (/ic-checkpoint, /ic-stop, /ic-evolve, /ic-resume)
  claude/prompts/*.md          # prompt templates copied into .inference-chain/prompts/ by `ic init`
  plugin/                      # Claude Code Plugin manifest (.claude-plugin/plugin.json + commands/ + hooks/)
test/                          # vitest
docs/PRD-TRD.md                # spec
```

The flat `src/core/*` layout is acceptable while files stay small. Split into
`src/commands/`, `src/storage/`, etc. (per TRD §3) when any single file
exceeds ~300 lines or a clear seam appears.

## What this project is NOT
Per PRD §7 — do not add any of these:
- raw chain-of-thought capture
- transcript storage
- code-diff documentation
- vector memory / RAG
- blockchain
- SaaS / cloud sync
- task manager

If a feature request fits one of those, push back and reference PRD §7.

> Note: an MCP server (`ic mcp`) and Claude Desktop support were originally
> excluded from v1 but were promoted into scope in PRD §20 (v1.1) and have
> shipped (`src/mcp/server.ts`). They are no longer on the NOT list.

## Working in this repo

### Common commands
```bash
pnpm install        # uses pnpm-workspace.yaml's onlyBuiltDependencies for better-sqlite3
pnpm build          # tsc → dist/
pnpm test           # vitest run
pnpm lint           # biome check
pnpm format         # biome format --write
```

### Manual end-to-end smoke
```bash
cd /tmp/foo
node /path/to/inference-chain/dist/cli.js init --project-name "foo"
# Author or have Claude author .inference-chain/inbox/latest-update.yml with kind: interaction_update
node /path/to/inference-chain/dist/cli.js ingest .inference-chain/inbox/latest-update.yml
# Re-place a fresh inbox file (ingest moves it out), then:
node /path/to/inference-chain/dist/cli.js evolve
node /path/to/inference-chain/dist/cli.js status
node /path/to/inference-chain/dist/cli.js verify
node /path/to/inference-chain/dist/cli.js resume
```

## Key invariants — do not break these
1. **Hash chain integrity.** Every event appended to `.inference-chain/ledger.jsonl`
   must include a `parentEventId` + `parentHash` matching the previous event,
   and its own `hash` must equal `sha256(canonicalJson(event-without-hash))`.
   `ic verify` enforces this. See `src/core/events.ts` and
   `src/storage/jsonl.ts`.

2. **Forward-only.** The ledger never rewrites past events. `evolve` only
   appends and updates `current.yml` + `chain_state` in SQLite. Never edit
   `ledger.jsonl` in place.

3. **Inbox files are consumed.** `ic evolve` moves the inbox file
   (`latest-update.yml` or `latest-brief.yml`) into `updates/` or `briefs/`
   after applying. Re-running `ic evolve` without a fresh inbox file is
   intentionally an error — *not* idempotent re-application.

4. **All artifacts carry `kind` + `schema_version`.** `ic ingest` routes by
   `kind`. Never re-introduce the try/catch-through-schemas pattern.

5. **`evolveLedger` is pure.** It returns `{ evolutionRecord, updatedLedger }`
   and does not touch disk. All IO lives in `cli.ts` / `storage/`.

6. **Templates are bundled, not inlined.** `install-claude` copies from
   `templates/claude/commands/` — do not write slash command strings inline
   in `src/`. If you need to change a slash command, edit the template.

## Style
- TypeScript strict; ESM (`type: module`), so import paths use `.js`
  extensions even though sources are `.ts`.
- No comments explaining *what* code does (names should do that). Comments
  are for *why* — hidden constraints, invariants, surprising choices.
- Default to no error handling for impossible states; only validate at
  boundaries (file IO, user input). Trust internal callers.
- Run `pnpm test && pnpm build` before claiming a change is done.

## Reference
- Hooks: https://code.claude.com/docs/en/hooks
- Plugins: https://docs.claude.com/en/docs/claude-code/plugins
- Reflexion paper (verbal RL): https://arxiv.org/abs/2303.11366
- Agentic Context Engineering paper: https://arxiv.org/abs/2510.04618
