# Final Test Matrix

Legend: ✅ passed (real) · 🧪 passed with a labelled simulation · ⏳ blocked on model keys · ❌ failing · — not applicable. Date every cell when re-run.

| Area | Test | How | Last result | Date |
|---|---|---|---|---|
| Build | typecheck, lint, unit, build | `npm run check` | ✅ 177 tests | 18 Nov |
| VS Code | activation, commands, MCP, TrueForge tool listing | `npm run test:vscode` | ✅ 11/11 (+2 opt-in live tests) | 18 Nov |
| VS Code | WorkspaceEdit apply + exact undo | same | ✅ | 17 Nov |
| VS Code | native diff tab + per-hunk CodeLens; accept 1 / reject 1 | same (dev-harness proposal, **not model output**) | 🧪 | 17 Nov |
| VS Code | conflict on unsaved user edit | same | ✅ | 17 Nov |
| VS Code | approved MCP apply + Proof of Change | same (**approval simulated in code**) | 🧪 | 17 Nov |
| VS Code | real TrueForge failure → ModelShield exhausted → clean workspace | same | ✅ | 17 Nov |
| Safety | traversal, symlink, secret files | `tests/mcp/pathJail.test.ts` | ✅ | 17 Nov |
| Safety | unapproved propose_edit/run_command refused | `tests/mcp/server.test.ts` | ✅ | 17 Nov |
| Safety | command allowlist, no shell, timeout, cancel kills command | `tests/verification`, `tests/mcp` | ✅ | 17 Nov |
| Context | golden Task A/B retrieval | `tests/context` | ✅ | 17 Nov |
| Context | 33-task eval: 25/33 fully in top 5, R@5 0.84, R@10 0.94, in-context 0.94 | `scripts/eval-retrieval.ts` | ✅ measured; **target ≥80% not met** (76% overall, 5/8 on fresh tasks) | 17 Nov |
| Context | benchmark floor (≥25/33, in-context ≥0.93) | `tests/context/flaskGolden.test.ts` | ✅ | 17 Nov |
| SafeChange | two edits to one file in one pause → one merged diff; overlap/adjacent refused | `tests/safety/changeSet.test.ts` | ✅ | 17 Nov |
| SafeChange | multi-file change set: validate all first; write failure → rollback; rollback failure reported | same + real VS Code test (buffer and disk restored) | ✅ (failure **injected**) | 17 Nov |
| SafeChange | merged + change set through real MCP protocol | `tests/mcp/server.test.ts` (**approval simulated**) | 🧪 | 17 Nov |
| SafeChange | merged edits produced by a **real model** | checklist 9b | ⏳ | |
| Perf | stall attribution (CPU profile, owner split) | `AXIOM_PROFILE=… npm run test:vscode` + `scripts/analyze-cpuprofile.mjs` | ✅ largest stalls are VS Code's own | 17 Nov |
| Perf | MCP server pooling; patch posts; dirty-row sync | `scripts/bench-*.ts`, `[perf]` report in `test:vscode` | ✅ | 17 Nov |
| Perf | live Task B with `axiomForge.perfLog` | Show Performance Report | ⏳ | |
| TrueForge | preflight with keys (both agent definitions) | `scripts/preflight.ts` | ✅ no failures, nothing blocked | 18 Nov |
| Task C | invalid-key primary → immediate switch, no retries | `AXIOM_LIVE_EXPECT_AUTH=1` live test (`TASK_C_RECORDING.md`) | ⏳ needs the `gemini-broken` provider (user step) | |
| UI | no rerender of static rows during streaming | browser measurement (`window.__axiomRenders`) | ✅ | 17 Nov |
| UI | AA contrast, 5 colours × 2 themes | `webview/src/theme.test.ts` | ✅ | 17 Nov |
| UI | 360/420/520 px, focus ring, no overflow, reduced-motion rule | browser preview | ✅ (preview) | 17 Nov |
| UI | live data inside VS Code | F5 with a model | ⏳ | |
| TrueForge | model calls propose_edit; approval pause; args; allow → resume | `scripts/proof.ts` (Gemini) | ✅ real | 18 Nov |
| TrueForge | deny | `proof.ts --deny` | ✅ real, 0 files changed | 18 Nov |
| TrueForge | cancel mid-turn | `proof.ts --cancel-after 6` | ✅ real, 0 files changed | 18 Nov |
| TrueForge | approved args reach MCP unchanged (grant matches) | proof step 12 | ✅ real (propose_edit + run_command, after the call_tool fix) | 18 Nov |
| TrueForge | recorded real streams replayed | `tests/trueforge/recorded.test.ts` | ✅ 6 tests | 18 Nov |
| TrueForge | subagent visible in session | Task B | ⏳ | |
| Task A | official verification `False` on **agent** output | `verify-task-a.sh` | ✅ PASS (via proof.ts; ⌘I UI ⏳) | 18 Nov |
| Task B | pytest, --help, masked JSON, ≥3 files on **agent** output | `verify-task-b.sh` | ❌ attempt on gemini-3-1-flash-lite (paced): 4/5 checks ok, pytest 59 passed, **masking case-sensitive → FAIL** (`docs/evidence/taskB-agent-attempt-*`). Re-run after 13:30 IST on gemini-3-5-flash | 18 Nov |
| Task C | primary failure → fallback → backup edit accepted and applied | live `test:vscode` (`AXIOM_LIVE_TASKC=1`) | ✅ 3/3 clean with the compact inline profile (real 429 → Groq qwen → edit applied → done) | 18 Nov |
| Checker sanity | verify scripts fail on clean tree, pass on a hand-written reference fix | Phase 1 run | ✅ (reference fix = **test of the checker only**) | 17 Nov |
| Clean clone | `git clone` + `npm ci` + `npm run check` | local clone in a scratch folder | ✅ 168 passed, 10 skipped (Flask fixture not fetched) after fixing `.gitignore` (tests/fixtures was untracked) | 18 Nov |
| Clean clone | README steps on a 2nd Mac incl. F5 | Vivan or Kunjal | ⏳ (needs remote) | |
| Secrets | keys, private keys, org ids, home path in files + history | `bash scripts/check-publish.sh` | ✅ PASS (1 WARN: local username in one old evidence log in history) | 18 Nov |
