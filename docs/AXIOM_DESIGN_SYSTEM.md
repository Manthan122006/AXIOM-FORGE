# AXIOM Forge Design System

Source of truth: `webview/src/styles.css` (tokens at the top). Contrast is enforced by `webview/src/theme.test.ts`. Supersedes `DESIGN_SYSTEM.md`.

## Principles
1. **State is the decoration.** Colour and motion appear only when they say something true about the run.
2. **One signature: the Trace.** A six-station run strip and a continuous evidence spine in the timeline. Everything around it stays quiet.
3. **Seams, not cards.** Sections are separated by hairlines and spacing; boxes are reserved for things you act on (a file to review, an example to pick, a model node).
4. **Plain words.** Sentence case, no tracked-out capitals, no "a · b · c" strings, numbers in their own figures.

## Colour
| Token | Dark | Light | Use |
|---|---|---|---|
| `--ax-bg` | `#13151a` graphite | `#f4f5f7` | app background |
| `--ax-surface` / `-2` | `#191c22` / `#20242c` | `#ffffff` / `#eceef2` | raised: inputs, files, code, hover |
| `--ax-seam` / `-2` | `#2a2f39` / `#383e4b` | `#dcdfe5` / `#c7ccd5` | hairlines, control borders |
| `--ax-fg` / `--ax-muted` | `#e5e7ec` / `#9ba3b1` | `#181b21` / `#525a68` | text |
| `--ax-act` | `#9c9dfb` indigo | `#4b4ccc` | AXIOM identity, selection, links, focus |
| `--ax-act-strong` | `#5d5fd8` | `#4b4ccc` | primary button (white text) |
| `--ax-run` | `#5cc8e6` ice | `#0a6d84` | **live** work only |
| `--ax-ok` | `#47c68b` | `#1a774d` | verified, applied, accepted |
| `--ax-wait` | `#e8ad4a` | `#8a5700` | waiting for you |
| `--ax-bad` | `#f2706b` | `#b9372e` | failed, rejected, conflict |
Every text colour ≥ 4.5:1 on bg, surface and surface-2 in both themes (tested). High-contrast VS Code themes map surfaces and borders to the theme's own variables.

## Type
- UI: the platform UI face (`-apple-system`, Segoe UI Variable); code and paths: the user's editor font. No bundled web fonts (webview CSP, offline use, size).
- Scale: 11 · 12 · 13 (body) · 15 · 19 (view titles, figures) · 26 (workspace name). Headings 620–680 weight with −0.02em tracking; figures use tabular, slashed-zero numerals.
- Line length ≤ 64ch for prose (`.lede`).

## Shape and surface
Radius by role: 3 px chips, 6 px controls, 8 px boxes, 10 px the composer, 0 for panes. Borders 1 px; state edges 3 px (hunks, banners). One shadow only: the `@` suggestions popover. Focus: 2 px indigo outline, 1 px offset, everywhere.

## Iconography
Seven original 16-unit glyphs (`webview/src/ui/icons.tsx`), 1.5 stroke, each encoding its area (stationed trace for Activity, split hunk for Review, fork with a dashed backup path for Models, ledger with a tick for Proof). No icon libraries.

## Components
`Rail` (navigation with derived badges) · `Trace` · `ViewHead` · `Section` · `Figure` · `Meter` · `Dot` (live ring) · `Empty` · `Skeleton` · `ViewBoundary` · `Composer` · `Timeline` · `FileReview`/`Hunk`/`DecisionBar` · `RelationMap` · route nodes (Models) · proof `Result`.

## Layout
Container queries on `.app`: under 620 px, a 44 px icon rail and 16 px gutters (sidebar); from 620 px, a 168 px labelled rail, 32 px gutters and content capped at 860–920 px (full-size tab). The relation map switches to a narrow layout under 480 px.
