# Model Key Checklist: run this the moment keys are added

Prereqs: TrueForge running (`OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1`), `npm run build`, `npm run fixture:flask`, `bash scripts/tasks/reset-fixture.sh`. Never paste keys into chat, terminals that are being recorded, commits or screenshots.

| # | Step | Command / action | Pass when | Record |
|---|---|---|---|---|
| 0 | Preflight (no keys needed) | `npx tsx scripts/preflight.ts` (after keys: add `--primary <name> --backup <name>`) | no FAIL rows; after keys, no BLOCKED rows | paste the table into `TRUEFORGE_INTEGRATION_STATUS.md` |
| 1 | Provider config in TrueForge | http://localhost:8790 → Settings → Models: add **Google Gemini** (primary) and **custom OpenAI-compatible** `https://api.groq.com/openai/v1` (backup) | both listed | screenshot of Settings with keys hidden |
| 2 | Exact model names | `curl -s http://localhost:8790/api/v1/models` | both models appear; copy their exact `name` | names into `axiomForge.models.primary/backup` |
| 3 | Gemini connectivity (through TrueForge) | TrueForge chat UI: new chat on the Gemini model, ask "reply OK" | reply streams | — |
| 4 | Groq connectivity + **tool calling** | same, on the Groq model, with an agent that has one tool | reply streams and a tool call works | Groq model id that supports tools |
| 5 | Agent saved | `npx tsx scripts/setup-trueforge.ts --model <gemini-name> --mcp-url http://127.0.0.1:7811/mcp` (or the VS Code command) | `registered … agent "axiom-forge"` | agent id |
| 6 | MCP discovery | `curl -s http://localhost:8790/api/v1/mcp-servers/axiom-forge/tools` | 7 tools | — |
| 7 | Real `propose_edit` + approval pause | `npx tsx scripts/proof.ts --model <gemini> --prompt "Use propose_edit to add a one-line comment '# axiom proof' at the top of src/flask/__main__.py"` | log shows `model.message` (tool call) → `tool.approval_required` → `turn.update` paused | recording in `tests/fixtures/trueforge-events/recorded/` |
| 8 | Arguments readable | same log: `[approval] propose_edit {...}` and `[stage] … hunk(s)` | args parsed, diff staged | — |
| 9 | Approve → resume | (the proof allows by default) | `user.tool_approval` → `turn.update` running → `tool.response` "Applied …" → `turn.done{done}`; file changed | `git -C fixtures/flask diff` |
| 9b | Same-file / multi-file (Phase 3) | Task B run: watch the Output channel when the model proposes several edits in one pause | two edits to one file show as **one** diff ("combines N edits"); all files apply together; the tool responses say "merged" / "applied together" | Output channel log |
| 10 | Deny | `bash scripts/tasks/reset-fixture.sh`, then step 7 with `--deny` | `tool.response` carries the denial; file unchanged; model acknowledges | `verify-task-c.sh` clean |
| 11 | Cancel | step 7 with `--cancel-after 4` | `turn.done{cancelled, reason: client-cancelled}`; file unchanged | `verify-task-c.sh` clean |
| 12 | Fingerprint match | in step 9, the MCP tool **applied** (no "Not applied: … not approved") | proves TrueForge passes the approved args unchanged | if it fails: record TrueForge's arg transform, fix `normalizeGatedArgs` |
| 13 | Primary failure | Settings → Models: change the Gemini key to an invalid value; F5 → Task A | ModelShield shows *failed (auth)* → *switching* → *Running on backup*; diff appears from Groq | screenshot of banner; Output channel log |
| 14 | Groq fallback works | accept the diff → `bash scripts/tasks/verify-task-a.sh` | `False` | — |
| 15 | Workspace integrity | before accepting in 13: `bash scripts/tasks/verify-task-c.sh` | clean | — |
| 16 | No-backup variant | clear `axiomForge.models.backup`, repeat 13 | clear error < 30 s; `verify-task-c.sh` clean | — |
| 17 | Restore | put the real Gemini key back | — | — |

## How errors are distinguished (`src/trueforge/classify.ts`)

