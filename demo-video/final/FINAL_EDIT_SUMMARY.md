# Final edit summary

## Pass 2 (19 Nov 2026): opening frame and end credits only

**Input inspected:** `~/Downloads/AXIOM_FORGE_DEMO.mp4`, byte-identical (SHA-1 `bbd62411…`) to the pass-1 output, so it was edited from its own source composition (`demo-video/final/composition/`, built by `demo-video/tools/build_final.py`), not reconstructed from pixels.
**Output:** `demo-video/final/AXIOM_FORGE_FINAL_DEMO.mp4` (3:22.0). **Previous version kept:** `demo-video/final/archive/AXIOM_FORGE_FINAL_DEMO_v1.mp4` (and the identical copy in Downloads).

### What the inspection found
| Section | Where | What was there |
|---|---|---|
| Opening branding frame | frame 0 (the baked-in poster every player shows before play) | a copy of the old end card, including "Recorded live in VS Code on 18 Nov 2026 for the TrueFoundry Forge-a-thon, IIT Bombay." and the sentence-style audio credit |
| Opening reveal | 0:18.0–0:32.0 | mark, "AXIOM Forge", subline, tagline: **no disclaimer**; left unchanged |
| Ending | 3:00.6–3:20.0 | tiles montage (3:00.6–3:03.5), closing statement (3:04–3:12), brand slate (3:12.6–3:20) with the disclaimer and the cramped credit sentence |
| Transitions | into the ending at 3:00.6 | cut from Proof of Change into the screens montage; unchanged |

### What changed (exactly)
1. **Frame 0 (opening):** replaced by a clean brand frame: the AXIOM mark, "AXIOM FORGE" and "Understand the code. Justify every change. Verify before delivery." No disclaimer, no date, no credits. It is taken from the new end slate at 3:16.0, before any secondary text appears.
2. **End slate (from 3:15.5):** the two footer sentences were removed and replaced by:
   - a short violet rule under the tagline;
   - a subtle event line: **TrueFoundry Forge-a-thon · IIT Bombay · 18 November 2026** (28 px, muted, fades in at 3:16.2);
   - a separate **Audio credits** block at the bottom (fades in at 3:16.75): **Music** Sascha Ende, ende.app · CC BY 4.0 · **Sound effects** Kenney · CC0 · **Voice** Kokoro (26 px, with a 20 px label).
3. **Tagline phrases** on the slate arrive 0.3 s apart instead of 0.45 s, so the secondary information follows sooner.
4. **The slate holds 2.0 s longer**, so the credits stay readable for about 5 s, then **fades cleanly to black** (3:21.35–3:22.0). Total duration 3:20.0 → **3:22.0**.

Unchanged: everything before 3:13 (mark, wordmark and closing statement timing included), all footage, narration, music, sound effects and their timing (the bell and the spoken "Axiom Forge" stay on the 3:13.8–3:13.9 cue), colours and fonts. The closing statement ("AI should not just write code. It should understand, justify and verify every change.") was kept as it was.

Attribution is unchanged in substance: the same three credits and licences as before (from `.claude/skills/brag/assets/music/README.md` and the Brag audio reference). No URLs or licence terms were added or changed.

---

## Pass 1 (18 Nov 2026)
**Output:** `demo-video/final/AXIOM_FORGE_FINAL_DEMO.mp4` (3:20, same length, resolution and structure as the first cut).
**Original kept untouched:** `demo-video/AXIOM_FORGE_COMPETITION_DEMO.mp4` and `demo-video/composition/` are unchanged; the refinement lives in `demo-video/final/composition/`, built by `demo-video/tools/build_final.py` (a fork of `build_composition.py`).

Nothing new was recorded and the AXIOM Forge application was not touched. Every product shot is the same live footage as the first cut (`footage/cuts.tsv`). Scene order, timing (all eight scene boundaries), music, sound effects, visual identity and 21 of 24 narration lines are unchanged.

## What changed, and why

