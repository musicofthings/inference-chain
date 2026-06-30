#!/usr/bin/env python3
"""Edge session-distillation engine (Prompt Engine 4).

Turns a raw developer-AI session log into a schema-valid `dev_<author>.yml`
ChainLedger that the deterministic `ic teams merge` / `ic teams sync` can
consume. This is the "LLM at the edge" front-end of the hybrid: the model only
authors a structured artifact; the deterministic core decides shared team truth.

The authoritative schema check lives in the TS core — run `ic teams validate
<file>` (or `ic teams merge`) afterward. This script does a light structural
pre-check and refuses to write on empty/garbled model output.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _ic_common import (
    INFERENCE_DIR,
    call_claude,
    die,
    extract_tag,
    fill,
    load_prompt,
    read_text,
    today,
    write_text,
)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Distill a session log into dev_<author>.yml.")
    ap.add_argument("--author", required=True, help="Developer name (used for dev_<author>.yml).")
    ap.add_argument("--project", required=True, help="project_id for the ledger.")
    ap.add_argument("--log", type=Path, help="Raw session log file. If omitted, reads stdin.")
    ap.add_argument("--iteration", type=int, help="Iteration number (default: prev dev ledger + 1).")
    ap.add_argument("--out", type=Path, help="Output path (default .inference/dev_<author>.yml).")
    return ap.parse_args()


def read_log(path: "Path | None") -> str:
    if path is not None:
        return read_text(path)
    if not sys.stdin.isatty():
        return sys.stdin.read()
    return ""


def next_iteration(out_path: Path, explicit: "int | None") -> int:
    if explicit is not None:
        return explicit
    # Auto-increment from an existing dev ledger if present.
    existing = read_text(out_path, default="")
    for line in existing.splitlines():
        if line.strip().startswith("iteration:"):
            try:
                return int(line.split(":", 1)[1].strip()) + 1
            except ValueError:
                break
    return 1


def main() -> int:
    args = parse_args()
    raw = read_log(args.log).strip()
    if not raw:
        die("No session log supplied (use --log <file> or pipe via stdin).")

    out_path = args.out or (INFERENCE_DIR / f"dev_{args.author}.yml")
    iteration = next_iteration(out_path, args.iteration)

    user = fill(
        load_prompt("04-session-distill.md"),
        PROJECT_ID=args.project,
        AUTHOR=args.author,
        ITERATION=str(iteration),
        CURRENT_DATE=today(),
        RAW_SESSION_LOG=raw,
    )
    system = "You execute the session-distillation task exactly as specified. Output only the requested <dev_ledger> tag."

    response = call_claude(system, user)
    ledger_yaml = extract_tag(response, "dev_ledger").strip()
    if not ledger_yaml:
        die("Distiller returned no <dev_ledger>; nothing written.")
    # Light structural pre-check; the TS core does the authoritative validation.
    if "kind: chain_ledger" not in ledger_yaml or "project_id:" not in ledger_yaml:
        die("Distilled output is not a recognizable ChainLedger; nothing written.")

    write_text(out_path, ledger_yaml.rstrip() + "\n")
    print(f"[inference-chain/teams] Wrote {out_path}.")
    print(f"[inference-chain/teams] Validate it: ic teams validate {out_path}")
    print("[inference-chain/teams] Then assemble: ic teams sync .inference")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
