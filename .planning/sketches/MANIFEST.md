# Sketches Manifest

**Project:** Dota 2 Match Analyst
**Started:** 2026-05-14

## Design direction

Tight dark UI (#0a0a0a / #0f0f0f panels), tabular-numeric data over white headings, restrained accent colors (Radiant green #4ade80, Dire red #ef4444). Skating between "pro broadcast overlay" and "infosec terminal" — never decorative, always functional. Tracking real-time tournament matches, so the user is scanning multiple data dimensions in seconds.

## Reference points

- Dota 2 official broadcast graphics (gold/XP lead overlay)
- Existing project components: ScoreHeader, BuildingsSection, DotaMapView
- Tabular numeric data styling — `font-variant-numeric: tabular-nums` throughout
- Project memory: don't restructure shipped UI layout silently

## Sketches

| # | Topic | Variants | Winner | Tags |
|---|-------|----------|--------|------|
| 001 | HistoryGraphs (Dota-style gold/XP lead) | A: broadcast canonical · B: gradient intensity · C: line + soft fill + static labels | **C** | `#chart` `#data-viz` `#phase-10.2` |
| 002 | Match page layout restructure (Row 1 = heroes \| items \| cooldowns) | A: Map·Roshan·Buildings · B: Map·Roshan·History · C: 2+2 pairs | **C** | `#layout` `#match-page` `#phase-10.3` |
| 003 | Home redesign — full dark esports restyle | 10 themes: A neon · **B slate** · C carbon · D purple · E midnight · F blood · G emerald · H mono · I frost · J gold | **B** | `#theme` `#home` `#redesign` `#full-restyle` |
| 004 | Match page in Tactical Slate (dense screen stress-test) | B slate (default) + A/E/J compare | **B** | `#theme` `#match-page` `#redesign` `#full-restyle` |
