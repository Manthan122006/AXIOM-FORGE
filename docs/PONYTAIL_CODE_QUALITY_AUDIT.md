# Ponytail code-quality audit (read-only)

**Date:** 18 Nov 2026 · **Commit audited:** `20d9e1d` · **Framework:** Ponytail 5.3.3, `/ponytail-audit` (installed from `DietrichGebert/ponytail` via the Claude Code plugin CLI; the installed `skills/` are byte-identical to the repository at `96608e0`). No source file was changed for this report. Corrected after `/ponytail-review` of this report (finding 2's scope and duration, finding 5's test coverage, provenance date, lean estimate label).

**What this repo does:** AXIOM Forge is a VS Code extension. A user describes a change; the extension runs an agent through a local TrueForge server, serves the agent seven editor tools over MCP (read, search, context, propose an edit, run a command), shows every proposed hunk for approval, writes only accepted hunks, falls back to a backup model when the primary fails, and records real test runs as proof.

**Load assumed:** one developer, one VS Code window, one agent run at a time, repositories the size of Flask (~200 files). Findings are judged against that load.

## Baseline (before any change)
| Check | Command | Result |
|---|---|---|
| Typecheck + lint + unit + build | `npm run check` | pass; **217/217** tests in 15 files |
| VS Code integration (real VS Code 1.125.1) | `npm run test:vscode` | **12 passing**, 2 pending (opt-in live-model tests) |
| Context retrieval benchmark | `npx tsx scripts/eval-retrieval.ts` | 25/33 tasks fully in top 5, R@5 0.84, R@10 0.94, in-context 0.94 |
| Flask Task A/B/C checkers on a clean tree | `scripts/tasks/verify-task-{a,b,c}.sh` | A: FAIL, B: FAIL, C: PASS (expected: A and B check agent output, C checks the tree is unchanged) |

## What was read
All of `src/` (MCP server and path jail, command runner, approvals, SafeChange, staging, merge, hunks, ModelShield, failure classifier, TrueForge client, stream reducer, controller, VS Code host, workspace host, context engine), the webview views and shared components, the test suites, the task checkers, `package.json`, and the agent definitions. Read in less depth: `scripts/bench-*`, `webview/src/dev/` (preview tooling), CSS.

## Findings

### Must fix

1. **A failed save is reported as "applied", and Proof can then verify old code** (`src/extension/vscodeHost.ts:L40-58`)
   - **What this is:** In VS Code, SafeChange writes accepted hunks through `VsCodeWorkspaceHost.writeText`, which edits the open document and then calls `doc.save()`. Undo of a new file goes through `deleteFile`.
   - **Problem:** `doc.save()` returns `false` when saving fails (read-only file, disk error, a save conflict), and the result is ignored. SafeChange then marks the change "applied", while the file on disk is unchanged. If the agent next runs `pytest`, the tests run against the old file and Proof can show a passing check for code that was never written. `deleteFile` also ignores `applyEdit`'s result, so Undo can say "Reverted" while the file is still there.
   - **Fix:** throw when `doc.save()` or `applyEdit` returns false (two lines). SafeChange already turns a thrown write into status `failed` and, for change sets, rolls back the files already written.
   - **Risk of changing it:** low; only the failure path changes.
   - **Tests:** a VS Code integration case that makes the save fail (read-only file) and expects `failed`, plus the existing apply/undo integration tests.
   - **If we skip it:** in a rare failure, AXIOM Forge's core promise ("verified") is wrong without any warning.

2. **A run can lock the extension for a long time if TrueForge stops answering while a session is created** (`src/trueforge/client.ts:L63-84`, `src/extension/controller.ts:L483-491`)
   - **What this is:** every run first creates a TrueForge session: through the SDK for the saved agent (`agents.list`, `sessions.create`), or a raw `fetch` POST for inline edits and model overrides.
   - **Problem:** none of these three calls takes the run's abort signal. If TrueForge accepts the connection but never answers, the `fetch` waits until Node's 5-minute header timeout and the SDK calls until their 15-minute timeout; ModelShield then retries and tries the backup, so the run can stay locked for tens of minutes. **Stop run** does not help: `cancel()` aborts the run's signal, which this request does not use, so `runTask`'s cleanup never runs and every later run is refused with "AXIOM Forge is already running" until the window is reloaded.
   - **Fix:** pass the run's abort signal, combined with a timeout (`AbortSignal.any([signal, AbortSignal.timeout(30_000)])`), into all three calls.
   - **Risk of changing it:** low; the request and its error handling are unchanged when TrueForge answers.
   - **Tests:** a unit test with a local HTTP server that never responds, for both paths: aborting the signal rejects `createSession` promptly.
   - **If we skip it:** a hung TrueForge locks the extension for up to tens of minutes, or until a window reload.

### Should fix

3. **An unused message runs commands without the approval dialog** (`src/extension/controller.ts:L370-371, L724-731`, `src/shared/contracts.ts`)
   - **What this is:** the host accepts a `runVerification` message from the webview and runs the command directly (allow-listed, no shell, but no approval dialog).
   - **Problem:** nothing in the webview sends this message (`grep` finds no sender), so it is dead code. It is also the only path that runs a command without asking, and it is broken: when the command is refused by the allow-list, the Proof entry it created stays "running" forever.
   - **Fix:** delete the message type, the `case`, and `runUserVerification`.
   - **Risk:** none for users (no sender exists). Typecheck proves nothing else uses it.
   - **Tests:** typecheck, build, the VS Code tests.

