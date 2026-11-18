# Final QA report: AXIOM_FORGE_FINAL_DEMO.mp4

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
