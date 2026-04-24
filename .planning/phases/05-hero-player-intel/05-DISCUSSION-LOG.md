# Phase 5: Hero & Player Intel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 05-hero-player-intel
**Areas discussed:** Hero stats on draft portrait, Counterpick tooltip style, PLAYER-01 stats placement, 'Known to play' threshold

---

## Hero Stats on Draft Portrait (DRAFT-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Badge overlay on portrait | Small stat text at bottom edge of portrait. '52% · 18%'. No slot size change. | ✓ |
| Stats row beneath portrait | Dedicated row below portrait in each timeline slot. Slot height grows. | |
| Only on hover / tooltip | No visible stats by default. Stats appear only in hover tooltip. | |

**User's choice:** Badge overlay on portrait
**Notes:** Keeps the timeline compact. Winrate + pickrate always visible at a glance without interaction.

---

## Counterpick Tooltip Style (DRAFT-04)

### Tooltip style

| Option | Description | Selected |
|--------|-------------|----------|
| Card with portraits | Positioned card with mini hero portraits, top-3 counters, ⚠ flag for known-to-play | ✓ |
| Text-only + flag | Lightweight text tooltip, hero names + ⚠ symbol, no portraits | |
| Inline expansion | Slot expands in-place within the timeline, no floating overlay | |

**User's choice:** Card with portraits — rich, consistent with app's visual language.

### Counter count

| Option | Description | Selected |
|--------|-------------|----------|
| Top-3 | Enough for decisions, not overwhelming | ✓ |
| Top-5 | More info, longer tooltip | |

**User's choice:** Top-3

---

## PLAYER-01 Stats Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Same tooltip as DRAFT-04 | Player name + games/winrate at top of card, counterpicks below. One hover = all intel. | ✓ |
| Inline in PlayerRow | Additional columns in HeroPlayerGrid. Always visible, no interaction needed. | |
| Both surfaces | Tooltip during draft + columns in-game. More complex. | |

**User's choice:** Same tooltip as DRAFT-04
**Notes:** Single hover reveals everything. Keeps PlayerRow table clean. Works in both draft and in-game states.

---

## "Known to Play" Threshold

| Option | Description | Selected |
|--------|-------------|----------|
| ≥5 games + >50% winrate | STATE.md default suggestion | |
| ≥5 games only | Simpler, no winrate filter | |
| ≥10 games + >50% winrate | Stricter — pro players rarely play 10+ games on a single hero casually | ✓ |

**User's choice:** ≥10 games + >50% winrate
**Notes:** Stricter than the STATE.md TODO suggestion. Rationale: in pro play, fewer games per hero means the 5-game bar is too noisy. ≥10 games signals genuine specialization.

---

## Claude's Discretion

- Badge font size and background opacity
- Tooltip positioning CSS (above vs below viewport-aware)
- Loading skeleton behavior inside tooltip while intel loads
- Whether to use OpenDota `?date=90` windowing for player hero stats
- Exact hero color coding on badge (green/red/neutral based on winrate threshold)

## Deferred Ideas

- Hero name tooltip — may include as no-cost addition inside hover card (Claude's discretion)
- Tournament-scoped hero winrate — v2
- OpenDota 90-day window for player stats — Claude decides based on API support
- Patch winrate sparkline — v2
