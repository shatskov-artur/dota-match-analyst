---
phase: 06-win-probability
plan: "06"
subsystem: server
tags: [tdd, heuristic, win-probability, bff, sigmoid]
dependency_graph:
  requires: []
  provides: [winProbHeuristic.ts, extended-winprob-route]
  affects: [server/src/routes/live.ts, client/src/hooks/useWinProbability.ts]
tech_stack:
  added: []
  patterns: [sigmoid-logistic-regression, clamp-probability, popcount-bitmask]
key_files:
  created:
    - server/src/services/winProbHeuristic.ts
    - server/src/services/winProbHeuristic.test.ts
  modified:
    - server/src/routes/live.ts
decisions:
  - "sigmoid intercept 0.0335 (non-zero) so equal gold returns ~0.508 not 0.5"
  - "clamp to [0.05, 0.95] — extremes never shown to avoid false certainty"
  - "radiantWinProb renamed to stratz — no backward-compat alias (gap closure)"
  - "popcount via raw bit manipulation rather than buildingDecoder output — simpler for advantage counting"
metrics:
  duration: "3m 18s"
  completed: "2026-04-26T23:00:09Z"
  tasks_completed: 3
  files_created: 2
  files_modified: 1
---

# Phase 06 Plan 06: Heuristic Win Probability Computation Summary

**One-liner:** Pure sigmoid heuristic (gold + kills + towers + rax) providing always-finite win probability bars when Stratz returns null for non-TI/DPC matches.

## What Was Built

TDD RED→GREEN cycle implementing `winProbHeuristic.ts` (pure functions) and wiring the result into the existing `/winprob/:matchId` BFF route. The route now returns `{ stratz, gold, estimate, gameState, duration }` where `gold` and `estimate` are always finite numbers in `[0.05, 0.95]`.

### winProbHeuristic.ts exports

- `computeGoldWinProb(goldDiff)` — sigmoid(0.0335 + 0.000267 × goldDiff), clamped
- `computeEstWinProb(inputs)` — multi-feature: gold + killDiff(×0.18) + towerAdv(×0.3) + raxAdv(×0.6), clamped
- `extractScoreboardInputs(game)` — extracts all four inputs from Valve live game object; returns zeros when absent

### /winprob/:matchId response shape (after)

```json
{
  "stratz": null,
  "gold": 0.537,
  "estimate": 0.621,
  "gameState": 5,
  "duration": 1842
}
```

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | 85aee3b | 12 failing tests — import error (module did not exist) |
| GREEN (feat) | 022e6f1 | 12 passing tests — all assertions verified |
| REFACTOR | — | Not needed — implementation was clean on first pass |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 85aee3b | test | RED — failing tests for heuristic win probability computation |
| 022e6f1 | feat | implement heuristic win probability computation |
| b7f6940 | feat | extend /winprob/:matchId to return { stratz, gold, estimate } |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test assertion: sigmoid(2.7035) ≈ 0.937 is not clamped to 0.95**
- **Found during:** Task 2 (GREEN) — first test run
- **Issue:** Plan spec states "+10,000 gold → clamped to 0.95" but sigmoid(0.0335 + 0.000267×10000) = sigmoid(2.7035) ≈ 0.9372, which is below the 0.95 ceiling and NOT clamped. The plan's math comment was wrong.
- **Fix:** Updated test assertion from `toBe(0.95)` to `toBeGreaterThan(0.93)` + `toBeLessThan(0.945)` with corrected comment.
- **Files modified:** server/src/services/winProbHeuristic.test.ts
- **Commit:** 022e6f1 (included in GREEN commit)

## Known Stubs

None — gold and estimate are always finite computed values, never placeholder or hardcoded.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced. The `/winprob/:matchId` route existed prior; this plan extended its response shape only.

## Self-Check

- [x] server/src/services/winProbHeuristic.ts — created
- [x] server/src/services/winProbHeuristic.test.ts — created (12 tests GREEN)
- [x] server/src/routes/live.ts — extended (stratz/gold/estimate response)
- [x] radiantWinProb removed from route (grep confirms 0 matches)
- [x] TypeScript clean (npx tsc --noEmit in server/ exits 0)
- [x] winProbHeuristic.test.ts — 12/12 passing

## Self-Check: PASSED
