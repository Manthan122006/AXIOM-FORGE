# AXIOM Forge — Team Assignments

Rule: code only against `src/shared/contracts.ts`. If you need a new field, open a PR that changes only that file and ping Manthan. Integrate into `main` **at least daily** (Wed 21:00, Thu 21:00 IST).

## Shared setup (every member, ~15 min, macOS)

```bash
# Node ≥ 22.14 (24.x is fine) — check
node -v
```

```bash
git clone https://github.com/<org-or-manthan>/axiom-forge.git && cd axiom-forge && npm ci
```

```bash
# Flask fixture used by Tasks A/B/C (outside the extension repo)
git clone https://github.com/pallets/flask.git ~/axiom-fixtures/flask && cd ~/axiom-fixtures/flask && git checkout 3.1.3 && python3 -m venv .venv && .venv/bin/pip install -e . pytest
```

```bash
# Local TrueForge, pinned, with ONLY loopback allowlisted so it can reach our MCP server
OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1
```

Then open http://localhost:8790 → **Settings → Models** and add your own free-tier keys (never paste keys in chat, code, or commits). Run the extension with **F5** in VS Code ("Run AXIOM Forge").

Branches: `feat/trueforge-client` (Manthan) · `feat/webview-ui` (Vivan) · `feat/mcp-tools` (Toheed) · `feat/context-engine` (Kunjal). PR template: what changed, files, how to run, tests run (paste output), known issues, screenshot.

---

## Manthan Chandulal Gajra — architecture, TrueForge integration, final integrator

**Files:** `src/extension/*`, `src/trueforge/*`, `agents/axiom-agent.json`, `scripts/setup-trueforge.ts`, `scripts/proof.ts`, `README.md`, write-up.

**First task (today):** `scripts/proof.ts`, a headless proof using the probe MCP server:
1. `sessions.create({ agent: { spec } })` with `mcp_servers:[{ name:'axiom-forge', require_approval_for_tools:['propose_edit','run_command'], preload_tools:['assemble_context','propose_edit'] }]`.
2. `createTurnStream` → print every event type; collect `tool.approval_required`; look up args via `source_event_id`; reply `user.tool_approval` allow, then a second run with deny; a third run calling `sessions.cancel` mid-stream.
3. Save the raw event logs to `tests/fixtures/trueforge-events/*.jsonl`. They become the reducer's unit-test fixtures.

**Acceptance:** all three logs exist; deny produces a model message acknowledging the denial; cancel ends with `turn.done{cancelled}`.
**Then:** T-1 → T-2 → T-3 → I-1 (Task A) → T-4.
**Commit style:** `feat(trueforge): stream reducer with delta merge`.

## Vivan Jain — webview UI, design system, motion

**Files:** `webview/**` (React 18 + Vite + Tailwind 4, built into `dist/webview`).

**First task:** design tokens + shell with **static fixture state only** (an `AxiomState` JSON in `webview/src/dev/fixtures.ts`, excluded from the production bundle):
- Tokens: graphite base `#0B0C0F`, surfaces `#121419 / #181B22`, border `#232733`, text `#E6E8EE / #9AA1B2`, accent indigo `#7C83FF`, active cyan `#5CE1E6`, success `#3DDC97` (verified only), warning `#F5B54A`, danger `#FF6B6B`. Use VS Code font vars for code (`var(--vscode-editor-font-family)`). Also map to `--vscode-*` so the light theme degrades gracefully.
- Motion tokens: 120 ms micro, 200 ms panel, `cubic-bezier(.2,.8,.2,1)`; wrap everything in `@media (prefers-reduced-motion: reduce)`.
- Regions: Header (brand, TrueForge/MCP/model badges from `connection`/`mcp`/`session`), Timeline, Context Receipt, Change Review, Verification, Composer (`@` opens mention popup fed by `mentionResults`).
**Acceptance:** looks right at 300 px and 600 px wide; every badge reads from state; no hard-coded "connected".
**Then:** U-2 → U-4 → U-3 → U-5. Messages to host only via `WebviewToHost`.

## Toheed Inamdar — MCP server, workspace safety, SafeChange apply

**Files:** `src/mcp/*`, `src/safety/*`, `src/verification/*`, tests under `tests/mcp`, `tests/safety`.

**First task:** `src/mcp/server.ts` (Streamable HTTP via `@modelcontextprotocol/sdk@1.32.2`, bind `127.0.0.1`, random free port, stateless) + `read_file` + `search_workspace` (`@vscode/ripgrep`) + `src/mcp/pathJail.ts`:
- resolve → `realpath` → must stay under the workspace root; reject `..`, absolute paths outside, symlink escapes, `.git/`, `.env*`, `*.pem`, `id_*`, `.venv/`.
- every tool has a zod schema; annotations set (`readOnlyHint` true for reads; `propose_edit` `readOnlyHint:false`; `run_command` `destructiveHint:true`).
**Acceptance:** vitest: traversal (`../../etc/passwd`, encoded, symlink) rejected; `GET /api/v1/mcp-servers/axiom-forge/tools` lists the tools.
**Then:** S-1 hunking (`diff@5` `structuredPatch`) → M-3 `propose_edit` (stage on call, apply accepted hunks only after approval) → S-2 undo → M-4 `run_command` (allowlist `pytest`, `python`, `flask`, `git status|diff`; 120 s timeout; output tail 4 KB; scrub `/(sk|gsk|AIza)[A-Za-z0-9_\-]{10,}/`).
**Key test:** call `propose_edit` handler without a recorded approval → no file change.

## Kunjal — context engine, retrieval, QA lead

**Files:** `src/context/*`, `tests/context/*`, `docs/ACCEPTANCE_TESTS.md` evidence.

**First task:** Q-1 Flask fixture, then `src/context/indexer.ts` + `search.ts`: walk the workspace (respect `.gitignore`), record size/lines, skip binaries and >512 KB; ripgrep keyword search with per-file hit counts.
**Then:** `symbolSearch.ts` (Python `def`/`class`/top-level assignments by regex + line numbers; good enough and explainable) → `dependencyGraph.ts` (`import x`, `from .x import y`, relative resolution within `src/`) → `testDiscovery.ts` (`src/pkg/mod.py` ↔ `tests/test_mod.py`, plus test files that import the module) → doc pairing (`docs/**/*.rst|md` mentioning the module or its symbols) → `ranking.ts` + `tokenBudget.ts` + `contextReceipt.ts`.
**Ranking v1 weights:** mention 100 · selection 80 · symbol def match 40 · path/name match 25 · keyword hits 3/hit (cap 30) · import neighbour 15 · test pair 20 · doc pair 15. Budget 24 000 est. tokens, per-file cap 6 000; over-cap → outline + ±30-line windows around hits.
**Acceptance (golden test):** for the exact Task B prompt on Flask 3.1.3, `src/flask/cli.py`, `tests/test_cli.py`, `docs/cli.rst` are all in the top 5, total ≤ budget, and every item has a non-empty reason. For Task A's selection, `helpers.py` is first and `tests/test_helpers.py` is paired.
