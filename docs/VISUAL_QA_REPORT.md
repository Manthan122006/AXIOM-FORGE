# Visual QA Report (18 Nov 2026)

**Where:** the real built webview (`npm run dev:webview` → http://localhost:5199) in the in-app browser, driven by the labelled preview simulation (`webview/src/dev/preview.ts`; receipt and hunks are real engine output). **Not** inside the VS Code window (see limits).

## Matrix covered
| State | 360 px dark | 1200 px dark | 1200 px light |
|---|---|---|---|
| Empty / first run (Task, Overview) | ✓ | – | – |
| Offline | ✓ (earlier round) | – | – |
| Streaming / agent working | ✓ | – | – |
| Waiting for review (Task + Trace) | ✓ | ✓ | ✓ |
| Review studio: undecided, accept file, per-hunk | ✓ | – | ✓ |
| Completed (applied + verified) | ✓ | ✓ | – |
| Context with relationship map | ✓ | – | – |
| Models: fallback | ✓ | – | – |
| Proof | ✓ | – | – |
Contrast for every token pair: automated (`theme.test.ts`).

## Defects found and fixed in the loop
| Round | Defect | Fix |
|---|---|---|
| 1 | Overview showed three empty "nothing yet" sections on first run | hidden until there is content; tighter empty states |
| 2 | **Trace did not light Review** while files waited (preview proposals predated the run, logic filtered by time) | a staged proposal always belongs to the live run; preview stamps proposals |
| 2 | "Assemble context" row repeated the whole request truncated | detail dropped for that tool |
| 2 | receipt counts truncated in the timeline | moved to their own line |
| 3 | "1 hunk still need a decision" | plural-correct copy |
| 3 | every timeline step re-animated when returning to Task | only the newest step animates |
| 3 | finished agent text had a hollow grey node | indigo node |
| 4 | relationship map wider than the sidebar; docs column clipped | narrow layout under 480 px, name clipping with full path in tooltip |
| 4 | score number floated below its meter; very long lede | aligned; lede clipped at 140 chars |
| 5 | wide layout: Trace and review prompt not aligned with content | 32 px inset, capped width |
| 5 | integration tests failed when a demo window held port 7811 (environment, but real) | tests use their own port |
| – | false alarm: "grey heading" | computed colour correct; screenshot caught the 220 ms entrance |

## Not verified (honest)
- Rendering inside the real VS Code webview (your theme, real fonts, real sidebar width): needs **Developer: Reload Window** in the demo window and a human look.
- Live model runs through the new screens.
- Keyboard-only walkthrough of every view (focus order and visible focus were spot-checked, not exhaustively).
- High-contrast themes (token fallbacks exist, not inspected).

Screenshots: `docs/screenshots/before/` and `docs/screenshots/after/`.
