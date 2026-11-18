# Submission Checklist (Round 1 closes Fri 20 Nov 2026, 23:59 IST; our target is 18:00)

## Eligibility gate
- [ ] Agent loop runs on TrueForge (sessions/turns via SDK + HTTP API; streamed events rendered)
- [x] Editor capabilities exposed as MCP tools (7), agent decides what to read/change
- [x] TrueForge in local mode (`npx @truefoundry/trueforge@0.185.1`)
- [ ] Models configured **in TrueForge** (`scripts/preflight.ts` shows no BLOCKED rows); extension never calls a provider (enforced by an eslint import ban) and works with any TrueForge model
- [ ] Video shows the TrueForge session for Task B
- [x] Repo contains the agent definitions used: `agents/axiom-agent.json` (agent mode, Task B) and `agents/axiom-agent-inline.json` (inline edits, Tasks A and C): **re-check both match what was used in the video**

## Artefact 1: video (public link)
- [ ] ≤ 4:00; editor visible; A → B → C; each verified on screen (`DEMO_SCRIPT.md`)
- [ ] No cut between an instruction and its diff
- [ ] No keys visible anywhere
- [ ] Uploaded as YouTube **unlisted** or Drive "anyone with the link"; opened in a private window to confirm

## Artefact 2: write-up PDF, 1–3 pages, headings in this order
- [ ] 1 Team: names, college/employer, GitHub handles (collect handles from all four)
- [ ] 2 Starting point: "from scratch"
- [ ] 3 Architecture on TrueForge: SDK/HTTP, 7 MCP tools, approval-driven SafeChange, subagent/deferred tools/compaction **only if visible in the session**
- [ ] 4 How context is selected: strategy + 24k budget + eval numbers from `RETRIEVAL_EVAL.md`: quote the **fresh-split** result (5/8) next to the 33-task aggregate (25/33), and say the 80% target wasn't met
- [ ] 5 Model setup: Gemini/Groq models, where they ran, cost (₹0 if free tier), how to switch (TrueForge Settings + two VS Code settings)
- [ ] 6 Scorecard: one row per criterion (A1–A3, B1–B4, C1–C2) with **real** video timestamps and a one-line claim
- [ ] 7 Tools used: Claude Code (Claude) as the AI coding assistant; skills used
- [ ] 8 Known limitations (from `KNOWN_LIMITATIONS.md`, `PHASE_2_AUDIT.md`, `PERFORMANCE.md`): change sets are not crash-atomic; retrieval misses on catch-all files; + "another month"
- [ ] Every claim cross-checked against `FINAL_TEST_MATRIX.md`; nothing claimed that's ⏳

## Artefact 3: GitHub repository (public before the deadline)
- [ ] Repo created, `main` pushed; branches merged
- [x] Clean clone + `npm ci` + `npm run check` passes (18 Nov, local scratch clone)
- [ ] README clean-clone steps (incl. F5) tested on a second Mac
- [ ] `LICENSE` (MIT) present; third-party attributions in README
- [ ] `config/models.example.json` present; `bash scripts/check-publish.sh` → PASS right before the first push and before the deadline (PASS on 18 Nov)
- [ ] `skills-lock.json`/`.agents` decision: they live in the parent folder, not the repo. Mention in write-up section 7 if relevant
- [ ] Opened in a private window to confirm it's public

## Portal
- [ ] Three public links submitted on the Techfest portal; confirmation screenshot saved
- [ ] Optional: social posts with #TrueForge #Forgeathon #AXIOM
