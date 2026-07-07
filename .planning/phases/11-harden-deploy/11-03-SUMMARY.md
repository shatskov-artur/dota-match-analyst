---
phase: 11-harden-deploy
plan: 03
subsystem: testing
tags: [react-query, refetchInterval, polling, vitest, quota-guard]

# Dependency graph
requires:
  - phase: 03-match-core
    provides: useMatchDetail hook with inline refetchInterval ternary
  - phase: 04-draft-ux
    provides: computeDraftInterval pure helper + test
  - phase: 05-hero-player-intel
    provides: computeIntelInterval pure helper + test
  - phase: 06-win-probability
    provides: computeWinProbInterval pure helper + test
provides:
  - "computeMatchInterval pure helper extracted from useMatchDetail inline ternary"
  - "Explicit game_state===6 -> false unit-test coverage across all four match-page pollers"
  - "ROADMAP criterion 3 (D-11) locked by tests: finished matches stop polling"
affects: [11-harden-deploy verification, future poller edits]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-helper + unit-test split for polling cadence (computeXInterval) applied to the last remaining inline poller"

key-files:
  created:
    - client/src/hooks/useMatchDetail.test.ts
  modified:
    - client/src/hooks/useMatchDetail.ts

key-decisions:
  - "Extracted the sole remaining inline refetchInterval ternary (useMatchDetail) into computeMatchInterval so all four pollers share the pure-helper + test pattern"
  - "Task 2 required no file changes: explicit computeXInterval(6)->false assertions already existed in the draft/intel/winprob tests; confirmed by grep against the acceptance criteria"

patterns-established:
  - "Every match-page poller now has an explicit game_state===6 -> false unit assertion, guarding against silent post-game-polling regression"

requirements-completed: []

# Metrics
duration: ~6min
completed: 2026-07-07
---

# Phase 11 Plan 03: Polling-stop verification Summary

**All four match-page pollers now stop (`refetchInterval === false`) at `game_state === 6`, locked by explicit pure-helper unit tests so a future edit cannot silently reintroduce post-game polling that drains upstream quota.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-07T22:28Z
- **Completed:** 2026-07-07T22:30Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Extracted the last remaining inline `refetchInterval` ternary (`useMatchDetail.ts:39`) into a pure exported `computeMatchInterval(gameState)` helper mirroring `computeWinProbInterval` / `computeIntelInterval` / `computeDraftInterval`.
- Added `useMatchDetail.test.ts` asserting `computeMatchInterval(6) === false` (post-game stops — ROADMAP criterion 3) plus `5`/`undefined → 30_000` (in-game polls).
- Confirmed the explicit `game_state === 6 → false` assertion already exists in the draft, intel, and winprob helper tests — all four pollers are now covered by name.
- Full suite green: 26 hook tests pass; `npm run build` (tsc + vite) green — pure extraction compiles with no behavior change.

## Task Commits

1. **Task 1: Extract computeMatchInterval pure helper + add its ===6 test** - `808616d` (refactor)
2. **Task 2: Add explicit game_state===6 assertions to draft/intel/winprob helper tests** - no commit (assertions already present; confirmed via grep, no file change)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified

- `client/src/hooks/useMatchDetail.ts` - Added exported pure helper `computeMatchInterval(gameState)`; replaced inline `refetchInterval` ternary with `computeMatchInterval(matchFromCache?.game_state)`. QueryKey/queryFn/staleTime unchanged.
- `client/src/hooks/useMatchDetail.test.ts` - New. Asserts `computeMatchInterval(6) === false` and `5`/`undefined → 30_000`, mirroring the `useWinProbability.test.ts` template.

## Deviations from Plan

**Task 2 required no source change.** The plan wrote Task 2 as "add or confirm" the explicit `===6` assertions. All three already existed:
- `useDraftDetail.test.ts:26` — `expect(computeDraftInterval(6)).toBe(false)`
- `useMatchIntel.test.ts:24` — `expect(computeIntelInterval(6)).toBe(false)`
- `useWinProbability.test.ts:12` — `expect(computeWinProbInterval(6, 600)).toBe(false)`

Per the plan's own "if present, leave it" instruction, no edits were made and no commit was produced for Task 2. All grep-based acceptance criteria for Task 2 pass against the existing assertions.

No auto-fixes (Rules 1-3) were triggered. No architectural decisions (Rule 4) arose.

## Verification

- `cd client && npx vitest run src/hooks/useMatchDetail.test.ts` — 3/3 green (Task 1 acceptance).
- `cd client && npx vitest run src/hooks` — 26/26 green across all 5 hook test files (all four cadence helpers assert `===6 → false`).
- `cd client && npm run build` — tsc + vite green (computeMatchInterval extraction compiles). Pre-existing chunk-size (>500 kB) advisory is out of scope and unrelated to this plan.

## Threat Model

T-11-07 (DoS — post-game match draining upstream quota) is mitigated as planned: all four cadence helpers return `false` at `game_state === 6`, and every helper now has an explicit unit assertion locking the guard. No new security-relevant surface introduced.

## Success Criteria

- [x] ROADMAP criterion 3 met: polling stops (`refetchInterval === false`) at `game_state === 6`, verified by explicit unit tests across all four pollers (D-11).
- [x] No behavior change — pure extraction + confirmed assertions only.

## Self-Check: PASSED

- `client/src/hooks/useMatchDetail.ts` — FOUND
- `client/src/hooks/useMatchDetail.test.ts` — FOUND
- `.planning/phases/11-harden-deploy/11-03-SUMMARY.md` — FOUND
- Task 1 commit `808616d` — FOUND
- Acceptance greps: `export function computeMatchInterval` (1), `refetchInterval: computeMatchInterval` (1), `computeMatchInterval(6)` in test (1) — all present
