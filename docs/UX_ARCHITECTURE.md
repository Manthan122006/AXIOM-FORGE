# UX Architecture

## Surfaces
| Surface | How to open | Opens on |
|---|---|---|
| Sidebar (Agent view) | AXIOM Forge icon in the activity bar | **Task** |
| Full-size tab | "Open full size" at the bottom of the rail, the ⤢ button in the view title, or ⌘⇧P "AXIOM Forge: Open Workspace" | **Overview** |
Both are the same app on the same host state (the controller keeps one patch stream per surface).

## The seven areas (rail order)
| Area | Question it answers | Real data it reads |
|---|---|---|
| **Overview** | Is everything ready, and what happened recently? | `workspace` (index stats), `connection`, `mcp`, `models` (listed in TrueForge), runs derived from the timeline, `proposals`, `verification` |
| **Task** | What should change, and where is the run now? | timeline, Trace stations, pending proposals, composer → `send` |
| **Context** | Which files did the agent get, and why? | `receipts` (selected, scores, signals, ranges, excluded, budget, repo stats, **relations from the engine's graph**) |
| **Activity** | What exactly did the agent do, and how long did it take? | timeline per run: tool calls (args, phase, start/finish), subagents, compaction, recovery, run end |
| **Review** | What will be written if I say yes? | `proposals` (hunks, decisions, status, outcome, merged edits) → `hunkDecision`, `acceptAll`, `rejectAll`, `submitReview`, `openDiff`, `undo` |
| **Models** | Which model is serving, and what happens if it fails? | `models`, `recovery`, session slot, **recovery history** (timeline) |
| **Proof** | Is the change actually verified? | `verification` (exit code, duration, output, stale), tests parsed from the real output, applied-but-unverified proposals |

Badges on the rail are derived, never stored: Review shows the number of files waiting; Task pulses while a run is live; Models turns amber or red on a failure; Proof turns red on a failed check; Overview turns red when TrueForge is unreachable.

## Key journeys
1. **First run:** Task opens with "What should change?", three example tasks (understand / change / fix) that prefill the box, and the ⌘I and `@` tips. Overview shows a three-step "Start here".
2. **Agent task:** type → Run. The Trace lights stations as events arrive. When the agent pauses on an edit, the Trace focuses **Review: waiting for you**, the rail shows a badge, and a prompt in Task says the agent is paused and offers **Review changes**. Decide hunks or whole files; the decision bar always says what Apply will do. After apply, **Applied** lights, then **Verified** once a check passes.
3. **Inline edit (⌘I):** unchanged in the editor (native diff + CodeLens); the same proposal appears in Review.
4. **Model failure:** the Task banner and Models both show the reason (e.g. auth), the switch, and the outcome. History stays in Models.
5. **Proof:** each check shows its exit code, duration, parsed test counts and output; changes applied after the last passing check are listed as not verified.

## Writing rules
Name things by what users do (Task, Review, Proof), active verbs on buttons (Apply accepted, Reject file, Open diff in editor), errors say what happened and what to do, empty states give the next action.
