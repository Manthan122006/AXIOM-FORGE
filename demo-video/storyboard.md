# AXIOM Forge competition film: storyboard (3:20)

Film time on the left. "Source" is the raw take and second it was cut from (`footage/raw/`, recorded 18 Nov 2026 in the real Extension Development Host; take start times: 01 16:23:47, 04 16:30:24, 05 16:35:30, 06 16:37:33 IST). Clip ids refer to `footage/cuts.tsv`.

| Film | Scene | Picture | Source | Voice | Evidence status |
|---|---|---|---|---|---|
| 0:00–0:18 | 1. The stranger | Real Flask file paths drift in the dark; "216 files", "285.5k tokens"; "Ask an AI to change it." / "You get confident code." / No reasons, No review, No proof it works | graphics; numbers from the product's Overview and Context receipt | "Every codebase starts as a stranger…" | numbers measured by the product |
| 0:18–0:32 | 2. Reveal | Mark draws, "AXIOM Forge", "An engineering agent inside VS Code, running on TrueForge."; tagline in three beats; the Overview screen rises | c01 = take 01 0.5–15.5 s | "Axiom Forge is an engineering agent…" | tagline is product copy |
| 0:32–1:02 | 3. Repository intelligence | Typing the task, Run; "Context assembled 8 of 216 files"; Context view: figures, map hover, per-file reasons | c02 take 04 3.0–15.6; c03 15.6–21.0; c04 260.5–275.0 | "Describe the change… eight of 216 files… The map shows… every file carries its reason" | **live** |
| 1:02–1:28 | 4. The agent | Agent reads cli.py and test_cli.py (1.75× speed, labelled); native VS Code diff; Trace stops at "Review: waiting for you"; Activity: finished, 2 min 44 s, 6 tool calls, 0 failed | c05 21.0–35.5 @1.75×; c06 36.0–42.5; c07 76.0–80.6; c08 224.0–234.0 | "Then the agent works through True Forge… it stops" | **live** |
| 1:28–2:02.6 | 5. SafeChange Studio | Hunk with the model's explanation; Accept; "Ready to apply"; Decided: applied with Undo change; second file accepted; rename hunk **Rejected**, "Send rejection" | c09 95.5–107.6; c10 150.0–157.5; c11 take 06 70.0–85.0 | "Safe Change shows every hunk… Reject it…" | **live**; disk state checked with `git diff` afterwards (rename absent) |
| 2:02.6–2:32.6 | 6. ModelShield | ⌘I on `get_version` (1.75×, labelled); Models: primary `gemini-broken` **failed (bad config)**, backup qwen-3-8-27b serving, routing history "Request failed (400)"; the backup's docstring diff; accepted, applied | c12 take 05 24.0–38.0 @1.75×; c14 69.0–78.5; c13 40.0–46.5; c15 104.0–110.0 | "Models fail. Here, the primary has a deliberately invalid key…" | **live**; demo setup labelled on screen. Note: c14 is shown before c13 for clarity (in the recording the diff appeared first, then the Models view was opened) |
| 2:32.6–3:00.6 | 7. Proof of change | "AXIOM Forge wants to run a command: pytest tests/test_cli.py -q" → Run command; Proof: 58 passed, 0 failed, 1 passing check; details: exit 0, 319 ms, files covered; Task Trace all green, "Verified: exit 0" | c16 take 04 169.0–179.5; c17 190.5–201.0; c18 208.0–215.0 | "Last, proof… Fifty-eight tests passed. Exit code zero. Applied, and verified." | **live** |
| 3:00.6–3:20 | 8. Final reveal | Seven real screens (stills from the clips) in a slow tilt; the mark; "AXIOM FORGE"; "Understand. Control. Verify."; footer with recording facts and credits | stills from c19, c18, c04, c08, c11, c14, c17 | "Axiom Forge. Understand. Control. Verify." | stills from live footage |

## Cuts made for privacy
- Three macOS notifications crossed the screen during recording (take 04 ≈ 92 s and ≈ 141–147 s, take 05 ≈ 2–4 s; one was a personal WhatsApp message). Every cut avoids them; verified frame by frame (`footage/cuts.tsv`).
- Take 02 (the first run on gemini-3-5-flash) ended with a Groq error that prints the account's organisation id. It is not used.

## What the film deliberately does not claim
- That the full agent profile runs on the Groq backup: in take 02 Gemini hit its free-tier limit and timed out, ModelShield retried twice, switched to Groq, and Groq's free tier rejected the 35k-token request (limit 7k/min). The run ended with "Your files are unchanged." The film shows fallback only on the inline edit, where it worked.
- Retrieval quality numbers beyond the one task shown (the 33-task benchmark is 25/33 fully in the top 5; on fresh tasks 5/8).
