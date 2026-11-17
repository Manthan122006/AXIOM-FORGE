#!/usr/bin/env bash
# Restore fixtures/flask to the pristine 3.1.3 tree (keeps the ignored .venv).
set -euo pipefail
DIR="${1:-fixtures/flask}"
git -C "$DIR" checkout --quiet -- .
git -C "$DIR" clean -fdq
git -C "$DIR" -c advice.detachedHead=false checkout --quiet 3.1.3
echo "reset $DIR to $(git -C "$DIR" rev-parse --short=8 HEAD); status: $(git -C "$DIR" status --porcelain | wc -l | tr -d ' ') changed files"