| Class | Typical source | Signals | Retry? | Fallback? |
|---|---|---|---|---|
| `auth` | provider via `turn.done{error}` | 401/403, "API key not valid", "invalid api key", "permission denied" | no | **yes** |
| `rate_limit` | provider | 429, "quota", "RESOURCE_EXHAUSTED", "rate limit" | yes, ×2 backoff 1 s/2 s ±20 % | yes |
| `server` (outage) | provider | 5xx, "service unavailable", "overloaded", "bad gateway" | yes | yes |
| `timeout` | provider or our watchdog | "timed out", `ETIMEDOUT`, headers timeout; watchdog after 120 s of silence **with no tool in flight** | yes | yes |
| `unreachable` (network) | provider endpoint | `ECONNREFUSED`, `ENOTFOUND`, "fetch failed", "Outbound URL blocked" | yes | yes |
| `bad_config` | TrueForge 422 / provider 404 | "Unknown model", "provider not configured", "model not found" | no | yes |
| `trueforge_error` | **TrueForge itself** | TrueForge health check fails after a thrown error; 400/409/422 for non-model reasons | no | **no** (switching models can't help) |
| `cancelled` | user | AbortError, "cancel" | never | never |
| `tool_error` | our tools | tool failure text | no | no |

**No blind replay.** Fallback opens a *fresh* TrueForge session with the original request. Staged but unapproved proposals are discarded and grants revoked. If any approved write or command already ran in the failed attempt, ModelShield stops (`side_effects`) and tells the user, instead of re-running the request.

Caveat: provider error *texts* come through TrueForge and are matched by pattern. Steps 13 and 16 are where we confirm the real wording; add any new pattern with a unit test.

## Live results (18 Nov 2026, 00:15–00:30 IST; TrueForge 0.185.1; recordings in `tests/fixtures/trueforge-events/recorded/`, replayed by `tests/trueforge/recorded.test.ts`)

| Step | Result | Evidence |
|---|---|---|
| 0 Preflight | ✅ no FAIL/BLOCKED with `--primary google-gemini/gemini-3-5-flash --backup groq/gpt-oss-20b` | `docs/evidence/preflight-with-keys.txt` |
| 1–2 Providers / names | ✅ 13 Gemini models + `groq/gpt-oss-20b` | `/api/v1/models` |
| 3 Gemini through TrueForge | ✅ (after one transient `Headers Timeout`) | `gemini-readonly-assemble-context.json`, `gemini-headers-timeout.json` |
| 4 Groq + tool calling | ⚠️ **first tool call works, the next request fails 400**: TrueForge echoes `reasoning_content` and Groq rejects it for `gpt-oss-20b` | `groq-reasoning-content-400.json` |
| 5–6 Agent saved, 7 tools | ✅ | proof log `[setup]`, `[trueforge→mcp]` |
| 7–9 propose_edit → pause → approve → applied → resume | ✅ file changed, turn `done` | `gemini-allow-edit-and-pytest.json` |
| 9b merged same-file edits from a real model | ⏳ not observed yet (the model made one edit per file) | |
| 10 Deny | ✅ reason reaches the model, 0 files changed | `gemini-lite-deny.json` |
| 11 Cancel | ✅ `turn.done{cancelled, client-cancelled}`, 0 files changed | `gemini-lite-cancel.json` |
| 12 Approved args reach MCP unchanged | ✅ for `propose_edit` and `run_command` (grant matched, applied/ran) | same allow recording |
| — Deferred tool via `call_tool` | 🐞 found and fixed: an approved deferred `run_command` was refused (no grant matched). Now unwrapped; `run_command` also preloaded | `gemini-allow-edit-deferred-run-command-before-fix.json` |
| 13–15 Fallback | ✅ **in real VS Code**: primary `gemini-3-5-flash` (real 429) → retry 1/2 → retry 2/2 → backup `groq/gpt-oss-20b` on a fresh session → `done`, workspace unchanged, 23.7 s. Only a no-tool prompt: a tool-using turn on this Groq model fails (step 4) | `AXIOM_LIVE_PRIMARY=… AXIOM_LIVE_BACKUP=… npm run test:vscode` |
| 16 No-backup variant | covered by the earlier real-TrueForge test (exhausted, clean) | `test:vscode` B/I/J |
| Task A on agent output | ✅ `verify-task-a.sh` PASS (gemini-3-5-flash-lite, via `proof.ts`, not yet via the ⌘I UI) | `gemini-lite-task-a.json` |
| Task B on agent output | ⏳ **not run to completion**: `gemini-3-6-flash` daily quota already used, `gemini-3-7-flash` timed out | |

**Free-tier limits measured (Google error payload):** 20 requests/day and 5 requests/minute **per model**. One agent turn uses one request per step: the allow+pytest run used ~6, so Task B (~10–15 steps) may not fit in a single model's daily quota, and 5/minute can end a long turn early (`gemini-429-mid-turn.json`).

### Backup retest (18 Nov, ~00:40 IST) with `groq/qwen-3-8-27b`
| Check | Result |
|---|---|
| Tool-using turn on Groq qwen | ⚠️ **works sometimes**: 1 of 4 runs got through edit → approval → applied; 2 runs failed with Groq `tool_use_failed` (the model emitted `read_file` without `path`); others hit the rate limit |
| Groq free-tier limit | **7,000 input tokens/minute** for this model; one agent request is ~3k tokens (system + 7 tool schemas + history), so only ~2 requests fit per minute |
| ModelShield changes from these runs | `tool_use_failed` is now `model_output` (retryable, not `tool_error`); provider retry hints are respected ("try again in 4.5s" → wait 4.75 s; a hint > 30 s skips retries and switches model at once) |
| **Task C shape in real VS Code** (`AXIOM_LIVE_TASKC=1`) | ✅ primary 429 → retries → backup qwen → **inline edit proposed, accepted, applied** (`return False`) in 41 s; then the backup's final summary request hit the 7k/min limit, the run ended with an error and **was not replayed** because an approved write had happened (correct). On camera this ends with a red banner after a correct change |

### Compact inline profile (18 Nov, ~01:00 IST)
Inline edits (Tasks A and C) now use `agents/axiom-agent-inline.json`: only `read_file` + `propose_edit` (preloaded, edit approval-gated), no subagents, 699-character instructions, iteration limit 8. Agent mode keeps `agents/axiom-agent.json`.

| Measure | Full agent | Inline agent |
|---|---|---|
| Input tokens of one request (TrueForge `turn.done` metrics, Groq qwen, no-tool turn; `scripts/measure-request.ts`) | 2,802 | **1,114** (−60%) |
| Live Task-C-shaped run in real VS Code (primary `gemini-3-5-flash` real 429 → backup `groq/qwen-3-8-27b`) | 1 of 3 tries got the edit applied, then hit the 7k tokens/min limit | **3 of 3 clean**: edit proposed, accepted, applied, `turn.done{done}`, banner "Backup model … completed the request" (71 s, 29 s, 36 s; runs 60 s apart) |

### 18 Nov morning (09:00–09:45 IST)
**Quota probe** (one cheap request per model): available: `gemini-3-1-flash-lite`, `gemini-3-5-flash-lite`, `gemini-flash-lite-latest`; 503 high demand: `gemini-3-6/3-7/3-8-flash`, `gemini-flash-latest`; 429: `gemini-3-5-flash` (daily, used yesterday), `gemini-3-1-pro-preview`, `gemini-4-argon/carbon` (no usable free quota). **Daily free quotas reset at midnight Pacific = 13:30 IST.**

| Task B attempt | Result |
|---|---|
| `gemini-3-1-flash-lite`, no pacing | 429 after 33 s: **250k input tokens/minute** (10 requests, two 24k receipts in history) |
| `gemini-flash-lite-latest`, pacing 13 s | 100 s; edit loop on `tests/test_cli.py` (model invented a line 3×) → TPM 429 again |
| `gemini-3-1-flash-lite`, pacing 16 s, 16k receipt | 7.3 min; changed `cli.py`, `test_cli.py`, `docs/cli.rst`; fixed its own failing test; `pytest tests/test_cli.py` **59 passed**; `verify-task-b.sh`: --help ✅, test ✅, docs ✅, ≥3 files ✅, **masking ❌** (case-sensitive: `session_secret_value` leaked). Turn ended on TPM 429 before its summary. **Not counted as a Task B pass.** |

Changes from these runs: opt-in step pacing (`axiomForge.pacing.minSecondsBetweenSteps`, `proof.ts --pace`), `proof.ts --budget`, and an actionable "old_text not found" message that shows where the first lines match and the real text there.

**Next Task B attempt:** after 13:30 IST, on `gemini-3-5-flash` (stronger, fresh 20/day):
```bash
bash scripts/tasks/reset-fixture.sh
npx tsx scripts/proof.ts --model google-gemini/gemini-3-5-flash --pace 16 --budget 16000 --prompt "<Task B instruction>"
bash scripts/tasks/verify-task-b.sh
```
**Invalid-key fallback:** prepared, not run (needs the `gemini-broken` provider; see `TASK_C_RECORDING.md`).
