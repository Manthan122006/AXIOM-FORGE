#!/usr/bin/env bash
# Launch the AXIOM Forge local demo: an Extension Development Host on fixtures/flask with an
# ISOLATED VS Code profile (~/.axiom-forge-demo), so your own VS Code settings/extensions are untouched
# and nothing is written into fixtures/flask (Task C checks its git status).
#
#   bash scripts/demo.sh                       # primary/backup defaults below
#   PRIMARY=google-gemini/gemini-3-5-flash-lite bash scripts/demo.sh
#
# Requires TrueForge running in another terminal:
#   OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PRIMARY="${PRIMARY:-google-gemini/gemini-3-5-flash}"
BACKUP="${BACKUP:-groq/qwen-3-8-27b}"
PACE="${PACE:-16}"
DEMO_HOME="${AXIOM_DEMO_HOME:-$HOME/.axiom-forge-demo}"
CODE="${VSCODE_EXECUTABLE:-}"
for c in "$CODE" "$HOME/Applications/Visual Studio Code.app/Contents/MacOS/Code" "/Applications/Visual Studio Code.app/Contents/MacOS/Code" "$(command -v code || true)"; do
  if [ -n "$c" ] && [ -x "$c" ]; then CODE="$c"; break; fi
done
[ -x "$CODE" ] || { echo "VS Code not found. Set VSCODE_EXECUTABLE=/path/to/Code"; exit 1; }

echo "1/4 TrueForge…"
if ! curl -s -g -o /dev/null --max-time 3 "http://[::1]:8790/api/v1/models" && ! curl -s -o /dev/null --max-time 3 "http://127.0.0.1:8790/api/v1/models"; then
  echo "   TrueForge is not running. Start it in another terminal:"
  echo "   OUTBOUND_URL_ALLOWED_HOSTS='[\"127.0.0.1\"]' npx -y @truefoundry/trueforge@0.185.1"
  exit 1
fi
echo "   reachable"

echo "2/4 Build…"
(cd "$REPO" && npm run build >/dev/null)
echo "   dist/extension.js + dist/webview built"

echo "3/4 Flask fixture…"
[ -f "$REPO/fixtures/flask/src/flask/cli.py" ] || (cd "$REPO" && npm run fixture:flask)
echo "   $(git -C "$REPO/fixtures/flask" status --porcelain | wc -l | tr -d ' ') changed files in fixtures/flask (run scripts/tasks/reset-fixture.sh for a clean start)"

echo "4/4 Demo profile + launch…"
mkdir -p "$DEMO_HOME/user-data/User" "$DEMO_HOME/extensions"
cat > "$DEMO_HOME/user-data/User/settings.json" <<JSON
{
  "axiomForge.models.primary": "$PRIMARY",
  "axiomForge.models.backup": "$BACKUP",
  "axiomForge.pacing.minSecondsBetweenSteps": $PACE,
  "axiomForge.perfLog": true,
  "security.workspace.trust.enabled": false,
  "workbench.startupEditor": "none",
  "editor.fontSize": 15
}
JSON
echo "   primary=$PRIMARY backup=$BACKUP pacing=${PACE}s profile=$DEMO_HOME"
"$CODE" --new-window --user-data-dir "$DEMO_HOME/user-data" --extensions-dir "$DEMO_HOME/extensions" \
  --extensionDevelopmentPath="$REPO" "$REPO/fixtures/flask" >/dev/null 2>&1 &
echo "   VS Code (Extension Development Host) is starting. Click the AXIOM Forge triangle in the left activity bar."
