# Final Test Matrix

Legend: ✅ passed (real) · 🧪 passed with a labelled simulation · ⏳ blocked on model keys · ❌ failing · — not applicable. Date every cell when re-run.

| Area | Test | How | Last result | Date |
|---|---|---|---|---|
| Build | typecheck, lint, unit, build | `npm run check` | ✅ 123 tests | 17 Nov |
| VS Code | activation, commands, MCP, TrueForge tool listing | `npm run test:vscode` | ✅ | 17 Nov |
| VS Code | WorkspaceEdit apply + exact undo | same | ✅ | 17 Nov |
| VS Code | native diff tab + per-hunk CodeLens; accept 1 / reject 1 | same (dev-harness proposal, **not model output**) | 🧪 | 17 Nov |
| VS Code | conflict on unsaved user edit | same | ✅ | 17 Nov |
| VS Code | approved MCP apply + Proof of Change | same (**approval simulated in code**) | 🧪 | 17 Nov |
| VS Code | real TrueForge failure → ModelShield exhausted → clean workspace | same | ✅ | 17 Nov |
| Safety | traversal, symlink, secret files | `tests/mcp/pathJail.test.ts` | ✅ | 17 Nov |
| Safety | unapproved propose_edit/run_command refused | `tests/mcp/server.test.ts` | ✅ | 17 Nov |
| Safety | command allowlist, no shell, timeout, cancel kills command | `tests/verification`, `tests/mcp` | ✅ | 17 Nov |
| Context | golden Task A/B retrieval | `tests/context` | ✅ | 17 Nov |
| Context | 13-task eval: in-context recall 0.90, R@5 0.74 | `scripts/eval-retrieval.ts` | ✅ (measured) | 17 Nov |
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
| Secrets | no keys in history | `git log -p \| grep -E 'AIza|gsk_|sk-'` + gitleaks | ⏳ before publishing | |
