---
phase: 04-draft-ux
plan: "02"
subsystem: server-schemas, server-cache, server-services, server-routes
tags: [draft, scoreboard, ttl, cache-key, bff-route, passthrough, security]
dependency_graph:
  requires:
    - 04-01 (LiveGameSchema scoreboard regression test contract — turns GREEN)
  provides:
    - server/src/schemas/valve.ts ScoreboardSchema + DraftItemSchema + TeamScoreboardSchema
    - server/src/cache.ts TTL.DRAFT = 4 constant
    - server/src/services/valveApi.ts getLiveLeagueGamesFast() — distinct 'live_games:draft' cache key
    - server/src/routes/live.ts GET /api/live/draft/:matchId — thin pass-through, 4s cache
  affects:
    - 04-03 (useDraftDetail hook can now consume LiveGame['scoreboard'] type and hit /api/live/draft/:matchId)
    - 04-04 (DraftSection component renders scoreboard.{radiant,dire}.{picks,bans})
    - HomePage NOT affected — 30s 'live_games' cache lane untouched
tech_stack:
  added: []
  patterns:
    - Distinct cache-key namespacing ('live_games' 30s ↔ 'live_games:draft' 4s) to prevent eviction across lanes
    - Per-route TTL via cached() decorator dimension — single fetch helper, multiple cache lanes
    - .passthrough() on every nested zod sub-schema to absorb Valve patch drift silently
    - Constant-string error responses on BFF routes (no upstream error leak)
    - Number.isFinite(Number(x)) input-validation guard for numeric path params
key_files:
  created: []
  modified:
    - server/src/schemas/valve.ts
    - server/src/cache.ts
    - server/src/services/valveApi.ts
    - server/src/routes/live.ts
decisions:
  - "Used distinct cache key 'live_games:draft' (colon namespace separator) so the 4s draft fast lane never evicts the 30s 'live_games' lane serving HomePage (D-16, T-04-D-02 mitigation)"
  - "Both wrappers share the single fetchLiveLeagueGames() upstream helper — DRAFT adds a cache dimension, not a new upstream path. Preserves T-04-04 log discipline (URL never logged)"
  - "Draft route is a thin pass-through with NO league_name enrichment — MatchPage already pulls league_name via useMatchDetail (D-16)"
  - "Draft route returns constant-string errors only ({ error: 'Invalid matchId' }, { error: 'Match not live' }) — no stack traces, no upstream status leak (T-04-I-02 mitigation)"
  - "Numeric path-param validation via Number.isFinite() guards before any cache or upstream touch (T-04-S-01 mitigation)"
  - "DraftItemSchema.hero_id is .optional() because picks pre-lock can arrive without it (PF-8 from 04-RESEARCH.md)"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-24T20:16:29Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 4
---

# Phase 4 Plan 2: Backend Draft Route + Schema Extension Summary

**One-liner:** Backend now serves `GET /api/live/draft/:matchId` at ~4s freshness via a distinct `'live_games:draft'` cache lane, with the LiveGameSchema extended for the verified nested `scoreboard.{radiant,dire}.{picks,bans}` shape — Plan 01's schema regression test turns GREEN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend LiveGameSchema with ScoreboardSchema (D-17) and add TTL.DRAFT (D-15) | 6f33089 | server/src/schemas/valve.ts (modified), server/src/cache.ts (modified) |
| 2 | Add getLiveLeagueGamesFast() service with distinct cache key (D-16) | 07442ef | server/src/services/valveApi.ts (modified) |
| 3 | Add GET /api/live/draft/:matchId route (D-16) | 1e1b4da | server/src/routes/live.ts (modified) |

## Diff Summary per File

### `server/src/schemas/valve.ts` (modified)
- Added `DraftItemSchema = z.object({ hero_id: z.number().optional() }).passthrough()` (PF-8 — picks pre-lock may arrive without hero_id).
- Added `TeamScoreboardSchema = z.object({ picks: z.array(DraftItemSchema).optional(), bans: z.array(DraftItemSchema).optional() }).passthrough()`.
- Added `ScoreboardSchema = z.object({ radiant: TeamScoreboardSchema.optional(), dire: TeamScoreboardSchema.optional() }).passthrough()`.
- Inserted `scoreboard: ScoreboardSchema.optional()` inside `LiveGameSchema` between `players` and `radiant_team`.
- All four `.passthrough()` calls preserved on existing schemas; three new `.passthrough()` calls added (CLAUDE.md schema-drift discipline).
- No exported `Scoreboard` type — consumers reach the shape through `LiveGame['scoreboard']`.

### `server/src/cache.ts` (modified)
- Added `DRAFT: 4` to the `TTL` const after `LIVE_MATCH: 30`. Inline comment explains the 1s headroom below the 5s client poll cadence.
- Existing `LIVE_MATCH`, `HERO_STATS`, `PLAYER_STATS` constants and the `cached()` decorator are unchanged.

### `server/src/services/valveApi.ts` (modified)
- Added `export function getLiveLeagueGamesFast(): Promise<LiveLeagueGames>` after the existing `getLiveLeagueGames()`.
- Calls `cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames)` — distinct cache key from the existing `cached('live_games', TTL.LIVE_MATCH, fetchLiveLeagueGames)`.
- The single private `fetchLiveLeagueGames()` helper is shared between both wrappers — one upstream code path, two cache lanes.
- Existing `getLiveLeagueGames()` and `fetchLiveLeagueGames()` bodies are byte-for-byte unchanged.

