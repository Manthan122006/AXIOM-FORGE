# First Product Demo: launch and explore AXIOM Forge locally

Nothing here pushes, publishes or adds a remote. Everything runs on your Mac.

## What runs where
| Piece | How it starts | Where |
|---|---|---|
| **TrueForge 0.185.1** (agent loop, model calls, approvals) | terminal 1, keep it open | http://localhost:8790 (listens on `[::1]`) |
| **VS Code Extension Development Host** with AXIOM Forge | `bash scripts/demo.sh` (or F5 in VS Code) | a separate VS Code window on `fixtures/flask` |
| **AXIOM MCP server** (7 editor tools) | started by the extension on activation | `http://127.0.0.1:7811/mcp` |
| **Webview UI** (sidebar) | built React bundle `dist/webview/main.js`, loaded by the extension | AXIOM Forge icon in the activity bar |
| Agent definitions | chosen per run by the extension | agent mode → `agents/axiom-agent.json`; ⌘I inline edit → `agents/axiom-agent-inline.json` (compact) |

## Launch (exact commands)
Terminal 1 (leave running):
```bash
OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1
```
Terminal 2, from the repo:
```bash
bash scripts/tasks/reset-fixture.sh
```
```bash
bash scripts/demo.sh
```
`demo.sh` checks TrueForge, runs `npm run build`, checks `fixtures/flask`, writes an **isolated VS Code profile** in `~/.axiom-forge-demo` (your own VS Code settings and extensions are untouched; nothing is written into `fixtures/flask`), and opens the Extension Development Host. Defaults: primary `google-gemini/gemini-3-5-flash`, backup `groq/qwen-3-8-27b`, pacing 16 s, perf log on. Override: `PRIMARY=google-gemini/gemini-3-5-flash-lite bash scripts/demo.sh`.

Alternative: open the repo in VS Code and press **F5** ("Run AXIOM Forge (Flask fixture)"). That uses your normal profile, so set `axiomForge.models.primary` / `.backup` yourself, in **User** settings (not in `fixtures/flask/.vscode`, which would make Task C's clean-tree check fail).

## In the new window
1. Click the **AXIOM Forge** triangle in the left activity bar → the **Agent** view opens.
2. Header: **● TrueForge** (green = reachable), **● Tools** (green = MCP server listening), and the model pill: the configured primary, green if TrueForge lists it, red if not; hover for primary and backup. "Listed" ≠ quota left.
3. **View → Output → "AXIOM Forge"**: the extension's log (MCP URL, index size, sessions, approvals, stalls, perf spans).
4. Command Palette (⌘⇧P) → type "AXIOM Forge" to see: Inline Edit, Stop, Reconnect, Register MCP Server and Agent in TrueForge, Show Performance Report.

## Model quota (read before spending requests)
Gemini free tier: **20 requests/day, 5 requests/min, 250k input tokens/min per model**; resets at **13:30 IST**. Groq free tier (`qwen-3-8-27b`): **7,000 input tokens/min**. On 18 Nov at 09:40 IST `gemini-3-5-flash` was exhausted until 13:30; only flash-lite models had quota. A ⌘I edit costs ~2–3 requests; an agent-mode task 10–20.

## Restart / stop
- TrueForge: Ctrl+C in terminal 1, run the same command again. Keys are kept in TrueForge's local database.
- Extension after code changes: in the demo window, ⌘⇧P → "Developer: Reload Window" (after `npm run build`), or close it and run `bash scripts/demo.sh` again.
- Clean Flask tree: `bash scripts/tasks/reset-fixture.sh`.
- Remove the demo profile: `rm -rf ~/.axiom-forge-demo`.

Next: `FEATURE_WALKTHROUGH.md`.
