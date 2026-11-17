# AXIOM Forge — Task Board

Statuses: **Not started · In progress · Blocked · Implemented · Tested · Verified**. *Verified* = evidence from a real run (not mocks). Updated Tue 17 Nov 21:00 IST.

| ID | Task | Owner | Pri | Status | Evidence / next step |
|---|---|---|---|---|---|
| P0-1 | Official requirements extracted | Manthan | P0 | Verified | `PROJECT_MASTER_PLAN.md` |
| P0-2 | TrueForge API researched (source + SDK types) | Manthan | P0 | Verified | `ARCHITECTURE.md` §2 |
| P0-3 | Skills discovered/installed/registered | Manthan | P1 | Verified | `SKILL_REGISTRY.md`, `skills-lock.json` |
| P0-4 | Shared contracts | Manthan | P0 | Tested | `src/shared/contracts.ts`, strict tsc |
| P0-5 | TrueForge 0.185.1 local | Manthan | P0 | Verified | log banner; listens on `[::1]:8790` |
| P0-6 | Model providers (Gemini primary, Groq backup) | Manthan | P0 | Blocked | keys to be added by Manthan |
| P0-7 | Build/lint/test tooling, git | Manthan | P0 | Tested | `npm run check` green; 5 commits on `main` |
| P0-8 | Live integration proof (turn → tool → approval → cancel) | Manthan | P0 | Blocked | `scripts/proof.ts` ready; MCP-listing and 422 path verified |
| M-1 | MCP Streamable-HTTP server, 127.0.0.1, Host/Origin checks | Toheed | P0 | Verified | TrueForge lists 7 tools (live); 12 protocol tests |
| M-2 | read_file / search / find_symbol / related_files + path jail | Toheed | P0 | Tested | 20 path-jail + protocol tests |
| M-3 | propose_edit staged pre-approval, applied post-grant | Toheed | P0 | Tested | MCP + VS Code tests; live approval BLOCKED |
| M-4 | run_command allowlist/no shell/timeout/abort/scrub | Toheed | P0 | Tested | 27 tests |
| S-1 | Hunking, conflict detection | Toheed | P0 | Tested | `safeChange.test.ts` |
| S-2 | Per-hunk apply via WorkspaceEdit + undo | Toheed | P0 | Verified | VS Code integration test (real editor buffer + disk) |
| S-3 | Native diff + per-hunk CodeLens | Toheed | P0 | Implemented | needs a live proposal to check by hand |
| C-1..4 | Index, symbols, imports, pairing, ranking, budget, receipt | Kunjal | P0 | Tested | 9 golden tests on Flask 3.1.3 |
| C-5 | @mentions (engine + composer) | Kunjal/Vivan | P1 | Tested | golden test + browser preview |
| C-6 | Retrieval eval beyond fixed tasks | Kunjal | P1 | Not started | packet in TEAM_ASSIGNMENTS |
| T-1 | TurnTracker reducer | Manthan | P0 | Tested | synthetic streams; recorded streams pending |
| T-2 | Approval bridge (pause → review → grant → allow/deny) | Manthan | P0 | Implemented | live BLOCKED |
| T-3 | Cancellation | Manthan | P0 | Implemented | live BLOCKED |
| T-4 | ModelShield | Manthan | P1 | Tested | 7 policy tests; live fallback BLOCKED |
| T-5 | Agent definition + setup | Manthan | P0 | Implemented | TrueForge 422 until a provider exists |
| T-6 | IPv6 loopback fix | Manthan | P0 | Verified | VS Code test connects |
| U-1..5 | Webview: tokens, timeline, receipt, review, proof, recovery, composer | Vivan | P0 | Tested (preview) | screenshots 360/420/520 px, dark/light |
| U-6 | Live-data polish, session link, contrast test, a11y pass | Vivan | P1 | Not started | packet |
| I-1 | Inline edit command (⌘I) | Manthan | P0 | Implemented | Task A BLOCKED |
| V-1 | Proof of Change (results, stale) | Toheed | P1 | Implemented | live BLOCKED |
| Q-1 | Flask fixture + pinned test deps | Kunjal | P0 | Verified | test_cli 58/58 on clean tree |
| Q-2 | Task A/B/C verify scripts | Kunjal | P0 | Verified | fail on clean, pass on reference fix, reset clean |
| Q-3 | Tasks A/B/C live | All | P0 | Blocked | keys |
| Q-4 | Extension-host responsiveness evidence | Manthan | P1 | In progress | stall detector added; check in F5 |
| D-1 | README, LICENSE, example config | Manthan | P0 | Implemented | clean-clone test pending |
| D-2 | Video | Manthan/Vivan | P0 | Not started | Fri |
| D-3 | Write-up PDF | Manthan/Kunjal | P0 | Not started | Fri |
| D-4 | Public repo, secret scan, submit | Manthan | P0 | Not started | needs GitHub owner |
