---
sketch: 004
name: match-page-tactical-slate
question: "Does the Tactical Slate theme hold up on the dense match page (score + panel grid)?"
winner: "B (Tactical Slate)"
tags: [theme, match-page, tactical-slate, redesign, full-restyle]
---

# Sketch 004: Match Page · Tactical Slate

## Design Question
Tactical Slate won on the Home screen (sketch 003). The match page is the densest screen in the
app — score header + win-prob bars + a 3-column row (heroes / items / cooldowns) + a 3-column row
(history chart / roshan+buildings / live map). Does the theme stay readable and not feel crowded
when every panel is full of real data?

## How to View
```
open .planning/sketches/004-match-page-tactical-slate/index.html
```
Default theme is Tactical Slate (the winner). The toolbar dropdown lets you sanity-check the same
dense layout against a few other dark themes for comparison.

## Layout (mirrors real MatchPage.tsx)
- **Score header card** — Radiant/Dire tags, 56px kill scores, status tag, game clock, Roshan timer,
  gold diff, delay disclosure
- **Win-prob bars** — Stratz + Gold rows (R/D split tracks)
- **Row 1:** Heroes & players · Net worth & items · Ultimates on cooldown (3× equal width)
- **Row 2:** Gold/XP lead chart · Roshan + Buildings stack (320px) · Live map (420px)

## What to Look For
- **Card style** — do the soft-shadow rounded panels read as distinct without heavy borders?
- **Gold accent** — used for net worth, gold diff, chart highlight. Too much? Just right?
- **Density** — 5+ panels on screen: still calm, or busy?
- **Numeric legibility** — tabular-nums mono for all scores/timers/net-worth
- **Team colors** — Radiant green / Dire red still pop against the warm charcoal base
- Anything to tweak before we write the real CSS (spacing, radius, accent intensity, contrast)
