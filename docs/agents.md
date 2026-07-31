# Agent adapters

Inference Chain’s ledger core is agent-agnostic. Host wiring is installed with:

```bash
ic init --project-name "My Project"
ic install --target <claude|codex|gemini|grok|cursor|openhands>
```

`ic install-claude` is an alias for `--target claude`. MCP project config is
merged by default; pass `--no-with-mcp` to skip. Use `--overwrite` to replace
existing adapter files (host keys already present are still preserved unless
overwrite is set for that file’s merge path).

Shared prompts live in `templates/common/prompts/` and are copied into
`.inference-chain/prompts/` by `ic init` and every adapter install.

## Manual fallback (any agent)

```bash
# write inbox YAML using .inference-chain/prompts/*
ic ingest .inference-chain/inbox/latest-update.yml   # or latest-brief.yml
ic evolve
ic resume
```

Or drive the same loop via `ic mcp` tools: `chain_ingest_update` /
`chain_ingest_brief`, `chain_evolve`, `chain_resume_brief`.

## Targets

### claude

| Writes | Purpose |
| --- | --- |
| `.claude/commands/ic-*.md` | Slash commands |
| `.claude/settings.json` hooks | SessionStart / PreCompact / Stop |
| `.claude/plugins/inference-chain/` | Plugin scaffold |

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

## Adapter contract

Adapters live under `src/integrations/<target>/` and register in
`src/integrations/registry.ts`. Each implements:

```ts
install(opts: { overwrite: boolean; withMcp: boolean }): InstallResult
```

They must not touch the ledger, hash chain, or `evolveLedger` purity. Shared
helpers: `src/integrations/shared/{fs,merge,mcp,prompts}.ts`.