4. **Every paced step leaves a listener on the run's abort signal; the sleep helper is written twice** (`src/mcp/pacer.ts:L12-19`, `src/trueforge/modelShield.ts:L35-42`)
   - **What this is:** with pacing on, each tool result waits a few seconds; ModelShield waits between retries. Both use their own copy of "sleep, but stop early if the run is cancelled".
   - **Problem:** neither copy removes its `abort` listener when the sleep finishes normally. Measured: after 30 paced steps, 30 listeners remain on the run's signal; when the user later presses Stop, all 30 fire. Harmless today, but it grows with every step and the two copies must be fixed together.
   - **Fix:** one small exported `sleep(ms, signal)` that removes its listener when it resolves, used by both.
   - **Risk:** low; same timing and same cancellation behaviour.
   - **Tests:** `tests/mcp/pacer.test.ts` and the ModelShield tests, plus one assertion that no listener is left after a completed sleep.

5. **The VS Code API floor is not checked by the type checker** (`package.json`: `engines.vscode ^1.100.0`, `@types/vscode 1.125.0`)
   - **What this is:** after today's fix the extension declares support for VS Code 1.100+, but the type definitions are still those of 1.125.
   - **Problem:** code can call an API added after 1.100 and typecheck still passes; on VS Code 1.100–1.124 the extension then fails, which is exactly how it silently failed to load on the team's 1.100.2 today. `vsce package` also refuses `@types/vscode` newer than `engines.vscode`.
   - **Fix:** pin `@types/vscode` to `1.100.0` (the code already typechecks against it; verified on 18 Nov, commit `94777c5`). This checks typed API use only: the integration tests still run on VS Code 1.125.1, so a run on 1.100 before submission is still worthwhile.
   - **Risk:** low; type definitions only.
   - **Tests:** `npm run check`, `npm run test:vscode`.

6. **The webview's script nonce uses `Math.random`** (`src/extension/controller.ts:L321`)
   - **What this is:** the Content Security Policy only runs scripts that carry this nonce.
   - **Problem:** `Math.random` is not a secure random source; a nonce is meant to be unguessable. The risk is small (the page HTML is static), but this is the one place the security model relies on randomness.
   - **Fix:** `crypto.randomBytes(16).toString('base64')`, one line.
   - **Risk:** none for behaviour.
   - **Tests:** the VS Code tests that open both surfaces (the webview loads only if the nonce matches).

7. **Clicking a file that no longer exists does nothing and logs an unhandled error** (`src/extension/controller.ts:L352-362`)
   - **What this is:** Context, Activity and Proof let the user open a file.
   - **Problem:** if the file was deleted or renamed since, `openTextDocument` rejects inside a fire-and-forget handler: no message to the user, an unhandled rejection in the extension host.
   - **Fix:** catch it and show the same warning used for refused paths.
   - **Risk:** none.
   - **Tests:** typecheck; manual click on a removed file.

### Nice to have

8. **The three example tasks are written twice** (`webview/src/views/Overview.tsx:L8`, `webview/src/views/Workspace.tsx:L11`). Keep one list (with labels) and import it in both views. Same text on screen.
9. **`components/Proof.tsx` contains only `RecoveryBanner`**, a ModelShield banner; the name points readers to the wrong place. Rename the file to `RecoveryBanner.tsx`.
10. **Small dead code:** the `_fresh` parameter of `controller.attempt` is never used; `scripts/measure-request.ts:L19` has an unused variable; `TrueForgeConnection.health` builds its candidate list from a convoluted expression equivalent to `loopbackCandidates(this.baseUrl)`.
11. **`maxOutputBytes` counts characters, not bytes**, and live output is scrubbed per chunk (a key split across two chunks is not redacted in the live stream; the stored tail is). Rename or document; low impact (8 KB tail, stored copy is scrubbed).

## Considered and not reported as findings (deliberate decisions)
- **`assembleContext` is 250 lines** (`src/context/assemble.ts`). It is split into six numbered, commented stages and guarded by the 33-task benchmark. Splitting it moves shared closures around for little gain, with real risk to the measured ranking. Defer.
- **`python -c …` and `npm run <script>` are allowed commands.** Python is Turing-complete either way; the real gate is the approval dialog, which names the command and says it runs without a shell. Documented behaviour, not a bug.
- **`SafeChange.apply` and the change-set path overlap.** In the app every approved proposal goes through a change set; `apply` is used by tests and the MCP fallback branch. Merging them means rewriting the safety tests; the duplication is guarded by tests on both paths. Defer.
- **Two `describe()` functions** (the banner and the Models view) produce different on-screen wording. Merging would change user-visible text, which this pass must not do.
- **Proposals and grants live in memory for the session.** Fine for one user and one window.

## Summary
- **Verdict:** fix 1 and 2 first (a false "applied", and a lock-up that needs a reload); 3–7 are small and safe.
- **Lean:** about −25 lines possible (hand estimate) (dead `runVerification` path, duplicate sleep helper, duplicate example list, small dead code). No dependency can be removed: the four runtime dependencies (MCP SDK, TrueForge SDK, `diff`, `zod`) are all load-bearing.
- **Not checked:** behaviour on Windows paths; live model runs (Task A/B/C end to end need model quota and were not re-run for the baseline; their checkers were); the webview dev preview tooling; CSS.
