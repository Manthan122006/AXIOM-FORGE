# Animation Guidelines

**Rule:** motion only answers a state change that really happened, or an action the user took. Nothing loops except the "live" ring on something actually in progress. Everything is CSS (no animation library: the motions are simple, and a library would add ~40–100 KB to a webview that must stay light during streaming).

## Tokens
`--t-fast` 120 ms (hover, press) · `--t-med` 220 ms (enter, state colour) · `--t-slow` 420 ms (progress fills, route draw) · easing `--ease-out` cubic-bezier(0.16, 1, 0.3, 1). No bounce.

## Implemented motions
| Motion | Trigger (real) | Implementation |
|---|---|---|
| View change | user picks a rail item | pane fade + 3 px rise, 220 ms (`.pane`) |
| Rail indicator slide | user picks a rail item | indigo bar translates to the new item (`.rail-ind`) |
| Rail badge pop | a proposal becomes `staged` | scale-in once (`.rail-badge`) |
| Trace segment fill | a station's event arrives | `scaleX` 0→1, 420 ms (`.seg::after`) |
| Station state | station changes state | border/background colour transition |
| Live ring | tool `running`/`awaiting_approval`, streaming text, active station, running check | 1.8 s expanding ring (`.live::after`) |
| New timeline step | a new event appended | the newest step only fades in (`.tl > .step:last-child`), so revisiting a view doesn't replay history |
| Streaming caret | assistant text `streaming` | 1 s step blink |
| Hunk decision | Accept/Reject | edge colour + background/opacity transition (`.hunk.d-*`) |
| Decision bar | review becomes pending | slides up once (`ax-rise`) |
| Model route | `switching`/`recovered`/backup slot in state | backup path draws (stroke-dashoffset), primary path turns dashed red |
| Meters | budget/score values | `scaleX` transition |
| Banners, review prompt | appear when state requires | fade + rise |
| Skeleton shimmer | **defined but not used yet** (no screen currently waits on a long computation) | gradient sweep |

## Performance
Animations use `transform`/`opacity` only (compositor); SVG motion is on paths' dash offsets, not layout. Streaming updates touch one row (patch protocol + reconcile), so motion never triggers whole-list re-renders. Hidden views live in React `<Activity mode="hidden">`: their effects are paused and their updates run at low priority, after the visible view.

## Reduced motion
`@media (prefers-reduced-motion: reduce)` removes all animations and transitions; every state remains visible through colour and text.
