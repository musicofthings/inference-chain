# Scope: the edge `distill` step (hybrid front-end)

> Status: **design / not yet implemented.** This is the missing front-end that
> completes the hybrid recommended in `docs/teams-comparison.md`.

## Why

The IC-native path (`ic teams merge`) is deterministic and `ic verify`-friendly,
but it requires each developer to have a structured `dev_<name>.yml`
`ChainLedger`. Hand-authoring that YAML after a long AI session is friction.

The `distill` step removes that friction: it turns a raw AI-chat session log
into a schema-valid `dev_<name>.yml`. This is the "LLM at the edge" half of the
design — the model only *authors a structured artifact*; the merge that decides
shared team truth stays deterministic.

```
raw session log --(distill: LLM, edge)--> dev_<name>.yml  (ChainLedger)
                                              |
                          (ic teams merge: deterministic, core)
                                              v
                                        team-ledger.yml + resume brief
```

## Where it lives (key decision)

The deterministic TS core deliberately makes **no model API calls** and carries
no `anthropic` dependency (PRD §7). So the distiller is an **edge tool**, placed
with the other LLM engines:

- **`.inference/scripts/distill_session.py`** (Python, edge) — calls Claude,
  emits `dev_<name>.yml`. Consistent with `distill_bots.py` / `local_merge.py`;
  adds no dependency to the TS core.
- **Schema authority stays in TS.** The deterministic side is the single source
  of truth for what a valid `ChainLedger` is. A new **`ic teams validate <file>`**
  (TS) parses a draft with `ChainLedgerSchema` and reports OK/errors; `ic teams
  merge` already rejects nonconforming ledgers at the boundary.

Rejected alternative: a TS `ic teams distill` using the Anthropic SDK. It would
put a model API call and dependency into the deterministic core package —
violating the core's no-API principle and bloating the dependency surface. Keep
the LLM at the edge.

## Schema-drift mitigation

The Python emits YAML; the canonical shape lives in the Zod `ChainLedgerSchema`.
Two defenses keep them aligned:

1. **Validation boundary (Phase 1).** `ic teams merge` / `ic teams validate`
   parse with `ChainLedgerSchema` and reject any draft that doesn't conform,
   with an actionable per-file error. A drifted distiller fails loudly, never
   silently corrupts a merge.
2. **Schema-in-prompt (Phase 2).** Generate a JSON Schema from the Zod schema at
   build (`zod-to-json-schema`) and embed it in the distill prompt so the model
   targets the exact field set.

## Interface

```bash
ic teams validate .inference/dev_shibi.yml          # TS, deterministic boundary check

python .inference/scripts/distill_session.py \
  --log session.txt --author shibi --project variant-pipeline \
  [--iteration N] [--out .inference/dev_shibi.yml]
```

`distill_session.py` behavior:
- Read the raw log from `--log` or stdin.
- Fill a new prompt (`prompts/04-session-distill.md`) with the log, author,
  project, today's date, and iteration.
- Call Claude; extract a single `<dev_ledger>` tag containing YAML.
- Refuse to write on empty/garbled output (same wipe-guard pattern as
  `distill_bots.py`).
- Write `dev_<author>.yml`; print the next command (`ic teams merge ...`).

Iteration numbering: default to `(existing dev_<author>.yml iteration) + 1`, or
take `--iteration`. Each developer owns their own counter; the team merge takes
the max.

## New prompt: `prompts/04-session-distill.md`

Same semantic-filter discipline as Prompt Engine 1 (no chain-of-thought, no
transcript, no debugging noise), but the output is a full `ChainLedger` YAML
rather than a Markdown bullet ledger:

- `<role>`: Principal Engineer / semantic filter for an n+1 memory system.
- `<extraction_targets>`: operating model + confidence, stable learnings,
  active hypotheses (with evidence), rejected approaches, decisions, open
  questions, next best actions, blockers, risks, do-not-repeat constraints.
- `<negative_constraints>`: identical exclusions to Prompt 1.
- `<output_format>`: a single `<dev_ledger>` tag containing YAML with
  `kind: chain_ledger`, `project_id`, `iteration`, `updated_at`
  (= {{CURRENT_DATE}}), `global_objective`, `current_operating_model`,
  and the list fields. ASCII punctuation only.

## Validation boundary: `ic teams validate <file>`

Thin TS command: `ChainLedgerSchema.parse(YAML.parse(read(file)))`, printing
`OK: valid ChainLedger (iteration N)` or the first actionable error. Reuses the
same friendly-error helper added to `mergeFromDir`. ~20 lines + a test.

## Phased plan

- **Phase 1** (small, ~ one prompt + one Python script + `ic teams validate` +
  tests): the distiller and the validation boundary. Developers review the
  distilled YAML before merging (LLM output, human-in-the-loop).
- **Phase 2**: JSON-Schema-in-prompt for tighter conformance; auto-increment
  iteration; an `ic teams sync` convenience that chains distill -> validate ->
  merge -> resume in one command.

## Open questions for sign-off

1. Are distilled `dev_<name>.yml` ledgers committed to Git (shared, travels with
   the repo — recommended, matches the spec engine's `dev_*.md`) or kept local?
2. Mandatory human review of the distilled YAML before merge (recommended), or
   trust-and-merge?
3. Phase 1 only, or build through Phase 2's `ic teams sync` in one go?

## Effort

Comparable to `distill_bots`: one prompt, one ~80-line Python engine, a ~20-line
TS `validate` command, and tests. No new dependencies in the core (Python edge
only); `zod-to-json-schema` is a Phase-2 devDependency if pursued.
