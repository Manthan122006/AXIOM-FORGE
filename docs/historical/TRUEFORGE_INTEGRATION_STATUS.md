# TrueForge Integration Status

Pinned: **TrueForge server 0.185.1** (`npx -y @truefoundry/trueforge@0.185.1`), **@truefoundry/trueforge-sdk 0.185.0**, **@modelcontextprotocol/sdk 1.32.2**. Last updated 2026-11-18 00:35 IST.

> **18 Nov, with real models:** propose_edit → approval pause → apply → resume, approved run_command (pytest exit 0), deny, cancel, approved-argument matching and ModelShield fallback (real 429 → Groq) are **verified live**. Task A passes on agent output. Found and fixed: deferred tools arrive as TrueForge's `call_tool`. Open: Groq `gpt-oss-20b` fails tool turns (`reasoning_content` 400); Gemini free-tier quotas (20/day, 5/min per model); Task B not yet completed. Full table: `MODEL_KEY_CHECKLIST.md` → "Live results".

## Verified against the live local server (real evidence)

| Behaviour | Result | Evidence |
|---|---|---|
| Server starts in standalone mode, SQLite | ✅ | log banner `TrueForge v0.185.1 · standalone`; db at `~/Library/Application Support/trueforge/db/db.sqlite` |
| **Server listens on IPv6 loopback only** (`[::1]:8790`); `127.0.0.1:8790` refuses | ✅ found + fixed | `lsof` shows `TCP [::1]:8790 (LISTEN)`; extension now probes `localhost`, `[::1]`, `127.0.0.1` (`loopbackCandidates`, unit-tested) |
| Default SSRF guard blocks loopback MCP; `OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]'` allows it (hostname match, port-independent) | ✅ (allow path) | source `trueforge-core/src/core/util/ssrfGuard.ts`; with the allowlist TrueForge reached our server. Negative case (without allowlist) **not re-run**. |
| Register MCP server via `POST/PUT /api/v1/settings/mcp-servers` with `{manifest:{type:"remote",name,url,description}}` | ✅ | `scripts/proof.ts` log: registration OK |
| **TrueForge's own MCP client lists all 7 AXIOM tools** from our server | ✅ | proof log: `tools visible to TrueForge: assemble_context, read_file, search_workspace, find_symbol, related_files, propose_edit, run_command`; also asserted inside a real VS Code by `npm run test:vscode` |
| Agent save validates the model: `422 Unknown model "<x>" — provider not configured` | ✅ | proof log + server log |
| Session create (saved or inline spec) also 422 without a provider | ✅ | server log `createSessionHandler … 422` |
| That 422 message classifies as `bad_config` (ModelShield will not retry it, will fall back) | ✅ | `classifyFailure` unit test pattern `unknown model` |

## Verified against SDK types / source (compile-time), not yet at runtime

| Item | Status |
|---|---|
| `sessions.create / createTurnStream / subscribeToTurn(afterEventId) / createTurnEvents / cancel` signatures | Type-checked against 0.185.0 `.d.mts` |
| Event union `TurnStreamingEvent` (19 variants) handled by `TurnTracker` | Type-checked; unit-tested on **synthetic** streams |
| Delta merge via SDK `mergeEventDelta` (text + tool-call fragments by index) | Uses the SDK function itself |
| Tool name identity from `toolInfo` (`type:"mcp"`, `serverName`, `name`) | From types; real name format in streams **unverified** |
| `require_approval_for_tools` by literal name (`propose_edit`, `run_command`) | From docs; **unverified** at runtime |

## NEEDS VERIFICATION (blocked on a configured model)

Run `npx tsx scripts/proof.ts --model <name>` (allow), `--deny`, and `--cancel-after 6`, then the VS Code flows. Recorded streams land in `tests/fixtures/trueforge-events/recorded/`.

| # | Behaviour | How we'll verify | Status |
|---|---|---|---|
| 1 | A model calls `propose_edit` through TrueForge | proof log shows `model.message` with `toolCalls[].toolInfo.name == "propose_edit"` | BLOCKED (keys) |
| 2 | TrueForge pauses: `tool.approval_required` + `turn.update{paused}` | proof log | BLOCKED |
| 3 | Arguments readable via `sourceEventId` → `model.message.toolCalls[].function.arguments` | proof prints staged hunks | BLOCKED |
| 4 | `user.tool_approval` allow/deny resumes the same turn; MCP call carries exactly the approved args (grant fingerprint matches) | file changes only on allow; deny reason reaches the model | BLOCKED |
| 5 | Turn resumes and ends `turn.done{done}` | proof log | BLOCKED |
| 6 | `sessions.cancel` mid-stream → `turn.done{cancelled, reason:"client-cancelled"}`, no write | `--cancel-after`, then `verify-task-c.sh` | BLOCKED |
| 7 | Workspace consistent after cancel/failure | `git status` clean | BLOCKED |
| 8 | Subagent `thread.created` appears when the agent delegates to `repo-scout` | Task B run + TrueForge session page | BLOCKED |
| 9 | Invalid primary key → `turn.done{error}` text; classified `auth`; fallback session on backup completes | Task C run | BLOCKED |
| 10 | Unreachable custom endpoint → classified `unreachable`, retried with backoff, then fallback | Task C variant | BLOCKED |

## Test fixtures

- `tests/fixtures/trueforge-events/synthetic.ts`: **synthetic** streams typed against the SDK and ordered per TrueForge's documented "Turn 2" sequence. Used for reducer tests and UI development only.
- `webview/src/dev/fixture.json`: preview data; the Context Receipt and hunks are real outputs of our engine on Flask 3.1.3, the agent turn is simulated and the preview says so on screen.
- `tests/fixtures/trueforge-events/recorded/`: will hold real recorded streams (created by `scripts/proof.ts`).

## Context-engineering features used (B4)

| Feature | How | Status |
|---|---|---|
| Subagents | agent instructions delegate repository mapping to a `repo-scout` subagent (`dynamic_sub_agents.enabled: true`) | configured; runtime visibility BLOCKED |
| Deferred tool loading | `preload: false` for the server, `preload_tools` = `assemble_context`, `read_file`, `propose_edit`; the rest load on demand | configured; runtime BLOCKED |
| Compaction | `context_management.compaction` at 60k input tokens | configured; may not trigger on short tasks |
| Code Mode / Skills | not used: they need a sandbox; server log says "Local sandbox fallback is available", not yet investigated | not claimed |
