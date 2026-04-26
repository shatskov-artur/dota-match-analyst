---
phase: 06-win-probability
plan: "01"
subsystem: testing
tags: [tdd, red-state, win-probability, stratz, cadence-gate]
dependency_graph:
  requires: []
  provides:
    - client/src/hooks/useWinProbability.test.ts
    - server/src/services/stratzApi.test.ts
    - server/src/services/intel.test.ts (extended)
  affects:
    - Plan 06-02 (stratzApi.ts must satisfy stratzApi.test.ts)
    - Plan 06-03 (intel.ts must export rankCountersStratz)
    - Plan 06-04 (useWinProbability.ts must satisfy useWinProbability.test.ts)
tech_stack:
  added: []
  patterns:
    - vi.mock('ioredis') + vi.mock('../env.js') for server test isolation
    - Pure function test pattern (no mocks needed for computeWinProbInterval)
    - Dynamic import in beforeEach for module-level test isolation
key_files:
  created:
    - client/src/hooks/useWinProbability.test.ts
    - server/src/services/stratzApi.test.ts
  modified:
    - server/src/services/intel.test.ts
decisions:
  - gameState===6 must be checked first in computeWinProbInterval (CLAUDE.md critical pitfall: polling on finished matches drains Stratz 500 req/hr quota)
  - rankCountersStratz sorts by winRateHeroId1 ascending (lower = harder counter for heroId1)
  - STRATZ_TOKEN added to env mock in intel.test.ts for Phase 6 env validation compatibility
metrics:
  duration: "104s"
  completed_date: "2026-04-26"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 06 Plan 01: TDD RED Stubs for Win Probability Summary

**One-liner:** RED test stubs defining MATCH-06 behavioral contracts — cadence gate, Stratz null-return safety, and rankCountersStratz transform — all failing until Plans 06-02 through 06-04 implement the modules.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Client test stub — computeWinProbInterval cadence contract | 66faaba | client/src/hooks/useWinProbability.test.ts |
| 2 | Server test stubs — Stratz null-return + rankCountersStratz | 202e2c6 | server/src/services/stratzApi.test.ts, server/src/services/intel.test.ts |

## Test Coverage Created

### Task 1: useWinProbability.test.ts (7 test cases — all RED)

- `gameState===6, duration=600` → `false` (postgame first-guard)
- `gameState===5, duration=400` → `30000` (active poll)
- `gameState===5, duration=301` → `30000` (boundary: strictly > 300)
- `gameState===5, duration=300` → `false` (boundary: not strictly > 300)
- `gameState===5, duration=200` → `false` (early-game)
- `gameState===5, duration=undefined` → `false`
- `gameState===2, duration=600` → `false` (draft)
- `gameState===undefined, duration=600` → `false`

### Task 2: stratzApi.test.ts (4 test cases — all RED)

- Network error → `null`
- HTTP 401 → `null`
- Empty `liveWinRateValues` array → `null`
- Populated `liveWinRateValues` → last entry's `winRate`

### Task 2: intel.test.ts extension (4 new test cases — all RED; 9 existing tests GREEN)

- Top-3 sorted by `winRateHeroId1` ascending
- Filters `heroId === 0` and `heroId === undefined`
- Empty input → empty array
- `disadvantageScore = 1 - winRateHeroId1`

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

This plan is the RED phase. Gate sequence:
1. RED gate (this plan) — test(06-01) commits: 66faaba, 202e2c6
2. GREEN gate — Plans 06-02, 06-03, 06-04 will provide feat(...) commits
3. REFACTOR gate — optional, per implementation quality

## Known Stubs

None — this is a test-only plan. No production code stubs introduced.

## Threat Flags

None — test files only. STRATZ_TOKEN value is `'test-stratz-token'` (placeholder, no real secret).

## Self-Check: PASSED

- `client/src/hooks/useWinProbability.test.ts` — FOUND
- `server/src/services/stratzApi.test.ts` — FOUND
- `server/src/services/intel.test.ts` — FOUND (modified)
- Commit 66faaba — FOUND
- Commit 202e2c6 — FOUND
- useWinProbability.test.ts exits non-zero (RED) — CONFIRMED
- stratzApi.test.ts exits non-zero (RED, 4 failed) — CONFIRMED
- intel.test.ts: 9 pass / 4 fail (rankCountersStratz RED, existing GREEN) — CONFIRMED
