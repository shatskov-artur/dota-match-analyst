---
phase: 03-match-core
plan: "02"
subsystem: client-hooks
tags: [tanstack-query, use-match-detail, building-decoder, player-filter, cache-read]
dependency_graph:
  requires:
    - client/src/hooks/useLiveGames.ts (LiveGamesResponse type, ['live-games'] cache key)
    - shared/buildingDecoder.ts (buildingDecoder function)
    - client/src/utils/heroMapper.ts (used by consumers of this hook)
  provides:
    - client/src/hooks/useMatchDetail.ts (TQ v5 hook for match detail data)
    - client/src/hooks/useLiveGames.ts PlayerDetail interface (typed player access for Wave 2+ components)
    - client/src/hooks/useLiveGames.ts EnrichedGame extended (players, tower_state, barracks_state, stream_delay_s)
  affects:
    - All Wave 2+ match components (ScoreHeader, HeroPlayerGrid, BuildingsSection) — unblocked
tech_stack:
  added: []
  patterns:
    - TQ v5 getQueryData for synchronous cache read without triggering refetch
    - useQuery with ['live-games'] key sharing the cache with useLiveGames
    - isFetched redirect guard pattern to prevent premature navigation
    - Plain refetchInterval (not callback) per TQ v5 constraint
key_files:
  created:
    - client/src/hooks/useMatchDetail.ts
  modified:
    - client/src/hooks/useLiveGames.ts
decisions:
  - "Extended EnrichedGame with players/tower_state/barracks_state/stream_delay_s — these fields exist in BFF response via .passthrough() but were missing from client type, causing TS errors in useMatchDetail"
  - "Added PlayerDetail interface to useLiveGames.ts (not a separate file) — co-located with LiveGamesResponse for import ergonomics"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-24T20:12:00Z"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 1
---

# Phase 3 Plan 2: useMatchDetail Hook Summary

**One-liner:** TQ v5 useMatchDetail hook reading ['live-games'] cache, with post-game polling freeze, isFetched redirect guard, buildingDecoder call, and Radiant/Dire player team split.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useMatchDetail hook | 3075faf | client/src/hooks/useMatchDetail.ts (created), client/src/hooks/useLiveGames.ts (modified) |

## Verification

- `cd client && npx vitest run` — 27 tests, 4 files, all passed
- All 8 acceptance criteria verified:
  - `getQueryData.*live-games` pattern present
  - `refetchInterval: matchFromCache?.game_state === 6 ? false : 30_000` present
  - `!query.isLoading && query.isFetched && !match` redirect guard present
  - `buildingDecoder(match?.tower_state` (not building_state) present
  - `p.team === 0` for radiantPlayers, `p.team === 1` for direPlayers present
  - No `enabled:` flag (defaults to true — required for D-15 cache-miss refetch)
  - No `onSuccess` (removed in TQ v5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Extended EnrichedGame interface with match detail fields**
- **Found during:** Task 1 implementation
- **Issue:** `EnrichedGame` in `useLiveGames.ts` only had `match_id`, `league_id`, `league_name`, and a handful of score/series fields. The useMatchDetail hook accesses `players`, `tower_state`, `barracks_state`, and `stream_delay_s` on `EnrichedGame` — TypeScript would reject these as unknown properties, breaking compilation for all Wave 2+ components.
- **Fix:** Added `PlayerDetail` interface and extended `EnrichedGame` with `players?: PlayerDetail[]`, `tower_state?: number`, `barracks_state?: number`, `radiant_score?: number`, `dire_score?: number`, `stream_delay_s?: number`. Fields match the server-side `LiveGameSchema` (already typed in `server/src/schemas/valve.ts`) and reflect data that flows through `.passthrough()`.
- **Files modified:** `client/src/hooks/useLiveGames.ts`
- **Commit:** 3075faf (included in same task commit)

## Known Stubs

None — the hook is fully implemented. Consumers (ScoreHeader, HeroPlayerGrid, BuildingsSection) are not yet built (Wave 2 plans 03-03 and 03-04).

## Threat Flags

None — hook processes data from the already-validated BFF cache. matchId URL param is compared via `String(g.match_id) === matchId` (string comparison only, no eval, no server-side use). Post-game polling freeze (T-03-04 mitigation) implemented as required.

## Self-Check: PASSED

- `client/src/hooks/useMatchDetail.ts` — FOUND
- `client/src/hooks/useLiveGames.ts` extended with PlayerDetail + new EnrichedGame fields — FOUND
- Commit 3075faf — FOUND
