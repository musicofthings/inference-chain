#!/usr/bin/env bash
#
# End-to-end wiring eval for the built CLI (dist/cli.js).
#
# Complements `pnpm test` (in-process) by driving the real binary through
# init -> install -> doctor -> ingest/evolve/resume/verify in throwaway
# project directories, and asserting the install contracts that unit tests
# cannot observe: committed config stays machine-independent, --overwrite
# never eats hand-authored files, and a failing adapter does not abort a
# multi-target plan.
#
# Usage: pnpm eval:e2e [--keep]
#   --keep  leave the temp project directories in place for inspection

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CLI="$REPO_ROOT/dist/cli.js"

KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

if [ ! -f "$CLI" ]; then
	printf 'dist/cli.js not found — run `pnpm build` first.\n' >&2
	exit 1
fi

PASS=0
FAIL=0
LAST_LOG=""
WORKDIRS=()

cleanup() {
	[ "$KEEP" = 1 ] && return 0
	for d in "${WORKDIRS[@]:-}"; do
		[ -n "$d" ] && [ -e "$d" ] && rm -rf "$d"
	done
}
trap cleanup EXIT

# Every CLI call must happen in a throwaway project. A `cd` that silently fails
# would otherwise run `ic init` / `ic install --all` against this repo.
assert_sandboxed() {
	case "$PWD" in
	"$REPO_ROOT" | "$REPO_ROOT"/*)
		printf '\nABORT: eval tried to run the CLI inside the repo (%s)\n' "$PWD" >&2
		exit 2
		;;
	esac
}

section() { printf '\n=== %s ===\n' "$1"; }
ok() {
	PASS=$((PASS + 1))
	printf '  PASS  %s\n' "$1"
}
bad() {
	FAIL=$((FAIL + 1))
	printf '  FAIL  %s\n' "$1"
}

# Sets $NEWDIR and cds into it. Must not be called in a command substitution:
# the subshell would swallow the cd and leave the CLI pointed at the repo.
NEWDIR=""
newproject() {
	NEWDIR=$(mktemp -d)
	WORKDIRS+=("$NEWDIR")
	cd "$NEWDIR" || exit 1
	assert_sandboxed
}

# Run the CLI, capturing combined output in $LAST_LOG. Returns the real exit code.
run_cli() {
	assert_sandboxed
	LAST_LOG=$(mktemp)
	WORKDIRS+=("$LAST_LOG")
	node "$CLI" "$@" >"$LAST_LOG" 2>&1
}

# Assert the CLI exits with a specific status. Never inspect $? outside this.
expect_exit() {
	local want=$1 label=$2
	shift 2
	run_cli "$@"
	local got=$?
	if [ "$got" = "$want" ]; then
		ok "$label"
	else
		bad "$label (exit $got, expected $want)"
		sed 's/^/        | /' "$LAST_LOG"
	fi
}

# Assert a filesystem/content predicate. Must not reference $?.
check() {
	if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi
}

# Assert the last CLI run's output matches (or does not match) a pattern.
check_log() {
	if grep -qE "$2" "$LAST_LOG"; then ok "$1"; else bad "$1"; fi
}
check_log_absent() {
	if grep -qE "$2" "$LAST_LOG"; then bad "$1"; else ok "$1"; fi
}

PROJECT_MCP_FILES=(
	.mcp.json
	.cursor/mcp.json
	.vscode/mcp.json
	opencode.json
	.continue/config.json
	.windsurf/mcp.json
	.openhands/mcp.json
	.gemini/settings.json
	.codex/config.toml
	.grok/config.toml
)

################################################################################
newproject
MAIN=$NEWDIR
printf 'primary project: %s\n' "$MAIN"

section "1. init"
expect_exit 0 "ic init" init --project-name "EvalProject"
check "current.yml created" '[ -f .inference-chain/current.yml ]'
check "ledger.jsonl created" '[ -f .inference-chain/ledger.jsonl ]'
check "prompts copied" '[ -f .inference-chain/prompts/capture-session-brief.md ]'

section "2. install --all"
expect_exit 0 "ic install --all" install --all
check_log_absent "no adapter reported FAILED" 'FAILED'
check "claude commands" '[ -f .claude/commands/ic-checkpoint.md ]'
check "claude .mcp.json" '[ -f .mcp.json ]'
check "claude plugin scaffold" '[ -f .claude/plugins/inference-chain/commands/ic-stop.md ]'
check "cursor rules" '[ -f .cursor/rules/inference-chain.mdc ]'
check "gemini toml command" '[ -f .gemini/commands/ic-stop.toml ]'
check "grok skill" '[ -f .grok/skills/ic-evolve/SKILL.md ]'
check "codex hooks" '[ -f .codex/hooks.json ]'
check "AGENTS.md marker" 'grep -q "<!-- inference-chain -->" AGENTS.md'
check "copilot instructions marker" 'grep -q "<!-- inference-chain -->" .github/copilot-instructions.md'
check "windsurfrules marker" 'grep -q "<!-- inference-chain -->" .windsurfrules'
check "vscode mcp" '[ -f .vscode/mcp.json ]'
check "opencode config" '[ -f opencode.json ]'
check "continue config" '[ -f .continue/config.json ]'
check "copilot prompt files" '[ -f .github/prompts/ic-stop.prompt.md ]'
check "opencode commands" '[ -f .opencode/commands/ic-stop.md ]'
check "windsurf workflows" '[ -f .windsurf/workflows/ic-stop.md ]'
check "thin-host commands share the common body" 'grep -q "latest-brief.yml" .github/prompts/ic-stop.prompt.md'
check "desktop snippet" '[ -f .inference-chain/mcp-desktop.json ]'
check "chatgpt excluded from --all" '[ ! -f .inference-chain/mcp-chatgpt-desktop.json ]'

section "3. committed config is machine-independent"
LEAKED=0
for f in "${PROJECT_MCP_FILES[@]}"; do
	if [ ! -f "$f" ]; then
		bad "missing project config $f"
		continue
	fi
	if grep -qF -e "$HOME" -e "$MAIN" -e "$(node -p 'process.execPath')" -e "/private/var" "$f" 2>/dev/null; then
		printf '        | leak in %s: %s\n' "$f" "$(head -c 200 "$f" | tr '\n' ' ')"
		LEAKED=1
	fi
done
check "no home/project/node paths in project MCP config" '[ "$LEAKED" = 0 ]'
check "desktop snippet is pinned (by design)" 'grep -q -- "--cwd" .inference-chain/mcp-desktop.json'

section "4. doctor"
expect_exit 0 "ic doctor" doctor
sed 's/^/        /' "$LAST_LOG"
check_log "reports healthy" 'summary: healthy'
check_log_absent "no unwired hosts" 'unwired='
expect_exit 0 "ic doctor --json" doctor --json
check "doctor --json is valid JSON" 'node -e "JSON.parse(require(\"fs\").readFileSync(process.argv[1],\"utf8\"))" "$LAST_LOG"'

section "5. ledger loop"
cat >.inference-chain/inbox/latest-update.yml <<'YML'
kind: interaction_update
schema_version: "1.0.0"
id: "upd_e2e_1"
project_id: "EvalProject"
iteration: 0
created_at: "2026-08-07T18:00:00.000Z"
trigger: "manual_checkpoint"
what_changed: "verified multi-host install wiring end to end"
confirmed:
  - belief: "project MCP config is portable"
    evidence: "no machine paths in generated configs"
next_action_delta:
  - "ship the portability fix"
YML
expect_exit 0 "ic ingest" ingest .inference-chain/inbox/latest-update.yml
check_log "ingest names the artifact" 'upd_e2e_1'
expect_exit 0 "ic evolve" evolve
check "evolution archived" 'ls .inference-chain/evolutions | grep -q .'
check "inbox consumed" '[ ! -f .inference-chain/inbox/latest-update.yml ]'
expect_exit 0 "ic status" status
check_log "status names the project" 'EvalProject'
expect_exit 0 "ic verify" verify
expect_exit 0 "ic resume" resume
check "resume brief written" '[ -f .inference-chain/resumes/resume_latest.md ]'
check "resume carries the next action" 'grep -qi "portability" .inference-chain/resumes/resume_latest.md'

section "6. forward-only: evolve without an inbox artifact"
expect_exit 1 "second ic evolve exits 1" evolve
check_log "explains the missing inbox" 'No inbox artifact found'

section "7. re-install is non-destructive"
printf 'MY OWN COMMAND\n' >.claude/commands/ic-checkpoint.md
printf '# House rules\n\nKEEP THIS LINE\n' >.github/copilot-instructions.md
expect_exit 0 "ic install --all (re-run)" install --all
check "user-edited command preserved" 'grep -q "MY OWN COMMAND" .claude/commands/ic-checkpoint.md'
expect_exit 0 "ic install --target copilot --overwrite" install --target copilot --overwrite
check "hand-authored copilot text survives --overwrite" 'grep -q "KEEP THIS LINE" .github/copilot-instructions.md'
check "our marker block is present too" 'grep -q "<!-- inference-chain -->" .github/copilot-instructions.md'
expect_exit 0 "ic verify after re-installs" verify
check_log "chain still valid" 'hash chain valid'

################################################################################
section "8. failure isolation in a multi-target plan"
newproject
expect_exit 0 "ic init" init --project-name "FailEval"
# A directory where .windsurfrules must be a file makes that one adapter throw.
mkdir -p .windsurfrules
expect_exit 1 "plan with a broken adapter exits 1" install --target cursor,windsurf,generic
check_log "windsurf reported as failed" 'windsurf: FAILED'
check_log "surviving targets still reported" 'adapters \(targets\): cursor, generic'
check "cursor still installed" '[ -f .cursor/commands/ic-resume.md ]'
check "generic still installed" '[ -f AGENTS.md ]'

################################################################################
section "9. --detect only picks real hosts"
newproject
expect_exit 0 "ic init" init --project-name "DetectEval"
mkdir -p .cursor .vscode # bare .vscode/ must not count as a host
expect_exit 0 "ic install --detect" install --detect
check_log "cursor detected" 'Detected cursor'
check_log_absent "bare .vscode not detected" 'Detected vscode'
check "no vscode MCP written" '[ ! -f .vscode/mcp.json ]'

################################################################################
section "10. --pin-launch and --no-with-mcp"
newproject
PINDIR=$NEWDIR
expect_exit 0 "ic init" init --project-name "PinEval"
expect_exit 0 "ic install --target cursor --pin-launch" install --target cursor --pin-launch
check "pinned config carries absolute --cwd" 'grep -q -- "--cwd" .cursor/mcp.json'
check "pinned config carries this project path" 'grep -q "$PINDIR" .cursor/mcp.json'
check_log "warns the config is machine-local" 'Do not commit'
expect_exit 0 "ic install --target desktop --no-with-mcp" install --target desktop --no-with-mcp
check "--no-with-mcp writes no snippet" '[ ! -f .inference-chain/mcp-desktop.json ]'

################################################################################
section "11. capture loop closes without manual commands"
newproject
expect_exit 0 "ic init" init --project-name "LoopEval"
expect_exit 0 "ic install --target claude" install --target claude
check "Stop hook runs sync" 'grep -q "ic sync --quiet" .claude/settings.json'
check "PreCompact hook runs sync" 'grep -q "ic sync --quiet" .claude/settings.json'
expect_exit 0 "ic sync on empty inbox" sync
check_log "empty inbox is a no-op" 'Nothing to sync'
assert_sandboxed
cat >.inference-chain/inbox/latest-brief.yml <<'BRIEF'
kind: session_brief
schema_version: "1.0.0"
id: brf_loop_eval
project_id: LoopEval
iteration: 0
created_at: "2026-06-01T00:00:00Z"
session_intent:
  primary_goal: "close the loop"
  what_agent_was_doing: "writing a brief"
working_theory:
  summary: "the stop hook applies the brief with no human commands"
  confidence: high
actions_attempted: []
outcomes_observed: []
worked:
  - "hook-driven ledger advance"
did_not_work: []
partially_worked: []
issues_identified: []
fixes_attempted: []
unresolved_state: ""
next_best_action:
  - "measure it"
do_not_repeat: []
user_constraints: []
human_handoff_summary: "loop closed"
BRIEF
# Exactly what the Stop hook runs.
expect_exit 0 "ic sync --quiet applies the brief" sync --quiet
check "inbox consumed" '[ ! -f .inference-chain/inbox/latest-brief.yml ]'
check "brief archived" '[ -f .inference-chain/briefs/brf_loop_eval.yml ]'
check "resume brief refreshed" 'grep -q "hook-driven ledger advance" .inference-chain/resumes/resume_latest.md'
expect_exit 0 "ledger still verifies" verify

################################################################################
section "12. MCP server handshake over stdio"
newproject
MCPDIR=$NEWDIR
expect_exit 0 "ic init" init --project-name "McpEval"
assert_sandboxed
MCP_OUT=$(mktemp)
WORKDIRS+=("$MCP_OUT")
printf '%s\n%s\n' \
	'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"eval","version":"0"}}}' \
	'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' |
	node "$CLI" mcp --cwd "$MCPDIR" >"$MCP_OUT" 2>/dev/null
LAST_LOG="$MCP_OUT"
check_log "server answered initialize" 'serverInfo'
check_log "chain_evolve advertised" 'chain_evolve'
check_log "chain_ingest_evolution advertised" 'chain_ingest_evolution'
check_log "chain_resume_brief advertised" 'chain_resume_brief'

################################################################################
printf '\n===============================\n'
printf 'PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$KEEP" = 1 ] && printf 'temp dirs kept: %s\n' "${WORKDIRS[*]}"
[ "$FAIL" = 0 ]
