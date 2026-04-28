---
phase: 08-ability-cooldowns-map
plan: 03
status: complete
completed: 2026-04-28
---

# 08-03 Summary — Client utils: heroUltimateMapper + mapCoords

## What was built

Two pure browser-safe helpers that turn Plan 01's RED tests GREEN. No I/O, no side effects, no React.

- `client/src/utils/heroUltimateMapper.ts` — 24 lines. Vite native JSON import of `shared/heroUltimates.json`; `heroUltimateMapper(heroId)` and `heroUltimateIconUrl(heroId)` exports.
- `client/src/utils/mapCoords.ts` — 26 lines. `normalizeMapCoords(valveX, valveY)` exported; HALF=8192, SVG=320; clamp on both axes; mandatory Y-flip.

## Verification

- `cd client && npm test -- --run src/utils/heroUltimateMapper.test.ts src/utils/mapCoords.test.ts` → **10/10 GREEN** (5 + 5).
- `cd client && npx tsc --noEmit` → exit 0, clean.
- `grep -c "createRequire" client/src/utils/heroUltimateMapper.ts` → 0.
- `grep -c "import ults from '../../../shared/heroUltimates.json'" client/src/utils/heroUltimateMapper.ts` → 1.
- `grep -c "1 - (y + HALF) / (2 \* HALF)" client/src/utils/mapCoords.ts` → 1 (Y-flip present).
- `grep -c "Math.max(-HALF, Math.min(HALF" client/src/utils/mapCoords.ts` → 2 (clamp on both axes).
- No `shared/*` files modified.

## Deviation

heroUltimateMapper had to handle Monkey King (hero 114): `shared/heroUltimates.json` stores his ultimate as `string[]` because of his form-toggle ult (`monkey_king_untransform` / `monkey_king_transfiguration`). Plan 01's generator emitted the array intentionally; the mapper now picks `v[0]` for array-valued entries, preserving the `string | null` return type and CDN URL contract. Cast widened to `as unknown as Record<string, string | string[]>` to satisfy strict tsc. All 5 plan-01 assertions still pass — none of them targeted hero 114.

## Commits

- `76ff5c1` feat(08-03): heroUltimateMapper + heroUltimateIconUrl (handle Monkey King multi-form)
- `1d9ff32` feat(08-03): mapCoords normalizeMapCoords (centered ±8192 → SVG 320 with Y-flip)
