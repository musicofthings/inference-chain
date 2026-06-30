#!/usr/bin/env python3
"""Client-side semantic merge engine (Prompt Engine 2).

Invoked from the pre-commit hook. Collects the developer ledgers staged in
this commit, merges them into masterplan.md via Claude, offloads stale nodes
to archive.md, and aborts the commit (exit 1) when an unresolvable conflict
is detected so a human can resolve the `> [!WARNING] CONFLICT:` block.
"""
from __future__ import annotations

import subprocess
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

MASTERPLAN = INFERENCE_DIR / "masterplan.md"
ARCHIVE = INFERENCE_DIR / "archive.md"

# Reserved files in .inference/ that are NOT per-developer ledgers.
RESERVED = {"masterplan.md", "archive.md", "overrides.md", "bot_ledger.md"}
CONFLICT_MARKER = "> [!WARNING] CONFLICT:"


def staged_dev_ledgers() -> list[Path]:
    """Developer ledgers staged in this commit (dev_*.md under .inference/)."""
    try:
        out = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        out = ""

    staged = []
    for line in out.splitlines():
        p = Path(line.strip())
        if p.name.startswith("dev_") and p.suffix == ".md" and p.name not in RESERVED:
            if p.exists():
                staged.append(p)

    # Fallback for non-git / manual runs: glob the dev ledgers on disk.
    if not staged:
        staged = [
            p
            for p in INFERENCE_DIR.glob("dev_*.md")
            if p.name not in RESERVED
        ]
    return sorted(set(staged))


def main() -> int:
    ledgers = staged_dev_ledgers()
    if not ledgers:
        # Nothing developer-authored to merge; let the commit proceed.
        return 0

    bundle = "\n\n".join(
        f"<!-- ledger: {p.name} -->\n{read_text(p)}" for p in ledgers
    )
    current = read_text(MASTERPLAN, default="(masterplan.md is empty)")

    user = fill(
        load_prompt("02-semantic-merge.md"),
        CURRENT_DATE=today(),
        CURRENT_MASTERPLAN_CONTENT=current,
        DEVELOPER_LEDGER_CONTENTS=bundle,
    )
    system = "You execute the Global Context Synthesizer task exactly as specified in the user message. Output only the requested XML tags."

    response = call_claude(system, user)

    updated = extract_tag(response, "updated_masterplan")
    archive_block = extract_tag(response, "archive_block")
    report = extract_tag(response, "synthesis_report") or "(no report)"

    if not updated:
        die("Synthesizer returned no <updated_masterplan>. Aborting to avoid corrupting state.")

    write_text(MASTERPLAN, updated.rstrip() + "\n")

    if archive_block:
        existing = read_text(ARCHIVE, default="")
        merged = f"{existing.rstrip()}\n\n<!-- archived {today()} -->\n{archive_block.rstrip()}\n"
        write_text(ARCHIVE, merged)

    print(f"[inference-chain/teams] {report}")

    # Trust the model's explicit flag, and as a backstop require the marker to
    # begin a line (a real callout) — not merely appear in prose where the
    # model describes the conflict rules. A loose substring match produced
    # false-positive aborts when the model echoed the marker while reporting
    # "no conflicts".
    flagged = extract_tag(response, "has_conflict").strip().lower() == "true"
    has_block = any(
        line.lstrip().startswith(CONFLICT_MARKER) for line in updated.splitlines()
    )
    if flagged or has_block:
        die(
            "Semantic conflict detected. masterplan.md now contains a CONFLICT "
            "block. Resolve it, then re-commit.",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
