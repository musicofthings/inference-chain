#!/usr/bin/env bash
#
# n+1 sharpness regression: replays every bundled scenario under
# examples/*/*/sessions and fails if the ledger stops carrying signal forward.
#
# A scenario is n+1-positive when anti_repeat_coverage >= 0.5,
# rejected_persistence == 0, and score_progression > 0 (PRD-TRD §22).
#
# Usage: pnpm eval:sim

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CLI="$REPO_ROOT/dist/cli.js"

if [ ! -f "$CLI" ]; then
	printf 'dist/cli.js not found — run `pnpm build` first.\n' >&2
	exit 1
fi

TMPDIRS=()
cleanup() {
	for d in "${TMPDIRS[@]:-}"; do
		[ -n "$d" ] && [ -e "$d" ] && rm -rf "$d"
	done
}
trap cleanup EXIT

FAILED=0
FOUND=0

for scenario in "$REPO_ROOT"/examples/*/*/sessions; do
	[ -d "$scenario" ] || continue
	FOUND=$((FOUND + 1))
	name=$(basename "$(dirname "$scenario")")

	run=$(mktemp -d)
	TMPDIRS+=("$run")
	cd "$run" || exit 1

	# Guard: simulate --reset wipes .inference-chain/, so never run it in-repo.
	case "$PWD" in
	"$REPO_ROOT" | "$REPO_ROOT"/*)
		printf 'ABORT: simulation tried to run inside the repo (%s)\n' "$PWD" >&2
		exit 2
		;;
	esac

	if ! node "$CLI" simulate "$scenario" --reset --json >report.json 2>err.log; then
		printf 'FAIL  %s — simulate exited non-zero\n' "$name"
		sed 's/^/      | /' err.log
		FAILED=$((FAILED + 1))
		continue
	fi

	node -e '
		const r = JSON.parse(require("fs").readFileSync("report.json", "utf8"));
		const m = r.metrics;
		const name = process.argv[1];
		const line = [
			"anti_repeat=" + m.anti_repeat_coverage,
			"promotion=" + m.hypothesis_promotion_rate,
			"rejected_persistence=" + m.rejected_persistence,
			"score_progression=" + m.score_progression,
			"brief_kb=" + m.final_brief_size_kb.toFixed(2),
		].join("  ");
		if (r.verdict.n_plus_1_positive) {
			console.log("PASS  " + name + "  " + line);
		} else {
			console.log("FAIL  " + name + "  " + line);
			for (const n of r.verdict.notes) console.log("      | " + n);
			process.exit(1);
		}
	' "$name" || FAILED=$((FAILED + 1))
done

if [ "$FOUND" = 0 ]; then
	printf 'No scenarios found under examples/*/*/sessions\n' >&2
	exit 1
fi

printf '\n%s scenario(s), %s failed\n' "$FOUND" "$FAILED"
[ "$FAILED" = 0 ]
