# Agent adapters

Inference Chain’s ledger core is agent-agnostic. Host wiring is installed with:

```bash
ic init --project-name "My Project"
ic install --target <agent>           # one or comma-separated
ic install --all                      # curated multi-host set
ic install --detect                   # hosts already present in this repo
```

Targets:

| Group | `--target` values |
| --- | --- |
| First-class (commands/hooks) | `claude`, `codex`, `gemini`, `grok`, `cursor`, `openhands` |
| Portable / Desktop | `generic`, `desktop` |
| Thin IDE adapters | `copilot`, `vscode`, `opencode`, `chatgpt`, `windsurf`, `continue` |
| Plan aliases | `all`, `detect` (same as `--all` / `--detect`) |

`ic install-claude` is an alias for `--target claude`. MCP project config is
merged by default; pass `--no-with-mcp` to skip. Use `--overwrite` to replace
existing adapter files (host keys already present are still preserved unless
overwrite is set for that file’s merge path).

### Multi-host install

- **`--all`** installs the curated set in `ALL_INSTALL_TARGETS` (first-class +
  generic + desktop + thin IDE adapters). Skips `chatgpt` (use
  `--target chatgpt` or `codex` + `desktop`). Never runs `ic teams init`.
- **`--detect`** scans for host markers (`.claude/`, `.cursor/`, `.vscode/`,
  `opencode.json`, …). If none match, falls back to `generic`.
- **`--target claude,cursor`** installs only the listed adapters.
- Use only one of `--target` / `--all` / `--detect`.

Adapters only wire surfaces the host actually has (see
`src/integrations/capabilities.ts`): slash/skills/hooks where supported;
everyone else gets AGENTS.md and/or MCP.

Shared prompts live in `templates/common/prompts/` and are copied into
`.inference-chain/prompts/` by `ic init` and every adapter install.

Shared slash/skill command **bodies** live in `templates/common/commands/` and
are wrapped with host-specific frontmatter at install time (Claude/Cursor md,
Gemini toml, Grok skills).

## Manual fallback (any agent)

```bash
# write inbox YAML using .inference-chain/prompts/*
ic ingest .inference-chain/inbox/latest-update.yml   # or latest-brief.yml
ic evolve
ic resume
```

Or drive the same loop via `ic mcp` tools: `chain_ingest_update` /
`chain_ingest_brief`, `chain_ingest_evolution`, `chain_evolve`,
`chain_resume_brief`.

### Health check

```bash
ic doctor           # init + verify + detected hosts + wiring
ic doctor --strict  # treat warnings as failure (CI)
ic doctor --json
```

`ic install` warns (does not fail) if `.inference-chain/current.yml` is missing.

## Targets

### claude

| Writes | Purpose |
| --- | --- |
| `.claude/commands/ic-*.md` | Slash commands (from common bodies) |
| `.claude/settings.json` hooks | SessionStart / PreCompact / Stop |
| `.claude/plugins/inference-chain/` | Plugin scaffold (full command bodies) |
| `.mcp.json` | Project MCP (default; not settings.json) |

Daily: `/ic-checkpoint`, `/ic-stop`, `/ic-resume`.

### codex

| Writes | Purpose |
| --- | --- |
| `AGENTS.md` (`<!-- inference-chain -->` block) | Workflow instructions |
| `.codex/hooks.json` | SessionStart / PreCompact / Stop |
| `.codex/config.toml` `[mcp_servers.inference-chain]` | MCP (default) |

Daily: follow AGENTS.md; prefer MCP tools when connected.

### gemini

| Writes | Purpose |
| --- | --- |
| `.gemini/commands/ic-*.toml` | Custom slash commands |
| `.gemini/settings.json` `mcpServers.inference-chain` | MCP (default) |

Daily: `/ic-checkpoint`, `/ic-stop`, `/ic-resume`.

### grok

