# Brag Plan: AXIOM Forge

Run: `/brag --full --voice --duration 200 --tone cinematic` (the person asked for the full Hyperframes workflow, voiceover and ~3:20).
On Opus 5.5 `/brag` would hand off to `/brag-slim`; it does not here, because the person asked for the full workflow and for voiceover, which brag-slim does not do.
`--duration 200` is the explicit duration, so Brag's 15–25 s window does not apply (SKILL.md: "An explicit `--duration` is that reason").

## What is this app?
A VS Code extension where an AI engineering agent (running on TrueForge, with editor tools exposed over MCP) changes a real repository only after it shows which files it read and why, waits for a person to approve every hunk, and proves the change with a real test run.

## The angle
The judges have seen "AI writes code" a hundred times. The angle here is the opposite: **an agent that has to earn every write.**
Every claim in the film is shown happening in the real Extension Development Host, recorded on 18 Nov 2026: a Flask repository, a real Gemini model through TrueForge, a real 400 from a deliberately invalid key, a real switch to Groq, real hunks accepted and rejected, a real `pytest` run (58 passed). The film never shows a state the product did not reach.

## Hook (first 2–3 seconds)
The repository as a stranger sees it: 216 real Flask file paths raining into a dark field while a counter climbs to **285.5k tokens**. One line lands: **"Where do you even start?"**

## Key moments (the middle)
- **Context receipt.** "8 of 216 files sent", 23.4k of a 24k budget, and every file saying *why* ("Tests cli.py", "Name matches cli"). The relationship map lights up when hovered.
- **The agent stops.** The Trace runs Context → Agent → Tools and halts on **Review: waiting for you**. The rail grows a badge.
- **SafeChange.** One hunk accepted, applied; a whole file accepted; a rename **rejected**: "The agent will be told not to apply this change."
- **ModelShield.** Primary deliberately has an invalid key → `failed (bad config)` → no retries → backup `qwen-3-8-27b` serving → the docstring still arrives and still waits for approval.
- **Proof.** "AXIOM Forge wants to run a command: `pytest tests/test_cli.py -q`" → Run → **58 passed, 0 failed, exit 0** → Trace **Verified: exit 0**.

## Outro / punchline
All seven screens fold into one frame, then: **AXIOM FORGE** / **Understand. Control. Verify.**

## User flow worth showing
Type a plain-English task → watch the context get chosen and the agent pause → accept / reject hunks → approve the test run → see it verified. All from one continuous live take (take 04), plus the inline-edit fallback take (05) and the rejection take (06).

## Tone
- Preset: cinematic
- Creative direction: premium technology launch that doubles as an engineering demonstration; restrained, confident, honest.
- Interpretation: fewer, longer shots; big type only at chapter breaks; the product UI is the hero and holds 6–10 s while it acts; slow camera push-ins on real footage; no neon, no particles, no stock footage.

## Format: landscape — 1920x1080, 30 fps
## Duration: 200 s (3:20)

## Visual identity (from the project: `webview/src/styles.css`)
- Background: `#13151a` (`--ax-bg`), surfaces `#191c22` / `#20242c`, seams `#2a2f39`
- Accent: indigo `#9c9dfb` (`--ax-act`), strong `#5d5fd8`; controlled cyan `#5cc8e6` (`--ax-run`)
- Status: ok `#47c68b`, wait `#e8ad4a`, bad `#f2706b`
- Text: `#e5e7ec`, muted `#9ba3b1`
- Display font: Outfit (bundled; geometric, calm, not the generated-design default). Mono: IBM Plex Mono for code, paths and model ids, the same role mono plays in the product.
- Strongest visual element: the six-station Trace (Context → Agent → Tools → Review → Applied → Verified) and the AXIOM triangle mark (`media/icon.svg`).

## Share copy (draft)
AXIOM Forge: an AI engineering agent for VS Code that shows which files it read and why, waits for you on every hunk, and proves the change with a real test run. Recorded live on Flask.

