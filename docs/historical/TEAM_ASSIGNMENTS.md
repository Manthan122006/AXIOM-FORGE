# AXIOM Forge — Team Task Packets

**Situation (Tue 17 Nov, 21:00 IST):** a first implementation of every module exists on `main` with 106 unit tests and 6 VS Code integration tests (see `PROJECT_STATUS.md`). Your job is to **own** one module: understand it well enough to explain and defend it on the judges' 10-minute call, harden it, and close its open items. Nothing is "done" for you until your own evidence is in your PR.

## Shared setup (all four Macs, ~15 min)

```bash
node -v   # must be >= 22.14
```

```bash
git clone <repo-url> axiom-forge && cd axiom-forge && npm ci && npm run check
```

```bash
npm run fixture:flask
```

```bash
OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1
```

Then add your own free-tier key in TrueForge (http://localhost:8790 → Settings → Models). Never paste keys in code, chat, commits or screenshots. Run the extension with **F5**.

**Rules.** Code against `src/shared/contracts.ts`; changes to it need Manthan's review. Branches are listed below. Every PR has: what changed, files, how to run, the commands you ran with their output, known issues, and a screenshot if it's UI. Merge into `main` by **Wed 21:00** and **Thu 21:00 IST**. Before each PR run `npm run check` and paste the summary.

---

## Manthan Chandulal Gajra: architecture, TrueForge integration, final integration
**Branch:** `feat/trueforge-client` · **Owns:** `src/trueforge/*`, `src/extension/controller.ts`, `src/extension/activate.ts`, `agents/axiom-agent.json`, `scripts/proof.ts`, `scripts/setup-trueforge.ts`, README, write-up.

**Objective.** Turn every BLOCKED line in `TRUEFORGE_INTEGRATION_STATUS.md` into verified evidence, then run Tasks A/B/C.

**Do, in order.**
1. Add Gemini (primary) and Groq (custom OpenAI-compatible, backup) in TrueForge. Confirm the names with `curl -s http://localhost:8790/api/v1/models`.
2. `npx tsx scripts/proof.ts --model <primary>`, then `--deny`, then `--cancel-after 6`. Commit the three files in `tests/fixtures/trueforge-events/recorded/`.
3. Add a reducer test that replays each recorded stream (`tests/trueforge/recorded.test.ts`) and asserts the final tracker state.
4. Command Palette → "Register MCP Server and Agent in TrueForge", then Task A in F5 and `bash scripts/tasks/verify-task-a.sh`.
5. Task B, then `verify-task-b.sh`; open the session in TrueForge's UI (`/sessions/<id>`) and check the repo-scout subagent appears.
6. Task C: put an invalid key on the primary provider, set `axiomForge.models.backup`, run Task A, then `verify-task-c.sh` before accepting.

**Acceptance.** The three recordings are committed; all 10 rows in the integration status are verified or have a documented reason; the verify scripts print PASS for A and B and clean for C.
**Definition of done.** Evidence pasted into `ACCEPTANCE_TESTS.md`, and the status docs updated.

## Vivan Jain: webview UI, design system, motion
**Branch:** `feat/webview-ui` · **Owns:** `webview/**`, `docs/DESIGN_SYSTEM.md`.

**Objective.** Make the UI correct with *live* host state inside VS Code and finish the polish, without breaking the state contract.

**Do.**
1. `npm run dev:webview`, then open `http://localhost:5199/?state=review` (also `fallback`, `offline`, `empty`). Know every state.
2. In F5 with a real run, check each region against `DESIGN_SYSTEM.md` at sidebar widths 300, 400 and 600 px, in dark and light themes. Fix the real-data issues you find: long paths, many hunks, and long streaming text.
3. Add a "Show TrueForge session" link in the header when `session.sessionId` is set; it posts `openSessionInTrueForge`, which already exists. It's needed for the Task B video.
4. Keyboard pass: Tab through hunks; Enter/Space on Accept and Reject; focus is always visible. Add `aria-live` only where it's needed.
5. Performance: with React DevTools Profiler during a streamed run, confirm only the streaming row re-renders per batch. If not, fix it using the `rerender-*` rules in `.agents/skills/vercel-react-best-practices`.
6. Write `webview/src/theme.test.ts`, which computes WCAG contrast for the five semantic colours against `#181818` and `#F8F8F8` (≥ 4.5:1). DESIGN_SYSTEM.md claims this, so it must be tested.

**Acceptance.** Screenshots at 300, 400 and 600 px in both themes are attached to the PR; the contrast test passes; there's no horizontal scroll at 300 px; reduced-motion disables all animation.
**Skills.** `frontend-design`, `vercel-react-best-practices`, `dataviz` for the budget meter.

## Toheed Inamdar: MCP server, workspace safety, SafeChange
**Branch:** `feat/mcp-tools` · **Owns:** `src/mcp/*`, `src/safety/*`, `src/verification/*`, `src/workspace/*`, `src/extension/vscodeHost.ts`, `src/extension/diffView.ts`, `tests/mcp`, `tests/safety`, `tests/verification`.

**Objective.** Be able to prove, live, that the agent cannot change a file or run a command without approval, and harden the edge cases.

**Do.**
1. Read `server.ts` and the approval registry (`approvals.ts`). Explain grant fingerprints to the team in 5 minutes.
2. Run the `security-review` skill on `src/mcp` and `src/safety`; fix confirmed findings with tests.
3. Add tests for these cases:
   - two `propose_edit` calls on the same file in one pause, where the second proposal's base is stale after the first is applied: it must be a conflict, not a corrupt write;
   - a proposal on a file the user edits in an unsaved buffer;
   - CRLF files;
   - new files in new directories;
   - `run_command` with a `cwd` outside the workspace.
4. In F5 with a real proposal, check the CodeLens Accept/Reject in the diff editor, then **Undo change**, and confirm the editor's own Undo (⌘Z) behaves sensibly after an apply. Record it.
5. Re-run the negative SSRF test: start TrueForge *without* `OUTBOUND_URL_ALLOWED_HOSTS` and confirm it can't reach the MCP server. Record the error text.

**Acceptance.** New tests pass; the security findings are fixed or recorded; there's a screen recording of the per-hunk CodeLens flow.

## Kunjal: context engine, retrieval quality, QA lead
**Branch:** `feat/context-engine` · **Owns:** `src/context/*`, `tests/context/*`, `scripts/tasks/*`, `docs/ACCEPTANCE_TESTS.md`.

**Objective.** Make retrieval measurably good beyond the two fixed tasks, and run QA for the whole team.

**Do.**
1. `npx tsx scripts/receipt.ts fixtures/flask "<task>"` for at least **10 new realistic Flask tasks** (blueprints, sessions, JSON provider, templating, `url_for`, signals…). For each, record the expected files and the actual top 5 in `docs/RETRIEVAL_EVAL.md`, and compute recall@5.
2. Improve ranking where recall@5 < 1 **without** regressing the golden tests, for example by weighting the click `command` symbols, using `__all__` exports, or tuning the doc-pairing threshold.
3. Check the receipt's honesty: every "Left out" reason must be true; add a test that over-budget items really didn't fit.
4. Own the task scripts. Run `verify-task-*.sh` after every teammate merge, and keep `ACCEPTANCE_TESTS.md` filled with dated evidence.
5. Large-repo check: run the receipt on a bigger repository (e.g. a clone of `pallets/werkzeug`) and record index time and memory.

**Acceptance.** `RETRIEVAL_EVAL.md` exists with ≥ 12 tasks and recall@5; the golden tests still pass; the large-repo numbers are recorded.

---

## Integration calendar
| When | Who | What |
|---|---|---|
| Wed 13:00 | Manthan | recorded streams committed; first live Task A |
| Wed 21:00 | all | merge round 1; Kunjal runs the verify scripts |
| Thu 18:00 | Manthan | Tasks B and C live |
| Thu 21:00 | all | merge round 2; feature freeze |
| Fri 12:00 | Manthan + Vivan | record the video; Kunjal + Manthan write the write-up |
| Fri 18:00 | Manthan | public repo + links submitted |