### `server/src/routes/live.ts` (modified)
- Import line extended: `import { getLiveLeagueGames, getLiveLeagueGamesFast } from '../services/valveApi.js'`.
- Added `liveRoutes.get('/draft/:matchId', async (c) => { ... })` between the existing `/games` handler and `export default liveRoutes`.
- Handler body:
  - Coerces `:matchId` via `Number()`, rejects non-finite with `c.json({ error: 'Invalid matchId' }, 400)`.
  - Awaits `getLiveLeagueGamesFast()`.
  - Looks up the match via `data.result.games?.find((g) => g.match_id === parsedId)`.
  - Returns 404 `{ error: 'Match not live' }` if not found.
  - Otherwise returns 200 `{ match_id, game_state, scoreboard }` — no league_name, no extra fields.
- Existing `/games` handler is byte-for-byte unchanged.

## Verification

- `cd server && npx tsc --noEmit` — exits 0 (no TypeScript errors introduced).
- `cd server && npx vitest run` — 18 tests across 3 files (cache.test.ts: 8, valve.test.ts: 5, env.test.ts: 5), all PASS.
- Plan 01 `valve.test.ts` is GREEN: all 5 scoreboard tests pass (pre-draft empty, both teams populated, passthrough of unknown sub-fields, empty teams `{}`, undefined `hero_id`).
- `grep -c "DraftItemSchema" server/src/schemas/valve.ts` → 3 (declaration + comment + nested usage).
- `grep -c "TeamScoreboardSchema" server/src/schemas/valve.ts` → 3 (declaration + radiant + dire nested usages).
- `grep -c "ScoreboardSchema" server/src/schemas/valve.ts` → 5 (declaration + DraftItemSchema/TeamScoreboardSchema comment refs + LiveGameSchema field).
- `grep "scoreboard: ScoreboardSchema\.optional()" server/src/schemas/valve.ts` matches exactly once.
- `grep "DRAFT: 4" server/src/cache.ts` matches exactly once; `grep "LIVE_MATCH: 30"` still matches once (regression guard).
- `grep "export function getLiveLeagueGamesFast(): Promise<LiveLeagueGames>" server/src/services/valveApi.ts` matches once.
- `grep "cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames)" server/src/services/valveApi.ts` matches once.
- `grep -c "cached('live_games'," server/src/services/valveApi.ts` → 1 (regression guard for the 30s lane).
- `grep -c "liveRoutes.get(" server/src/routes/live.ts` → 2 (existing /games + new /draft/:matchId).

## New Route Response Contract

`GET /api/live/draft/:matchId`

| Status | When | Body |
|--------|------|------|
| 200 | matchId is finite AND the match is in the live-games payload | `{ match_id, game_state, scoreboard }` |
| 400 | matchId path param does not parse as a finite number | `{ error: "Invalid matchId" }` |
| 404 | matchId is finite but no live match has that id | `{ error: "Match not live" }` |

## Cache Key Lanes

| Cache key | TTL | Populated by | Consumed by | Eviction risk |
|-----------|-----|--------------|-------------|---------------|
| `live_games` | 30s (TTL.LIVE_MATCH) | `getLiveLeagueGames()` | `GET /api/live/games` (HomePage); `useMatchDetail` shared TQ key | None — Plan 04-02 added a SEPARATE key, not a TTL change |
| `live_games:draft` | 4s (TTL.DRAFT) | `getLiveLeagueGamesFast()` | `GET /api/live/draft/:matchId` (Plan 04-03 useDraftDetail) | None — distinct namespace, isolated lane |

Both wrappers call the same private `fetchLiveLeagueGames()` upstream helper, so the cache lanes diverge only on TTL and key — there is exactly ONE upstream code path that hits Valve.

## Deviations from Plan

None — all three tasks executed exactly as the plan specified. No bugs encountered, no missing functionality, no blocking issues, no architectural escalations. Auto-fix rules 1-3 did not trigger; rule 4 did not trigger.

## Authentication Gates

None — backend-only plan, no auth surface introduced (REQUIREMENTS.md: v1 has no accounts).

## Known Stubs

None — `GET /api/live/draft/:matchId` is a fully wired pass-through with real Valve data flowing end-to-end through the `cached()` decorator. All response fields are sourced from upstream; nothing returns hardcoded empty/placeholder values.

## Threat Flags

None — plan's `<threat_model>` covered every surface introduced (path param, schema drift, cache eviction, upstream API key, error-response leak). No new surfaces emerged during execution. T-04-S-01, T-04-T-01, T-04-I-01, T-04-I-02, T-04-D-01, T-04-D-02 mitigations all in code as specified.

## Self-Check: PASSED

- `server/src/schemas/valve.ts` — FOUND (modified)
- `server/src/cache.ts` — FOUND (modified)
- `server/src/services/valveApi.ts` — FOUND (modified)
- `server/src/routes/live.ts` — FOUND (modified)
- Commit `6f33089` (Task 1) — FOUND in `git log --oneline -5`
- Commit `07442ef` (Task 2) — FOUND in `git log --oneline -5`
- Commit `1e1b4da` (Task 3) — FOUND in `git log --oneline -5`
- `server/src/schemas/valve.ts` contains `scoreboard: ScoreboardSchema.optional()` — FOUND
- `server/src/cache.ts` contains `DRAFT: 4` — FOUND
- `server/src/services/valveApi.ts` contains `cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames)` — FOUND
- `server/src/routes/live.ts` contains `liveRoutes.get('/draft/:matchId'` — FOUND
