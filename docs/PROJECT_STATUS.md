# AXIOM Forge — Project Status

_Audit baseline: 2026-11-17 20:15 IST. Updated as work lands; the latest section is at the bottom._

## Baseline audit (before implementation started)

| Area | Status | Evidence |
|---|---|---|
| Repository / git | NOT STARTED | `axiom-forge/` had no `.git`, no `package.json` |
| Docs (plan, architecture, board, tests, registry, team) | COMPLETE | `docs/*.md` |
| Shared contracts | COMPLETE | `src/shared/contracts.ts`, `tsc --strict` clean |
| Build / lint / test tooling | NOT STARTED | — |
| MCP server + tools | NOT STARTED | only a throwaway probe in the scratchpad, not in repo |
| SafeChange | NOT STARTED | — |
| Context engine | NOT STARTED | — |
| TrueForge client | NOT STARTED | — |
| Webview UI | NOT STARTED | — |
| Extension host | NOT STARTED | — |
| TrueForge server 0.185.1 running locally | COMPLETE | `GET /api/v1/models` → 200 |
| TrueForge → 127.0.0.1 MCP | COMPLETE (tool listing only) | `axiom-probe` connector lists tools |
| Model providers | BLOCKED | `GET /api/v1/settings/model-providers` → `{"data":[]}`; keys to be added by Manthan |
| Model-driven turn / approval / cancel | BLOCKED | needs a model |
| Skills | COMPLETE (installed) / see note | `frontend-design`, `vercel-react-best-practices` installed and pinned; **not in this session's loaded skill list** (installed mid-session), so their `SKILL.md` files are read and followed directly |
