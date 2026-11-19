# Design Audit (before the redesign, 18 Nov 2026)

Screenshots: `docs/screenshots/before/` (the shipped webview in the browser preview, 360 px dark and 520 px light).

## What existed
One vertical sidebar: status header, a single scrolling timeline, a "Changes to review" dock and a Proof dock stacked above the composer. Colours came from the VS Code theme with five semantic accents. About 750 lines of CSS, eight components.

## Weaknesses, most important first
| # | Weakness | Effect | Evidence |
|---|---|---|---|
| 1 | **One undifferentiated column.** Context, activity, review, proof and model health all competed for the same strip | the review dock took ~60% of the height and pushed the run out of view; nothing had room to explain itself | `review-dark-360.jpg` |
| 2 | **No product identity.** It inherited the theme's surfaces; the only "brand" was a triangle | read as a generic VS Code extension | all before shots |
| 3 | **Capabilities without a home.** Context Receipt as a nested ledger inside a timeline row, ModelShield as a transient banner, Proof as a collapsible dock | the five differentiators were present but invisible | `streaming-dark-360.jpg` |
| 4 | **No run overview.** You had to read the whole timeline to know where a run stood | judges can't tell "waiting for you" from "working" at a glance | — |
| 5 | **Template chrome**: meta strings joined with middle dots ("12 files · 23.6k of 24k tokens"), raw unified-diff headers (`@@ -594,6 +594…`) | noisy, mechanical | `review-dark-360.jpg` |
| 6 | **Weak first run**: three bullet points and an empty column | a new user doesn't know what to ask | `empty-dark-360.jpg` |
| 7 | **Model status only after a run**; failure reason lost once the backup took over | Task C story half-told | `offline-dark-360.jpg` |
| 8 | Disabled primary button low contrast; offline message repeated itself | polish | — |
| 9 | No full-size surface | cramped on big displays and in the video | — |

## What was worth keeping
Semantic state colours that already passed AA; the patch protocol and `reconcile` (only changed rows re-render); real-state-only rendering; per-hunk review semantics; focus rings; reduced-motion rule.

## Decision
Keep the architecture and every host message; rebuild the information architecture around seven areas, give AXIOM Forge its own surfaces and type, and make one signature element (the Trace) carry the run's state.
