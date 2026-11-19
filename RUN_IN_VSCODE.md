# Run AXIOM Forge in VS Code

## What you need (once)
- **VS Code** 1.100 or newer (Code → About Visual Studio Code).
- **Node.js** 22.14 or newer (`node -v`).
- **Python 3** and **git**, only for the Flask demo repository.
- Model keys go **into TrueForge**, never into this folder.

## 1. Open the right folder
In VS Code, choose **File → Open Folder…** and pick **this folder** (the one holding `package.json` and this file).

Don't open its parent folder. F5 only finds the launch settings in `.vscode/` when this folder is the workspace root.

## 2. Install and build (once)
Open **Terminal → New Terminal** in VS Code and run:

```bash
npm run setup
```

This installs the dependencies, builds the extension and the UI into `dist/`, and downloads Flask 3.1.3 into `fixtures/flask` with its own virtualenv. It takes about 2–4 minutes.

If you don't have Python or git, run `npm ci && npm run build` instead and use launch option B below.

## 3. Start TrueForge (keep this terminal open)
Open a second terminal (the **+** in the terminal panel) and run:

```bash
OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx -y @truefoundry/trueforge@0.185.1
```

- Leave it running. It serves on `http://localhost:8790`.
- The first time, open that address in a browser, go to **Settings → Models**, and add your providers there:
  - Google Gemini, for example `gemini-3-5-flash`;
  - Groq as the backup, for example `qwen-3-8-27b`.
- `OUTBOUND_URL_ALLOWED_HOSTS` lets TrueForge reach the extension's MCP server on 127.0.0.1.

## 4. Launch the extension (F5)
1. Open the **Run and Debug** view (⇧⌘D).
2. Pick a launch option from the dropdown at the top:
   - **A. Run AXIOM Forge (Flask fixture)**: opens the Flask repository. This is the real demo.
   - **B. Run AXIOM Forge (on its own source, no Flask needed)**: opens this repository.
3. Press **F5**.

A second window, the **Extension Development Host**, opens. That window is the product.

## 5. Use it
1. In the new window, click the **AXIOM Forge** icon in the left activity bar.
2. To see all seven areas full size, click **Open full size** at the bottom of the rail. You can also run ⌘⇧P → **AXIOM Forge: Open Workspace**.
3. Choose the models in ⌘, (Settings) → search `axiomForge`:
   - `axiomForge.models.primary`: `google-gemini/gemini-3-5-flash`
   - `axiomForge.models.backup`: `groq/qwen-3-8-27b`

   Use the names exactly as TrueForge lists them.
4. On free model tiers, set `axiomForge.pacing.minSecondsBetweenSteps` to `16` to avoid hitting rate limits.
5. The first time, run ⌘⇧P → **AXIOM Forge: Register MCP Server and Agent in TrueForge** and pick the primary model. If you skip this, the first run offers **Register now**.
6. Go to **Task**, type a request, and press Run. Then follow it through Context, Activity, Review (accept or reject the edits), Models and Proof.

## If it doesn't work
| What you see | What to do |
|---|---|
| F5 asks "Select debugger" or nothing happens | You opened the wrong folder. Open the folder containing `package.json` (step 1). |
| The dev window opens but has no AXIOM Forge icon | Your VS Code is older than 1.100 and silently skips the extension. Update VS Code. |
| npm warns `allow-scripts … esbuild, fsevents` | Harmless: the build still works. |
| `Cannot find module` / build error | Run `npm ci && npm run build` again. |
| Overview shows TrueForge **offline** | The step 3 terminal isn't running, or something else holds port 8790. |
| MCP shows **not registered** / tools fail | TrueForge was started without `OUTBOUND_URL_ALLOWED_HOSTS` (step 3). Restart it, then in the dev window run ⌘⇧P → **Developer: Reload Window**. |
| A model error, or 429 | Check the key in TrueForge's Settings → Models, wait for the quota to reset, or let the backup take over. |
| Port 7811 already in use | Close any other AXIOM Forge dev window (only one can serve MCP at a time). |
| The Flask window is empty | `fixtures/flask` wasn't downloaded. Run `npm run fixture:flask`, or use launch option B. |
| You changed code | Stop (⇧F5) and press F5 again. The build runs automatically before every launch. |

## Optional: the isolated demo launcher
`bash scripts/demo.sh` does steps 2 and 4 in one go, using a separate VS Code profile in `~/.axiom-forge-demo`. TrueForge must already be running.
