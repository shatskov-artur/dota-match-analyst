---
phase: 06-win-probability
plan: "03"
subsystem: server/BFF routes
tags: [stratz, winprob, intel, route, cleanup]
dependency_graph:
  requires: [06-02]
  provides: [GET /api/live/winprob/:matchId, Stratz-based intel aggregator]
  affects: [server/src/routes/live.ts, server/src/services/openDotaApi.ts, server/src/schemas/openDota.ts, server/src/services/intel.ts]
tech_stack:
  added: []
  patterns: [Promise.all winprob+valveData, Number.isFinite matchId guard, opaque 502 catch block]
key_files:
  created: []
  modified:
    - server/src/routes/live.ts
    - server/src/services/openDotaApi.ts
    - server/src/schemas/openDota.ts
    - server/src/services/intel.ts
decisions:
  - "Inline HeroMatchup type in intel.ts rather than deleting rankCounters — preserves existing Phase 5 tests with zero behaviour change"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-26"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 6 Plan 03: BFF Route Wiring Summary

One-liner: Added GET /api/live/winprob/:matchId returning {radiantWinProb, gameState, duration} and upgraded intel aggregator from OpenDota to Stratz matchup data; removed all deprecated OpenDota matchup code.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add winprob route + upgrade intel aggregator | 17d95bc | server/src/routes/live.ts |
| 2 | Remove deprecated matchup code from openDotaApi + openDota | 2c6711d | server/src/services/openDotaApi.ts, server/src/schemas/openDota.ts, server/src/services/intel.ts |

## What Was Built

### Task 1 — live.ts changes

- New `GET /api/live/winprob/:matchId` route registered after the intel route.
- Route validates matchId with `Number.isFinite()` → 400 on non-numeric (T-6-03).
- Runs `getWinProbability(parsedId)` and `getLiveLeagueGamesFast()` in parallel via `Promise.all`.
- Returns `{ radiantWinProb: number | null, gameState: number | null, duration: number | null }`.
- Stratz errors already swallowed inside `getWinProbability` (returns null) — outer catch returns opaque 502 (T-6-04).
- Intel aggregator updated: `getHeroMatchups` → `getHeroMatchupsStratz`, `rankCounters` → `rankCountersStratz`.
- Imports updated accordingly; `StratzHeroDryadEntry` imported for the type cast.

### Task 2 — cleanup

- `fetchHeroMatchups` and `getHeroMatchups` removed from `openDotaApi.ts`.
- `HeroMatchupSchema`, `HeroMatchup` type, and `CounterHeroEntry` interface removed from `openDota.ts`.
- `HeroMatchup` import in `intel.ts` replaced with an inline local type (same shape) to preserve `rankCounters` function and its existing 3 tests without any behaviour change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved rankCounters in intel.ts by inlining HeroMatchup type**

- **Found during:** Task 2
- **Issue:** Removing `HeroMatchupSchema` from `openDota.ts` also removed the `HeroMatchup` exported type, which `intel.ts` imports for `rankCounters`. Deleting `rankCounters` would have broken 3 existing `intel.test.ts` tests that the plan did not intend to remove.
- **Fix:** Replaced the `import type { HeroMatchup }` line in `intel.ts` with an inline local type definition carrying the same shape. `rankCounters` continues to work; tests remain green.
- **Files modified:** `server/src/services/intel.ts`
- **Commit:** 2c6711d

## Verification Results

- `npx tsc --noEmit`: exits 0 (clean)
- `npx vitest run`: 38/38 tests pass across 6 test files
- `grep "winprob/:matchId" server/src/routes/live.ts`: route present (2 lines)
- `grep "getHeroMatchupsStratz" server/src/routes/live.ts`: 4 lines (import + jsdoc + call + comment)
- `grep "rankCountersStratz" server/src/routes/live.ts`: 3 lines (import + Map type + call)
- `grep "getHeroMatchups\b" server/src/routes/live.ts`: no lines (removed)
- `grep "HeroMatchupSchema" server/src/services/openDotaApi.ts`: no lines (removed)
- `grep "HeroMatchupSchema" server/src/schemas/openDota.ts`: no lines (removed)

## Known Stubs

None — all route logic is wired to real upstream functions; no hardcoded placeholders.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes beyond what is documented in the plan threat model (T-6-03, T-6-04 mitigations applied as specified).

## Self-Check: PASSED

- `server/src/routes/live.ts` exists with winprob route
- `server/src/services/openDotaApi.ts` has no matchup functions
- `server/src/schemas/openDota.ts` has no HeroMatchupSchema
- Commits 17d95bc and 2c6711d confirmed in git log
