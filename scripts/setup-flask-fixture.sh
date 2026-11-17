#!/usr/bin/env bash
# Clones the official competition repository at the pinned release into fixtures/flask
# and creates a venv with Flask installed in editable mode plus pytest.
set -euo pipefail
DEST="${1:-fixtures/flask}"
if [ ! -d "$DEST/.git" ]; then
  git clone --quiet https://github.com/pallets/flask.git "$DEST"
fi
git -C "$DEST" -c advice.detachedHead=false checkout --quiet 3.1.3
SHA=$(git -C "$DEST" rev-parse --short=8 HEAD)
if [ "$SHA" != "22d92470" ]; then echo "unexpected commit $SHA (expected 22d92470)" >&2; exit 1; fi
if [ ! -x "$DEST/.venv/bin/python" ]; then
  python3 -m venv "$DEST/.venv"
  "$DEST/.venv/bin/pip" install --quiet --upgrade pip
  # Versions from Flask 3.1.3's own uv.lock (newer pytest removed APIs its tests import)
  "$DEST/.venv/bin/pip" install --quiet -e "$DEST" "pytest==8.4.2" "asgiref==3.11.0" "python-dotenv==1.2.1" greenlet
fi
echo "flask fixture ready at $DEST (commit $SHA)"
