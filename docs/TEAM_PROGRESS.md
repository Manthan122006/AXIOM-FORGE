# Team Progress & Handoffs

_Inspected Tue 17 Nov 2026, late evening._

## Branch inspection (facts only)

| Branch | Commits ahead of `main` | Authors | Status |
|---|---|---|---|
| `feat/trueforge-client` | 0 | Manthan (via Claude Code) | fast-forwarded to `main` (616315d+) |
| `feat/webview-ui` | 0 | — | fast-forwarded; **no work from Vivan yet** |
| `feat/mcp-tools` | 0 | — | fast-forwarded; **no work from Toheed yet** |
| `feat/context-engine` | 0 | — | fast-forwarded; **no work from Kunjal yet** |

No teammate has pushed or shared code yet, and nothing is marked complete on their behalf. All existing code was written in this Claude Code session on Manthan's machine; each owner now has to **understand it well enough to defend it live** (the shortlist call includes a code walkthrough).

There's no remote yet, so branches can't be pushed. **Before teammates can start, Manthan must create the GitHub repo and push `main` and the four branches** (see "Immediate next actions").

---

## Manthan: TrueForge integration, architecture, ModelShield, final integration
**Completed (in repo, tested):** TrueForge client + reducer, ModelShield, controller, inline/agent flows, setup/proof scripts, A–J integration tests (10/10), audit fixes H1–H5, M1–M4.
**Owns:** `src/trueforge/*`, `src/extension/controller.ts`, `src/extension/activate.ts`, `agents/`, `scripts/proof.ts`, `scripts/setup-trueforge.ts`, docs.
**Needs improvement:** everything model-driven is unverified; M5 (two edits on the same file in one pause); live cancel.
**Next tasks:** (1) create the GitHub repo, push `main` + branches; (2) add keys and run `docs/MODEL_KEY_CHECKLIST.md` steps 1–17; (3) commit recorded streams + `tests/trueforge/recorded.test.ts`; (4) run Tasks A/B/C live per `DEMO_SCRIPT.md`; (5) rehearse and record the video.
**Acceptance:** checklist rows 7–16 pass with recordings; `verify-task-a.sh` PASS, `verify-task-b.sh` PASS on **agent-generated** changes, `verify-task-c.sh` clean.
**Tests:** `npm run check`, `npm run test:vscode`, `scripts/proof.ts` (allow/deny/cancel), `scripts/tasks/*.sh`.
**Git:** `feat/trueforge-client` → PR with recorded streams, test output and screenshots.

## Vivan: frontend, UI/UX, timeline, diff review, receipt, a11y
**Completed (by Claude, needs Vivan's review):** webview per `DESIGN_SYSTEM.md`; reconcile (rerender fix, measured); AA contrast test; Session button; no horizontal overflow at 360 px; focus ring visible.
**Owns:** `webview/**`, `docs/DESIGN_SYSTEM.md`.
**Needs improvement:** never seen with **live** data inside VS Code; long assistant output; many-hunk proposals; dock height vs timeline when reviewing; `aria-live` noise during streaming; light theme inside real VS Code.
**Next tasks:** (1) `npm run dev:webview`, walk every `?state=` view; (2) F5 + the dev harness (`axiomForge.devTools: true` → "Stage a sample proposal") to review real hunks in the sidebar; (3) once keys exist, check a real Task B run at 300/400/600 px, dark and light; (4) React Profiler during streaming: confirm only the streaming row and its parents commit; (5) keyboard-only pass through review; (6) remove the dev render counter if it shows up anywhere outside dev builds.
**Acceptance:** screenshots at 360/420/520 px (both themes) attached; no overflow; profiler screenshot; `npx vitest run webview` green.
**Git:** `feat/webview-ui` PR with screenshots.

## Toheed: MCP, workspace safety, command execution, security
**Completed (by Claude, needs Toheed's review):** MCP server (7 tools), path jail, approval grants, command runner, SafeChange, VS Code host, diff view, cancel-kills-command.
**Owns:** `src/mcp/*`, `src/safety/*`, `src/verification/*`, `src/workspace/*`, `src/extension/vscodeHost.ts`, `src/extension/diffView.ts`, their tests.
**Needs improvement:** M5 (two edits on the same file in one pause), M6 (multi-file atomicity), L4 (redo), L5 (`python -c`), negative SSRF check.
**Next tasks:** (1) explain grant fingerprints to the team (5 min); (2) run the `security-review` skill on `src/mcp` and `src/safety`; fix confirmed findings with tests; (3) design and implement M5: when the same file has an earlier proposal in the same pause, compute the later proposal against the earlier one's proposed text **or** merge them into one review; test it; (4) F5 + dev harness: visually check the CodeLens Accept/Reject, Undo, ⌘Z/⌘⇧Z; (5) start TrueForge *without* `OUTBOUND_URL_ALLOWED_HOSTS` and record the refusal.
**Acceptance:** new tests pass; security findings fixed or documented; a screen recording of the CodeLens flow.
**Git:** `feat/mcp-tools` PR.

## Kunjal: context engine, retrieval, Task B discovery, QA
**Completed (by Claude, needs Kunjal's review):** engine + receipt; eval harness on 13 tasks (in-context recall 0.90, R@5 0.74); Task A/B/C verify scripts.
**Owns:** `src/context/*`, `tests/context/*`, `scripts/eval-retrieval.ts`, `scripts/receipt.ts`, `scripts/tasks/*`, `docs/RETRIEVAL_EVAL.md`, `docs/ACCEPTANCE_TESTS.md`, `docs/FINAL_TEST_MATRIX.md`.
**Needs improvement:** misses on E1, E6, E8; noise (~8–10 of 12 selected outside the ground truth).
**Next tasks:** (1) add ≥5 more eval tasks with grep-checked ground truth; (2) improve R@5 **without** task-specific rules: candidates are class-name ↔ phrase pairing ("test client" ↔ `FlaskClient`), a tighter relative cut-off, test-module discovery by symbol usage; re-run the eval after each change; (3) run the receipt on a larger repo (e.g. `pallets/werkzeug`) and record index time/memory; (4) own `FINAL_TEST_MATRIX.md`: run it after every merge.
**Acceptance:** mean in-context recall ≥ 0.90 and R@5 ≥ 0.80 on ≥ 18 tasks; golden tests pass; matrix filled with dates.
**Git:** `feat/context-engine` PR with before/after eval tables.
