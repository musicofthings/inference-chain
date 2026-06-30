"""Shared helpers for the Inference Chain teams engines.

Kept dependency-light: only the `anthropic` SDK plus the stdlib. Both
engines (local_merge.py, distill_bots.py) import from here so the model
config, prompt loading, and frontmatter handling stay in one place.
"""
from __future__ import annotations

import datetime as _dt
import os
import re
import sys
from pathlib import Path

# Resolve .inference/ relative to this file (scripts/ lives inside it).
INFERENCE_DIR = Path(__file__).resolve().parent.parent
PROMPTS_DIR = INFERENCE_DIR / "prompts"

# Default model is overridable so teams can pin cost/quality without editing
# code. These are exact API model strings.
DEFAULT_MODEL = os.environ.get("IC_TEAMS_MODEL", "claude-sonnet-4-6")
MAX_TOKENS = int(os.environ.get("IC_TEAMS_MAX_TOKENS", "8000"))


def die(msg: str, code: int = 1) -> "None":
    sys.stderr.write(f"[inference-chain/teams] {msg}\n")
    raise SystemExit(code)


def today() -> str:
    return _dt.date.today().isoformat()


def read_text(path: Path, default: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return default


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def load_prompt(name: str) -> str:
    p = PROMPTS_DIR / name
    if not p.exists():
        die(f"Prompt template missing: {p}")
    return p.read_text(encoding="utf-8")


def fill(template: str, **subs: str) -> str:
    out = template
    for key, value in subs.items():
        out = out.replace("{{" + key + "}}", value)
    return out


def extract_tag(text: str, tag: str) -> str:
    """Return the inner text of the first <tag>...</tag> block, or ''."""
    m = re.search(rf"<{tag}>(.*?)</{tag}>", text, re.DOTALL)
    return m.group(1).strip() if m else ""


def get_client():
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        die("ANTHROPIC_API_KEY is not set. Export it before committing.")
    try:
        import anthropic  # noqa: WPS433 (import-inside-fn is deliberate)
    except ImportError:
        die("Anthropic SDK missing. Run: pip install anthropic")
    return anthropic.Anthropic(api_key=key)


def call_claude(system: str, user: str) -> str:
    client = get_client()
    try:
        resp = client.messages.create(
            model=DEFAULT_MODEL,
            max_tokens=MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except Exception as err:  # noqa: BLE001 (surface any SDK/network error cleanly)
        die(f"Claude API call failed: {err}")
    return "".join(
        block.text for block in resp.content if getattr(block, "type", "") == "text"
    ).strip()
