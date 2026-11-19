# AXIOM Forge — Project Master Plan

*Understand the code. Justify every change. Verify before delivery.*

Today is **Tue 17 Nov 2026**. Round 1 closes **Fri 20 Nov 2026, 23:59 IST**. Internal freeze: **Fri 20 Nov 18:00 IST**. That's about 3.5 working days, so we cut scope ruthlessly and build the rubric-critical path first.

## 1. Requirements checklist (from the official PDF — PDF wins on any conflict)

### Eligibility gate (pass/fail)
- [ ] Agent loop runs on TrueForge; extension is a TrueForge **client** (sessions + turns via HTTP API / TS SDK), renders streamed events.
- [ ] Read file / search / propose write / run command exposed as **MCP tools**; the agent decides what to read/change.
- [ ] TrueForge in **local mode** (`npx @truefoundry/trueforge@...`). Sandbox optional.
- [ ] Model configured in TrueForge (catalog provider or OpenAI-compatible). **Extension never calls a provider.** No single hard-coded provider.
- [ ] Video briefly shows the TrueForge session for Task B (turns + tool calls); repo contains the agent definition used.
- [ ] Public repo, OSS licence compatible with upstream, upstream LICENSE preserved, fork point declared if any (we start **from scratch**).

### Five capabilities
1. Inline edit: selection + keybinding + plain-language instruction → diff in editor → accept/reject. No copy-paste.
2. Agent mode: one request drives a TrueForge tool loop (read, search, write, run) and changes **≥3 files the user did not name**.
3. Context assembly: `@file`, `@symbol`, automatic retrieval; use TrueForge context-engineering features.
4. Diff review: hunk by hunk, visible preview, accept/reject each, no silent writes, applied change **undoable**.
5. Streaming + cancellation: tokens stream via TrueForge events, interrupt mid-flight, editor never blocks, no half-applied edits.

### Out of scope (do not build)
Tab completion / FIM, training or hosting models, hosted backend/DB, accounts/auth, Marketplace publishing.

### Fixed tasks (pallets/flask, tag 3.1.3, commit 22d92470; exact wording)
- **A** — open `src/flask/helpers.py`, select `get_debug_flag`, instruct: *"Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false."* Review and accept the diff. Verify: `FLASK_DEBUG=off python -c "from flask.helpers import get_debug_flag; print(get_debug_flag())"` → `False`.
- **B** — agent panel, no files named: *"Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as "***". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands."* Review hunks, accept, **show the TrueForge session**. Verify: `pytest tests/test_cli.py -q` passes; run the command on any Flask app → masked JSON; diff touches ≥3 files.
- **C** — configure TrueForge with an unreachable endpoint or invalid key, repeat A. Verify: editor responsive, clear message **or** second model takes over automatically, `git status` clean.

### Scoring (100) — anchors; between anchors the lower applies
| | Criterion | Pts | Our target anchor |
|---|---|---|---|
| A1 | Inline edit | 10 | diff in editor + per-hunk accept/reject |
| A2 | Agent mode | 10 | discovers + edits ≥3 files unprompted |
| A3 | Streaming & cancel | 10 | immediate cancel, workspace consistent |
| B1 | Context assembly | 15 | budgeted retrieval, strategy stated, **visible in Task B** (Context Receipt) |
| B2 | Diff safety | 10 | per-hunk review + **working undo shown on screen** |
| B3 | Resilience | 10 | automatic fallback to 2nd model, no user action, workspace unchanged |
| B4 | TrueForge depth | 10 | MCP tools + **TrueForge approval drives diff review** + subagents/deferred tools/compaction visible in session & write-up |
| C1 | Video | 10 | all 3 tasks, in order, legible, verified |
| C2 | Write-up | 15 | architecture, context strategy, model setup, trade-offs, **accurate timestamped scorecard**, honest limitations |

Tie-break: B, then A, then earlier submission time → submitting early matters.

