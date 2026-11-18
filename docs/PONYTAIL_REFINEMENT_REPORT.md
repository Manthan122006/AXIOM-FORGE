# Ponytail refinement report

**Date:** 19 Nov 2026 · **Base commit:** `20d9e1d` · **Audit:** `docs/PONYTAIL_CODE_QUALITY_AUDIT.md` (Ponytail 5.3.3, `/ponytail-audit`, then `/ponytail-review` of the audit itself).
**Scope approved by the team:** findings **1, 2, 3 and 5** only. Findings 4 and 6–11 were deliberately not applied.

## What was changed, and why

| # | Finding | Change | Files |
|---|---|---|---|
| 1 | A failed save was reported as "applied" | `VsCodeWorkspaceHost.writeText` now throws when `doc.save()` returns `false`; `deleteFile` throws when VS Code refuses the delete. SafeChange already turns a thrown write into `failed` (and rolls back change sets), so Proof can no longer verify a file that was never written, and Undo can no longer say "Reverted" when it did not. | `src/extension/vscodeHost.ts` (+4/−2) |
| 2 | A stalled TrueForge could lock a run, with Stop ignored | `createSession` takes the run's abort signal and combines it with a 30 s deadline (`AbortSignal.any`). It is passed to all three calls that can stall: `sdk.agents.list`, `sdk.sessions.create` and the inline-manifest `fetch`. The controller passes `run.abort.signal`. When TrueForge answers normally nothing changes. | `src/trueforge/client.ts` (+10/−3), `src/extension/controller.ts` (+1) |
| 3 | An unused message ran commands without the approval dialog | Deleted the `runVerification` webview→host message type, its handler and `runUserVerification`. Nothing sent it, and it was the only command path without approval. | `src/shared/contracts.ts` (−1), `src/extension/controller.ts` (−12) |
| 5 | The VS Code API floor was not type-checked | `@types/vscode` pinned to `1.100.0` to match `engines.vscode ^1.100.0`; the code typechecks against it unchanged. | `package.json`, `package-lock.json` |

Comments were added only where the reason is not visible in the code (why a failed save must fail the write; why session creation has a deadline).

### Tests added
- `tests/trueforge/client.test.ts` (2 tests): a local HTTP server that accepts connections and never answers; aborting the run's signal makes `createSession` reject in under 2 s, for both the saved-agent (SDK) path and the inline (`fetch`) path. **Checked against the old code:** both tests fail there (they hang until the test timeout), and pass with the fix.
- `tests/integration/suite/extension.test.cjs`: "a save that fails is reported as failed, never as applied (disk unchanged)". In real VS Code, a read-only file is targeted; the save fails with `EACCES`, SafeChange reports `failed`, and the file on disk is unchanged. The cleanup avoids touching editors so later tests are not affected.
- The existing "Open Workspace" UI test's failure message now lists the open tabs (diagnostic only; the assertion is unchanged).

## Tests executed (before → after)

| Check | Before (baseline at `20d9e1d`) | After |
|---|---|---|
| Typecheck (extension + webview) | pass | pass |
| Lint | pass | pass |
| Unit tests (`vitest`) | 217/217, 15 files | **219/219**, 16 files (+2 new) |
| Production build (extension + webview) | pass | pass (`dist/extension.js` 2.28 MB, `dist/webview/main.js` 288 KB) |
| VS Code integration (real VS Code 1.125.1) | 12 passing, 2 pending | **13 passing, 2 pending** in 4 of 5 runs; 1 run had 1 failure (see below) |
| Context retrieval benchmark | 25/33 in top 5, R@5 0.84, R@10 0.94, in-context 0.94 | identical |
| Flask Task A/B/C checkers on a clean tree | A FAIL, B FAIL, C PASS (expected) | identical |

Areas covered by the passing suites:
- **SafeChange:** 27 unit tests, plus 5 VS Code tests (apply/undo, per-hunk, conflict, change set with rollback, and the new save failure).
- **ModelShield / fallback:** 12 unit tests, plus the real-TrueForge fallback test (unconfigured primary and backup → `bad_config`, both tried, workspace unchanged).
- **Cancellation:** 9 unit tests, plus the 2 new abort tests.
- **TrueForge:** recorded-stream replays, the reducer, and live connectivity with MCP tool listing.
- **Proof of Change:** the approved `run_command` integration test records a Proof entry.

**Intermittent failure, reported honestly:** in one of five runs with the final code, the existing test `[UI] "Open Workspace" opens one full-size AXIOM Forge tab` found 0 tabs 500 ms after opening the panel. That run also logged "Extension host is unresponsive" several times; the machine was also running a second VS Code window, TrueForge and the AXIOM demo. The baseline code passed this test in both of its runs. A first version of the new read-only test closed an editor in its cleanup and the UI test failed in both runs with it; that cleanup was replaced. The remaining single failure could not be reproduced in three further runs, and its cause is not proven.

**Not executed:** live model runs (Task A/B/C end to end and the two opt-in `[LIVE]` tests). They need model quota and were not part of the baseline either; the task checkers were run.

## Improvements considered and not applied
| Finding | Why not applied |
|---|---|
| 4. Abort-listener leak in the pacer and ModelShield sleep | Measured but harmless at the expected load (about 30 listeners per paced run, freed with the run); pacing is off by default. Not approved for this pass. |
| 6. `Math.random` CSP nonce | Theoretical risk only (static HTML). Not approved. |
| 7. Opening a deleted file fails silently | Edge case with no data at risk. Not approved. |
| 8–11. Duplicate example list, `Proof.tsx` naming, small dead code, output-limit naming | Tidiness, not defects; every edit costs an integration re-test. Not approved. |
| Splitting `assembleContext` | Clearly staged and guarded by the 33-task benchmark; risk to measured ranking. |
| Merging `SafeChange.apply` into the change-set path | Would require rewriting safety tests; both paths are tested. |
| Merging the two `describe()` helpers in the webview | Would change on-screen wording. |

## User-visible behaviour
- **Unchanged:** the UI, styles, animations and the seven screens (no webview file was modified); the demo workflow; the demo videos (not touched).
- **Changed, only in failure cases:**
  - a save that fails now shows as a failed apply instead of "applied";
  - a TrueForge that hangs during session creation now fails the attempt after 30 s, or immediately on Stop, instead of locking the extension.

## Remaining technical debt and limitations
- Findings 4 and 6–11 (above).
- The integration tests run on VS Code 1.125.1; the 1.100 floor is type-checked, not run.
- One intermittent UI-timing failure in 1 of 5 runs, cause not proven (above).
- Live end-to-end Task A/B/C runs were not repeated for this change.
