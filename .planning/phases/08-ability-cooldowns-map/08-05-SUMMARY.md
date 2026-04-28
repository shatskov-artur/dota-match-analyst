---
phase: 08-ability-cooldowns-map
plan: 05
status: complete
completed: 2026-04-29
---

# 08-05 Summary — MatchPage page wiring + human checkpoint

## What was built

`client/src/pages/MatchPage.tsx` updated to mount the Phase 8 components and wire merged player props through to them.

- Imported `CooldownsBlock`.
- New in-game row `<div className="mt-12 flex gap-12 items-stretch">` containing three siblings:
  1. `HeroPlayerGrid` (Phase 3 component, unchanged props).
  2. `ItemsBlock` wrapped in `<div className="w-fit flex flex-col">` (Phase 7 layout idiom preserved verbatim).
  3. NEW right-side stack `<div className="flex flex-col gap-8" style={{ width: 320 }}>` containing `DotaMapView` (with new `heroPositions` prop) on top and `CooldownsBlock` below.
- `heroPositions` array constructed from `radiantPlayers` + `direPlayers`, filtered on `typeof p.position_x === 'number' && typeof p.position_y === 'number' && typeof p.hero_id === 'number'`.
- `CooldownsBlock` receives the same merged 10-player array (with `team` literal injected); component self-filters on `ultimate_state`.
- The right-side stack is gated on `!buildings.unavailable` independently — when `building_state` is absent, only the right column hides; HPG + ItemsBlock remain visible (CLAUDE.md "building_state can be absent").
- BuildingsSection unchanged: full-width row below, gated on `!buildings.unavailable`.
- Pre-game / loading skeleton: when in-game gate is closed, `HeroPlayerGrid` renders alone in an `mt-12` block (preserves Phase 3-7 skeleton behaviour).
- Existing `ScoreHeader`, `WinProbBar`, `DraftSection`, h1, back-link, ambient glow untouched.

## Deviation from PLAN

The plan's spec called for a strict two-column restructure (HeroPlayerGrid stacked above ItemsBlock in a left column, DotaMapView stacked above CooldownsBlock in a right column). On human verification, the user rejected the restructure: Phase 7 had shipped `HPG | ItemsBlock` side-by-side with `flex gap-12 items-stretch`, and that visual habit was load-bearing. Plan reinterpreted to preserve the Phase 7 row exactly and additively add a third right-side stack column. All Phase 8 success criteria still observable; no Phase 8 component or contract was changed.

User-facing language for this phase: Russian (per user memory).

## Verification

- `cd client && npx tsc --noEmit` → exit 0, clean.
- `cd client && npm test -- --run` → **86/86 GREEN** across 13 test files.
- `cd client && npm run build` → exit 0 (Vite production build, 432 modules transformed).
- `cd server && npx vitest run` → 54/54 GREEN.
- Human checkpoint: layout approved by user against live tournament match (`да, все верно`).

## Commits

- `e72cc68` feat(08-05): MatchPage two-column layout (D-01) with CooldownsBlock + heroPositions wiring
- `114493c` fix(08-05): keep ItemsBlock visible when buildings.unavailable; gate only right column on buildings
- `190ddd2` refactor(08-05): preserve Phase 7 HPG | ItemsBlock side-by-side; add right stack (Map + Cooldowns)

## Phase 8 success criteria — observed

- SC-08-01 — CooldownsBlock filters out `ultimate_state === 1` and sorts ascending by `ultimate_cooldown` ✓
- SC-08-02 — Each row shows portrait + ult icon + countdown ✓
- SC-08-03 — Block hidden when no entries match the filter ✓
- SC-08-04 — Hero portraits on minimap with team-coloured rings; refresh on existing 30s cycle ✓
- SC-08-05 — Heroes hidden during draft (gate via `game_state === 5 && !buildings.unavailable`) ✓
