---
phase: 01-foundations
plan: 03
subsystem: api
tags: [typescript, vitest, zod, shared-primitives, hero-mapper, building-decoder]

requires:
  - phase: 01-02
    provides: cached() decorator and env validation

provides:
  - heroMapper(id) pure function returning {name, portrait} | null
  - buildingDecoder(towerState, barracksState) returning structured BuildingState
  - hiddenProfile(accountId) boolean guard for Steam anonymous sentinel
  - shared/heroes.json with 130+ heroes seeded from OpenDota
  - shared/index.ts barrel exporting all primitives and types
  - WR-01 fix: Redis URL construction inside try block
  - WR-02 fix: server/src/index.ts imports env.ts for startup validation
  - WR-03 fix: zod moved to runtime dependencies in shared/package.json

affects: [02-live-matches-list, 03-match-core, 04-draft-ux, 05-hero-player-intel]

tech-stack:
  added: [vitest, tsx (seed script runner)]
  patterns: [pure function shared primitives, createRequire for JSON imports in ESM, bitmask decoding]

key-files:
  created:
    - shared/heroMapper.ts
    - shared/heroMapper.test.ts
    - shared/buildingDecoder.ts
    - shared/buildingDecoder.test.ts
    - shared/hiddenProfile.ts
    - shared/hiddenProfile.test.ts
    - shared/heroes.json
    - scripts/seed-heroes.ts
  modified:
    - shared/index.ts
    - server/src/cache.ts
    - server/src/index.ts
    - shared/package.json

key-decisions:
  - "Used createRequire for heroes.json import (ESM + NodeNext TS config requires it)"
  - "buildingDecoder uses === undefined check (not falsy) so towerState=0 (all destroyed) is correctly distinguished from absent"
  - "hiddenProfile checks exact equality against 4294967295 (0xFFFFFFFF) — the only Steam hidden sentinel"

patterns-established:
  - "Pure function pattern: all shared primitives are stateless, never throw, return null for unknowns"
  - "Bitmask decoding: lower bits = Radiant, upper bits = Dire; bit=1 means standing, bit=0 means destroyed"

requirements-completed: []

duration: 25min
completed: 2026-04-23
---

# Plan 01-03: Shared Primitives & Bug Fixes Summary

**Three pure-function shared primitives (heroMapper, buildingDecoder, hiddenProfile) with 13 unit tests, 130+ hero JSON dataset, and three production bug fixes (WR-01 Redis URL outside try, WR-02 missing env import, WR-03 zod in devDependencies)**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-23T01:00:00Z
- **Completed:** 2026-04-23T01:25:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Implemented heroMapper, buildingDecoder, hiddenProfile as pure functions with full unit coverage (13 tests, all pass)
- Seeded shared/heroes.json from OpenDota API (130+ heroes, indexed by hero_id string)
- Updated shared/index.ts barrel to export all three primitives and their TypeScript types
- Applied WR-01: moved `const redisUrl` inside try block in cache.ts — malformed URL now degrades gracefully
- Applied WR-02: added `import { env }` to server/src/index.ts — startup validation runs on server start
- Applied WR-03: moved zod from devDependencies to dependencies in shared/package.json

## Task Commits

1. **Task 1: Fix WR-01, WR-02, WR-03** - `861d7c8` (fix)
2. **Task 2: Seed heroes.json and implement shared primitives with tests** - `d1a8088` (feat)

## Files Created/Modified
- `shared/heroMapper.ts` - hero_id → {name, portrait} | null, backed by heroes.json
- `shared/heroMapper.test.ts` - 4 tests covering known IDs, unknown IDs, 0, and non-throwing inputs
- `shared/buildingDecoder.ts` - tower/barracks bitmask → BuildingState, undefined vs 0 distinction
- `shared/buildingDecoder.test.ts` - 5 tests covering undefined, 0, bit positions, rax defaults, rax decoding
- `shared/hiddenProfile.ts` - boolean guard for Steam sentinel 0xFFFFFFFF
- `shared/hiddenProfile.test.ts` - 4 tests covering sentinel, normal ID, 0, sentinel-minus-1
- `shared/heroes.json` - 130+ heroes seeded from OpenDota, indexed by string hero_id
- `shared/index.ts` - barrel exporting all three primitives and their types
- `scripts/seed-heroes.ts` - one-time OpenDota seed script
- `server/src/cache.ts` - WR-01: redisUrl moved inside try block
- `server/src/index.ts` - WR-02: added env import, replaced raw process.env.PORT
- `shared/package.json` - WR-03: zod moved to runtime dependencies

## Decisions Made
- Used `createRequire` from Node's `module` package for JSON import (TypeScript NodeNext + ESM combination does not support `import ... assert { type: 'json' }` without additional config)
- `buildingDecoder` uses strict `=== undefined` check so `towerState === 0` (all buildings destroyed) is never treated as absent data — this is the critical pitfall documented in CLAUDE.md

## Deviations from Plan
None — plan executed exactly as written. `hiddenProfile.test.ts` was missing from the untracked file set and was created as specified in the plan.

## Issues Encountered
- `hiddenProfile.test.ts` was not present in the working tree (only `hiddenProfile.ts` was untracked). Created per plan spec. All 13 tests pass after creation.

## Self-Check: PASSED

## Next Phase Readiness
- All three shared primitives ready for use in Phase 2+ routes
- `shared/index.ts` barrel exports enable `import { heroMapper, buildingDecoder, hiddenProfile } from '@shared/index'`
- Plan 01-04 can now proceed: Valve API schema and route depend on no shared primitives directly

---
*Phase: 01-foundations*
*Completed: 2026-04-23*
