#!/usr/bin/env python3
"""Cloud-side automated-review distillation engine (Prompt Engine 3).

Runs in CI (GitHub Actions) when a PR merges. Reads raw bot review comments,
the human overrides, AND the current bot_ledger.md, then asks Claude to return
the COMPLETE updated ledger with new constraints merged in and duplicates
collapsed. The whole file is rewritten (not appended), so the ledger
self-deduplicates across runs/PRs — the same approach the masterplan merge uses.

Raw comments are provided by the workflow either as a file (--comments-file)
or on stdin.
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

OVERRIDES = INFERENCE_DIR / "overrides.md"
BOT_LEDGER = INFERENCE_DIR / "bot_ledger.md"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Distill PR review-bot feedback.")
    ap.add_argument(
        "--comments-file",
        type=Path,
        help="File containing raw bot comments. If omitted, reads stdin.",
    )
    return ap.parse_args()


def read_comments(path: "Path | None") -> str:
    if path is not None:
        return read_text(path)
    if not sys.stdin.isatty():
        return sys.stdin.read()
    return ""


def main() -> int:
    args = parse_args()
    raw = read_comments(args.comments_file).strip()
    if not raw:
        print("[inference-chain/teams] No bot comments supplied; nothing to distill.")
        return 0

    existing = read_text(BOT_LEDGER, default="")
    if not existing.strip():
        die("bot_ledger.md missing or empty — run `ic teams init` first.")
    overrides = read_text(OVERRIDES, default="(no overrides configured)")

    user = fill(
        load_prompt("03-bot-distillation.md"),
        CURRENT_DATE=today(),
        CURRENT_BOT_LEDGER=existing,
        HUMAN_OVERRIDES_CONTENT=overrides,
        RAW_BOT_COMMENTS_TEXT=raw,
    )
    system = "You execute the Automated Review Synthesizer task exactly as specified. Output only the requested <updated_bot_ledger> tag."

    response = call_claude(system, user)
    updated = extract_tag(response, "updated_bot_ledger").strip()

    # Never let a bad/empty model response wipe the ledger.
    if not updated:
        die("Distiller returned no <updated_bot_ledger>; leaving bot_ledger.md unchanged.")

    if updated.rstrip() == existing.rstrip():
        print("[inference-chain/teams] No new constraints; bot_ledger.md unchanged.")
        return 0

    write_text(BOT_LEDGER, updated.rstrip() + "\n")
    print("[inference-chain/teams] bot_ledger.md updated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
