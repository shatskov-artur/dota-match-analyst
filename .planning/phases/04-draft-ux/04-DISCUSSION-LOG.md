# Phase 4: Draft UX - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 04-draft-ux
**Areas discussed:** Draft section layout, Ban visualization, Turn indicator, Draft ↔ in-game transition

---

## Draft Section Layout

### Arrangement

| Option | Description | Selected |
|--------|-------------|----------|
| Side-by-side per team | Radiant column \| Dire column. Picks row (5 slots) above bans row (7 slots). Mirror layout. | ✓ |
| Chronological draft order | Actions listed in order they happened with R/D annotation. | |
| Picks only, bans as small icons | Large pick portraits, compact ban icon strip below. | |

**User's choice:** Side-by-side per team

---

### Page Position

| Option | Description | Selected |
|--------|-------------|----------|
| After ScoreHeader, before player grid | Title → ScoreHeader → Draft → HeroPlayerGrid → Buildings. | ✓ |
| Above ScoreHeader (draft first) | Draft is the very first section below the title. | |
| Replace HeroPlayerGrid during draft | Draft slots into HeroPlayerGrid position, no co-existence. | |

**User's choice:** After ScoreHeader, before player grid

---

## Ban Visualization

### Ban style

| Option | Description | Selected |
|--------|-------------|----------|
| Same portrait, red X overlay | Same size as picks, semi-transparent red X across portrait. | ✓ |
| Greyed-out portrait, smaller | ~70% size, desaturated. Picks dominate visually. | |
| Hero name text only | Bans as text labels, no portraits. | |

**User's choice:** Same portrait, red X overlay

---

### Empty slots

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show empty bordered slots | 5 pick + 7 ban slots always visible as empty boxes per team. | ✓ |
| Only show filled slots | Slots appear as heroes are picked/banned. Section grows. | |

**User's choice:** Yes, show empty bordered slots

---

## Turn Indicator

### Visual treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Text label + subtle side glow | Label above grid + left-edge ember glow on active column. | ✓ |
| Text label only | Plain text label, no animation or glow. | |
| Pulsing glow only (no text) | Active column border pulses, no text. | |

**User's choice:** Text label + subtle side glow

---

### Fallback when Valve API has no explicit active team field

| Option | Description | Selected |
|--------|-------------|----------|
| Infer from picks_bans order | Derive from counting picks/bans vs standard CM draft sequence. | ✓ |
| Hide the indicator entirely | If uncertain, show no turn indicator. | |
| Always show both teams as active | Highlight both columns, no directional claim. | |

**User's choice:** Infer from picks_bans order

---

## Draft ↔ In-Game Transition

### What happens when game_state → 5 (in-game)

| Option | Description | Selected |
|--------|-------------|----------|
| Persist above player grid | Draft stays visible (frozen, no turn indicator) for context. | ✓ |
| Collapse/hide once in-game | Draft disappears, player grid becomes main content. | |
| Collapsible by user | Draft persists with a collapse toggle, default expanded. | |

**User's choice:** Persist above player grid

---

### When draft section first appears

| Option | Description | Selected |
|--------|-------------|----------|
| Only when game_state === 2 (draft) | Section mounts during draft, not pre-draft or in-game. | ✓ |
| Always visible (empty pre-draft) | Section always present, fills during draft, freezes in-game. | |

**User's choice:** Only when game_state === 2 (draft)

---

## Claude's Discretion

- Portrait size for draft slots
- CSS animation style for left-edge glow
- Red X implementation (SVG vs CSS pseudo-element)
- Column header label styling

## Deferred Ideas

- Draft pick timer (v2)
- Hero name tooltip on draft portrait (Phase 5 hover interactions)
- Captain's Mode phase label (Ban Phase 1 / Pick Phase 1)
