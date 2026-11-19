# Demo Blockers (18 Nov 2026, 10:00 IST)

| # | Blocker | Affects | Status / way through |
|---|---|---|---|
| 1 | **Gemini free-tier quota**: 20 requests/day, 5/min, 250k input tokens/min per model; `gemini-3-5-flash` exhausted until **13:30 IST** | B (⌘I), D (agent mode) with Gemini | Before 13:30: `PRIMARY=google-gemini/gemini-3-5-flash-lite bash scripts/demo.sh` (few requests left), or use the quota failure itself to demo F. After 13:30: defaults. A paid key removes this blocker |
| 2 | **Agent mode (Task B) not passing yet**: best attempt 4/5 checks (case-sensitive masking) | D, G (on agent output) | Retry after 13:30 on `gemini-3-5-flash` with pacing 16 (the demo profile sets it); don't present it as passing until `verify-task-b.sh` passes on the agent's own output |
| 3 | **Groq free tier: 7,000 input tokens/min** | F | Wait 60 s between Groq runs. Agent mode on Groq would exceed it; inline (⌘I) fits |
| 4 | **Invalid-key fallback not run** | F (the official Task C story) | Add the `gemini-broken` provider in TrueForge (`TASK_C_RECORDING.md`), then run it. The quota-failure fallback works today (3/3) |
| 5 | **⌘I and the sidebar not yet exercised with a live model by a human** | B, D | All parts were run live through TrueForge via scripts and the VS Code test harness; your session is the first manual run. Report anything odd from View → Output → "AXIOM Forge" |
| 6 | Extension-host startup work: indexing Flask blocked ~0.6 s right after activation, before you'd interact (first real log, 18 Nov) | perceived snappiness at startup | Not blocking the demo; logged in `PERFORMANCE.md` follow-ups |
| 7 | Visual issues from `UI_UX_AUDIT.md` (#1 review dock crowds the timeline, #2 fallback reason not shown after switching) | video clarity | Recommendations only; not changed without your decision |

Not blockers: TrueForge, MCP and the extension are running; TrueForge lists all 7 tools; 177 unit and 11/11 VS Code tests pass; the Flask fixture is clean.
