# AXIOM Forge — Architecture

> Status: **implemented.** Written as the design on 17 Nov 2026 (verified against the TrueForge 0.185.1 server and `@truefoundry/trueforge-sdk` 0.185.0 source and docs) and corrected on 19 Nov 2026 to match the code. Current test results: [VALIDATION.md](VALIDATION.md).

## 1. The one-paragraph version

TrueForge (running locally via `npx @truefoundry/trueforge@0.185.1`, port 8790) owns the agent loop and every model call. The VS Code extension is a **client**: it creates sessions and streams turns with `@truefoundry/trueforge-sdk`. Inside the extension host we run a **Streamable-HTTP MCP server** on `127.0.0.1:<port>` that exposes the editor to the agent (`read_file`, `search_workspace`, `find_symbol`, `related_files`, `propose_edit`, `run_command`). TrueForge connects to that MCP server as a registered connector. Mutating tools are listed in the agent's `require_approval_for_tools`, so TrueForge **pauses the turn** (`tool.approval_required`) before they run; the extension turns that pause into the SafeChange diff review, and the user's per-hunk decisions decide what the tool actually writes.

```
User ─▶ VS Code extension ──SDK (HTTP + SSE)──▶ TrueForge (local, SQLite)
            ▲   │                                   │  agent loop, model calls,
            │   │ renders events, approvals         │  approvals, subagents,
            │   ▼                                   │  deferred tools, compaction
            │ SafeChange / Proof of Change          ▼
            └──────────── MCP over HTTP ◀──── tool calls (127.0.0.1 only)
                 (MCP server lives in the extension host → has vscode APIs)
```

## 2. Verified TrueForge facts we build on

| Fact | Source | Consequence for us |
|---|---|---|
| Hierarchy Agent → Session → Turn → Event → Delta; `sessions.create`, `sessions.createTurnStream`, `sessions.subscribeToTurn`, `sessions.createTurnEvents`, `sessions.cancel` | SDK `Client.d.mts`, docs `api/overview.mdx` | TrueForge client module wraps exactly these. |
| Streamed events: `turn.created`, `model.message`, `model.message.delta`, `tool.approval_required`, `tool.response`, `turn.update` (`paused`/`running`), `thread.created`/`thread.done`, `thread.context_compaction_*`, `turn.done` (`done`/`cancelled`/`error`) | SDK `TurnStreamingEvent` | Timeline + streaming UI is a pure reducer over these. Use `isEventDelta`/`mergeEventDelta`. |
| Since 0.185.0 a turn **pauses** for approvals; answer with `user.tool_approval` {allow \| deny+reason} on the same turn | `announcements/turn-lifecycle-0-185-0.mdx` | Approval = diff review. Must pin ≥0.185. |
| `sessions.cancel` aborts the model request, **waits for running MCP tool calls to finish**, emits `turn.done` cancelled, idempotent | `api/use-agent.mdx` | Our tools must be short or check their own cancellation token; edits are only applied inside an approved tool call, so a cancel can never leave half-applied hunks (see §5). |
| `require_approval_for_tools` defaults to `["@write","@destructive"]` and **only matches labelled tools** | `create-agent/overview.mdx` | We list `propose_edit` and `run_command` by name **and** annotate them (`readOnlyHint:false`, `destructiveHint`). |
| Remote MCP servers registered via `POST /api/v1/settings/mcp-servers` (`{type:"remote", name, url, description, auth?}`) | OpenAPI, `RemoteMcpServerManifest` | `scripts/setup-trueforge.ts` registers our connector and saves the agent — reproducible from a clean clone. |
| Outbound SSRF guard blocks `127.0.0.0/8`, `localhost`, `.localhost` … unless the **hostname** is in `OUTBOUND_URL_ALLOWED_HOSTS` (JSON array, port-independent) | `trueforge-core/src/core/util/ssrfGuard.ts`, `trueforge/src/config.ts` | Start TrueForge with `OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]'`. Narrow, documented, dev-only. MCP server binds to 127.0.0.1 only. |
| Providers: `google-gemini` catalog provider; `custom` = any OpenAI-compatible endpoint (Groq) | `models.mdx` | Gemini primary, Groq backup, both configured in TrueForge. Extension never sees keys. |
| **No automatic model fallback today** ("Planned: automatic model selection") | `models.mdx` | ModelShield (§6) lives in the extension's orchestration layer and switches the *TrueForge* session's model; still no direct provider calls. |
| Subagents (`create_sub_agent`, `thread.created` events), deferred tool loading (default), compaction, large-response offloading — none need a sandbox. Code Mode and skills **require a sandbox (Daytona, cloud)** | `key-features/*.mdx`, `skills.mdx` | Use **subagents** (repo-scout) + **deferred tool loading** + **compaction**. Do not claim Code Mode / skills. |
| No auth in local mode | `api/quickstart.mdx` | Client uses `baseUrl` only; TrueForge must stay on localhost. |

