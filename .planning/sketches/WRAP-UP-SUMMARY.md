# Sketch Wrap-Up Summary

**Date:** 2026-05-14
**Sketches processed:** 1
**Design areas:** Charts & Data Visualization
**Skill output:** `.claude/skills/sketch-findings-dota-stats/`

## Included Sketches

| # | Name | Winner | Design Area |
|---|------|--------|-------------|
| 001 | history-graphs | C — Line + soft fill + static peak labels | Charts & Data Visualization |

## Excluded Sketches

_None — only one sketch in this wrap-up batch._

## Design Direction

Tight dark UI for real-time tournament tracking. Black/near-black canvas (#0a0a0a/#0f0f0f), team-identity accents only (Radiant #4ade80, Dire #ef4444), tabular numerics throughout. **Passive readability over interactivity** — users glance during 30s polls, they don't hover. Static labels and color-coded headlines beat tooltips.

## Key Decisions

### Layout
- Charts live in bordered panels (#161616 border, 4px radius, 24-28px padding)
- Two stacked sections per chart panel (Gold lead top, XP lead bottom)
- Each section ~200px tall, full panel width via `preserveAspectRatio="none"`
- Symmetric Y axis around zero with `peak * 1.20` headroom

### Palette
| Token | Value | Purpose |
|-------|-------|---------|
| `--radiant` | `#4ade80` | Radiant team accent (lines, fills, headlines) |
| `--dire` | `#ef4444` | Dire team accent |
| `--panel` | `#0f0f0f` | Chart panel background |
| `--axis` | `#2a2a2a` | Zero line |
| `--grid` | `#1a1a1a` | Minute gridlines (dashed) |
| `--fg-dim` | `#555` | Axis labels |

### Typography
- Section labels: 11px uppercase, tracking 0.18-0.25em, color `#888`
- Headline values: 12px tabular-nums, colored by leading side
- Peak labels: 10px tabular-nums semi-bold, team-color

### Interaction
- **No hover tooltips on charts.** Peak labels (`+3.4k @ 14:30`) deliver the same info passively.
- Hover budget reserved for intel tooltips, draft portraits, items.

### Anti-patterns (validated rejections)
- ❌ Dense filled areas (alpha ≥ 0.55) — variant A. Too loud on dark background.
- ❌ Vertical gradient fills — variant B. Visual noise; misreads small swings as big near zero.
- ❌ Hover scrub lines — overkill for 30s polling cadence.

## Next Step

The skill auto-loads when implementing Phase 10.2 (HistoryGraphs polish). The reference at `references/charts-data-viz.md` contains drop-in SVG composition order, peak detection JS, and edge-anchor clamping logic.
