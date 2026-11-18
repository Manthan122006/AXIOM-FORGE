# Team Progress & Handoffs (Phase 3)

_Updated Wed 18 Nov 2026, 09:50 IST. Re-run the inspection command below before every update; never mark a teammate's task done without their commit and evidence._

## Actual contributions (from git, not from plans)

```bash
for b in feat/trueforge-client feat/webview-ui feat/mcp-tools feat/context-engine; do
  echo "$b: $(git log --oneline main..$b | wc -l) commits ahead; authors: $(git log --format='%an <%ae>' main..$b | sort -u | tr '\n' ' ')"; done
git shortlog -sne --all
```

| Branch | Commits ahead of `main` | Authors | Teammate work received |
|---|---|---|---|
| `feat/trueforge-client` | 0 | — | — |
| `feat/webview-ui` | 0 | — | **none yet (Vivan)** |
| `feat/mcp-tools` | 0 | — | **none yet (Toheed)** |
| `feat/context-engine` | 0 | — | **none yet (Kunjal)** |

All commits on `main` were made in Claude Code sessions on Manthan's machine (author "Manthan Chandulal Gajra", co-author Claude). The feature branches sat at the Phase 2 commit, so they had **no teammate work**. **There is still no remote**, so teammates can't push. That is the first blocker (Manthan, action 1).

## What Phase 3 already did (so nobody repeats it)
| Area | Done in Phase 3 (commit) | Evidence |
|---|---|---|
| Retrieval | 33-task benchmark (13 dev, 12 held-out, 8 fresh) `548bb47`, `03314f4`; BM25 + identifier + bidirectional pairing `e06ddb8` | `RETRIEVAL_EVAL.md`: 25/33 fully in top 5 (was 18/33); **fresh set 5/8, no gain** |
| SafeChange | same-file merge + all-or-nothing change sets with rollback `e9c2f5d` | 20 unit + 1 MCP + 1 real VS Code test |
| Performance | stall attribution, MCP pooling, patch posts, perf spans `204ab73` | `PERFORMANCE.md` |
| TrueForge prep | preflight `7320025`, proof uses the extension's staging path `424ca32` | `docs/evidence/preflight-no-keys.txt` |

---

## Today's exact actions (18 Nov): supersede the older task lists below where they overlap

**Manthan**
1. Create an **empty** GitHub repo (no README/licence, so nothing to merge), e.g. `axiom-forge`, public. Then from the repo folder:
   ```bash
   bash scripts/check-publish.sh
   git remote add origin https://github.com/<owner>/axiom-forge.git
   git push -u origin main
   git push origin feat/trueforge-client feat/webview-ui feat/mcp-tools feat/context-engine
   ```
   Add Vivan, Toheed and Kunjal as collaborators. (Commits use `manthan@axiom.local`; GitHub won't link them to your profile. That's cosmetic, so leave it unless you want to rewrite before the first push.)
2. In TrueForge, add provider **`gemini-broken`** (Google Gemini type, any invalid key text, one model), then run the invalid-key test in `TASK_C_RECORDING.md`.
3. After **13:30 IST**: Task B on `gemini-3-5-flash` with `--pace 16 --budget 16000` (commands in `MODEL_KEY_CHECKLIST.md`), then `verify-task-b.sh`. If it passes, repeat through the sidebar UI with `axiomForge.pacing.minSecondsBetweenSteps: 16`.
4. Record A → B → C per `DEMO_SCRIPT.md` and `TASK_C_RECORDING.md`.

**Vivan**: after the push: clone on your Mac, follow README from scratch incl. F5; record the result in `FINAL_TEST_MATRIX.md`. Check the ModelShield banner texts (*Running on backup model …*, *Backup model … completed the request*) and the Proof panel in a live run; screenshots at 360/420/520 px. No redesigns this phase.

**Toheed**: after the push: review `src/mcp/pacer.ts`, `nearestMatchHint` in `src/safety/proposeEditArgs.ts` (it returns file text to the model: confirm the path jail and secret-file rules still bound what can be shown), `scripts/check-publish.sh`; run it yourself; run the `security-review` skill on `src/mcp` + `src/safety`.

**Kunjal**: after the push: own `FINAL_TEST_MATRIX.md`; re-run `npm run check`, `npm run test:vscode` and `bash scripts/tasks/verify-task-*.sh` after each merge; continue F9+ retrieval tasks as planned below (no ranking changes before new tasks are committed).

## Manthan: TrueForge integration, ModelShield, final integration, model verification
**Files:** `src/trueforge/*`, `src/extension/controller.ts`, `src/extension/activate.ts`, `agents/axiom-agent.json`, `scripts/proof.ts`, `scripts/preflight.ts`, `scripts/setup-trueforge.ts`, `docs/TRUEFORGE_INTEGRATION_STATUS.md`, `docs/MODEL_KEY_CHECKLIST.md`.
**Tasks, in order**
1. Create the GitHub repo; push `main` and the four branches; give the three teammates write access. *Commit:* none (push only).
2. Add Gemini + Groq in TrueForge Settings → Models; `npx tsx scripts/preflight.ts --primary <g> --backup <q>` until there are no FAIL/BLOCKED rows.
3. `MODEL_KEY_CHECKLIST.md` steps 5–17 (including 9b, merged edits). *Commit:* `test(trueforge): recorded allow/deny/cancel streams` with the files in `tests/fixtures/trueforge-events/recorded/` plus a `tests/trueforge/recorded.test.ts` that replays them through `TurnTracker`.
4. Tasks A/B/C live per `DEMO_SCRIPT.md`; `verify-task-*.sh` on the **agent's** changes. *Commit:* `docs: live Task A/B/C results` (update `FINAL_TEST_MATRIX.md` rows marked ⏳).
5. Merge teammates' PRs (rebase, `npm run check` + `npm run test:vscode` after each).