## 3. Components

| Module | Path | Owner | Responsibility |
|---|---|---|---|
| Extension shell | `src/extension/` | Manthan | activation, commands, keybindings (`cmd+i` / `ctrl+i`), status bar, webview host |
| TrueForge client | `src/trueforge/` | Manthan | session/turn lifecycle, SSE reducer, approvals bridge, cancel, ModelShield |
| MCP server | `src/mcp/` | Toheed | Streamable-HTTP server on 127.0.0.1, tool schemas (zod), path jail, command allowlist |
| Context engine | `src/context/` | Kunjal | index, literal/regex search, BM25, symbol index, Python import graph, test/doc pairing, ranking, budget, Context Receipt |
| SafeChange | `src/safety/` | Toheed (+Manthan) | staging, hunking (`diff` lib), conflict check, per-hunk apply via `WorkspaceEdit`, undo journal |
| Proof of Change | `src/verification/`, `src/extension/controller.ts` | Toheed | run approved commands, exit codes, staleness |
| Webview | `webview/` (React + Vite) | Vivan | all panels; consumes `AxiomState` only |
| Contracts | `src/shared/contracts.ts` | everyone, Manthan merges | the only shapes crossing module boundaries |

## 4. MCP tool surface

| Tool | Annotation | Approval | Notes |
|---|---|---|---|
| `read_file(path, startLine?, endLine?)` | readOnly | no | jailed to workspace; refuses `.env*`, keys, >256 KB without range |
| `search_workspace(query, glob?, regex?, max_results?)` | readOnly | no | case-insensitive literal or regex search over the indexed workspace text files |
| `find_symbol(name)` | readOnly | no | definitions + references from the symbol index |
| `related_files(path)` | readOnly | no | imports, importers, paired tests, paired docs, with reasons |
| `assemble_context(task, mentions?)` | readOnly | no | runs the ranked retrieval, returns a budgeted bundle **and emits the Context Receipt** to the UI |
| `propose_edit(path, edits[] \| new_content, rationale)` | write | **yes, by name** | validated + staged *before* the approval pause; on allow, applies only accepted hunks |
| `run_command(command, cwd?)` | destructive | **yes, by name** | allowlist: `python`/`python3`, `pytest`, `flask`, `node`, read-only `git` (`status`, `diff`, `log`, `show`, `ls-files`), `npm test`/`npm run`, `npx vitest`/`tsc`/`eslint`; no shell operators; timeout; output capped & secret-scrubbed |

Deferred loading stays on for the other tools; `assemble_context`, `read_file`, `propose_edit` and `run_command` are in `preload_tools` (`agents/axiom-agent.json`) so the model always sees them.

## 5. SafeChange: how approval drives the diff

1. Model emits `model.message` with one or more `propose_edit` tool calls → TrueForge emits `tool.approval_required` and `turn.update{paused}`.
2. The extension looks up each call's arguments by `source_event_id` and stages **all calls of the pause together** (`stageProposeEdits`): paths are validated (jail); each call's new text is computed against the **current document text** (open buffer if dirty, else disk) and `baseHash` is recorded. Several calls on the **same file** are merged line by line into one proposal (`src/safety/merge.ts`). An overlapping or adjacent edit is refused with a reason, and an identical edit is applied once.
3. Webview + native `vscode.diff` (virtual `axiom-proposed:` URI) show one diff per file. The user accepts/rejects each hunk.
4. Decisions go to TrueForge as `user.tool_approval`: ≥1 hunk accepted → `allow` plus a single-use grant per call; 0 accepted → `deny` with reason. Everything approved in this review becomes **one change set**.
5. TrueForge then calls the tool. The **first** approved call applies the whole change set (`SafeChange.applyChangeSet`); the others report its recorded result:

