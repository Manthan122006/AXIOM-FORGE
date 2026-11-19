# Feature Walkthrough

Status: **✅ live** = verified with real models through TrueForge · **✅ VS Code** = verified in real VS Code without a model · **⏳** = not yet verified. "Model?" = whether it spends Gemini/Groq quota.

Before starting: `historical/FIRST_PRODUCT_DEMO.md` (TrueForge running, `bash scripts/demo.sh`, AXIOM Forge view open). After every feature that changes files: `bash scripts/tasks/reset-fixture.sh`.

## A. Product overview (no model)
| Element | Where | What it shows |
|---|---|---|
| Header | top of the Agent view | **TrueForge** dot (reachability, re-checked every 5 s), **Tools** dot (MCP server on 127.0.0.1:7811), model pill (configured primary; green = listed in TrueForge; hover = primary + backup), **Session** button during/after a run (opens the TrueForge session page) |
| Empty state | middle, before any run | what AXIOM Forge does and the three ways to start (⌘I, describe a change, `@` mentions) |
| Timeline | middle, during a run | your request, model text (streaming), each tool call with its state, Context Receipt, subagents, run end |
| Changes to review | dock above the composer, when the agent proposes edits | one card per file, per-hunk Accept/Reject, Open diff, Undo change, Apply |
| Proof | under the timeline after a command ran | command, exit code, duration, output tail; "stale" after later edits |
| Recovery banner | above the timeline | retrying / running on backup / completed / no model could complete |
| Composer | bottom | instruction box (`@` for files/symbols), Run / Stop run |
| Status bar | bottom-left of VS Code | `AXIOM` with state icon |
| Output | View → Output → "AXIOM Forge" | everything the host did, incl. perf spans and stalls |
Status: ✅ VS Code (activation, MCP, TrueForge listing on 18 Nov in the demo window).

## B. Inline editing (model: ~2–3 requests) · ✅ live (via proof script) · ⌘I UI ⏳
1. Open `src/flask/helpers.py`, select `get_debug_flag` (L28–33).
2. ⌘I → *Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.* → Enter.
3. Timeline: your request → `read_file`/`propose_edit` rows; the tool row turns **waiting for you**.
4. The native diff opens (left = file, right = proposal) with **Accept / Reject** CodeLens above each hunk and **Apply decisions…** at the top. The same hunks are in the sidebar dock.
5. Reject a hunk to see per-hunk control, or accept all → **Apply**. Only accepted hunks are written.
6. **Undo change** on the card restores the file (refused if you edited the file since).
7. Check: `bash scripts/tasks/verify-task-a.sh` → PASS.
Uses `agents/axiom-agent-inline.json`.

## C. Context intelligence (no model for the receipt itself)
- **Without a model (real engine):** `npx tsx scripts/receipt.ts fixtures/flask "Where does Flask decide whether debug mode is on?"`: ranked files, scores, why each was chosen, line windows sent, what was left out and why, budget used.
- **In the product (model):** describe a task in the composer. The agent calls `assemble_context` first, and the timeline shows **Context assembled · N files · x k of 24k tokens**. Expand **Why these files** for the Context Receipt.
- Ranking (details in `docs/RETRIEVAL_EVAL.md`): BM25 keywords, file/folder names (only for words that don't appear in most files), definitions of code identifiers named in the task, imports, test/doc pairing, budget packing with focused line windows. 33-task benchmark: 25/33 fully in top 5.
Status: ✅ (engine, offline) · in-product receipt ✅ live (18 Nov runs).

## D. Autonomous agent mode (model: 10–20 requests) · ⏳ not passing yet
1. Composer: the Task B instruction (no file names) → Run.
2. Timeline: Assemble context → Context Receipt → `repo-scout` subagent → reads → `propose_edit` per file (**waiting for you**).
3. Dock: ≥3 files; several edits to one file appear as **one** diff ("combines N edits"); everything approved applies together (rolled back if a file can't be written).
4. Approve the `pytest` command (modal) → Proof shows exit code and output.
5. **Session** → the TrueForge session page with turns, tool calls and the subagent thread.
On a free Gemini key keep `axiomForge.pacing.minSecondsBetweenSteps` at 16 (the demo profile does). Last attempt: 4/5 checks; masking was case-sensitive (`docs/evidence/taskB-agent-attempt-*`).

## E. Safety
| What | How to see it | Status |
|---|---|---|
| No write without approval | In any run, **Reject all** → the tool response says it was denied; `git -C fixtures/flask status` clean | ✅ live (deny) |
| Approval | accept hunks → Apply | ✅ live |
| Conflict | when a diff is waiting, type into that file (don't save), then Apply → "changed after the proposal was made; nothing written" | ✅ VS Code |
| Cancel | **Stop run** (or ⌘⇧Esc) mid-run → "Run stopped. Nothing unapproved was written." | ✅ live |
| Commands | modal "AXIOM Forge wants to run a command" with the exact command; allowlist, no shell | ✅ live (pytest) |
| Undo | **Undo change** on an applied card | ✅ VS Code |
| Without a model | set `"axiomForge.devTools": true` in the demo profile → ⌘⇧P "AXIOM Forge (dev): Stage a sample proposal": a **labelled non-model** two-hunk proposal on the open file, to try diff review, conflict and undo without quota | ✅ VS Code |

## F. Model recovery (model: Groq ~3 requests)
- Primary = Gemini, backup = Groq: model pill tooltip; Output log shows `model shield:` lines.
- **Quota failure → backup** (as of now, `gemini-3-5-flash` before 13:30 IST is a genuine quota failure): run a ⌘I edit → banner *Retrying …* ×2 → *Running on backup model qwen-3-8-27b* → diff → accept → *Backup model … completed the request*. ✅ live 3/3 (18 Nov, via the VS Code test harness).
- **Invalid key → backup, no retries**: needs the `gemini-broken` provider (`TASK_C_RECORDING.md`). ⏳
- Wait 60 s between Groq runs (7k input tokens/min).

## G. Proof of Change
- Proof panel: command, exit code, duration, output tail, **stale** marker after later edits. ✅ VS Code (simulated approval) · ✅ live: `pytest tests/test_cli.py -q` exit 0 through TrueForge.
- Files modified: the review cards (applied/undone) and `git -C fixtures/flask status`.
- Official checks: `bash scripts/tasks/verify-task-a.sh`, `verify-task-b.sh`, `verify-task-c.sh`.

## Tools for the curious
- ⌘⇧P **AXIOM Forge: Show Performance Report**: timings per operation since activation.
- `npx tsx scripts/preflight.ts --primary <m> --backup <m>`: wiring check without spending quota.
- TrueForge UI http://localhost:8790: sessions, models, the registered MCP server.
