# AXIOM Forge — Task Board

Statuses: **Not started · In progress · Blocked · Implemented · Tested · Verified**. "Verified" means the evidence column points at something real.

| ID | Task | Owner | Pri | Depends | Acceptance | Status | Evidence |
|---|---|---|---|---|---|---|---|
| P0-1 | Read official PDF, extract requirements | Manthan | P0 | — | checklist in PROJECT_MASTER_PLAN §1 | Verified | `docs/PROJECT_MASTER_PLAN.md` |
| P0-2 | Research TrueForge API from source + SDK types | Manthan | P0 | — | ARCHITECTURE §2 with citations | Verified | `docs/ARCHITECTURE.md` §2 |
| P0-3 | Skill discovery + registry | Manthan | P1 | — | `docs/SKILL_REGISTRY.md` | Verified | `docs/SKILL_REGISTRY.md`; `frontend-design` + `vercel-react-best-practices` installed, files and `skills-lock.json` checked |
| P0-4 | Shared contracts | Manthan | P0 | P0-2 | `src/shared/contracts.ts` compiles | Tested | `tsc --strict --noEmit` clean (TS 5.6.3), 2026-11-17 |
| P0-5 | TrueForge running locally, pinned 0.185.1 | Manthan | P0 | — | `GET /api/v1/models` 200 | Verified | banner `TrueForge v0.185.1 · standalone`, SQLite at `~/Library/Application Support/trueforge/db/db.sqlite`, HTTP 200 |
| P0-5b | TrueForge → 127.0.0.1 MCP reachability | Manthan | P0 | P0-5 | TrueForge lists tools of a loopback MCP server | Verified | started with `OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]'`; registered `axiom-probe` via `POST /api/v1/settings/mcp-servers {manifest:{type:"remote",...}}`; `GET /api/v1/mcp-servers/axiom-probe/tools` returned `echo` + `propose_edit`. Negative case (without allowlist) not yet re-tested |
| P0-6 | Model providers configured (Gemini primary, Groq backup) | Manthan | P0 | P0-5, **API keys** | a plain turn streams on each model | Blocked | needs team's own free-tier keys, entered in TrueForge Settings → Models |
| P0-7 | Repo scaffold (extension + webview + vitest), git init, GitHub repo | Manthan | P0 | — | `npm run build && npm test` green | Not started | — |
| P0-8 | Integration proof: session → turn → MCP `read_file` → `propose_edit` approval pause → allow/deny → cancel | Manthan + Toheed | P0 | P0-5..7, M-1 | `scripts/proof.ts` log | Not started | — |
| T-1 | TrueForge client: sessions, stream reducer, resubscribe | Manthan | P0 | P0-8 | unit tests on recorded event fixtures | Not started | — |
| T-2 | Approval bridge (`tool.approval_required` → SafeChange → `user.tool_approval`) | Manthan | P0 | T-1, S-1 | proposal shown before any write | Not started | — |
| T-3 | Cancellation (button, `sessions.cancel`, discard staged) | Manthan | P0 | T-1 | cancel mid-stream ⇒ `git status` clean | Not started | — |
| T-4 | ModelShield: classify, retry/backoff, backup session | Manthan | P1 | T-1 | Task C with bad Gemini key ⇒ Groq completes | Not started | — |
| T-5 | Agent definition `agents/axiom-agent.json` + setup script | Manthan | P0 | M-1 | `scripts/setup-trueforge.ts` idempotent | Not started | — |
| M-1 | MCP Streamable-HTTP server on 127.0.0.1 | Toheed | P0 | P0-7 | TrueForge lists our tools via `GET /api/v1/mcp-servers/{name}/tools` | Not started | — |
| M-2 | `read_file`, `search_workspace` + path jail + secret-file denylist | Toheed | P0 | M-1 | traversal tests pass | Not started | — |
| M-3 | `propose_edit` (stage pre-approval, apply accepted hunks post-approval) | Toheed | P0 | M-1, S-1 | cannot write without approval (test) | Not started | — |
| M-4 | `run_command` allowlist, timeout, scrub | Toheed | P0 | M-1 | timeout + exit code tests | Not started | — |
| S-1 | SafeChange: hunking, baseHash, conflict check | Toheed | P0 | — | unit tests | Not started | — |
| S-2 | Per-hunk apply via `WorkspaceEdit` + undo journal | Toheed + Manthan | P0 | S-1 | undo restores exact pre-image | Not started | — |
| C-1 | Indexer + ripgrep search | Kunjal | P0 | P0-7 | Flask indexed < 2 s | Not started | — |
| C-2 | Python symbol index + import graph | Kunjal | P0 | C-1 | `get_debug_flag` def + refs found | Not started | — |
| C-3 | Test/doc pairing | Kunjal | P0 | C-1 | `cli.py` ↔ `tests/test_cli.py`, `docs/cli.rst` | Not started | — |
| C-4 | Ranking + budget + Context Receipt | Kunjal | P0 | C-1..3 | Task B prompt ranks the 3 files top-5, under budget | Not started | — |
| C-5 | `@file` / `@symbol` mention parsing + completion | Kunjal + Vivan | P1 | C-2 | mentions hard-included in receipt | Not started | — |
| U-1 | Webview shell, design tokens, dark theme | Vivan | P0 | P0-7 | renders in VS Code sidebar 300–600 px | Not started | — |
| U-2 | Stream/timeline/composer bound to `AxiomState` | Vivan | P0 | U-1, T-1 | live tokens + tool rows from real events | Not started | — |
| U-3 | Context Receipt panel | Vivan | P0 | U-1, C-4 | shows real receipt | Not started | — |
| U-4 | Change review panel (per-hunk, undo) | Vivan | P0 | U-1, S-1 | hunk controls drive SafeChange | Not started | — |
| U-5 | Verification + recovery states | Vivan | P1 | U-1, V-1, T-4 | only real results shown | Not started | — |
| I-1 | Inline edit command (`cmd+i`) | Manthan | P0 | T-2, S-2 | **Task A** | Not started | — |
| V-1 | Proof of Change (results, staleness) | Toheed | P1 | M-4 | exit codes shown | Not started | — |
| Q-1 | Flask fixture: clone tag 3.1.3, venv, `pip install -e . pytest` | Kunjal | P0 | — | `pytest tests/test_cli.py -q` green on clean tree | Not started | — |
| Q-2 | Run Tasks A/B/C end-to-end, record evidence | All | P0 | everything | `ACCEPTANCE_TESTS.md` filled | Not started | — |
| D-1 | README, LICENSE (MIT), `.env.example`, `config/models.example.json` | Manthan | P0 | — | clean-clone test | Not started | — |
| D-2 | Video ≤ 4 min | Manthan + Vivan | P0 | Q-2 | public link | Not started | — |
| D-3 | Write-up PDF, 8 headings | Manthan + Kunjal | P0 | Q-2 | public link | Not started | — |
| D-4 | Secret scan + clean-clone + submit | Manthan | P0 | D-1..3 | portal confirmation | Not started | — |
