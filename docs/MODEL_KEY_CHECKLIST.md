# Model Key Checklist: run this the moment keys are added

Prereqs: TrueForge running (`OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1`), `npm run build`, `npm run fixture:flask`, `bash scripts/tasks/reset-fixture.sh`. Never paste keys into chat, terminals that are being recorded, commits or screenshots.

| # | Step | Command / action | Pass when | Record |
|---|---|---|---|---|
| 1 | Provider config in TrueForge | http://localhost:8790 → Settings → Models: add **Google Gemini** (primary) and **custom OpenAI-compatible** `https://api.groq.com/openai/v1` (backup) | both listed | screenshot of Settings with keys hidden |
| 2 | Exact model names | `curl -s http://localhost:8790/api/v1/models` | both models appear; copy their exact `name` | names into `axiomForge.models.primary/backup` |
| 3 | Gemini connectivity (through TrueForge) | TrueForge chat UI: new chat on the Gemini model, ask "reply OK" | reply streams | — |
| 4 | Groq connectivity + **tool calling** | same, on the Groq model, with an agent that has one tool | reply streams and a tool call works | Groq model id that supports tools |
| 5 | Agent saved | `npx tsx scripts/setup-trueforge.ts --model <gemini-name> --mcp-url http://127.0.0.1:7811/mcp` (or the VS Code command) | `registered … agent "axiom-forge"` | agent id |
| 6 | MCP discovery | `curl -s http://localhost:8790/api/v1/mcp-servers/axiom-forge/tools` | 7 tools | — |
| 7 | Real `propose_edit` + approval pause | `npx tsx scripts/proof.ts --model <gemini> --prompt "Use propose_edit to add a one-line comment '# axiom proof' at the top of src/flask/__main__.py"` | log shows `model.message` (tool call) → `tool.approval_required` → `turn.update` paused | recording in `tests/fixtures/trueforge-events/recorded/` |
| 8 | Arguments readable | same log: `[approval] propose_edit {...}` and `[stage] … hunk(s)` | args parsed, diff staged | — |
| 9 | Approve → resume | (the proof allows by default) | `user.tool_approval` → `turn.update` running → `tool.response` "Applied …" → `turn.done{done}`; file changed | `git -C fixtures/flask diff` |
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
