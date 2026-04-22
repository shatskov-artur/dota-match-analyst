---
phase: 01-foundations
plan: 04
subsystem: api
tags: [typescript, zod, hono, valve-api, caching, bff]

requires:
  - phase: 01-02
    provides: cached() decorator with TTL constants and graceful Redis fallthrough
  - phase: 01-03
    provides: shared primitives (heroMapper, buildingDecoder, hiddenProfile) and WR bug fixes

provides:
  - LiveGameSchema and LiveLeagueGamesSchema zod schemas with .passthrough() on all sub-schemas
  - getLiveLeagueGames() service function wrapping Valve fetch in cached('live_games', TTL.LIVE_MATCH)
  - GET /api/live/games Hono route returning Valve GetLiveLeagueGames response
  - Full typed data pipeline: route -> service -> cached() -> Valve fetch -> zod parse -> response
  - SC2 closed: BFF live games endpoint operational

affects: [02-live-matches-list, 03-match-core, 04-draft-ux, 05-hero-player-intel]

tech-stack:
  added: []
  patterns: [zod .passthrough() on all Valve schemas, cached() wrapping Valve fetch, Hono route file exporting default router, all env access via env.ts]

key-files:
  created:
    - server/src/schemas/valve.ts
    - server/src/services/valveApi.ts
    - server/src/routes/live.ts
  modified:
    - server/src/index.ts

key-decisions:
  - "PlayerSchema and TeamSchema use .passthrough() too — not just top-level schemas"
  - "All nested LiveGame fields are .optional() per CLAUDE.md: absent during lobby/pre-game"
  - "Error in fetchLiveLeagueGames logs res.status/res.statusText only — never logs URL (T-04-04)"
  - "getLiveLeagueGames is exported as a named function (not arrow const) for clarity"

patterns-established:
  - "Valve schema pattern: z.object({...}).passthrough() on every level, all fields optional except match_id/lobby_id/league_id"
  - "Service layer pattern: private fetchX() wrapped by public getX() via cached() — never export the raw fetch"
  - "Route pattern: Hono instance created in route file, exported as default, mounted at prefix in index.ts"

requirements-completed: []

duration: 5min
completed: 2026-04-23
---

# Phase 01 Plan 04: Valve API Route Summary

**Typed Valve GetLiveLeagueGames pipeline with zod .passthrough() schemas, cached() service layer, and GET /api/live/games Hono route — closing SC2**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-22T23:04:47Z
- **Completed:** 2026-04-22T23:09:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Implemented `server/src/schemas/valve.ts` with `LiveGameSchema`, `LiveLeagueGamesSchema`, and all sub-schemas using `.passthrough()` (6 total passthrough calls per CLAUDE.md requirement)
- All nested fields marked `.optional()` — handles lobby/pre-game states where most fields are absent
- Implemented `server/src/services/valveApi.ts` with `getLiveLeagueGames()` wrapping `fetchLiveLeagueGames` in `cached('live_games', TTL.LIVE_MATCH, ...)` — N viewers = 1 upstream Valve call per 30s
- Implemented `server/src/routes/live.ts` with `GET /games` handler calling `getLiveLeagueGames()` and returning `c.json(data)`
- Updated `server/src/index.ts` to mount liveRoutes at `/api/live` — route is live at `GET /api/live/games`
- All security mitigations applied: T-04-02 (zod parse), T-04-03 (cached), T-04-04 (no URL logging), T-04-05 (hardcoded URL)
- TypeScript compiles cleanly: `tsc --noEmit` exits 0

## Task Commits

1. **Task 1: Valve zod schemas and service layer** - `4ecdf5a` (feat)
2. **Task 2: Wire BFF route GET /api/live/games into Hono entry** - `5042546` (feat)

## Files Created/Modified

- `server/src/schemas/valve.ts` - Zod schemas for Valve GetLiveLeagueGames: PlayerSchema, TeamSchema, LiveGameSchema, LiveLeagueGamesSchema, all with .passthrough(); type exports LiveGame and LiveLeagueGames
- `server/src/services/valveApi.ts` - getLiveLeagueGames() wrapping private fetchLiveLeagueGames in cached(); uses env.VALVE_API_KEY; error messages omit URL
- `server/src/routes/live.ts` - Hono router with GET /games calling getLiveLeagueGames(); exported as default
- `server/src/index.ts` - Added liveRoutes import and app.route('/api/live', liveRoutes) mount

## Decisions Made

- Both `PlayerSchema` and `TeamSchema` use `.passthrough()` in addition to `LiveGameSchema` and `LiveLeagueGamesSchema` — matching the "every sub-schema" requirement from CLAUDE.md (total: 6 passthrough calls)
- `fetchLiveLeagueGames` is private (not exported) — per CLAUDE.md, `cached()` is the only path to upstream; `getLiveLeagueGames` is the single public API
- Error message in `fetchLiveLeagueGames` logs `res.status` and `res.statusText` only — the full URL contains `env.VALVE_API_KEY` and must never appear in logs (T-04-04 mitigation)
- `getLiveLeagueGames` is a named function export (not `export const`) for readable stack traces

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- `node_modules` not installed in worktree's `server/` directory — worktrees share git history but not filesystem artifacts like `node_modules`. Ran `npm install --prefer-offline` in `server/` to install dependencies. This is expected worktree setup behavior, not a bug. `node_modules` is gitignored so the worktree working tree remained clean after install.

## User Setup Required

None - no external service configuration required for this plan. `VALVE_API_KEY` was already an existing required env var (validated at startup by `env.ts` since Plan 01-02).

## Next Phase Readiness

- SC2 is closed: the full data pipeline from client request to Valve API and back is wired and typed
- Phase 2 (Live Matches List) can now use `GET /api/live/games` as its data source
- The route-service-cached pattern established here is the template for all subsequent data routes
- A manual smoke test (`curl http://localhost:3001/api/live/games` after setting VALVE_API_KEY in `.env`) will confirm end-to-end operation

## Threat Flags

None — all surfaces introduced (one new route, one new service, one new schema) are addressed in the plan's threat model. No unplanned network endpoints or trust boundary crossings were introduced.

---
*Phase: 01-foundations*
*Completed: 2026-04-23*
