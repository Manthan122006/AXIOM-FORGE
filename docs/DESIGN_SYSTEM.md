> **Superseded on 18 Nov 2026 by `AXIOM_DESIGN_SYSTEM.md`** (new palette, seven-area navigation, the Trace). Kept for history.

# AXIOM Forge — Design System (frontend-design pass 1)

**Subject:** a code-review instrument that lives in the VS Code sidebar. **Audience:** engineers (and judges) watching an agent change a real repository. **Primary job:** make it obvious, at a glance, *what the agent looked at, what it wants to change, and what has actually been verified*.

## Plan v1 (first draft)
- Near-black graphite background, one electric violet accent, cyan glow while running.
- Each region (context, changes, tests) as a rounded card with a soft shadow.
- Small monospace uppercase labels ("CONTEXT", "CHANGES") above each card.

## Review against the brief → what changed
That draft matched three generic tells the skill lists: *near-black + a single bright accent*, *the SaaS card kit*, and *all-caps monospace eyebrow labels*. The brief does fix the palette direction (graphite, violet/indigo, cyan for activity, green only when verified), so we keep the hues but change the axes it leaves free:

1. **Surfaces come from the editor, not from us.** Base colors are VS Code theme variables (`--vscode-sideBar-background`, `--vscode-foreground`…), so AXIOM Forge looks native in any theme and the light theme works for free. Our own colors are *semantic only* (action, running, pending, verified, failed). That is more restrained than painting our own graphite slab.
2. **No card per section.** The run is a real sequence, so it gets a single **timeline rail** (a vertical line with step nodes). Only actionable objects (a proposed file change) get a bordered container.
3. **No eyebrows.** Section headings are sentence-case and say what the user gets ("Why these files", "Changes to review", "Proof").
4. **One bold element: the Context Receipt as a ledger.** A receipt is a ledger: rows of files with a relevance bar, tabular token counts, a budget total line that fills like a meter, and an "Left out" section. It is the signature of the product (context assembly is the core of the problem), so it gets the boldness; everything else stays quiet.

## Tokens

| Role | Dark | Light | Used for |
|---|---|---|---|
| `--ax-act` (indigo) | `#8B8CF8` | `#5558D9` | primary actions, focus ring, selection |
| `--ax-run` (ice cyan) | `#6FD3E6` | `#0C7A91` | *only* things happening right now (streaming, running tool) |
| `--ax-ok` (green) | `#4CC38A` | `#1C8054` | *only* after evidence: command exit 0, hunk applied |
| `--ax-wait` (amber) | `#E8B04B` | `#9F6400` | waiting for the user (approval, review) |
| `--ax-bad` (red) | `#F06A6A` | `#C93C3C` | failures, rejected hunks, destructive actions |
| surfaces / text | `var(--vscode-*)` | same | everything else |

All five semantic colors pass WCAG AA (≥ 4.5:1) as text against both the default Dark+ (`#181818`) and Light+ (`#F8F8F8`) sidebars (checked with the contrast formula in `webview/src/theme.test.ts`).

**Type.** UI text in the editor's UI font (`--vscode-font-family`), 13 px base, scale 11 / 12 / 13 / 15. Paths, symbols, commands and diffs in the editor font (`--vscode-editor-font-family`), because they *are* code. Tabular numerals for token counts and durations. Sentence case throughout.

**Space & shape.** 4 px grid (4, 8, 12, 16, 24). Radius 6 px for actionable containers, 3 px for inline chips, 0 for rows. Borders 1 px `--vscode-panel-border`. No shadows except the composer (it floats over the scroll area).

**Motion.** Only motion that explains a state change: a new timeline step fades in (160 ms); the running node pulses slowly (1.6 s) while, and only while, TrueForge is actually running; the budget meter fills once when a receipt arrives (400 ms); a hunk decision cross-fades its state (120 ms). Easing `cubic-bezier(.2,.8,.2,1)`. Everything is disabled under `prefers-reduced-motion`.

## Layout (sidebar, 300–600 px)

```
┌ AXIOM Forge ─────────── ● TrueForge ● Tools ● model ┐  status strip: real state only
│ ┆ You  Add a new built-in CLI command …               │
│ ● Context assembled  12 files · 23.8k / 24k tokens    │  timeline rail (sequence)
│ ┆   [Receipt ledger ▸]                                │  ← signature element
│ ● repo-scout subagent · done                          │
│ ● read_file src/flask/cli.py L590-620        ✓        │
│ ● propose_edit src/flask/cli.py      waiting for you  │
│ ┆ assistant text streams here…                        │
├───────────────────────────────────────────────────────┤
│ Changes to review (3 files · 5 hunks)                 │  sticky when a review is pending
│  src/flask/cli.py  +24 −0   [Open diff]               │
│   hunk 1  @@ -594,3 +594,4 @@  [Accept] [Reject]      │
│  [Reject all]                 [Apply 4 accepted hunks]│
├───────────────────────────────────────────────────────┤
│ Proof  pytest tests/test_cli.py -q   exit 0 · 1.2 s   │
├───────────────────────────────────────────────────────┤
│ [ Ask AXIOM Forge… @ to mention a file or symbol ]  ⏎ │  composer (Stop while running)
└───────────────────────────────────────────────────────┘
```

Left-aligned throughout; numbers right-aligned in tabular columns.

## Copy rules
Name things by what the user gets: "Changes to review", not "Pending proposals". Buttons say exactly what happens: "Apply 4 accepted hunks", "Reject all", "Stop run", "Undo change". Errors say what happened and what to do: "TrueForge isn't running at localhost:8790. Start it with `npx @truefoundry/trueforge@0.185.1`."
