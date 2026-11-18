# Hyperframes Composition Brief: AXIOM Forge

## Objective
A 3:20 competition film for AXIOM Forge (TrueFoundry Forge-a-thon, IIT Bombay) that makes judges understand the problem, see the technical depth in the real product, and remember the name.

## Output
- Composition directory: `demo-video/composition/` (built by `demo-video/tools/build_composition.py`)
- Rendered video: `demo-video/AXIOM_FORGE_COMPETITION_DEMO.mp4`
- Format: landscape, 1920x1080, 30 fps
- Duration: 200 s (explicit `--duration`; Brag's 15–25 s window does not apply)

## Source material
- Project root: `axiom-forge/` (VS Code extension; webview in `webview/src`, host in `src/`)
- Files read: `README.md`, `webview/src/styles.css` (tokens), `webview/src/views/*.tsx`, `webview/src/ui/nav.tsx`, `media/axiom.svg`, `docs/RETRIEVAL_EVAL.md`, `docs/FINAL_TEST_MATRIX.md`, `docs/UX_ARCHITECTURE.md`
- Product name: AXIOM Forge
- Tagline (verbatim, from the Overview screen): "Understand the code. Justify every change. Verify before delivery."
- Closing line (from the person's brief): "Understand. Control. Verify."
- Product moments: real screen recordings of the Extension Development Host (`footage/raw/*.mov`, cut by `footage/cuts.tsv`).
- Copy shown on screen comes from the product or its measured output: "8 of 216 files sent", "23.4k of 24.0k token budget", "285.5k tokens in the whole repo", "14 real relationships", "Tests cli.py", "Name matches cli", "Review: waiting for you", "2 min 44 s", "6 tool calls", "failed (bad config)", "Request failed (400): Bad Request", "Running on backup qwen-3-8-27b", "58 passed, 0 failed", "Exit code 0", "319 ms", "Verified: exit 0", "7 tools served".

## Creative direction
- Tone preset: cinematic; direction: premium technology launch that doubles as an engineering demonstration.
- Angle: an agent that has to earn every write; everything shown is live.
- Hook: the repository as a stranger sees it (real Flask paths, 216 files, 285.5k tokens).
- Outro: seven real screens, the mark, "AXIOM FORGE / Understand. Control. Verify."
- Avoid: generic SaaS language, stock footage, neon, particles, fake UI, fabricated states.

## Visual identity
- Ground `#13151a`, surfaces `#191c22` / `#20242c`, seams `#2a2f39` / `#383e4b`
- Ink `#e5e7ec`, muted `#9ba3b1`
- Accent indigo `#9c9dfb` / `#5d5fd8`; cyan `#5cc8e6` (sparingly); ok `#47c68b`, wait `#e8ad4a`, bad `#f2706b`
- Display: Outfit (bundled). Mono: IBM Plex Mono for paths.
- Signature device: the product's six-station Trace, lifted into a persistent chapter bar that lights as the story advances (Context → Agent → Tools → Review → Applied → Verified).

## Storyboard
See `brag-plan.md` and `storyboard.md` (exact source timecodes).

## Audio
- Role: cinematic support under narration.
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`, extended to 200 s as `assets/music/bed.wav` with a bar-aligned loop (second pass starts at media 30.078 s so beats stay on the grid; crossfade at 132.2–134.4 s).
- Treatment: enters at 17 s; `data-automation` volume lane ducks to 0.11 under every narration line, 0.30 between.
- Cue guidance: preset `.../cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (109.96 BPM). Beat-locked: tagline phrases at 27.93 s and 29.55 s; "58 passed" accent at 165.4 s; finale transition at 180.7 s.
- Audio-reactive: build-time modulation of the indigo halo (S2, S8) and the background glow (S3–S7) from the bed's RMS (`assets/music/bed-audio.json`, extracted with the media-use helper).
- Voice: Kokoro `af_heart` at 0.95 speed, one file per sentence (`assets/vo/*.wav`), placed so on-screen text lands with the spoken word.
- SFX (Brag library, low-HF-risk picks): clicks only on real clicks visible in the footage (Run, Review changes, Accept, Reject, Send rejection, Run command), one soft impact on the reveal, one bong on "58 passed", one soft impact into the finale, one bell under the final wordmark.

## Hyperframes instructions (as followed)
Brag owns the story; Hyperframes owns structure and rendering. Skipped per Brag: storyline step, SPEC.md, usage/history/feedback, REVIEW.md. Gate: `npx hyperframes check` (passes). Render locally. Telemetry disabled for every CLI call.
