# Plan 09-05 — Summary

**Status:** Complete
**Wave:** 3
**Requirements:** ROSH-02, ROSH-03

## What was built

1. **`client/src/components/RoshanBlock.tsx`** (~115 LOC) with this contract:

   ```ts
   interface RoshanBlockProps {
     roshan: {
       killCount: number
       alive: boolean
       respawnIn: number | null
       lastKillLoot: number[] | null
     } | null
   }
   ```

   - `roshan === null` → returns null
   - alive → "Roshan #N" header + next-kill loot icons (32px)
   - dead → "Respawn" + mm:ss countdown + dimmed next-kill icons (28px)
   - LAST DROP row (20px icons) appears when `killCount >= 1`
   - 1Hz client tick via `useEffect setInterval(1000)` — same pattern as CooldownsBlock (project memory `feedback_cooldown_ticking.md`)
   - Reference time pings off `respawnIn:killCount` signature so backend resyncs don't get clobbered

2. **`client/src/pages/MatchPage.tsx`** — 2 surgical changes:
   - line 16: `import RoshanBlock from '../components/RoshanBlock'`
   - line 152: `<RoshanBlock roshan={match?.roshan ?? null} />` between `<DotaMapView … />` and `<CooldownsBlock … />`
   - DotaMapView + CooldownsBlock props are byte-identical to pre-edit state.

## Type widening

`client/src/hooks/useLiveGames.ts` — `EnrichedGame` interface gained one optional field:

```ts
roshan?: {
  killCount: number
  alive: boolean
  respawnIn: number | null
  lastKillLoot: number[] | null
} | null
```

This is the only TypeScript adjustment outside the new component file. The shape mirrors the BFF response from Plan 04.

## Test infra

`client/vitest.setup.ts` — added a global `afterEach(() => cleanup())` so successive Testing Library renders don't bleed DOM nodes into one another (the third LAST DROP test would otherwise see prior test's DOM still attached). Wired into `vitest.config.ts` via `setupFiles: ['./vitest.setup.ts']`.

## Tests transitioned RED → GREEN

- `client/src/components/RoshanBlock.test.tsx` — 6/6
  - renders nothing when roshan === null
  - alive — shows ROSHAN #N + ≥2 loot icons
  - dead — shows RESPAWN + mm:ss countdown
  - countdown ticks (5:00 → 4:57 after vi.advanceTimersByTime(3000))
  - LAST DROP visible when killCount >= 1
  - LAST DROP hidden when killCount === 0

## Verification

- `cd client && npx tsc --noEmit` — clean
- `cd client && npm run build` — built in 2.10s, no errors
- DotaMapView + CooldownsBlock render order preserved per project layout-preservation memory.

## Commits

- `(prev wave)` — feat(09-05): RoshanBlock component (alive/dead/last-drop, 1Hz tick)
- `7b55cae` — feat(09-05): mount RoshanBlock between Map and Cooldowns in MatchPage
