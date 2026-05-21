# inference-chain (Claude Code Plugin)

This directory is a [Claude Code Plugin](https://docs.claude.com/en/docs/claude-code/plugins)
manifest for Inference Chain.

## Install (project-local, via `ic`)

```bash
ic install-claude
```

This copies the plugin into `.claude/plugins/inference-chain/` and also
drops the slash commands into `.claude/commands/` for non-plugin Claude
Code installations.

## Install (manually as a plugin)

From the project root that uses Claude Code:

```bash
mkdir -p .claude/plugins
cp -R /path/to/inference-chain/templates/plugin .claude/plugins/inference-chain
```

Then in Claude Code:

```text
/plugin
```

and enable `inference-chain`.

## What it provides
- Slash commands: `/ic-checkpoint`, `/ic-stop`, `/ic-evolve`, `/ic-resume`
- Hooks: `SessionStart` (prints latest resume brief), `PreCompact` and
  `Stop` (nudges the agent toward `/ic-checkpoint` / `/ic-stop`)

It requires the `ic` CLI to be on `$PATH`. Install with:

```bash
pnpm install -g inference-chain
# or, from source:
pnpm install && pnpm build && pnpm link --global
```
