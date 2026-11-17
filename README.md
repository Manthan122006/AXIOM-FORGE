# AXIOM Forge

**Understand the code. Justify every change. Verify before delivery.**

AXIOM Forge is a VS Code extension whose coding agent runs on [TrueForge](https://github.com/truefoundry/trueforge). It works out which files matter in a repository bigger than the model's context window, shows *why* it chose them (the **Context Receipt**), proposes multi-file changes that you review **hunk by hunk** before anything touches disk, verifies the result by actually running commands, and falls back to a second model when the first one fails.

Built for the TrueFoundry Forge-a-thon (Techfest 2026–27, IIT Bombay) by Team AXIOM.

> **Starting point:** from scratch. No upstream editor project was forked.

## How it fits together

```
VS Code extension ──@truefoundry/trueforge-sdk (HTTP+SSE)──▶ TrueForge (local, SQLite)
   │  sidebar webview, native diff + per-hunk CodeLens            │ agent loop, model calls, approvals,
   │  SafeChange (stage → review → apply → undo)                  │ subagents, deferred tools, compaction
   │  Proof of Change, ModelShield (retry/backoff/fallback)       │
   └── MCP server on 127.0.0.1 (inside the extension host) ◀──────┘ tool calls
       read_file · search_workspace · find_symbol · related_files · assemble_context · propose_edit* · run_command*
       * approval-gated in TrueForge AND single-use-granted in AXIOM Forge
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · design: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) · status: [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

## Requirements

- macOS (tested), Node **≥ 22.14** (tested 24.18.0), VS Code **≥ 1.125**, Python 3.10+ (for the Flask tasks), git.
- A model provider configured **in TrueForge** (free tiers work). AXIOM Forge never calls a provider directly.

## Setup from a clean clone

```bash
git clone <this repo> axiom-forge && cd axiom-forge && npm ci && npm run build
```

1. **Start TrueForge locally** (pinned; the allowlist lets TrueForge reach our MCP server on loopback only):
   ```bash
   OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1
   ```
2. **Add models** at http://localhost:8790 → Settings → Models (e.g. Google Gemini as primary, Groq as a custom OpenAI-compatible provider as backup). See [config/models.example.json](config/models.example.json). Keys stay in TrueForge.
3. **Get the Flask task repository** (pallets/flask 3.1.3, commit 22d92470, with a venv):
   ```bash
   npm run fixture:flask
   ```
4. **Run the extension:** open this folder in VS Code and press **F5** ("Run AXIOM Forge (Flask fixture)"). It opens `fixtures/flask` with the extension loaded; the MCP server starts on `127.0.0.1:7811` and registers itself in TrueForge.
5. **Load the agent definition** ([agents/axiom-agent.json](agents/axiom-agent.json) for agent mode; inline edits use the compact [agents/axiom-agent-inline.json](agents/axiom-agent-inline.json), sent with each session): Command Palette → **AXIOM Forge: Register MCP Server and Agent in TrueForge**, pick the primary model. Optionally set `axiomForge.models.primary` / `axiomForge.models.backup` in settings for automatic fallback.
   Headless alternative: `npx tsx scripts/setup-trueforge.ts --model <name>`.
6. **Check the wiring** (no keys needed; never calls a provider): `npx tsx scripts/preflight.ts [--primary <name> --backup <name>]`. It checks the agent definition, TrueForge reachability, configured models, that TrueForge lists the 7 MCP tools, and that a TrueForge outage is classified differently from a provider failure. Model-dependent steps are listed as UNVERIFIED until you run [docs/MODEL_KEY_CHECKLIST.md](docs/MODEL_KEY_CHECKLIST.md).

## Using it

- **Inline edit:** select code, press **⌘I** (Ctrl+I), describe the change. The diff opens in the editor with Accept/Reject on each hunk.
- **Agent mode:** describe a change in the AXIOM Forge sidebar; you don't need to name files. Type `@` to mention a file or symbol.
- **Review:** accept/reject each hunk (sidebar or CodeLens in the diff), then **Apply**. **Undo change** reverts an applied file.
  - Several edits the agent makes to the **same file** in one step are merged into **one** diff; overlapping edits are refused, never silently overwritten.
  - Everything you approve in one review is applied **together**: all files are checked first, and if one can't be written the others are restored (not crash-atomic; see limitations).
- **Stop run** cancels the TrueForge turn; anything not yet applied is discarded.
- **Performance:** set `axiomForge.perfLog: true`, then run **AXIOM Forge: Show Performance Report** for per-operation timings. Stalls over 250 ms are logged with the AXIOM work that ran during them ([docs/PERFORMANCE.md](docs/PERFORMANCE.md)).

## Tests

```bash
npm run check          # typecheck + lint + unit tests + build
npm run test:vscode    # runs the extension inside your installed VS Code (no download)
bash scripts/tasks/verify-task-a.sh   # official Task A check against fixtures/flask
bash scripts/tasks/verify-task-b.sh   # Task B: pytest, flask --help, masked JSON, >=3 files
bash scripts/tasks/verify-task-c.sh   # Task C: git status clean
bash scripts/tasks/reset-fixture.sh   # restore fixtures/flask to pristine 3.1.3
npx tsx scripts/eval-retrieval.ts     # 33-task retrieval benchmark (see docs/RETRIEVAL_EVAL.md)
```

## Security notes

- The MCP server binds to `127.0.0.1` only and rejects browser `Origin`s and foreign `Host` headers.
- File access is jailed to the workspace (traversal, symlink escape, `.env`, keys and `.git` are refused).
- `propose_edit` and `run_command` need TrueForge approval **and** a single-use AXIOM Forge grant for that exact call; commands run without a shell from an allowlist with a timeout; output is secret-scrubbed.
- No API keys in this repository. `OUTBOUND_URL_ALLOWED_HOSTS` is narrowed to `127.0.0.1` for local development only.

## Known limitations

See [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

## License & attribution

MIT ([LICENSE](LICENSE)). Built on TrueForge (MIT, TrueFoundry), the Model Context Protocol TypeScript SDK (MIT), jsdiff (BSD-3-Clause), zod (MIT), React (MIT). Developed with Claude Code as an AI coding assistant.
