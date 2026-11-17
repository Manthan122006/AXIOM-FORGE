# Demo Script (≤ 4:00, Tasks A → B → C, each verified on screen)

**Rules from the PDF:** editor visible throughout; A, B, C in that order; each followed by its verification; show the TrueForge session briefly during B; you may cut model waiting time but **never between giving an instruction and the diff appearing**. Hand-written reference fixes are **never** shown as agent output.

## Setup before recording (off camera)
1. `OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1` (terminal not recorded if it shows keys; it doesn't by default).
2. `bash scripts/tasks/reset-fixture.sh` → "0 changed files".
3. VS Code F5 → `fixtures/flask` opens with AXIOM Forge; sidebar shows ● TrueForge ● Tools.
4. Settings: `axiomForge.models.primary` = Gemini name, `axiomForge.models.backup` = Groq name.
5. Integrated terminal open at `fixtures/flask` with the venv active (`source .venv/bin/activate`). Font size ≥ 16. Close unrelated panels.
6. A browser tab on http://localhost:8790 ready for the session view.
7. `npx tsx scripts/preflight.ts --primary <gemini> --backup <groq>` → no FAIL/BLOCKED rows. If any model-dependent step in `MODEL_KEY_CHECKLIST.md` hasn't passed yet, **don't record**: fix it first.

## What the judges must be able to tell apart on screen (all real events, no fabricated activity)
| State | Where it shows | What it looks like |
|---|---|---|
| Agent thinking / writing | timeline, assistant row | text streaming in, caret while `streaming` |
| Context retrieval | timeline: **Assemble context** tool row → **Context assembled** row | "12 files · 23.6k of 24k tokens"; expand for *Why these files* / *Left out* |
| Tool execution | timeline tool rows | `running` (blue) → `done` / `failed` |
| **Approval required** | tool row says **waiting for you** (amber) + "Changes to review" dock + native diff with Accept/Reject CodeLens | status bar "AXIOM review" |
| Changes applied | review card turns **applied** (green) + "Undo change"; editor shows the file | tool row result "Applied N of M hunk(s)…" |
| Verification running | **Proof** panel: command + `running` | then `passed · exit 0` or `failed · exit N` with output tail |
| Success / failure | final timeline row: **Run finished** / **Run stopped. Nothing unapproved was written.** / **Run failed: …**; ModelShield banner for fallback | |

## 0:00–0:12 Intro
Title card or voice-over: "AXIOM Forge: a VS Code coding agent on TrueForge. It shows what it read, asks before it writes, and proves its work."

## 0:12–1:00 Task A — inline edit
1. Open `src/flask/helpers.py`, select the whole `get_debug_flag` function (L28–33).
2. ⌘I → type exactly: *Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.* → Enter.
3. **Keep recording** until the diff opens (sidebar shows streaming + tool steps).
4. In the diff: point at the hunk(s); click **Accept** on each CodeLens → **Apply decisions…** (or Apply in the sidebar).
5. Terminal: `FLASK_DEBUG=off python -c "from flask.helpers import get_debug_flag; print(get_debug_flag())"` → **False**.
6. Leave the change applied. Undo is demonstrated in the closing segment (3:35) so it doesn't eat Task A time.

## 1:00–2:35 Task B — agent mode
1. `bash scripts/tasks/reset-fixture.sh` (cut).
2. Sidebar composer, type exactly the Task B instruction (no file names) → Run.
3. Show: **Context assembled** step → expand the **Context Receipt** (files, reasons, budget meter "x k / 24k", "Left out"); the **repo-scout** subagent step; read/search tool steps.
4. When proposals arrive: the "Changes to review" dock lists ≥3 files; open one diff; accept hunks (reject one if a hunk is unnecessary, which shows per-hunk control); **Apply**. If the model edited `cli.py` twice in one step, the card says *combines 2 edits from the agent into one diff*: point at it (B2/B3). All approved files apply together.
5. Agent runs `pytest tests/test_cli.py -q` → modal approval → **Proof** shows `passed · exit 0`.
6. Click **Session** in the header → the TrueForge session page (turns + tool calls + subagent thread), 5 s.
7. Terminal: `pytest tests/test_cli.py -q`, then `flask --app ../../scripts/tasks/demo_app config` → masked JSON (`"***"` for SECRET/PASSWORD/TOKEN/KEY).
8. `git status --short` → ≥3 files.

## 2:35–3:35 Task C — resilience
1. `bash scripts/tasks/reset-fixture.sh` (cut). In TrueForge Settings, break the Gemini key (off camera, or show the field with the value hidden).
2. Wait ≥ 60 s after any earlier Groq use (free tier: 7k input tokens/minute), then repeat Task A exactly. Inline edits use the compact agent `agents/axiom-agent-inline.json`.
3. Show the banner: *Retrying …* (only for transient failures) → *Running on backup model …* → *Backup model … completed the request*. The editor stays usable: scroll and type in another file while it runs.
4. Before accepting: terminal `git status` → clean. Then accept → `FLASK_DEBUG=off python -c "…"` → **False**.
5. (If fallback isn't configured: show the clear error and `git status` clean. That earns the 4-point anchor, not 10.)
6. **Only show recovery if it genuinely worked in rehearsal** (checklist steps 13–15 passed). Never stage it with an edited recording.

## 3:35–4:00 Close
Undo demo (one click restores a file), Context Receipt close-up, final frame with repo URL.

## Fallback plans
- Model slow: cut waiting **after** the diff appears, never before.
- Rate limit on free tier: ModelShield retries; if it exhausts, re-record later. Don't fake it.
- Agent proposes a wrong edit: **Reject** it on camera (this demonstrates B2), then re-run.