### Artefacts (all public links, via Techfest portal, before deadline)
- **Video** ≤ 4 min, editor visible, A → B → C each followed by verification, TrueForge session shown in B; may cut model wait, **must not cut between instruction and diff appearing**. YouTube unlisted / Drive anyone-with-link.
- **Write-up PDF** 1–3 pages, headings in order: 1 Team · 2 Starting point · 3 Architecture on TrueForge · 4 How context is selected · 5 Model setup · 6 Scorecard · 7 Tools used · 8 Known limitations.
- **GitHub repo** public, README with clean-clone setup (start TrueForge, load agent definition), example model config, no secrets.

### Shortlist risk
Top 15 do a 10-min call: walk through code + **repeat Task A live with an organiser-chosen model**. So: everyone must be able to explain their module, and nothing may depend on Gemini/Groq specifics.

### Round 2
16–18 Dec at IIT Bombay; build agents on TrueForge + raise a PR to the TrueForge repo. (Worth noting: a small upstream contribution such as a documented `OUTBOUND_URL_ALLOWED_HOSTS` recipe for local MCP would be a natural candidate.)

## 2. Key decisions (with why)

| Decision | Why | Alternative rejected |
|---|---|---|
| **From scratch**, not a Cline/Continue fork | 3.5 days; ripping out an upstream loop is slow and risky for eligibility; native `vscode.diff` + our own small webview is enough | Fork Continue — large codebase, own loop to remove |
| MCP server **inside the extension host** (Streamable HTTP, 127.0.0.1) | tools get direct `vscode` APIs (open buffers, `WorkspaceEdit`, undo); no extra process | separate Node process — needs IPC back to editor anyway |
| Approval-gated `propose_edit` applies only accepted hunks | makes TrueForge's approval the review gate (B4 = 7+) while still giving per-hunk control (A1/B2 = 10) | tool writes to a staging area, extension applies later — approval would not drive review |
| `OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]'` | TrueForge's SSRF guard blocks loopback by default; this is the narrowest documented escape hatch | `ngrok`/public tunnel — exposes the editor to the internet |
| ModelShield in extension, switching **TrueForge** session model | TrueForge has no fallback yet; doing it via a new TrueForge session keeps eligibility | calling Groq directly — eligibility failure |
| Subagent repo-scout + deferred tools + compaction | all work without a sandbox; Code Mode and skills need Daytona (cloud) | Code Mode — needs sandbox |
| Retrieval = ripgrep + symbol/import graph + pairing heuristics, no vectors | explainable, deterministic, fast on 17 k LOC, zero infra | embeddings — infra, non-deterministic, hard to explain |

## 3. Schedule (dependency order)

| When | Milestone | Exit criterion |
|---|---|---|
| **Tue 17 Nov (today)** | Phase 0: audit, docs, contracts, scaffold; TrueForge running; integration proof script | `scripts/proof.ts` streams a turn that calls our MCP `read_file` and pauses on `propose_edit` approval |
| **Wed 18 Nov** | Phase 1–3: extension ↔ TrueForge streaming panel; MCP tools; SafeChange per-hunk + undo; inline edit; **Task A passes** | Task A recorded as a rehearsal clip |
| **Thu 19 Nov** | Phase 4–5: context engine + Receipt + scout subagent; **Task B passes**; ModelShield; **Task C passes** | pytest green on B output, `git status` clean after C |
| **Fri 20 Nov AM** | Phase 6–7: UI polish, regression, clean-clone test | all acceptance tests in `ACCEPTANCE_TESTS.md` green |
| **Fri 20 Nov 12:00–18:00** | Phase 8: record video, write-up PDF, README, make links public, **submit** | portal submission confirmed |
| Fri 18:00–23:59 | buffer only | — |

## 4. Top risks
1. **Free-tier model quality/limits** for multi-file tool use (Task B). Mitigation: verify Gemini/Groq models with a real tool-call smoke test on day 1; keep the agent prompt explicit; have the context engine do the heavy lifting.
2. **Localhost MCP blocked** by SSRF guard → mitigated by allowlist (verified in source; to be verified at runtime).
3. **Approval semantics** (args visible before approval, deny behaviour) — verify in the integration proof before building UI.
4. **Time.** UI polish is phase 6; premium design system is set up on day 1 so polish is incremental, not a rewrite.