| Writes | Purpose |
| --- | --- |
| `AGENTS.md` marker block | Workflow instructions |
| `.grok/skills/ic-*/SKILL.md` | Skills (`/ic-checkpoint`, …) |
| `.grok/hooks/inference-chain.json` | Lifecycle reminders (needs `/hooks-trust`) |
| `.grok/config.toml` `[mcp_servers.inference-chain]` | MCP (default) |

Grok also reads Claude/Cursor compat paths; installing `--target claude` or
`cursor` alongside is optional.

### cursor

| Writes | Purpose |
| --- | --- |
| `.cursor/commands/ic-*.md` | Agent commands |
| `.cursor/rules/inference-chain.mdc` | Always-apply continuity rule |
| `.cursor/mcp.json` | MCP (default) |

Daily: `/ic-checkpoint`, `/ic-stop`, `/ic-resume` (or MCP).

### openhands

| Writes | Purpose |
| --- | --- |
| `AGENTS.md` marker block | Workflow instructions |
| `.openhands/mcp.json` | Project MCP (default) |

If your OpenHands build only reads `~/.openhands/mcp.json`, merge the same
`mcpServers.inference-chain` entry there.

**OpenClaw:** use the same stdio block under `mcp.servers.inference-chain` in
`openclaw.json` (or `openclaw mcp add`). The `openhands` target documents this
in install notes; no separate target id.

### generic

| Writes | Purpose |
| --- | --- |
| `AGENTS.md` marker block | Portable workflow instructions |
| (stdout notes) | Printed `mcpServers` JSON to paste anywhere |

Use when no host-specific pack exists, or as a baseline in multi-agent repos.

### desktop

| Writes | Purpose |
| --- | --- |
| `.inference-chain/mcp-desktop.json` | Claude Desktop–shaped `mcpServers` snippet |

Merge into `claude_desktop_config.json`. Does not edit global app configs.

### copilot

| Writes | Purpose |
| --- | --- |
| `.github/copilot-instructions.md` | Repo-wide Copilot instructions |
| `AGENTS.md` marker block | Coding-agent instructions |
| `.vscode/mcp.json` | VS Code / Copilot Chat MCP (default) |

### vscode

| Writes | Purpose |
| --- | --- |
| `AGENTS.md` marker block | Agent instructions |
| `.vscode/mcp.json` | Workspace MCP (`servers.inference-chain`) |

### opencode

| Writes | Purpose |
| --- | --- |
| `AGENTS.md` marker block | Project rules |
| `opencode.json` | Local MCP (`mcp.inference-chain`, argv array) |

### chatgpt

| Writes | Purpose |
| --- | --- |
| Codex pack (AGENTS.md, `.codex/*`) | Same as `--target codex` |
| `.inference-chain/mcp-chatgpt-desktop.json` | Desktop `mcpServers` snippet |

### windsurf

| Writes | Purpose |
| --- | --- |
| `.windsurfrules` | Cascade rules (AGENTS body) |
| `AGENTS.md` marker block | Shared instructions |
| `.windsurf/mcp.json` | MCP (default) |

### continue

| Writes | Purpose |
| --- | --- |
| `AGENTS.md` marker block | Shared instructions |
| `.continue/config.json` | `mcpServers.inference-chain` |

## Adapter contract

Adapters live under `src/integrations/<target>/` and register in
`src/integrations/registry.ts`. Each implements:

```ts
install(opts: { overwrite: boolean; withMcp: boolean }): InstallResult
```

They must not touch the ledger, hash chain, or `evolveLedger` purity. Shared
helpers: `src/integrations/shared/{fs,merge,mcp,prompts,commands}.ts`.

## Evals

Phase acceptance tests live under `test/evals/`:

- `phase0.test.ts` — MCP e2e, Claude parity, common command sync
- `phase1.test.ts` — generic / desktop portable contract
- `phase2.test.ts` — thin IDE adapters
- `phase3.test.ts` — `--all` / `--detect` / multi-target + capability matrix
- `phase4.test.ts` — `ic doctor` + MCP `chain_ingest_evolution`

Run: `pnpm test`.
