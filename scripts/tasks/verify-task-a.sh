#!/usr/bin/env bash
# Task A verification (official command + regression checks). Exit 0 = PASS.
set -uo pipefail
DIR="${1:-fixtures/flask}"; PY="$DIR/.venv/bin/python"; cd "$DIR" || exit 2
fail=0
check() { local val="$1" want="$2"; got=$(FLASK_DEBUG="$val" "$OLDPWD/$PY" -c "from flask.helpers import get_debug_flag; print(get_debug_flag())" 2>&1); [ "$got" = "$want" ] && echo "  ok   FLASK_DEBUG=$val -> $got" || { echo "  FAIL FLASK_DEBUG=$val -> $got (want $want)"; fail=1; }; }
echo "Official: FLASK_DEBUG=off python -c \"from flask.helpers import get_debug_flag; print(get_debug_flag())\""
FLASK_DEBUG=off "$OLDPWD/$PY" -c "from flask.helpers import get_debug_flag; print(get_debug_flag())"
for v in off OFF Off n N no 0 false FALSE ""; do check "$v" False; done
for v in 1 true yes on y debug; do check "$v" True; done
doc=$("$OLDPWD/$PY" -c "from flask.helpers import get_debug_flag; print(get_debug_flag.__doc__ or '')")
for w in off n; do echo "$doc" | grep -qiE "['\"\`]$w['\"\`]|\b$w\b" && echo "  ok   docstring mentions '$w'" || { echo "  FAIL docstring does not list '$w'"; fail=1; }; done
echo "git status:"; git status --short
[ $fail = 0 ] && echo "TASK A: PASS" || echo "TASK A: FAIL"; exit $fail
