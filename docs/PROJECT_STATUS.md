# AXIOM Forge — Project Status

_Last updated: Tue 17 Nov 2026, Phase 3. Repo: local git, `main` + 4 feature branches (no teammate commits yet). No remote yet._

> **Phase 3 (current):** `npm run check` → **155 tests pass**; `npm run test:vscode` → **11/11** in real VS Code (adds same-file merge + multi-file change set + buffer/disk rollback). Retrieval on a 33-task benchmark: **25/33** tasks fully in top 5 (was 18/33), in-context recall 0.94; **on 8 fresh tasks: 5/8, no gain** (`RETRIEVAL_EVAL.md`). Stall investigation with CPU profiles: the largest stalls are VS Code's own; AXIOM's repeated work fixed (`PERFORMANCE.md`). Preflight without keys: 5 pass, 3 blocked on keys, 7 model steps unverified.
>
> **Phase 2:** see `PHASE_2_AUDIT.md`. The feature table below is from Phase 2 except where marked.

## Summary
All model-independent parts are implemented and tested: MCP server and tools, workspace safety, SafeChange, context engine with Context Receipt, TrueForge client/reducer/ModelShield, extension host, webview UI, and the Task A/B/C verification scripts. Every **model-driven** behaviour is **BLOCKED** until model keys are entered in TrueForge; those are listed with exact verification steps in `TRUEFORGE_INTEGRATION_STATUS.md`.

## Feature status

| Feature | Status | Evidence |
|---|---|---|
| Build / typecheck / lint / unit tests | COMPLETE | `npm run check` exit 0: tsc clean (ext + webview), eslint clean, **106 tests pass**, esbuild + vite build |
| Extension runs in real VS Code | COMPLETE (smoke) | `npm run test:vscode` on installed VS Code 1.125.1: **6/6 pass** (activation, commands, MCP on 127.0.0.1, TrueForge lists our tools, WorkspaceEdit apply + exact undo, unapproved edit refused, inline edit w/o selection) |
| MCP server (7 tools, Streamable HTTP, 127.0.0.1) | COMPLETE | `tests/mcp/server.test.ts` (real MCP client over HTTP, 12 tests); TrueForge lists all 7 tools (live) |
| Path jail / secret files / traversal / symlink escape | COMPLETE | `tests/mcp/pathJail.test.ts` (20 cases) |
| Approval enforcement (no write without the user's grant) | COMPLETE (extension side) | MCP + VS Code tests: `propose_edit`/`run_command` refuse without a single-use grant |
| Command execution safety (allowlist, no shell, timeout, abort, scrub) | COMPLETE | `tests/verification/commandRunner.test.ts` (27 tests) |
| SafeChange (stage, per-hunk, conflict, apply, undo, discard on cancel) | COMPLETE | `tests/safety/safeChange.test.ts` (18 tests) + VS Code integration test |
| Native diff + per-hunk CodeLens in the editor | COMPLETE (programmatic) / NEEDS VERIFICATION (human visual, model output) | VS Code test: diff tab opens with our schemes; VS Code renders Accept/Reject per hunk; clicking them writes only the accepted hunk. Dev harness (`axiomForge.devTools`) lets anyone inspect it by hand without a model |
| Context engine + Context Receipt | COMPLETE | `tests/context/flaskGolden.test.ts` (9 tests on Flask 3.1.3): Task B prompt puts `cli.py`, `test_cli.py`, `docs/cli.rst` in the top 5; budget respected; reasons for every item; ~285k-token repo → 24k budget in ~50 ms |
| `@file` / `@symbol` mentions | COMPLETE (engine) / NEEDS VERIFICATION (UI with live host) | golden test; composer popup tested in browser preview |
| TrueForge client: sessions, streaming, approvals, subscribe, cancel | NEEDS VERIFICATION | type-checked against SDK 0.185.0; reducer tested on synthetic streams; live: health + 422 path verified |
| Loopback/IPv6 connection fix | COMPLETE | found TrueForge on `[::1]` only; probing fix unit-tested; VS Code test now connects |
| ModelShield (classify, retry/backoff, fallback, no unsafe replay) | COMPLETE (logic) / BLOCKED (live) | `tests/trueforge/reducer.test.ts` shield cases; live fallback needs two providers |
| Inline edit (Task A) | BLOCKED | flow implemented (`inlineEdit` → TrueForge → staged diff); needs a model |
| Agent mode (Task B) | BLOCKED | implemented; needs a model |
| Resilience (Task C) | BLOCKED | implemented; needs a provider with an invalid key + a backup |
| Webview UI | COMPLETE (preview) / NEEDS VERIFICATION (inside VS Code with live data) | screenshots at 360/420/520 px, dark + light, review/fallback/offline states; per-hunk flow clicked through |
| Agent definition | COMPLETE (file) / BLOCKED (saved in TrueForge) | `agents/axiom-agent.json`; TrueForge rejects saving until a provider exists (422) |
| Task A/B/C verification scripts | COMPLETE | on clean fixture: A FAIL, B FAIL, C PASS (correct); with a hand-written reference fix: A PASS, B PASS (pytest 59 passed, masked JSON, ≥3 files); reset → 0 changed files |
| README / LICENSE / example config | COMPLETE (draft) | `README.md`, `LICENSE` (MIT), `config/models.example.json`, `.env.example` |
| Event-loop responsiveness (A3) | NEEDS VERIFICATION | webview rerender bug fixed + measured; activation 0.7 s; extension-host p99 64–78 ms, max ~1.4 s spike still unattributed |
| Video, write-up, public repo | NOT STARTED | after live runs |

## Blockers
1. **Model keys** (Manthan, planned): add Gemini + Groq in TrueForge Settings → Models. Unblocks 10 runtime checks, Tasks A/B/C, and saving the agent.
2. GitHub remote (deferred by decision): needed before Friday.

## Next exact actions
1. Manthan: add keys → `npx tsx scripts/proof.ts --model <name>` (+ `--deny`, `--cancel-after 6`) → commit recorded streams.
2. Manthan: F5 → Task A, then `verify-task-a.sh`; Task B → `verify-task-b.sh`; Task C → `verify-task-c.sh`.
3. Team: task packets in `TEAM_ASSIGNMENTS.md`.
