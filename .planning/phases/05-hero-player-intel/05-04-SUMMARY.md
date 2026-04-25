---
phase: 05-hero-player-intel
plan: "04"
subsystem: client-hooks
tags: [react, tanstack-query, typescript, tdd, hero-stats, match-intel]
dependency_graph:
  requires:
    - "05-03"  # BFF routes GET /api/heroes/stats + GET /api/live/intel/:matchId
  provides:
    - useHeroStats hook (client/src/hooks/useHeroStats.ts)
    - useMatchIntel hook + computeIntelInterval (client/src/hooks/useMatchIntel.ts)
    - winrateColor utility (client/src/utils/winrateColor.ts)
  affects:
    - "05-05"  # DraftPortrait badge strip — consumes useHeroStats + winrateColor
    - "05-06"  # IntelTooltip / MatchPage wiring — consumes useMatchIntel
tech_stack:
  added: []
  patterns:
    - "TanStack Query v5 static hook: staleTime Infinity + refetchInterval false for patch-level data"
    - "TanStack Query v5 dynamic refetchInterval: (q: Query<T>) => computeXInterval(q.state.data?.game_state)"
    - "Pure helper pattern: computeIntelInterval exported for unit testing without React mount"
key_files:
  created:
    - client/src/utils/winrateColor.ts
    - client/src/hooks/useHeroStats.ts
    - client/src/hooks/useMatchIntel.ts
  modified: []
decisions:
  - "useHeroStats uses staleTime: Infinity + refetchInterval: false — patch data never polls (T-5-04 DoS mitigation)"
  - "computeIntelInterval mirrors computeDraftInterval pattern exactly — game_state 2 = 5000ms, else false"
  - "useMatchIntel staleTime: 4000ms (PF-2 — strictly below 5s cadence so interval fires every cycle)"
metrics:
  duration: "2m"
  completed_date: "2026-04-25"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 5 Plan 04: Client Hooks + winrateColor Utility Summary

**One-liner:** winrateColor pure utility + useHeroStats (staleTime Infinity, no polling) + useMatchIntel (5s draft cadence via computeIntelInterval) — all Wave 0 test stubs turned GREEN.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | winrateColor pure utility (TDD GREEN) | f8b8ea4 | client/src/utils/winrateColor.ts |
| 2 | useHeroStats + useMatchIntel hooks | cc98a1a | client/src/hooks/useHeroStats.ts, client/src/hooks/useMatchIntel.ts |

## What Was Built

### winrateColor.ts
Pure function mapping hero patch winrate (0–1 float) to badge color:
- `> 0.52` → `#4ade80` (radiant green)
- `< 0.48` → `#ef4444` (dire red)
- `0.48–0.52` inclusive → `#888888` (neutral grey)

### useHeroStats.ts
TanStack Query v5 hook for static patch data:
- Fetches `GET /api/heroes/stats`
- `staleTime: Infinity` — never considered stale within a browser session
- `refetchInterval: false` — zero polling (BFF 6h TTL manages freshness)
- Returns `HeroStatsMap | undefined` (undefined during load/error — badge strip hides per D-03)

### useMatchIntel.ts
TanStack Query v5 hook for dynamic per-match intel:
- Fetches `GET /api/live/intel/:matchId`
- `computeIntelInterval(gameState)` pure helper: `game_state === 2` → 5000ms, else false
- `staleTime: 4000ms` (PF-2 — strictly below 5s cadence)
- `refetchInterval` uses `(q: Query<MatchIntelResponse>) => computeIntelInterval(q.state.data?.game_state)` — v5 callback form

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| winrateColor.test.ts | 5/5 | GREEN |
| useMatchIntel.test.ts | 5/5 | GREEN |
| Full client suite | 58/58 | GREEN (no regressions) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — hooks are complete and ready to be consumed by Plans 05-05 and 05-06.

## Threat Surface Scan

No new network endpoints or auth paths introduced. Client hooks communicate only with the BFF routes established in Plan 05-03. The T-5-04 DoS mitigation (refetchInterval: false + staleTime: Infinity for useHeroStats) is implemented as specified in the threat model.

## Self-Check: PASSED

- [x] client/src/utils/winrateColor.ts — exists, exports `winrateColor`
- [x] client/src/hooks/useHeroStats.ts — exists, `staleTime: Infinity` + `refetchInterval: false`
- [x] client/src/hooks/useMatchIntel.ts — exists, exports `useMatchIntel` + `computeIntelInterval`
- [x] Commit f8b8ea4 — winrateColor utility
- [x] Commit cc98a1a — hooks
- [x] All 58 client tests GREEN
