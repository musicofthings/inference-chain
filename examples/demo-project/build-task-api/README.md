# Demo scenario — "Build a tiny task API"

A scripted, 8-step narrative of an AI coding agent building a minimal task
tracking HTTP API. Used by `ic simulate` to validate the n+1 hypothesis.

## What the narrative tests

| Step | Artifact type        | Story beat                                                      | What it should exercise                       |
| ---- | -------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| 1    | interaction_update   | Explores three libs; identifies `express` and `fastify` as candidates | new_information, frontier set                 |
| 2    | interaction_update   | Tries `express`; finds it slow with JSON streaming              | rejected belief                                |
| 3    | session_brief       | First session ends — tries `fastify`; partially works           | partially_worked → active hypothesis, iter ++  |
| 4    | interaction_update   | Confirms `fastify` works for the JSON streaming case            | confirmed → bump confidence (1st time)         |
| 5    | interaction_update   | Confirms `fastify` again on auth route                          | confirmed (2nd) → **auto-promote to stable**   |
| 6    | interaction_update   | Discovers SQLite WAL mode required for concurrent writes        | new_blockers, do_not_repeat_delta              |
| 7    | session_brief       | Second session ends — fix attempted, blocker resolved           | fixes_attempted → stable_decisions, iter ++    |
| 8    | session_brief       | Third session — adds rate limiting; supersedes earlier choice   | superseded (old rejected, new active)          |

## n+1 expectations

- `fastify` should appear in `stable_learnings` by step 5.
- `express` should remain in `rejected_hypotheses` for the rest of the run
  and never re-enter `active_hypotheses` (this is the **rejected_persistence**
  metric — must be 0).
- `do_not_repeat` should grow steadily and contain "express for streaming
  JSON" and "in-memory SQLite for concurrent writes" by the end.
- `score_progression` should be positive across iterations.
- The frontier should narrow as iterations advance (frontier_convergence).

## Run

```bash
ic simulate examples/demo-project/build-task-api/sessions --reset --project-name "task-api"
```

Or from the source tree:

```bash
node dist/cli.js simulate examples/demo-project/build-task-api/sessions \
  --reset --project-name "task-api"
```
