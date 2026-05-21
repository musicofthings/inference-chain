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


## Local n+1 algorithm test (on this machine)
1. Install dependencies:
   `pnpm install`
2. Run tests (includes a mathematical n+1 progression test):
   `pnpm test`
3. Run only progression test:
   `pnpm test -- evolveMath.test.ts`
4. Manual CLI flow:
   - `pnpm build`
   - `node dist/cli.js init --project-name "Demo"`
   - Create `.inference-chain/inbox/latest-update.yml` (InteractionUpdate)
   - `node dist/cli.js evolve`
   - Create `.inference-chain/inbox/latest-brief.yml` (SessionBrief)
   - `node dist/cli.js evolve`
   - `node dist/cli.js resume`

Expected signal of progress: `ic evolve` prints a score transition like `score: 3 -> 6`; this score is computed from accumulated stable learnings, hypotheses/frontier, and do-not-repeat memory, so non-decreasing values indicate n+1 context accumulation.
