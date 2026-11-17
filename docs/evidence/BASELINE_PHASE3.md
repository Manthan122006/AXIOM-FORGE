# Phase 3 baseline (2026-11-17 23:11 IST)

- HEAD: `9695502` on main; working tree: 1 changed files
- Feature branches (all at HEAD, 0 commits ahead of main, no teammate commits):
    feat/context-engine   9695502 docs: Phase 2 audit, retrieval eval, team progress, demo and submission plans
    feat/mcp-tools        9695502 docs: Phase 2 audit, retrieval eval, team progress, demo and submission plans
    feat/trueforge-client 9695502 docs: Phase 2 audit, retrieval eval, team progress, demo and submission plans
    feat/webview-ui       9695502 docs: Phase 2 audit, retrieval eval, team progress, demo and submission plans
  * main                  9695502 docs: Phase 2 audit, retrieval eval, team progress, demo and submission plans

## npm run check (exit 0)
```
 Test Files  8 passed (8)
      Tests  123 passed (123)
```
## npm run test:vscode (exit 0, real VS Code 1.125.1)
```
    ✔ registers its commands (444ms)
    ✔ starts the MCP server on 127.0.0.1
    ✔ reports real TrueForge connectivity and TrueForge can list our tools (1875ms)
    ✔ SafeChange applies only accepted hunks through WorkspaceEdit and undo restores the file (21266ms)
    ✔ propose_edit through MCP refuses without approval (no write) (4773ms)
    ✔ [E/F] dev harness: native diff tab + per-hunk CodeLens + accept 1 / reject 1 + apply + undo (22048ms)
    ✔ [E/F] conflict: a user edit after staging blocks the apply (9258ms)
    ✔ [D-G, approval simulated] approved propose_edit via MCP applies through WorkspaceEdit; approved run_command records Proof (9375ms)
    ✔ [B/I/J, real TrueForge] unconfigured primary + backup → classified bad_config, both tried, workspace unchanged (13704ms)
    ✔ inline edit without a selection warns instead of running (3126ms)
  10 passing (2m)
```