**Acceptance:** preflight clean; checklist rows 7–16 pass with recordings; three verify scripts pass on agent output; no ⏳ left in the matrix rows used by the video.

## Vivan: real UI review, streaming performance, diff review UX, responsive and a11y, live state
**Files:** `webview/src/**`, `docs/DESIGN_SYSTEM.md`; read-only: `src/extension/controller.ts` (`postNow`, patch protocol).
**Tasks**
1. Walk every `?state=` preview at 360/420/520 px, dark and light (`npm run dev:webview`). File issues for anything unclear. *Commit:* `fix(webview): …` per issue.
2. F5 → set `axiomForge.devTools: true` → "Stage a sample proposal": review real hunks in the native diff + sidebar; keyboard only (Tab/Enter/Space); screen reader announces "waiting for you" and failures once (check `aria-live`).
3. With keys: run Task B, enable `axiomForge.perfLog`, then **AXIOM Forge: Show Performance Report**. Paste the report and any `event loop stalled` lines into `PERFORMANCE.md` (new "Live run" section). *Commit:* `docs(perf): live Task B measurements`.
4. React Profiler during a live stream: confirm that only the streaming row commits (the patch protocol keeps the other rows' identity). *Evidence:* a profiler screenshot.
5. Make sure the demo states are unmistakable at a glance: thinking/streaming, context assembled, tool running, **waiting for you**, applied, verification running, passed/failed (mapping in `DEMO_SCRIPT.md`).

**Acceptance:** screenshots at 3 widths × 2 themes in `docs/screenshots/`; no horizontal overflow; `npx vitest run webview` green (includes `patch.test.ts`, contrast test); profiler evidence.

## Toheed: security review, MCP validation, same-file edits, multi-file rollback
**Files:** `src/mcp/*`, `src/safety/*` (incl. new `merge.ts`, `stage.ts` `stageProposeEdits`, `safeChange.ts` `applyChangeSet`), `src/verification/*`, `src/workspace/*`, `src/extension/vscodeHost.ts`, `tests/safety/*`, `tests/mcp/*`.
**Tasks**
1. Read and challenge the Phase 3 SafeChange design (merge rule: overlapping **or adjacent** edits conflict; change set = everything approved in one review; first approved call applies the set). Write down anything you disagree with in `KNOWN_LIMITATIONS.md` or fix it.
2. Run the `security-review` skill on `src/mcp` and `src/safety`; fix confirmed findings with a test each. *Commit:* `fix(security): …`.
3. Add adversarial tests: path traversal inside `edits`, a merged proposal where one call targets a symlink, 50 edits in one call, CRLF + BOM files, a change set where a file is deleted between review and apply. *Commit:* `test(safety): adversarial SafeChange cases`.
4. Start TrueForge **without** `OUTBOUND_URL_ALLOWED_HOSTS` and record the refusal (negative SSRF check). *Commit:* `docs: SSRF negative check`.
5. F5 + dev harness: screen-record the CodeLens Accept/Reject → Apply → Undo flow and a conflict.

**Acceptance:** `npx vitest run tests/safety tests/mcp` green with the new cases; security findings fixed or documented; recording linked in `FINAL_TEST_MATRIX.md`.

## Kunjal: context evaluation, generic retrieval, metrics, regression tests
**Files:** `src/context/*`, `scripts/eval-retrieval.ts`, `scripts/debug-retrieval.ts`, `tests/context/flaskGolden.test.ts`, `docs/RETRIEVAL_EVAL.md`, `docs/FINAL_TEST_MATRIX.md`.
**Rules:** no file names, task words or Flask special cases in `src/context`; write new tasks **before** changing ranking and commit them first; report the fresh-split result even if it goes down.
**Tasks**
1. Write ≥ 10 new fresh tasks (F9+) with grep-checked ground truth across modules not yet covered (e.g. `typing.py`, `globals.py`, `__main__.py`, `docs/patterns/*`, `docs/tutorial/*`). *Commit:* `test(context): fresh tasks F9–F18 (before tuning)`.
2. Implement **identifier decomposition**: index the word parts of definition names (`handle_url_build_error` → handle, url, build, error) and score task words against them. Then try a lower BM25 `b` for code. *Commit:* `feat(context): …` with before/after on F9+ only.
3. Run the receipt on a larger repo (`pallets/werkzeug`): record index time, memory and `assemble` latency.
4. Raise the floors in `flaskGolden.test.ts` only after a new measurement.
5. Own `FINAL_TEST_MATRIX.md`: re-run it after each merge.

**Acceptance:** ≥ 80% of fresh tasks fully in top 5 **or** an honest report of why not; golden + floor tests green; latency p50 < 50 ms on Flask.

---

## How work comes back
Each member works on their own branch, opens a PR into `main` with test output and screenshots, and Manthan merges after `npm run check` and `npm run test:vscode`. This file is updated from `git log`, not from chat.
