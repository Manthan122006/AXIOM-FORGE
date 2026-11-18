# Task C (resilience): reproducible recording setup

Verified live on 18 Nov 2026 with a *quota* failure as the primary failure: **3/3 clean** (primary fails → backup proposes the edit → accepted → applied → run `done`). The *invalid-key* variant is prepared (below) and must pass once before recording.

## What must be true
| Thing | Value | Why |
|---|---|---|
| TrueForge | `OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1` | pinned; lets TrueForge reach our MCP server on loopback |
| Backup model | `groq/qwen-3-8-27b` | `groq/gpt-oss-20b` fails tool turns (TrueForge echoes `reasoning_content`, Groq rejects it) |
| Inline agent | `agents/axiom-agent-inline.json` (used automatically for ⌘I) | ~1.1k input tokens per request instead of ~2.8k: fits Groq's free 7,000 tokens/minute |
| **Groq cooldown** | **no Groq use for ≥ 60 s before pressing Enter** | Groq free tier: 7,000 input tokens/minute for this model; a Task C turn uses ~3–5k |
| Primary failure | a TrueForge provider with an **invalid key** (recommended), or a Gemini model whose daily quota is used up | the PDF's Task C is "primary model fails" |

## One-time setup: an invalid-key primary that leaves your real key untouched
In TrueForge (http://localhost:8790) → Settings → Models → **Add provider**: type *Google Gemini*, name **`gemini-broken`**, API key: any obviously invalid text (e.g. `invalid-key-for-demo`), add one model, e.g. `gemini-3.5-flash-lite`. Your real `google-gemini` provider stays as it is.

Check it before recording (≈2 requests on Groq, 0 on Gemini):
```bash
npm run build:ext
AXIOM_LIVE_PRIMARY=gemini-broken/gemini-3-5-flash-lite AXIOM_LIVE_BACKUP=groq/qwen-3-8-27b AXIOM_LIVE_EXPECT_AUTH=1 npm run test:vscode
```
Pass = `[LIVE, real models] ModelShield …` ✔ with states `failed (auth)` → `switching` → `recovered` and **no `retrying`**.
(Use the exact model name TrueForge lists: `curl -s http://localhost:8790/api/v1/models`.)

Full Task-C-shaped check through the real extension path (the review is accepted by the test):
```bash
sleep 60   # Groq cooldown
AXIOM_LIVE_PRIMARY=gemini-broken/gemini-3-5-flash-lite AXIOM_LIVE_BACKUP=groq/qwen-3-8-27b AXIOM_LIVE_TASKC=1 npm run test:vscode
```

## Recording steps
1. `bash scripts/tasks/reset-fixture.sh` → `0 changed files`.
2. VS Code settings (workspace): `axiomForge.models.primary` = `gemini-broken/<model>`, `axiomForge.models.backup` = `groq/qwen-3-8-27b`.
3. **Wait 60 s** since any earlier Groq use (or start a stopwatch after the last run).
4. Open `src/flask/helpers.py`, select `get_debug_flag` (L28–33), ⌘I, type the Task A instruction, Enter.
5. On screen: banner *gemini-… failed (auth)* → *Running on backup model qwen-3-8-27b* (no "Retrying": an invalid key is not retried). The diff opens; the editor stays usable meanwhile.
6. **Before accepting**: terminal `bash scripts/tasks/verify-task-c.sh` → clean (nothing was written by the failed primary).
7. Accept the hunk(s) → Apply → banner *Backup model qwen-3-8-27b completed the request*.
8. Terminal: `bash scripts/tasks/verify-task-a.sh` → `TASK A: PASS`.

## If it goes wrong
| Symptom | Cause | Do |
|---|---|---|
| backup fails with 429 "input tokens per minute" | Groq cooldown not respected | wait 60 s, re-run |
| backup fails with `tool_use_failed` | the model emitted a malformed tool call | ModelShield retries it automatically (`model_output`); if it still fails, re-run |
| *Retrying gemini…* appears | the primary failure was transient (quota/timeout), not a bad key | fine for a quota demo; for the invalid-key story, use `gemini-broken` |
| run ends red after the edit was applied | backup hit a limit on its final message; AXIOM does not replay after an approved write | the change is applied and verifiable; re-record for a clean ending |
