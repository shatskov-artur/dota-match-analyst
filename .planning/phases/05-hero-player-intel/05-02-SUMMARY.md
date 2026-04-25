---
phase: 05-hero-player-intel
plan: "02"
subsystem: server/bff-data-layer
tags: [openDota, schemas, caching, intel, pure-helpers, tdd]
dependency_graph:
  requires: ["05-01"]
  provides: ["getHeroStats", "getPlayerHeroes", "getHeroMatchups", "buildHeroStatsMap", "intel.ts"]
  affects: ["05-03", "05-04", "05-05"]
tech_stack:
  added: []
  patterns:
    - "cached() decorator for all OpenDota calls (CLAUDE.md §Key Patterns)"
    - "zod .passthrough() + all fields .optional() for OpenDota schemas"
    - "Pure helper functions in intel.ts — injectable fetchFn for testability"
    - "hiddenProfile() short-circuit for account_id 4294967295"
key_files:
  created:
    - server/src/services/intel.ts
  modified:
    - server/src/schemas/openDota.ts
    - server/src/services/openDotaApi.ts
    - server/tsconfig.json
decisions:
  - "D-13: All new OpenDota calls use cached() — keys hero:stats, hero:matchups:{heroId}, player:heroes:{accountId}"
  - "D-09: applyKnownToPlay threshold is games>=10 AND win/games>0.5, applied server-side"
  - "D-05: rankCounters returns top-3 by disadvantage score"
  - "A1 defensive: HeroStatsSchema accepts both id and hero_id fields"
  - "A2 defensive: PlayerHeroSchema hero_id as z.union([z.string(), z.number()])"
  - "A3 defensive: HeroMatchupSchema accepts both hero_id and hero_id2"
  - "Rule 3 fix: server/tsconfig.json rootDir changed from ./src to .. to allow shared/hiddenProfile.ts import"
metrics:
  duration: "~6 minutes"
  completed: "2026-04-25"
  tasks_completed: 3
  files_changed: 4
---

# Phase 5 Plan 02: BFF Data Layer — Schemas, Service Functions, Intel Helpers Summary

Three-file BFF data layer: zod schemas for three OpenDota endpoints, six cached service functions in openDotaApi.ts, and pure helper functions in a new intel.ts module. All Wave 0 server tests turn GREEN.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend openDota.ts with HeroStatsSchema, PlayerHeroSchema, HeroMatchupSchema | 295e549 | server/src/schemas/openDota.ts |
| 2 | Add getHeroStats, getPlayerHeroes, getHeroMatchups, buildHeroStatsMap to openDotaApi.ts | 3860826 | server/src/services/openDotaApi.ts |
| 3 | Create intel.ts with rankCounters, applyKnownToPlay, buildPlayerIntelEntry | f944d93 | server/src/services/intel.ts, server/tsconfig.json |

## What Was Built

### server/src/schemas/openDota.ts (extended)
- `HeroStatsSchema` — accepts both `id` and `hero_id` (A1 defensive dual-field), all fields `.optional()`, `.passthrough()`
- `PlayerHeroSchema` — `hero_id` as `z.union([z.string(), z.number()])` (A2 type coercion), `.passthrough()`
- `HeroMatchupSchema` — accepts both `hero_id` and `hero_id2` (A3 older API version), `.passthrough()`
- Type aliases: `HeroStats`, `PlayerHero`, `HeroMatchup`, `HeroStatsEntry`, `HeroStatsMap`, `CounterHeroEntry`, `PlayerHeroEntry`

### server/src/services/openDotaApi.ts (extended)
- `buildHeroStatsMap(raw)` — pure transform, exported for unit testing; uses `h.id ?? h.hero_id`; skips `pro_pick === 0` (Pitfall 7 division-by-zero guard)
- `getHeroStats()` — `cached('hero:stats', TTL.HERO_STATS)` — global 6h cache (D-13)
- `getPlayerHeroes(accountId)` — `cached('player:heroes:{accountId}', TTL.PLAYER_STATS)` — 15min per player
- `getHeroMatchups(heroId)` — `cached('hero:matchups:{heroId}', TTL.HERO_STATS)` — 6h per hero
- All fetch* functions: catch network errors, return null; log `status/statusText` only (T-5-02)

### server/src/services/intel.ts (created)
- `rankCounters(matchups)` — filters `games_played > 0`, maps to `disadvantageScore = wins/games_played`, sorts DESC, slices top-3 (D-05)
- `applyKnownToPlay({games, win})` — D-09 threshold: `games >= 10 AND win/games > 0.5`, server-side
- `buildPlayerIntelEntry(accountId, heroId, _, fetchFn)` — PLAYER-02: `hiddenProfile(accountId)` short-circuits without calling fetchFn; coerces `hero_id` to number for comparison (A2)

## Test Results

```
server $ npm test -- --run

 ✓ src/cache.test.ts         (8 tests)
 ✓ src/services/intel.test.ts (9 tests)  ← was RED in Wave 0, now GREEN
 ✓ src/schemas/valve.test.ts  (5 tests)
 ✓ src/services/openDotaApi.test.ts (3 tests)  ← was RED in Wave 0, now GREEN
 ✓ src/env.test.ts            (5 tests)

Test Files  5 passed (5)
Tests      30 passed (30)
```

TypeScript: `npx tsc --noEmit` → 0 errors after tsconfig fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] server/tsconfig.json rootDir too restrictive for shared/ import**

- **Found during:** Task 3 — `intel.ts` imports `hiddenProfile` from `../../../shared/hiddenProfile.js`
- **Issue:** `rootDir: ./src` in server tsconfig caused TS error: "File is not under rootDir" when importing from `../shared/hiddenProfile.ts`
- **Fix:** Changed `rootDir` from `"./src"` to `".."` and added `"../shared/*.ts"` to `include` (excluding `*.test.ts`). This allows the server to reference shared TypeScript sources while keeping `outDir: ./dist` intact.
- **Files modified:** `server/tsconfig.json`
- **Commit:** f944d93

## Known Stubs

None — all functions are fully implemented. No placeholder values or TODO comments.

## Threat Flags

No new threat surface introduced beyond what is documented in the plan's threat model (T-5-01 through T-5-04).

## Self-Check: PASSED

Files exist:
- `server/src/schemas/openDota.ts` — FOUND (contains HeroStatsSchema, PlayerHeroSchema, HeroMatchupSchema)
- `server/src/services/openDotaApi.ts` — FOUND (exports getHeroStats, getPlayerHeroes, getHeroMatchups, buildHeroStatsMap)
- `server/src/services/intel.ts` — FOUND (exports rankCounters, applyKnownToPlay, buildPlayerIntelEntry)

Commits verified:
- 295e549 feat(05-02): add HeroStatsSchema... — FOUND
- 3860826 feat(05-02): add getHeroStats... — FOUND
- f944d93 feat(05-02): create intel.ts... — FOUND