### A. Opening (0:00–0:18): the problem, stated directly
| Before | After | Why |
|---|---|---|
| "Every codebase starts as a stranger." → "216 files / 285.5k tokens" → "Ask an AI to change it. You get confident code." → chips "No reasons / No review / No proof it works" | "AI can write code." then three questions, each landing with its narration: **Can it understand the repository?** (216 files, 285.5k tokens) / **Can it justify the changes it proposes?** ("A confident diff is not a correct one.") / **Can it prove they actually work?** ("Generated is not verified.") | Your brief: the viewer should immediately see that assistants can misunderstand a repo, propose wrong changes, need oversight, and that generation is not verification. The three questions map one-to-one to the tagline that follows in the reveal. |
| Narration: 3 lines (s1a–s1c) | 4 new lines (n1a–n1d), your suggested message, same voice | Same scene length (18 s); the reveal is unchanged. |

### B. Readability of the product footage
| Change | Why |
|---|---|
| Product screen enlarged from 1488×837 to 1560×878 px (+4.8 %), moved up into the space the chapter bar used | Every UI label and line of code is ~5 % larger on all product shots without cropping the VS Code window. |
| Tighter framing on the evidence: Context reasons 1.30→1.45×; the hunk under review 1.40→1.55×; ModelShield routing history 1.40→1.65× (now shows "Request failed (400): Bad Request" legibly); Proof counts 1.45→1.55× and Proof details 1.40→1.75× (exit code, 319 ms, "58 passed in 0.07s" readable) | Only the shots that carry technical evidence were tightened. |
| Two framings re-centred so nothing important is cut off: the typing shot (Run button now in frame) and the agent-reads shot (full task text in frame) | Your request to avoid cropping important controls. |
| Callouts re-positioned proportionally to the larger screen | Keep them beside, not over, the UI they describe. |

### C. Storytelling: the five-step flow
| Before | After |
|---|---|
| Chapter titles: "Repository intelligence", "The agent", "SafeChange Studio", "ModelShield", "Proof of change" | Numbered 1–5 with one plain line saying **why it matters**: 1 Repository intelligence, "AXIOM understands the codebase before it changes it." · 2 Autonomous agent, "It works a real task with real tools, then stops before writing." · 3 SafeChange, "Every proposed hunk stays under your control." · 4 ModelShield, "It recovers when a model provider fails." · 5 Proof of change, "It verifies the outcome with a real command." |
| "Recorded live in VS Code, 18 Nov 2026" under the title | Kept, moved to the right under the Trace so the why-line has room. |

No captions were added over the interface; the why-lines live in the chapter bar above the screen.

### D. Technical evidence
- Made legible through the framing changes in B (routing history with the 400 error, the pytest output line, exit code, duration).
- One narration line was ambiguous in the mix: "No shell, only allow-listed commands" transcribed as "A shell only allows listed commands", the opposite meaning. Re-voiced as "Finally, proof. The agent asks before it runs anything. Only allow-listed commands, and never a shell."
- Nothing was added that the recordings do not show. The existing on-screen labels ("1.75× speed", "Demo setup: primary given an invalid key on purpose") are kept.

### E. Ending (3:00.6–3:20)
| Before | After |
|---|---|
| Screens montage → "AXIOM FORGE" → "Understand. Control. Verify." + three footer lines | Screens montage → **"AI should not just write code."** → **"It should understand, justify and verify every change."** (both narrated) → mark → **AXIOM FORGE** (narrated, on the 193.8 s music cue with the bell) → **"Understand the code. Justify every change. Verify before delivery."** held for 5 s |
| 3 footer lines | 2 short lines: the recording fact and the required music credit (CC BY 4.0 needs attribution); no credits sequence |

### Small fixes
- The opening token counter no longer shows "0.0k tokens" before it starts counting.
- The closing statement's reading hold is marked as deliberate.
- The footer appears earlier so it is readable for long enough.

## What did not change
Scenes 2–7 picture edit and timing; all footage; the Trace chapter device; the reveal; colours and type; music bed, ducking and SFX (except the final bell moving with the wordmark to the 193.8 s cue); the remaining narration (s2a–s7c except s7a).
