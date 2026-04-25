---
phase: 05-hero-player-intel
plan: "03"
subsystem: server/routes
tags: [bff, routes, heroes, intel, caching, security]
dependency_graph:
  requires: ["05-02"]
  provides: ["GET /api/heroes/stats", "GET /api/live/intel/:matchId"]
  affects: ["client/src/hooks/useHeroStats", "client/src/hooks/useLiveIntel"]
tech_stack:
  added: []
  patterns: ["Hono router", "Promise.allSettled aggregator", "Two-level caching", "Number.isFinite guard"]
key_files:
  created:
    - server/src/routes/heroes.ts
  modified:
    - server/src/routes/live.ts
    - server/src/index.ts
decisions:
  - "heroRoutes mounted at /api (not /api/live) so GET /api/heroes/stats has correct URL — D-10"
  - "liveRoutes.get('/intel/:matchId') without /live/ prefix — liveRoutes already mounted at /api/live"
  - "Outer cache key intel:{matchId} (not per-user) — T-5-04 DoS mitigation"
  - "Promise.allSettled for all player + matchup fetches — hidden profile never breaks other players"
  - "Full player hero history stored in memory during aggregation for D-09 knownPlayers cross-reference"
metrics:
  duration: "127s"
  completed: "2026-04-25"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 2
---

# Phase 5 Plan 03: BFF Routes — Hero Stats + Live Intel Summary

Two new BFF endpoints wired end-to-end: GET /api/heroes/stats (patch win/pick rates, 6h cached) and GET /api/live/intel/:matchId (per-match player + counterpick intel with D-09 "known to play" flags, 15min cached per match_id).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create heroes.ts and mount in index.ts | be90ec9 | server/src/routes/heroes.ts (new), server/src/index.ts |
| 2 | Add GET /intel/:matchId to liveRoutes | b8737b6 | server/src/routes/live.ts |

## What Was Built

### Task 1 — GET /api/heroes/stats

- New `server/src/routes/heroes.ts` with `heroRoutes` Hono router
- `heroRoutes.get('/heroes/stats', ...)` delegates to `getHeroStats()` (6h cached upstream)
- Returns 200 with `{ [heroId]: { win_rate, pick_rate } }` map or 502 on upstream failure
- Mounted via `app.route('/api', heroRoutes)` in index.ts → correct URL `/api/heroes/stats`
- T-5-02: opaque 502, no upstream details; T-5-03: safeParse in service layer

### Task 2 — GET /api/live/intel/:matchId

- `liveRoutes.get('/intel/:matchId', ...)` appended to live.ts — correct path, no double `/live/`
- T-5-01: `Number.isFinite(Number(rawMatchId))` guard → 400 before any cache or upstream access
- Reads live game from fast cache (getLiveLeagueGamesFast) — no extra Valve API call
- Outer cache: `cached('intel:{matchId}', TTL.PLAYER_STATS)` — N viewers = 1 call per 15min (T-5-04)
- Two-level batch fetch via `Promise.all([Promise.allSettled(...matchups), Promise.allSettled(...players)])`
- Hidden profiles (`hiddenProfile(accountId)`) short-circuit before OpenDota call → null stats (PLAYER-02)
- Full player hero history stored for D-09 "known to play" cross-reference (games >= 10 AND win/games > 0.5)
- Per-pick `counters` array: top-3 counter heroes with `knownPlayers: string[]` of opposing players
- 200/400/404/502 response codes; T-5-02: outer catch returns opaque 502

## Security Mitigations Applied

| Threat ID | Mitigation | Location |
|-----------|-----------|---------|
| T-5-01 | Number.isFinite guard on matchId | live.ts:128 |
| T-5-02 | Opaque 502 in catch blocks | heroes.ts:20,23; live.ts:229 |
| T-5-03 | safeParse in service layer (Plan 02) | openDotaApi.ts |
| T-5-04 | Cache key intel:{matchId} not per-user | live.ts:139 |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — routes return real data from cached upstream calls.

## Threat Flags

None — no new network endpoints or auth paths beyond what the plan specified.

## Self-Check: PASSED

- [x] server/src/routes/heroes.ts exists
- [x] server/src/routes/live.ts contains liveRoutes.get('/intel/:matchId')
- [x] server/src/index.ts contains app.route('/api', heroRoutes)
- [x] Commits be90ec9 and b8737b6 exist
- [x] TypeScript compiles without errors (npx tsc --noEmit → no output)
- [x] 30/30 server tests pass
- [x] Number.isFinite guard at live.ts:128
- [x] cached('intel:...') at live.ts:139
- [x] No double /live/live/ path (liveRoutes.get('/intel/:matchId') confirmed)
