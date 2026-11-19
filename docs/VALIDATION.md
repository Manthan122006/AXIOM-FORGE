# Validation

What has been verified, and how. Re-run the commands to reproduce. Model-dependent results depend on the provider, the model and the quota.

**Environment for the automated runs (19 Nov 2026):** macOS 15.3, Node 24.18.0, VS Code 1.125.1, TrueForge 0.185.1 running locally, commit `3172c75` plus this documentation and repository-layout pass (no source changes).

## Automated checks (no model calls)

| Check | Command | Result (19 Nov 2026) | What it covers |
|---|---|---|---|
| Typecheck, lint, unit tests, build | `npm run check` | pass; **219/219** tests in 16 files | MCP server and path jail, command policy, approvals, SafeChange (staging, hunks, merge, conflicts, rollback), context engine, failure classification and ModelShield, the stream reducer (including replays of recorded TrueForge streams), webview logic |
| Integration in real VS Code | `npm run test:vscode` | **13 passing, 2 pending** | activation, commands, MCP on 127.0.0.1, TrueForge listing the 7 tools, per-hunk apply and undo through `WorkspaceEdit`, a failed save reported as failed, unapproved edits refused, the native diff with per-hunk CodeLens, conflict detection, change-set rollback, real-TrueForge `bad_config` fallback, the workspace tab |
| Retrieval benchmark | `npx tsx scripts/eval-retrieval.ts` | 33 Flask tasks: **25/33** with every expected file in the top 5, R@5 0.84, R@10 0.94, in-context recall 0.94, p50 latency 21 ms. Fresh tasks never used for tuning: **5/8** | ranking quality and budget; method and per-task results in [RETRIEVAL_EVAL.md](RETRIEVAL_EVAL.md) |
| Task checkers on a clean Flask tree | `bash scripts/tasks/verify-task-{a,b,c}.sh` | A **FAIL**, B **FAIL**, C **PASS** | expected on an untouched tree: A and B check the agent's changes, C checks that nothing changed |
| Preflight (no keys) | `npx tsx scripts/preflight.ts` | agent definitions, TrueForge reachability, model list and failure classification pass; "lists the 7 MCP tools" fails when no AXIOM Forge window is running (the MCP server lives in the extension) | wiring before a model run |

The 2 pending VS Code tests are opt-in live-model tests (`AXIOM_LIVE_PRIMARY`, `AXIOM_LIVE_BACKUP`). Without a running TrueForge, one more test is skipped. On 19 Nov the "Open Workspace" UI test failed once in five runs; the cause is not proven ([KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)).

## Live runs with real models (18 Nov 2026, TrueForge 0.185.1)

| Behaviour | Result | Evidence |
|---|---|---|
| `propose_edit` pauses the turn; approve → applied → turn resumes | verified | `tests/fixtures/trueforge-events/recorded/gemini-allow-edit-and-pytest.json` |
| Deny: reason reaches the model, no file changes | verified | `gemini-lite-deny.json` |
| Cancel mid-turn: no file changes | verified | `gemini-lite-cancel.json` |
| Approved arguments reach the MCP tool unchanged | verified for `propose_edit` and `run_command` | same allow recording |
| ModelShield: a real 429 on Gemini → 2 retries → Groq on a fresh session, workspace unchanged | verified in real VS Code | [MODEL_KEY_CHECKLIST.md](MODEL_KEY_CHECKLIST.md) |
| Task A on agent output | passes `verify-task-a.sh` (run through `scripts/proof.ts`, not the ⌘I UI) | `gemini-lite-task-a.json`, [MODEL_KEY_CHECKLIST.md](MODEL_KEY_CHECKLIST.md) |
| Task C shape (primary fails, backup proposes an inline edit) | in real VS Code: primary 429 → retries → Groq backup proposed the edit, accepted and applied; workspace clean before acceptance in 3 of 3 runs | [MODEL_KEY_CHECKLIST.md](MODEL_KEY_CHECKLIST.md), [historical/PROJECT_STATUS.md](historical/PROJECT_STATUS.md) |
| Agent mode in the workspace UI, end to end | recorded: 8 of 216 files in context, per-hunk review, `pytest tests/test_cli.py` 58 passed, exit 0 | the demo video ([docs/media/axiom-forge-demo.mp4](media/axiom-forge-demo.mp4)) |
| **Task B** | **not passing**: the best attempt passed 4 of 5 checks (the masking check failed) | [evidence/taskB-agent-attempt-verify.txt](evidence/taskB-agent-attempt-verify.txt) |

## Not verified
- Inline edit started from the ⌘I prompt with a live model (the inline path itself ran live in the Task C test above); same-file merging triggered by a real model's output.
- VS Code versions between 1.100 and 1.125 (the floor is type-checked only); Windows and Linux.
- The full agent profile on a free-tier Groq backup (it fails there; see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)).

Earlier, dated test reports are in [historical/](historical/).
