# Final QA report: AXIOM_FORGE_FINAL_DEMO.mp4

## Pass 2 (19 Nov 2026): opening frame and end credits

Checked on the rendered file.

| Check | Original (`archive/AXIOM_FORGE_FINAL_DEMO_v1.mp4`) | Final |
|---|---|---|
| Duration | 200.0 s (6000 frames) | **202.0 s** (6060 frames; container 202.1 s) |
| Resolution / aspect | 1920×1080, 16:9 | 1920×1080, 16:9 |
| Frame rate | 30 fps | 30 fps |
| Video codec | H.264 High, yuv420p, CRF 16 | same settings |
| Audio | AAC 48 kHz stereo, −15.1 LUFS, −1.3 dBTP | AAC 48 kHz stereo, **−15.1 LUFS, −1.4 dBTP** |
| Full decode | clean | **clean** (no errors) |
| Black frames | none | only the intended fade at the end (last ~0.2 s at video black, luma 16) |

### Opening reviewed
Frame 0 now shows only the mark, "AXIOM FORGE" and the tagline. The reveal (0:18–0:32) was checked frame by frame and contains no disclaimer, as before.

### Ending reviewed
Frames checked every second from 3:12 to the end. The mark, wordmark, tagline, rule, event line and audio credits are fully visible, with no clipping or overlap; the credits are legible at 1080p (26 px). The slate ends in a clean fade to black. The Hyperframes `check` gate passed, with 41/41 text elements meeting WCAG AA contrast. One accepted warning: the credit text is below the 28 px phone-reading floor, deliberately, as secondary information.

### Audio credits retained accurately
- Music: Sascha Ende, ende.app (CC BY 4.0)
- Sound effects: Kenney (CC0)
- Voice: Kokoro

These are the same credits and licences as the previous version; nothing added or removed.

### Transitions reviewed
The cut from Proof of Change into the screens montage at 3:00.6 was checked frame by frame (3:00.2–3:01.6). Montage → closing statement → slate → fade to black all behave as intended.

### Main demo footage preserved: measured
| Span | PSNR, final vs original | Meaning |
|---|---|---|
| 0:30–3:00.57 | **infinite** (every decoded frame bit-identical) | untouched |
| 0:00.03–0:30 | 65.4 dB average (min 56.6) | visually identical; only the encoder's first group of frames shifts because frame 0 changed |
| frame 0 | 32.2 dB | intentionally changed (new opening frame) |
| 3:13–3:20 | 31.5 dB | intentionally changed (new slate) |

### Audio synchronisation: measured
Compared sample by sample with the original:
- **Offset:** 0 ms in every segment, so there's no drift.
- **Level:** within ±0.01 dB in every 2-second window up to 3:00.
- **Waveform:** not bit-identical. The residual is 23–51 dB below the signal, because the renderer re-mixes and re-encodes the soundtrack on every render.
- **Ending (3:13–3:20):** the level is +0.15 dB, which is expected there because the slate content changed; the cause was not investigated further.

I did not listen to the result; this was measured, not heard.

### No unrelated scenes changed
Changed sources: `tools/build_final.py`:
- the end-slate markup and styles in `s8()`;
- the root duration (200 → 202 s);
- the music bed's clip length (pinned to its own 200 s).

No other scene's code changed. The PSNR results above confirm the picture is unchanged up to 3:00.57.

---

## Pass 1 (18 Nov 2026)
Checked on 18 Nov 2026 against the rendered file, not just the composition.

## File
| Check | Result |
|---|---|
| Container / codecs | MP4, H.264 (yuv420p) + AAC 48 kHz stereo, faststart |
| Resolution / frame rate | 1920×1080, 30 fps (unchanged from the first cut) |
| Duration / frame count | 200.000 s / 6000 frames (= duration × fps) |
| Full decode | `ffmpeg -v error -f null` reports no errors |
| Black frames | 0 segments (blackdetect, 0.2 s, threshold 0.05) |
| Frame 0 | the poster (`poster.jpg`, end card at 198 s); frame 1 starts the film |
| Size | 37.4 MB |

## Audio
| Check | Result |
|---|---|
| Integrated loudness | −15.1 LUFS (target −16 to −14), two-pass loudnorm |
| True peak | −1.3 dBTP (ceiling −1.5 requested; measured −1.3 after AAC) |
| Loudness range | 5.3 LU |
| Voice vs music | narrated windows −13.6 to −14.2 LUFS; music-only window (1:22–1:27) −18.0 LUFS; bed ducks to 0.11 under every line |
| Narration sync | the whole rendered soundtrack was transcribed (faster-whisper); all 26 lines are heard in order at their planned times (e.g. "AI can write code" 0:00, "216 files" 0:05, "Here, 8 of 216 files" 0:45, "58 tests passed" 2:45, "Axiom Forge" 3:13) |
| Narration wording | every line transcribed correctly in isolation; in the full mix the earlier ambiguous "No shell" line was re-voiced (see summary) |
| Sound effects | clicks only on real on-screen clicks; reveal impact at 17.95 s; bell on the wordmark at 193.8 s |

**Limitation:** I cannot listen. Levels, sync and wording were verified by measurement and transcription, not by ear. Please watch once with sound before submitting.

## Picture
| Check | Result |
|---|---|
| Hyperframes `check` (lint, runtime, layout, contrast, craft) | passes; 55/55 text elements meet WCAG AA contrast |
| Whole-film review | frames every 2.5 s across all 200 s inspected, plus snapshots of every changed moment |
| Readability | evidence frames legible at 1080p: "8 of 216 files sent", "23.4k of 24.0k", "Request failed (400): Bad Request", "58 passed, 0 failed", "Exit code 0", "319 ms", "58 passed in 0.07s", "Verified: exit 0" |
| Cropping | typing shot and agent-reads shot re-framed so the Run button and the full task text stay in frame |
| Spelling (on-screen text) | reviewed: all chapter titles, why-lines, callouts, opening and closing lines, footer |
| Transitions | scene seams at 18, 32, 62, 88, 122.6, 152.6 and 180.6 s inspected; no flash frames |
| Remaining craft warnings (accepted) | frame 0 thumbnail (solved by the baked poster); small labels under 28 px in the Trace and "Recorded live" tag (secondary labels) |

## Honesty and privacy
| Check | Result |
|---|---|
| Product footage | 100 % live recordings of the Extension Development Host from 18 Nov 2026; no simulated states; the browser preview was not used |
| Speed changes | two shots at 1.75×, labelled on screen |
| ModelShield | the invalid-key failure and Groq fallback are real (Gemini returned 400; ModelShield switched without retrying); the setup is labelled on screen |
| Claims not made | the full agent profile on the Groq backup (it failed on Groq's free tier in a real run); retrieval benchmark numbers |
| Secrets / personal data | no API keys, tokens, organisation ids, home paths or notifications visible; the three notifications and the Groq org-id error from the recording session are outside every cut (checked frame by frame when the clips were cut) |

## Known limitations
- The Activity screen's "Files touched" column shows "change proposed" for files that were applied (a small product UI wording issue, unchanged because the app was not to be modified); it is partly out of frame in that shot.
- In ModelShield, the Models view is shown before the backup's diff, the reverse of recording order, for clarity (documented in `storyboard.md`).
