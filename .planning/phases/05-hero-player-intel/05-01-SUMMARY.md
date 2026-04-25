---
phase: 05-hero-player-intel
plan: 01
subsystem: testing
tags: [vitest, tdd, unit-tests, wave-0, nyquist, red-state]

# Dependency graph
requires:
  - phase: 04-draft-ux
    provides: computeDraftInterval pattern (useDraftDetail.ts) — mirrored for useMatchIntel
provides:
  - 4 RED-state test stub files encoding Phase 5 behavioral contracts
  - winrateColor threshold contract (DRAFT-03: >0.52 green, <0.48 red, neutral)
  - buildHeroStatsMap transform contract (DRAFT-03: id vs hero_id, zero-pick guard)
  - rankCounters + applyKnownToPlay contracts (DRAFT-04: counterpick ranking, known-to-play threshold)
  - buildPlayerIntelEntry hidden-profile contract (PLAYER-02: null stats, no OpenDota call)
  - computeIntelInterval cadence contract (PLAYER-01: game_state=2 → 5000ms, else false)
affects:
  - 05-02 (BFF services — must export buildHeroStatsMap, rankCounters, applyKnownToPlay, buildPlayerIntelEntry)
  - 05-04 (client utils — must export winrateColor, computeIntelInterval)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 Nyquist validation: RED-state stubs created before implementation — identical to Phase 4 pattern (04-01-PLAN.md)"
    - "Dynamic import in server tests: `await import('./intel.js')` inside each it() — allows module-not-found to fail the test naturally"
    - "vi.mock('ioredis') + vi.mock('../env.js') — hoisted before imports to prevent ioredis constructor from running"

key-files:
  created:
    - client/src/utils/winrateColor.test.ts
    - client/src/hooks/useMatchIntel.test.ts
    - server/src/services/openDotaApi.test.ts
    - server/src/services/intel.test.ts
  modified: []

key-decisions:
  - "Wave 0 test stubs use dynamic import inside each it() for server tests so module-not-found error fails tests individually, not at suite load time"
  - "openDotaApi.test.ts uses dynamic import which fails with 'not a function' (module loads but buildHeroStatsMap not yet exported) — still RED state, correct"
  - "winrateColor.test.ts and useMatchIntel.test.ts fail at suite load (static import) — module-not-found error"

patterns-established:
  - "Phase 5 Wave 0 pattern: 4 test stubs, 2 client (static import) + 2 server (dynamic import) — matches Phase 4 structure"

requirements-completed:
  - DRAFT-03
  - DRAFT-04
  - PLAYER-01
  - PLAYER-02

# Metrics
duration: 15min
completed: 2026-04-25
---

# Phase 5 Plan 01: Wave 0 RED-state Test Stubs Summary

**4 Nyquist validation test stubs encoding DRAFT-03, DRAFT-04, PLAYER-01, PLAYER-02 behavioral contracts before any implementation exists**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-25T19:35:00Z
- **Completed:** 2026-04-25T19:38:00Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- Created `winrateColor.test.ts` — 5 test cases covering all threshold boundaries (>0.52 green, <0.48 red, inclusive boundaries)
- Created `useMatchIntel.test.ts` — 5 test cases covering polling cadence (game_state=2 → 5000ms, all other states → false)
- Created `openDotaApi.test.ts` — 3 test cases covering heroStats transform (id vs hero_id defensive fallback, zero-pick guard)
- Created `intel.test.ts` — 9 test cases covering rankCounters (sort DESC, top-3 slice, games=0 guard, hero_id2 fallback), applyKnownToPlay (threshold enforcement), buildPlayerIntelEntry hidden-profile skip

## Task Commits

1. **Task 1: Client RED-state stubs** - `c80c30b` (test)
2. **Task 2: Server RED-state stubs** - `a55d841` (test)

## Files Created/Modified

- `client/src/utils/winrateColor.test.ts` — DRAFT-03 badge color threshold tests (RED until 05-04)
- `client/src/hooks/useMatchIntel.test.ts` — PLAYER-01 polling cadence tests (RED until 05-04)
- `server/src/services/openDotaApi.test.ts` — DRAFT-03 heroStats transform tests (RED until 05-02 exports buildHeroStatsMap)
- `server/src/services/intel.test.ts` — DRAFT-04 + PLAYER-02 service function tests (RED until 05-02 creates intel.ts)

## Decisions Made

- Server tests use dynamic import (`await import('./intel.js')` inside each `it()`) so module-not-found errors cause individual test failures rather than suite-level failures — easier to track which contracts are satisfied as implementation lands
- `openDotaApi.test.ts` fails with "not a function" (module loads, export absent) rather than module-not-found — this is still valid RED state since `buildHeroStatsMap` is not yet exported
- All mocks (`vi.mock('ioredis')`, `vi.mock('../env.js')`) placed at top of file before any imports, matching the `cache.test.ts` pattern

## Deviations from Plan

None — plan executed exactly as written. All 4 test stub files match the contracts specified in the PLAN.md `<action>` blocks verbatim.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 0 complete: all 4 test stub files exist in RED state
- Plan 05-02 (BFF services) must export: `buildHeroStatsMap` from `openDotaApi.ts`, and `rankCounters`, `applyKnownToPlay`, `buildPlayerIntelEntry` from `intel.ts`
- Plan 05-04 (client utils/hooks) must export: `winrateColor` from `utils/winrateColor.ts`, `computeIntelInterval` from `hooks/useMatchIntel.ts`
- Pre-existing tests remain GREEN: 6 client test files (48 tests), 3 server test files (18 tests)

---
*Phase: 05-hero-player-intel*
*Completed: 2026-04-25*
