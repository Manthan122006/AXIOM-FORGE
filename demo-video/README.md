# AXIOM Forge competition demo film

**Final video:** `AXIOM_FORGE_COMPETITION_DEMO.mp4`: 3:20 (200.0 s), 1920×1080, 30 fps, H.264 + AAC 48 kHz stereo, −15.1 LUFS integrated, −1.3 dBTP peak. Frame 0 is the poster (`poster.jpg`).

| File | What it is |
|---|---|
| `AXIOM_FORGE_COMPETITION_DEMO.mp4` | the film (not in git: large media) |
| `poster.jpg` | thumbnail / `<video poster>` |
| `brag-plan.md` | Brag plan: angle, hook, tone, voiceover script, storyboard summary |
| `storyboard.md` | shot-by-shot table with exact source timecodes and evidence status |
| `composition-brief.md` | the Hyperframes hand-off brief |
| `composition/` | the Hyperframes project (built by `tools/build_composition.py`) |
| `footage/cuts.tsv` | every footage cut: take, in, out, speed |
| `footage/raw/` | the raw screen recordings (not in git) |
| `share-copy.txt`, `share-copy-variants.md` | captions |

## How it was made
- `/brag --full --voice --duration 200 --tone cinematic` (Brag 0.6.0, installed at project scope in `IIT BOMBAY/.claude/skills/brag`, identical to the official repo). The full workflow was used, not `/brag-slim`, because voiceover was requested.
- Hyperframes 0.9.65, run through its skill launcher with telemetry disabled. FFmpeg 6.0, Chrome Headless Shell and Kokoro live in `IIT BOMBAY/.video-tools/` (no system install; `source .video-tools/env.sh`).
- Footage: `screencapture` of the real Extension Development Host window (1440×810 pt → 2880×1620), driven by scripted clicks and keystrokes on 18 Nov 2026, 16:23–16:45 IST.
- Voice: Kokoro `af_heart`, one file per sentence, checked by transcription (faster-whisper) for every line.
- Music: "Happy Beats / Business Moves Vol. 12", Sascha Ende (ende.app), CC BY 4.0, credited on the end card. SFX: Kenney (CC0).

To re-render: restore `footage/raw/` (or keep the cut clips in `composition/assets/footage/`), then `python3 tools/build_composition.py` and `npx hyperframes render --quality delivery` in `composition/` (via the launcher in `.video-tools/hf`).

## Technical accuracy: what the film shows, and how it was established
| Capability shown | Status | Evidence |
|---|---|---|
| Context engine picks 8 of 216 files within a 24k budget, with per-file reasons and a relationship map | **Live** | takes 02 and 04; same numbers in both runs |
| Agent loop on TrueForge calling AXIOM's MCP editor tools (read, propose edit, run command) | **Live** | take 04: 6 tool calls, 0 failed, 2 min 44 s |
| Agent pauses on every proposed edit; nothing written until approved | **Live** | take 04 (Trace "Review: waiting for you"); files checked with `git diff` |
| Per-hunk accept, apply, undo button | **Live** | take 04 |
| Reject a hunk; agent told not to apply; file unchanged | **Live** | take 06; `git diff` afterwards shows no rename |
| ModelShield: invalid primary key → immediate switch to Groq backup → edit still needs approval | **Live** | take 05 (Gemini returned 400; classified bad config; no retries) |
| ModelShield: rate-limit/timeout retries | **Live, not in the film** | take 02 (429 + timeout, 2 retries) |
| Full agent profile on the Groq backup | **Live, failed; not claimed** | take 02: Groq free tier rejects 35k-token requests (7k/min); "Your files are unchanged" |
| Command approval (no shell, allow-list) and Proof: 58 passed, exit 0, 319 ms | **Live** | take 04 |
| Retrieval quality across 33 tasks | **Measured offline, not claimed in the film** | `docs/RETRIEVAL_EVAL.md` (25/33 in top 5; 5/8 on fresh tasks) |
| Merged multi-edit change sets, rollback on write failure | **Unit/integration-tested only, not shown** | `docs/FINAL_TEST_MATRIX.md` |
| Anything simulated | **None in the film** | the browser preview with simulated events was not used |

Speed changes are labelled on screen ("1.75× speed", two shots). One shot order was swapped for clarity in ModelShield (Models view shown before the backup's diff); `storyboard.md` says so.

## Privacy
Three macOS notifications (one a personal message) and a Groq error showing an organisation id were recorded; every cut avoids them (checked frame by frame). No keys, paths or account names appear.
