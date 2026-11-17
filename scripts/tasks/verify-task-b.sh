#!/usr/bin/env bash
# Task B verification. Exit 0 = PASS.
set -uo pipefail
ROOT=$(pwd); DIR="${1:-fixtures/flask}"; VENV="$ROOT/$DIR/.venv/bin"; cd "$DIR" || exit 2
fail=0
echo "\$ pytest tests/test_cli.py -q"; "$VENV/python" -m pytest tests/test_cli.py -q 2>&1 | tail -3; [ "${PIPESTATUS[0]}" = 0 ] || fail=1
grep -q "config" <("$VENV/flask" --help 2>&1) && echo "  ok   'config' listed in flask --help" || { echo "  FAIL 'config' not in flask --help"; fail=1; }
grep -qE "def test_[a-z_]*config|config_command|\"config\"" tests/test_cli.py && echo "  ok   tests/test_cli.py covers the command" || { echo "  FAIL no test for config in tests/test_cli.py"; fail=1; }
grep -qE "flask config|^config$|\`\`config\`\`" docs/cli.rst && echo "  ok   docs/cli.rst documents it" || { echo "  FAIL docs/cli.rst does not mention flask config"; fail=1; }
echo "\$ flask --app demo_app config"
out=$(cd "$ROOT/scripts/tasks" && "$VENV/flask" --app demo_app config 2>&1); echo "$out" | head -40
echo "$out" | "$VENV/python" -c '
import json,sys
d=json.load(sys.stdin)
bad=[k for k,v in d.items() if any(w in k.upper() for w in ("SECRET","PASSWORD","TOKEN","KEY")) and v!="***"]
leak=[s for s in ("dev-secret-should-not-print","hunter2","tok_live_123","sk_test_abc","lowercase-secret") if s in json.dumps(d)]
ok=d.get("APP_NAME")=="axiom-demo" and d.get("MAX_ITEMS")==25
print("  ok   masked JSON" if not bad and not leak and ok else f"  FAIL unmasked={bad} leaked={leak} normal_ok={ok}")
sys.exit(0 if not bad and not leak and ok else 1)' || fail=1
n=$(git diff --name-only | wc -l | tr -d ' '); u=$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')
echo "files changed: $n modified + $u new"; git status --short
[ $((n+u)) -ge 3 ] && echo "  ok   diff touches >= 3 files" || { echo "  FAIL diff touches < 3 files"; fail=1; }
[ $fail = 0 ] && echo "TASK B: PASS" || echo "TASK B: FAIL"; exit $fail
