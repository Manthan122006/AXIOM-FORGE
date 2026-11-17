#!/usr/bin/env bash
# Task C verification: after a failed (or fallen-back) run, the workspace must be unchanged
# unless the user explicitly accepted hunks. Exit 0 = clean.
DIR="${1:-fixtures/flask}"
echo "\$ git status (in $DIR)"; s=$(git -C "$DIR" status --porcelain); git -C "$DIR" status --short
[ -z "$s" ] && { echo "TASK C: PASS (no files changed)"; exit 0; } || { echo "TASK C: workspace has changes"; exit 1; }
