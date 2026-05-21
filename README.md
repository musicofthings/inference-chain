# Inference Chain — A Forward Inference Ledger for Claude Code

Inference Chain is a local-first agentic context engineering layer for Claude Code.

## What it is
A forward-only n+1 inference ledger that evolves session context.

## What it is not
Not RAG, not transcript archive, not vector DB, not blockchain.

## Quickstart
```bash
pnpm install
pnpm build
pnpm link --global
ic init --project-name "My Project"
ic install-claude
```

## Commands
`ic init`, `ic install-claude`, `ic ingest`, `ic evolve`, `ic resume`, `ic status`, `ic verify`

## License
Apache-2.0