```
validate ALL files ──any conflict──▶ write nothing, every proposal "failed/conflict", reason to the model
      │ all ok
write file 1 … file n (re-check each hash just before its write)
      │ write k fails
      ▼
restore k-1 … 1 (pre-image / delete created file) → read back → report "Restored …" or "ROLLBACK FAILED for …"
```
6. Nothing touches disk before step 5. Cancel during review → `sessions.cancel` + staged proposals discarded, grants revoked. Undo restores a file's pre-image after checking it still matches the post-image. The set is **not crash-atomic** (see KNOWN_LIMITATIONS).

## 6. ModelShield (fallback)

TrueForge has no built-in fallback, so the extension orchestrates it **through TrueForge**:

1. Turn ends `turn.done{state.status:"error"}` (or the stream throws / times out with no event for N s).
2. Classify `state.message` / HTTP error → `auth | unreachable | rate_limit | server | timeout | bad_config | cancelled | tool_error`.
3. Transient (`rate_limit`, `server`, `timeout`, `unreachable`) → retry on the primary up to 2× with exponential backoff (1 s base, 6 s cap, jitter); a provider's own retry hint is honoured when it is 30 s or less, and a longer one goes straight to fallback. `auth`/`bad_config` → no retry.
4. Still failing and a backup is configured → create a **new TrueForge session** with the same agent manifest but `model.name = backup`, send the same prompt. Pending proposals from the failed turn are **discarded, never replayed**; nothing was written because writes only happen inside approved calls.
5. UI shows each step truthfully (primary failed → retrying 1/2 → switched to `groq/...`).

Backup selection is data (`axiomForge.models.primary/backup` settings → TrueForge model names), so the organisers can swap models without code changes.

## 7. Context strategy (summary; benchmark in [RETRIEVAL_EVAL.md](RETRIEVAL_EVAL.md))

Hybrid, local, explainable (`src/context/assemble.ts`). Signals: explicit `@file`/`@symbol` and the editor selection (hard includes); **BM25** keyword relevance; file- and folder-name matches (stemmed, counted once per name part); definitions of **code identifiers** named in the task (strong) or of plain words (weak); one-hop Python imports; test/doc pairing **in both directions**, scaled by the evidence of the file it comes from. Score → rank → **budget**: default 24k tokens (≈ chars/4), per-file cap 6k (3k for tests/docs); over-cap files go in as outline + focused line windows. The Context Receipt lists included files with reasons, excluded candidates with reasons, and the budget used. Measured on a 33-task Flask benchmark with an ablation (`RETRIEVAL_EVAL.md`). The model also runs a **repo-scout subagent** (agent definition), whose `thread.created` shows in the TrueForge session.

## 7b. Performance design
The MCP server is stateless over HTTP but **pooled** (built once, reconnected per request); the webview receives **patches** (changed slices and changed timeline rows only); the stream reducer marks dirty rows; index re-derivation after a write is lazy. Every heavy synchronous step is a `perf.span`, and the stall detector names the spans that overlapped a stall. See `PERFORMANCE.md`.

## 8. Versions (pin, do not float)

| Thing | Version | Verified |
|---|---|---|
| Node | ≥ 22.14 (dev machine has 24.18.0) | yes |
| `@truefoundry/trueforge` | 0.185.1 | npm `latest` on 2026-11-17 |
| `@truefoundry/trueforge-sdk` | 0.185.0 | npm `latest` on 2026-11-17 |
| `@modelcontextprotocol/sdk` | 1.32.2 | npm `latest` on 2026-11-17 |
| Python (Flask tasks) | 3.13.9 available | yes |
