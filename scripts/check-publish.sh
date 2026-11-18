#!/usr/bin/env bash
# Run before every push: scans tracked files (including staged) AND all git history for secrets and
# private data. Exits non-zero on any hit. Usage: bash scripts/check-publish.sh
set -u
cd "$(dirname "$0")/.."
fail=0
KEYS='AIza[0-9A-Za-z_-]{30,}|gsk_[0-9A-Za-z]{20,}|sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{30,}|xox[abp]-[0-9A-Za-z-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
# This machine's home folder (each teammate checks their own) and provider organisation ids.
PRIVATE="org_[0-9a-z]{20,}|$(printf '%s' "$HOME" | sed 's/[.[\*^$()+?{|]/\\&/g')/"
check() { # label, pattern, history-severity (FAIL|WARN)
  local hits_tree hits_hist
  hits_tree=$(git grep -nIE "$2" -- . ':!scripts/check-publish.sh' 2>/dev/null | head -5)
  hits_hist=$(git log --all -p -- . ':!scripts/check-publish.sh' | grep -E "^\+" | grep -cE "$2")
  if [ -n "$hits_tree" ]; then
    echo "FAIL  $1 in tracked files:"; echo "$hits_tree" | cut -c1-160; fail=1
  elif [ "$hits_hist" != "0" ] && [ "$3" = FAIL ]; then
    echo "FAIL  $1: $hits_hist line(s) in git history (rewrite history before publishing)"; fail=1
  elif [ "$hits_hist" != "0" ]; then
    echo "WARN  $1: $hits_hist line(s) in git history only (current files are clean)"
  else echo "ok    $1"; fi
}
check "API keys / tokens / private keys" "$KEYS" FAIL
check "provider org ids, this machine's home path" "$PRIVATE" WARN
bad_files=$(git ls-files | grep -E '(^|/)\.env($|\.)|\.pem$|\.p12$|\.sqlite3?$|\.db$|(^|/)node_modules/|^fixtures/|\.vsix$|models\.local\.json$' | grep -v '\.env\.example$')
if [ -n "$bad_files" ]; then echo "FAIL  files that must not be committed:"; echo "$bad_files"; fail=1; else echo "ok    no .env, key, database, node_modules, fixture checkout or local config files tracked"; fi
big=$(git ls-files -z | xargs -0 ls -l 2>/dev/null | awk '$5 > 1000000 {print $5, $9}')
if [ -n "$big" ]; then echo "WARN  files over 1 MB:"; echo "$big"; else echo "ok    no tracked file over 1 MB"; fi
[ $fail = 0 ] && echo "PUBLISH CHECK: PASS" || echo "PUBLISH CHECK: FAIL"
exit $fail
