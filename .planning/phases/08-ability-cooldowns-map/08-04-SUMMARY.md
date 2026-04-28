---
phase: 08-ability-cooldowns-map
plan: 04
status: complete
completed: 2026-04-28
---

# 08-04 Summary — UI: CooldownsBlock + DotaMapView heroPositions

## What was built

- **`client/src/components/CooldownsBlock.tsx`** (103 lines): new component. Filters players to `ultimate_state != null && !== 1`, sorts ascending by `ultimate_cooldown ?? 0`, returns `null` when active list is empty (D-04 unmount). Mirrors `ItemsBlock`'s ItemSlot via internal `UltSlot` (heroUltimateIconUrl + onError fallback). Row contract: 32px hero portrait, 32px ult icon, tabular-nums countdown with "s" suffix, state label (`charging` / `unavail`).
- **`client/src/components/DotaMapView.tsx`** (156 lines, was 107): extended with optional `heroPositions?: HeroPosition[]` prop. New three-loop SVG block inserted before `{/* Labels */}` — `<defs>` with `<clipPath id="cp-${hero_id}-${team}">`, `<image>` per hero through clipPath, then team-colored stroke `<circle>`. Coordinates come from `normalizeMapCoords(position_x, position_y)` — formula never inlined.

## Verification

- `cd client && npx tsc --noEmit` → exit 0, clean.
- `cd client && npm test -- --run` → **86/86 GREEN** across 13 test files (no prior test broken; CooldownsBlock has no test yet — Plan 05 provides UAT).
- Grep checks pass:
  - `ultimate_state !== 1` × 1
  - `(a.ultimate_cooldown ?? 0) - (b.ultimate_cooldown ?? 0)` × 1
  - `if (active.length === 0) return null` × 1
  - `Cooldowns` × 1, `charging` × 1, `unavail` × 1
  - `heroUltimateIconUrl` × 1, `minHeight: 44` × 1, `tabular-nums` × 1
  - `normalizeMapCoords` × 3 (one per loop)
  - `heroPositions?: HeroPosition[]` × 1
  - `h.team === 'radiant' ? '#4ade80' : '#ef4444'` × 1
  - `preserveAspectRatio="xMidYMid slice"` × 1
- Building `<Dot>` count and RADIANT/DIRE labels untouched in DotaMapView.

## Notable

- DotaMapView.tsx was untracked in git before this plan (no prior commit). The Wave 3 commit therefore registers the file as `create mode 100644` even though the content extension is purely additive (heroPositions block + 2 imports + interface). The existing 107-line render is preserved verbatim.
- CooldownsBlock unmount-on-empty (D-04) is implemented strictly: no header, no placeholder, container disappears entirely when nobody has a defined `ultimate_state` other than 1.

## Commits

- `9069df5` feat(08-04): CooldownsBlock — filter/sort/unmount-on-empty per D-04 contract
- `9951b18` feat(08-04): extend DotaMapView with optional heroPositions (clipped portraits + team rings)
