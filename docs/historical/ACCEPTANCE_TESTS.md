# AXIOM Forge — Acceptance Tests

Each run records: date, git SHA of axiom-forge, TrueForge version, model(s), and the evidence listed. **No row is "pass" without evidence.**

## Fixed tasks (exact wording from the official PDF; do not edit)

Fixture: `pallets/flask` tag `3.1.3` (commit `22d92470`), clean tree (`git status` empty) before each run.

### AT-A Inline edit
1. Open `src/flask/helpers.py`, select `get_debug_flag`, press `cmd+i`.
2. Instruction: `Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.`
3. Expect: streamed status → diff in editor → per-hunk accept/reject visible → accept.
4. Verify: `FLASK_DEBUG=off python -c "from flask.helpers import get_debug_flag; print(get_debug_flag())"` prints `False`. Also check `FLASK_DEBUG=N`, `FLASK_DEBUG=1` → `True` (regression).
5. Undo check: press Undo in the review panel → `git status` clean again.

| Run | Date | Model | Diff shown | Per-hunk | Output | Undo | Evidence |
|---|---|---|---|---|---|---|---|

### AT-B Agent mode
1. Agent panel, no files named: `Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as "***". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.`
2. Expect: Context Receipt lists the files it chose and why; repo-scout subagent visible; ≥3 files proposed; hunks reviewed and accepted; TrueForge session page shows the turns and tool calls.
3. Verify: `pytest tests/test_cli.py -q` passes; `flask --help` lists `config`; `FLASK_APP=<demo app with SECRET_KEY + API_TOKEN> flask config` prints JSON with `***`.

| Run | Date | Model | Files discovered | Files changed | pytest | --help | masked JSON | TF session id | Evidence |
|---|---|---|---|---|---|---|---|---|---|

### AT-C Resilience
1. Variant C1 (minimum): primary model provider key set to an invalid value, no backup → repeat AT-A → clear error within 30 s, editor responsive, `git status` clean.
2. Variant C2 (target): invalid primary key + backup configured → repeat AT-A → UI shows failure → retry/switch → backup completes → diff → accept → verification prints `False`. Before accepting, `git status` clean.
3. Variant C3: unreachable endpoint (custom provider pointing at `http://127.0.0.2:9/v1`) → same expectations.

| Run | Variant | Date | Time to message | Fallback model | git status before accept | Evidence |
|---|---|---|---|---|---|---|

## Capability tests

| ID | Test | Pass criterion |
|---|---|---|
| CT-1 | Cancel during streaming text | stream stops < 1 s, `turn.done` cancelled, no proposals left staged |
| CT-2 | Cancel while a proposal awaits review | proposal → `discarded`, file untouched |
| CT-3 | Cancel during a multi-file run after 1 of 3 files applied | applied file is whole (not partial); undo available; others untouched |
| CT-4 | Reject all hunks | `deny` sent with reason; no write; model acknowledges |
| CT-5 | Accept 1 of 2 hunks | only that hunk on disk |
| CT-6 | Edit file manually between proposal and approval | conflict state, no write |
| CT-7 | Undo after apply | file byte-identical to pre-image |
| CT-8 | `@file` and `@symbol` mentions | appear in receipt as `explicit_mention` |
| CT-9 | Editor responsiveness during a long turn | typing/scrolling unaffected (manual + `extensionHost` CPU check) |
| CT-10 | TrueForge server stopped | header shows disconnected; send disabled with message; no hang |

## Security tests (automated, `tests/mcp`)

| ID | Test |
|---|---|
| ST-1 | `read_file("../../etc/passwd")`, URL-encoded, absolute, and symlink escape → rejected |
| ST-2 | `read_file(".env")`, `*.pem`, `.git/config` → rejected |
| ST-3 | `run_command("rm -rf /")`, `curl ...`, `bash -c` → rejected (not in allowlist) |
| ST-4 | `run_command("pytest")` exceeding timeout → killed, `timed_out` |
| ST-5 | `propose_edit` handler invoked without recorded approval → no write |
| ST-6 | MCP server bound to 127.0.0.1 only (connection from LAN IP refused) |
| ST-7 | Repo history secret scan (`gitleaks` or regex) clean before going public |
