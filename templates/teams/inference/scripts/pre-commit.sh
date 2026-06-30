#!/bin/bash
# Inference Chain (teams) — local semantic-merge gate.
# Husky links to this from .husky/pre-commit. It validates prerequisites,
# then runs the client-side synthesis engine over staged developer ledgers.
set -uo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Only fire when a developer ledger is part of this commit.
if git diff --cached --name-only | grep -q '^\.inference/dev_.*\.md$'; then
    echo -e "${YELLOW}🧠 Inference Chain: Processing local developer session records...${NC}"

    # Prerequisite 1: a Python interpreter (python3 on macOS/Linux, python on Windows).
    PYTHON="$(command -v python3 || command -v python || true)"
    if [ -z "$PYTHON" ]; then
        echo -e "${RED}❌ SYSTEM ERROR: no python3/python found on your PATH.${NC}"
        echo "Inference Chain requires Python 3.10+ to synthesize local context."
        echo "Action Required: Install Python or adjust your environment path configurations."
        exit 1
    fi

    # Prerequisite 2: Python 3.10+
    if ! "$PYTHON" -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"; then
        echo -e "${RED}❌ SYSTEM ERROR: $("$PYTHON" --version 2>&1) is too old; need Python 3.10+.${NC}"
        exit 1
    fi

    # Prerequisite 3: SDK check
    if ! "$PYTHON" -c "import anthropic" &> /dev/null; then
        echo -e "${RED}❌ CONFIGURATION ERROR: Anthropic Python SDK is not installed.${NC}"
        echo "Action Required: Run '$PYTHON -m pip install anthropic' to proceed."
        exit 1
    fi

    # Prerequisite 4: Environment token validation
    if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
        echo -e "${RED}❌ ACCESS DENIED: ANTHROPIC_API_KEY environment variable is blank.${NC}"
        echo "Local client-side synthesis requires this key to reach Claude."
        echo "Action Required: Set ANTHROPIC_API_KEY in your shell environment."
        exit 1
    fi

    # Execute Python engine
    if "$PYTHON" .inference/scripts/local_merge.py; then
        if [ -f ".inference/masterplan.md" ]; then
            git add .inference/masterplan.md
            if [ -f ".inference/archive.md" ]; then git add .inference/archive.md; fi
            echo -e "${GREEN}✅ Context synthesis successful. Integrated natively into commit payload.${NC}"
        fi
    else
        echo -e "${RED}❌ HOOK TERMINATED: Semantic merge conflict or structural failure occurred.${NC}"
        echo -e "Action Required: Inspect ${YELLOW}.inference/masterplan.md${NC} to resolve logic collisions manually."
        exit 1
    fi
fi