## Audio direction
- Role: cinematic support under a narrator.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (Brag's pick for polished/cinematic: "steady and clean"), 1:58, extended to 3:20 with a bar-aligned crossfade loop.
- Music treatment: enters at the reveal (≈ 0:20) after a near-silent hook; ducked to ~0.13 under the voice, rises between chapters, swells into the final mark, fades under the end card.
- Music cue guidance: preset `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (read at composition time); lock the logo reveal and the final mark to strong cues.
- Audio-reactive treatment: subtle; music RMS/bass makes the AXIOM mark's halo and the frame glow around the footage breathe slightly. No waveforms.
- SFX posture: sparse, motion-matched. Soft key ticks only on the typed task, mouse clicks on the real clicks (Accept, Apply, Reject, Run command), one soft impact on the reveal, one bell on the final mark.
- Restraint rule: no whooshes on every cut, nothing louder than the voice, no synthetic dings.

## Voiceover script
Kokoro via Hyperframes (`npx hyperframes tts`, voice `am_michael`, fallback `af_heart`). About 330 words at ~150 wpm.

1. **Problem (0:00–0:22).** "Every codebase starts as a stranger. Two hundred and sixteen files. Nearly three hundred thousand tokens. Ask an AI to change it, and you get confident code, with no reasons, no review, and no proof that it works."
2. **Reveal (0:22–0:36).** "AXIOM Forge is an engineering agent inside VS Code, running on TrueForge. It follows one rule. Understand the code. Justify every change. Verify before delivery."
3. **Context (0:36–1:08).** "Describe the change in plain words. Before the model sees anything, AXIOM's context engine ranks the whole repository and sends only what matters: here, eight of two hundred and sixteen files, inside a fixed token budget. Every file carries its reason. The tests that cover it. The docs that describe it. And the map shows how they really connect."
4. **Agent (1:08–1:38).** "Then the agent works through TrueForge, calling AXIOM's editor tools over MCP. It reads the real code. And the moment it wants to change something, it stops. Nothing touches your files until you decide."
5. **SafeChange (1:38–2:10).** "SafeChange shows every hunk, with the model's own explanation. Accept one. Accept a whole file. Apply writes only what you accepted, and every change can be undone. Reject it, and the agent is told not to apply it. The file stays exactly as it was."
6. **ModelShield (2:10–2:40).** "Models fail. Here, the primary has a deliberately invalid key. ModelShield sees a configuration error, skips the retries, and moves the same request to the backup, on a fresh session. The edit still arrives, and it still waits for your approval."
7. **Proof (2:40–3:02).** "Last, proof. The agent asks before it runs anything. No shell, only allow-listed commands. Fifty-eight tests passed. Exit code zero. Applied, and verified."
8. **Close (3:02–3:20).** "AXIOM Forge. Understand. Control. Verify."

## Storyboard
Scene-by-scene detail with exact source timecodes: `storyboard.md`. Summary:

### Scene 1 — The stranger — 22 s
Dark field; 216 real Flask paths (from `git ls-files` of the fixture) drift in faintly; token counter climbs to 285.5k; lines: "216 files." / "285.5k tokens." / "Where do you even start?" / "AI writes the change. Who checked it?"
Sequential/interaction: yes — paths cascade; counter ticks; each line holds ≥ 1.5 s.
Audio intent: near-silence, low room tone; voice carries it.
Transition mood: dramatic → the triangle mark draws itself from one path line.

### Scene 2 — Reveal — 14 s
AXIOM mark draws, wordmark resolves, tagline types in three beats. The real Overview (take 01) rises behind in a tilted, glowing frame.
Sequential/interaction: tagline in three phrases, each held ≥ 1.2 s.
Audio intent: music enters on a strong cue under the mark.
Transition mood: object becomes the world → the Overview frame fills the screen.

### Scene 3 — Repository intelligence — 32 s
Live footage: typing the task, Run, "Context assembled 8 of 216 files"; Context view: figures, map hover, reasons. Callouts: "8 of 216 files", "23.4k of 24k tokens", "Every file says why", "14 real relationships".
Sequential/interaction: real typing and clicks from the recording; callouts appear one by one and hold.
Audio intent: key ticks under the typing, voice explains.
Transition mood: push-in → cut on the click.

### Scene 4 — The agent — 30 s
Trace stations light; Read cli.py, Read test_cli.py, Propose edit; "Review: waiting for you"; badge; "1 file waiting for your review. The agent is paused until you decide." Activity view: 6 tool calls, 2 min 44 s. Health: "7 tools served".
Transition mood: carry across → the paused banner becomes the Review studio.

### Scene 5 — SafeChange — 32 s
Review studio hunk, Accept, Apply accepted; native diff; second file Accept file; rejection take: Reject → "Every hunk is rejected…" → Send rejection → "rejected".
Audio-coupled idea: clicks on Accept / Apply / Reject.
Transition mood: blur swap.

### Scene 6 — ModelShield — 30 s
⌘I on `get_version`; instruction typed; Models view: Primary failed (bad config) → Backup serving; routing history; docstring hunk accepted and applied. Label: "Demo setup: primary given an invalid key on purpose."
Transition mood: colour flood (bad → ok).

### Scene 7 — Proof — 22 s
Command approval dialog; Run command; Proof: 58 / 0 / 1 / 0; details: exit 0, 319 ms, "Changed files then"; Task Trace all green "Verified: exit 0"; Overview "2 changes applied / 0 not yet verified".
Audio-coupled idea: one bright accent on "58 passed".

### Scene 8 — Final reveal — 18 s
Seven real screens arranged as a slow 3D fan, then collapse into the mark; "AXIOM FORGE" / "Understand. Control. Verify." Small honest footer: "Recorded live in VS Code · Flask 3.1.3 · TrueForge 0.185.1".
Audio: final strong cue, bell, music fades under the end card.

**Music mood for this video:** cinematic, steady.
**Audio summary:** quiet hook carried by voice; music arrives with the mark, sits low under narration, lifts at chapter breaks and resolves on the final line.

## Footage honesty
- Everything inside the product frame is screen recording of the real Extension Development Host (takes 01, 02, 04, 05, 06), not the browser preview.
- Take 02 contains a Groq error that prints an organisation id; those frames are not used. A macOS notification that crossed take 04 at ≈ 16:32:58 is cut.
- Not claimed: that the full agent profile runs on the Groq backup (it exceeds Groq's free 7k tokens/minute; the run in take 02 ended "No model could complete the request… Your files are unchanged"). The film shows fallback only on the inline edit, where it was demonstrated.
