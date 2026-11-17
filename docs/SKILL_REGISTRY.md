# AXIOM Forge — Skill Registry

Discovered with the installed `find-skills` skill (`npx skills find <query>`, 2026-11-17), following its quality rules: prefer ≥1K installs, reputable sources (anthropics, vercel-labs, microsoft, github), and no duplicates of what's already available.

## Already available in this Claude Code session (verified in the session's skill list)

| Skill | Purpose | Project area | When to use |
|---|---|---|---|
| `find-skills` (project, `.agents/skills/find-skills`) | Discover/install skills | Meta | When a new domain comes up |
| `anthropic-skills:mcp-builder` | MCP server design guidance | `src/mcp` | Building/reviewing MCP tools (M-1..M-4) |
| `security-review` | Security review of changes | MCP, safety | Before merging `feat/mcp-tools`; before going public |
| `code-review` | Correctness review of a diff | All | Before each merge to `main` |
| `simplify` | Reuse/quality cleanup | All | After features stabilise |
| `dataviz` | Chart/meter/tile design | Webview | Context budget meter, verification stats |
| `anthropic-skills:pdf` | Create PDFs | Delivery | Write-up PDF (D-3) |
| `artifact-design` | Page design rules | Delivery | Only if we publish a shareable page |

## Newly installed (2026-11-17, approved by Manthan, project-scoped)

Installed with `npx skills add <repo> --skill <name> -y` into `IIT BOMBAY/.agents/skills/`, symlinked into `.claude/skills/`, and pinned by commit in `skills-lock.json`. Both are instruction-only markdown (no scripts); we reviewed them before use. Installer risk scan: Gen Safe, Socket 0 alerts, Snyk Low Risk for both.

| Skill | Source @ commit | Project area | When to use | Notes |
|---|---|---|---|---|
| `frontend-design` | `anthropics/skills` @ `e4bb5d9` (1.1M installs) | Webview UI/UX | Before U-1 tokens and on every panel; two-pass method: token plan first, then build + screenshot self-critique | Its quality floor (keyboard focus, reduced motion, accessible colour) matches our UI requirements |
| `vercel-react-best-practices` | `vercel-labs/agent-skills` @ `1a2c79d` (906K installs) | Webview React | U-2 streaming timeline (re-render on every delta), U-4 review panel | Apply the `rerender-*`, `js-*`, `bundle-*` rules; **ignore `server-*` / Next.js-specific rules**: our webview is a client-only Vite bundle |

## Considered, not installed

| Skill | Source / installs | Why not now |
|---|---|---|
| `wshobson/agents@tailwind-design-system` | wshobson, 73.9K | Optional; revisit only if Vivan adopts Tailwind tokens rather than CSS variables |

## Rejected

| Skill | Reason |
|---|---|
| VS Code extension skills (`aktsmm/...vscode-extension-guide` 218, `s-hiraoku/...` 162, `kjgarza/...` 94, `microsoft/aspire@vscode-extension` 13) | All under find-skills' 1K-install bar; the official VS Code API docs are the better source |
| `github/awesome-copilot@typescript-mcp-server-generator` (12.1K) | Overlaps the already-available `mcp-builder`; generators produce scaffolds we'd have to rework |
| `getsentry/skills@security-review` (23.8K) | Duplicates the built-in `security-review` |
| vitest skills (≤1.3K, small authors) | Low install counts; Vitest docs suffice |
| `github/awesome-copilot@readme-blueprint-generator` | README is short and rubric-driven; not worth a dependency |
| Code-search skills (`mgrep`, `symdex`) | These are tools for *Claude's* searching, not for our product's retrieval engine; they'd add external dependencies |
| `trueforge` query → `da7-tech/sureforge` (101) | Unrelated product, low installs. **No TrueForge skill exists**; we use the TrueForge repo docs directly |

## Which to use together
- UI work: `frontend-design` + `vercel-react-best-practices` + `dataviz` (budget meter).
- MCP work: `mcp-builder` → then `security-review` on the diff.
- Pre-merge: `code-review`, then `simplify`.
- Delivery: `pdf` for the write-up.
