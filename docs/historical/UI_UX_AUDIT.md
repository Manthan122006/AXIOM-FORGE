# UI/UX Audit (18 Nov 2026)

**Method and limits.** I inspected the real built webview (`dist/webview`, same React bundle the extension loads) in a browser preview at 360 and 520 px, dark and light, in five states: empty, offline, streaming, review, fallback. The preview feeds **simulated events** (a banner says so) and uses VS Code-like CSS defaults, not your theme. I could **not** see the real VS Code window (native diff, CodeLens, notifications, your theme), and I did not observe a live streaming run in the UI. Those parts need your own eyes. Nothing was redesigned.

## Verdict
Clean, restrained, and coherent with VS Code; nothing looks broken. It reads as a well-made developer tool rather than a showpiece. The weakest areas for a 4-minute video are **visual hierarchy during review** (the dock crowds out the timeline) and **too little "proof" visible at a glance** (why the model failed, what was verified).

## Findings
| # | Area | Observation | Severity | Recommendation |
|---|---|---|---|---|
| 1 | Review layout | With a proposal open, the "Changes to review" dock takes ~60% of the height at 860 px; the timeline shrinks to 3 rows, so judges lose sight of what the agent did | High (demo) | Cap the dock at ~45% with its own scroll, or collapse the Context Receipt list while reviewing |
| 2 | Fallback banner | After switching, the banner no longer says **why** the primary failed (e.g. "auth"); that reason was only in the brief "failed" state | High (Task C scoring) | Keep the failure class in the switching banner: "gemini-3-5-flash failed (auth) → running on qwen-3-8-27b" |
| 3 | Context Receipt reasons | Reasons list raw matched words ("mentions "loaded", "commands", "command"…"), which reads mechanical and repeats near-duplicates | Medium | Show the top 2–3 distinct signals in plain words ("defines `config_command`", "tests cli.py"), raw terms on hover |
| 4 | Empty state | Good copy, but a large blank area and no first-run guidance (agent not registered / model not listed) | Medium | Add a 3-line readiness checklist bound to real state: TrueForge ✓, tools ✓, primary listed ✓/✗ |
| 5 | Header at 360 px | The model pill wraps to its own line; at 520 px it fits in the header row | Low | Acceptable; or shorten to the model's last segment and drop "+backup" below 380 px |
| 6 | Disabled primary button | "Decide 3 more" uses a washed-out purple, readable but low contrast in light theme (disabled controls are exempt from AA, but it's the most important button) | Low | Keep the label high-contrast and dim only the background |
| 7 | Offline state | Title and first line repeat ("TrueForge isn't reachable" / "TrueForge is not reachable at …"); the start command lacks `-y` | Low | One sentence + the exact command with `-y` |
| 8 | Hunk headers | `@@ -594,6 +594…` truncates at 360 px; the raw unified-diff header is noise for most viewers | Low | Show "lines 594–600" instead |
| 9 | Typography | VS Code's own UI font (system fallback) and editor font for code; sizes consistent; good line-height | ✓ | — |
| 10 | Light/dark | Both themes coherent; status colours pass the AA contrast test (`webview/src/theme.test.ts`) | ✓ | Check once inside VS Code with a non-default theme |
| 11 | Motion | Minimal (streaming caret, state transitions); respects `prefers-reduced-motion` | ✓ | — |
| 12 | Accessibility | Focus rings visible; status dots have screen-reader text; `role="alert"` on failures | ✓ partially | A keyboard-only pass through review inside VS Code is still to do (Vivan) |
| 13 | Streaming timeline | Only changed rows re-render (patch protocol + reconcile, tested) | ✓ (measured offline) | Watch one live run for jank |
| 14 | Loading states | "Waiting for TrueForge…" in composer, `running` tool rows, recovery banner; no skeletons (fine for a sidebar) | ✓ | — |

## Not inspected (needs you)
Native diff + CodeLens in your theme · notifications/modals (command approval) · a live streaming run · the Proof panel with a real command (no preview state exists for it) · the TrueForge session page.

## Fixed during this audit (no redesign)
- The header now shows the configured primary model and whether TrueForge lists it (it said just "model" before any run), with primary and backup in the tooltip.
- The browser preview's fallback state used a made-up model and an impossible state combination ("completed" while still running); it now mirrors the real ModelShield sequence with `groq/qwen-3-8-27b`.
