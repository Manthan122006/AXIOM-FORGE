# Final Test Matrix

Legend: ✅ passed (real) · 🧪 passed with a labelled simulation · ⏳ blocked on model keys · ❌ failing · — not applicable. Date every cell when re-run.

| Area | Test | How | Last result | Date |
|---|---|---|---|---|
| Build | typecheck, lint, unit, build | `npm run check` | ✅ 155 tests | 17 Nov (Phase 3) |
| VS Code | activation, commands, MCP, TrueForge tool listing | `npm run test:vscode` | ✅ 11/11 | 17 Nov (Phase 3) |
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
| TrueForge | preflight without keys | `scripts/preflight.ts` | ✅ 5 pass, 3 blocked, 7 unverified | 17 Nov |
| UI | no rerender of static rows during streaming | browser measurement (`window.__axiomRenders`) | ✅ | 17 Nov |
| UI | AA contrast, 5 colours × 2 themes | `webview/src/theme.test.ts` | ✅ | 17 Nov |
| UI | 360/420/520 px, focus ring, no overflow, reduced-motion rule | browser preview | ✅ (preview) | 17 Nov |
| UI | live data inside VS Code | F5 with a model | ⏳ | |
| TrueForge | model calls propose_edit; approval pause; args; allow → resume | `scripts/proof.ts` | ⏳ | |
| TrueForge | deny | `proof.ts --deny` | ⏳ | |
| TrueForge | cancel mid-turn | `proof.ts --cancel-after 4` | ⏳ | |
| TrueForge | approved args reach MCP unchanged (grant matches) | proof step 12 | ⏳ | |
| TrueForge | subagent visible in session | Task B | ⏳ | |
| Task A | official verification `False` on **agent** output | `verify-task-a.sh` | ⏳ | |
| Task B | pytest, --help, masked JSON, ≥3 files on **agent** output | `verify-task-b.sh` | ⏳ | |
| Task C | invalid key → fallback → clean before accept | `verify-task-c.sh` | ⏳ | |
| Checker sanity | verify scripts fail on clean tree, pass on a hand-written reference fix | Phase 1 run | ✅ (reference fix = **test of the checker only**) | 17 Nov |
| Clean clone | README steps from scratch on a 2nd Mac | Vivan or Kunjal | ⏳ (needs remote) | |
| Secrets | no keys in history | `git log -p --all \| grep -E 'AIza…|gsk_…|sk-…|ghp_…'` | ✅ 0 matches (gitleaks not installed; re-run before publishing) | 17 Nov |
