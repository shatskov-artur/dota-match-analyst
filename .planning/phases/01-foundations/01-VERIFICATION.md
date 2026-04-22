---
phase: 01-foundations
verified: 2026-04-23T01:45:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0

re_verification:
  previous_status: gaps_found
  previous_score: 4/4
  gaps_closed:
    - "2 cache unit tests failing due to vi.fn() arrow function constructor incompatibility with vitest v4.1.5 — fixed by using regular function in vi.fn(function() { return mockRedisInstance }). All 8 cache.test.ts tests now pass (13/13 server, 13/13 shared)."
  gaps_remaining: []
  regressions: []

human_verification:
  - test: "Set VALVE_API_KEY in .env, run `cd server && npm run dev`, then `curl http://localhost:3001/api/live/games`"
    expected: "HTTP 200 with JSON body containing { result: { games: [...] } }. Games array may be empty if no live tournaments, but the shape must match the zod schema."
    why_human: "Requires a live Valve API key and a running server with Redis credentials. Cannot verify programmatically without credentials."
  - test: "Start both server and client with `npm run dev` from repo root. Open http://localhost:5173 in a browser."
    expected: "Page shows 'BFF status: BFF OK' (not 'BFF unreachable')."
    why_human: "Requires both processes running simultaneously and a browser render. Vite proxy behavior can only be confirmed at runtime."
---

# Phase 1: Foundations Verification Report

**Phase Goal:** Stand up the typed client-BFF-cache pipeline so any match data request can flow end-to-end, even before a single screen exists.
**Verified:** 2026-04-23T01:45:00Z
**Status:** human_needed
**Re-verification:** Yes — after vi.fn() mock constructor fix in cache.test.ts

## Re-verification Summary

Previous status: gaps_found. The single remaining gap — 2 cache unit tests failing due to `vi.fn(() => mockRedisInstance)` using an arrow function as a class constructor — has been closed. Line 13 of `server/src/cache.test.ts` now uses `vi.fn(function () { return mockRedisInstance })`. All server tests pass: 13/13 (8 cache + 5 env). All shared tests pass: 13/13. No regressions. Two runtime items still require human verification (live server + credentials).

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Developer can run React+Vite client and Hono BFF locally with one command, client hits BFF health endpoint | VERIFIED | `package.json` has `concurrently` dev script; `server/src/index.ts` mounts `GET /health` returning `{status:'ok',ts:...}`; `client/src/App.tsx` fetches `/api/health` via Vite proxy and renders result |
| 2 | BFF can call Valve's GetLiveLeagueGames, parse the response through a zod schema with `.passthrough()`, and return a typed payload | VERIFIED | `server/src/schemas/valve.ts` has 6 `.passthrough()` calls across PlayerSchema, TeamSchema, LiveGameSchema, LiveLeagueGamesSchema; `getLiveLeagueGames()` calls `LiveLeagueGamesSchema.parse(raw)`; `GET /api/live/games` route wired and mounted at `app.route('/api/live', liveRoutes)` |
| 3 | Any BFF fetch is wrapped by `cached()` backed by Redis with per-data-type TTL, so repeated calls within TTL produce exactly one upstream request | VERIFIED | `cached()` exists with correct Redis GET/SET logic and TTL constants. All 8 cache unit tests pass (13/13 server total). `getLiveLeagueGames()` calls `cached('live_games', TTL.LIVE_MATCH, fetchLiveLeagueGames)` |
| 4 | Shared primitives exist and are unit-tested: `heroMapper`, `buildingDecoder`, `hiddenProfile` | VERIFIED | All three primitives exist with full unit tests. 13/13 shared tests pass. `heroes.json` seeded with 127 heroes. `shared/index.ts` barrel exports all three primitives and their TypeScript types |

**Score:** 4/4 truths verified. All automated tests pass (26/26 total across server + shared).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Root dev script using concurrently | VERIFIED | `"dev": "concurrently \"npm run dev --prefix server\" \"npm run dev --prefix client\""` |
| `shared/package.json` | Shared package with zod as runtime dep | VERIFIED | zod in `dependencies` (WR-03 fixed) |
| `shared/tsconfig.json` | Shared TypeScript config | VERIFIED | strict: true, ES2022, NodeNext |
| `shared/index.ts` | Barrel export for all shared primitives | VERIFIED | Exports heroMapper, HeroInfo, buildingDecoder, BuildingState, TeamBuildings, LaneBuildings, hiddenProfile |
| `server/tsconfig.json` | Server tsconfig with @shared/* alias | VERIFIED | `"@shared/*": ["../shared/*"]` in paths |
| `client/tsconfig.json` | Client tsconfig with @shared/* alias | VERIFIED | `"@shared/*": ["../shared/*"]` in paths |
| `client/vite.config.ts` | Vite config with Tailwind v4 and @shared alias | VERIFIED | tailwindcss() plugin, @shared alias to ../shared, /api proxy to localhost:3001 |
| `server/src/index.ts` | Hono server with GET /health and /api/live mounted | VERIFIED | `/health` returns `{status:'ok',ts:...}`; `app.route('/api/live', liveRoutes)` present; imports `env.ts` (WR-02 fixed) |
| `server/src/env.ts` | Validated env vars via zod | VERIFIED | safeParse(process.env), throws on missing vars with named keys, exports `env` and `Env` |
| `server/src/cache.ts` | cached() decorator and TTL constants | VERIFIED | WR-01 fixed: redisUrl inside try block; TTL.LIVE_MATCH=30, TTL.HERO_STATS=21600, TTL.PLAYER_STATS=900; graceful degradation when redis=null |
| `server/src/cache.test.ts` | Unit tests for cache module | VERIFIED | 8/8 tests pass. vi.fn() mock constructor fix applied on line 13. |
| `server/src/schemas/valve.ts` | Zod schemas for Valve response with .passthrough() | VERIFIED | 6 passthrough calls; LiveGameSchema, LiveLeagueGamesSchema, PlayerSchema, TeamSchema; all nested fields .optional() |
| `server/src/services/valveApi.ts` | getLiveLeagueGames() wrapping Valve fetch in cached() | VERIFIED | cached('live_games', TTL.LIVE_MATCH, fetchLiveLeagueGames); uses env.VALVE_API_KEY; no raw process.env |
| `server/src/routes/live.ts` | Hono router with GET /games | VERIFIED | liveRoutes.get('/games', ...) calls getLiveLeagueGames() and returns c.json(data) |
| `shared/heroMapper.ts` | hero_id to name/portrait mapper | VERIFIED | heroMapper(id) returns HeroInfo\|null; uses createRequire for heroes.json; never throws |
| `shared/buildingDecoder.ts` | 32-bit bitmask decoder | VERIFIED | handles undefined (unavailable:true), 0 (all destroyed, unavailable:false), bit extraction for towers and barracks |
| `shared/hiddenProfile.ts` | Hidden profile sentinel guard | VERIFIED | returns accountId === 4294967295 |
| `shared/heroes.json` | Static hero data committed to repo | VERIFIED | 127 heroes seeded from OpenDota, indexed by string hero_id; includes "1": Anti-Mage |
| `scripts/seed-heroes.ts` | Hero data seed script | VERIFIED | exists, fetches from api.opendota.com/api/heroes, writes to shared/heroes.json |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `client/src/App.tsx` | `http://localhost:3001/health` | fetch('/api/health') via Vite proxy | WIRED | App.tsx calls fetch('/api/health'); Vite proxy rewrites /api to localhost:3001; server has GET /health |
| `server/src/index.ts` | `server/src/env.ts` | import { env } from './env.js' | WIRED | WR-02 fixed: env imported at startup, validation triggers on server start |
| `server/src/index.ts` | `server/src/routes/live.ts` | app.route('/api/live', liveRoutes) | WIRED | liveRoutes mounted at /api/live; exposes GET /api/live/games |
| `server/src/routes/live.ts` | `server/src/services/valveApi.ts` | import { getLiveLeagueGames } from '../services/valveApi.js' | WIRED | Route calls await getLiveLeagueGames() and returns c.json(data) |
| `server/src/services/valveApi.ts` | `server/src/cache.ts` | import { cached, TTL } from '../cache.js' | WIRED | getLiveLeagueGames() calls cached('live_games', TTL.LIVE_MATCH, fetchLiveLeagueGames) |
| `server/src/services/valveApi.ts` | `server/src/schemas/valve.ts` | import { LiveLeagueGamesSchema } from '../schemas/valve.js' | WIRED | fetchLiveLeagueGames calls LiveLeagueGamesSchema.parse(raw) |
| `server/src/cache.ts` | ioredis Redis client | new Redis(redisUrl) with TLS inside try block | WIRED (WR-01 fixed) | redisUrl construction inside try block; malformed URL degrades gracefully |
| `shared/heroMapper.ts` | `shared/heroes.json` | createRequire(import.meta.url)('./heroes.json') | WIRED | createRequire used for ESM+NodeNext JSON import compatibility |
| `shared/index.ts` | shared primitives | named re-exports | WIRED | exports heroMapper, buildingDecoder, hiddenProfile and their types |

### Data-Flow Trace (Level 4)

No dynamic data-rendering components in Phase 1 (no UI screens). `client/src/App.tsx` fetches `/api/health` and renders the string result as a smoke test only — not a data pipeline for verification.

The typed pipeline is verified at the code/wiring level: client → BFF proxy → GET /api/live/games → getLiveLeagueGames() → cached() → Valve fetch → LiveLeagueGamesSchema.parse() → typed LiveLeagueGames → c.json(). A runtime data-flow trace requires a live VALVE_API_KEY (see Human Verification Required).

### Behavioral Spot-Checks

| Behavior | Check | Status |
|----------|-------|--------|
| TTL.LIVE_MATCH === 30 | cache.test.ts TTL suite: PASS | PASS |
| TTL.HERO_STATS === 21600 | cache.test.ts TTL suite: PASS | PASS |
| TTL.PLAYER_STATS === 900 | cache.test.ts TTL suite: PASS | PASS |
| env.ts throws on missing UPSTASH_REDIS_URL | env.test.ts: 5/5 tests pass | PASS |
| env.ts throws on missing VALVE_API_KEY | env.test.ts: 5/5 tests pass | PASS |
| cached() cache hit returns cached value | cache.test.ts: PASS (fixed — was FAIL) | PASS |
| cached() cache miss calls fn() and stores in Redis | cache.test.ts: PASS (fixed — was FAIL) | PASS |
| cached() calls fn() twice on two consecutive misses | cache.test.ts: PASS | PASS |
| cached() propagates fn() error without writing to Redis | cache.test.ts: PASS | PASS |
| cached() falls through to fn() on Redis GET error | cache.test.ts: PASS | PASS |
| heroMapper(1) returns Anti-Mage | shared/heroMapper.test.ts: 4/4 pass | PASS |
| buildingDecoder(undefined,undefined) returns unavailable:true | shared/buildingDecoder.test.ts: 5/5 pass | PASS |
| hiddenProfile(4294967295) returns true | shared/hiddenProfile.test.ts: 4/4 pass | PASS |
| .passthrough() on all Valve schemas | grep -c 'passthrough' server/src/schemas/valve.ts = 6 | PASS |
| server/src/index.ts imports env.ts | import { env } from './env.js' present | PASS |
| redisUrl inside try block | redisUrl on line 12, try block opens on line 11 | PASS |
| zod in shared/package.json dependencies | zod under "dependencies" | PASS |
| no raw process.env reads in server files | grep confirms: no output | PASS |

All 26 automated test assertions pass (13 server + 13 shared).

### Requirements Coverage

Phase 1 has no REQ-ID requirements (infrastructure phase). All 15 v1 requirements are mapped to later phases and are unaffected.

### Anti-Patterns Found

None. The vi.fn() arrow function issue in cache.test.ts is resolved. No other anti-patterns identified.

### Human Verification Required

#### 1. End-to-End Data Pipeline Smoke Test

**Test:** Set VALVE_API_KEY (and UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN) in `server/.env`, run `cd server && npm run dev`, then `curl http://localhost:3001/api/live/games`.
**Expected:** HTTP 200 with JSON body containing `{ result: { games: [...] } }`. Games array may be empty if no live tournaments, but the shape must match the zod schema.
**Why human:** Requires a live Valve API key and a running server with Redis credentials. Cannot verify programmatically without credentials.

#### 2. Client BFF Health Check in Browser

**Test:** Start both `server` and `client` with `npm run dev` from repo root. Open `http://localhost:5173` in a browser.
**Expected:** Page shows "BFF status: BFF OK" (not "BFF unreachable").
**Why human:** Requires both processes running simultaneously and a browser render. Vite proxy behavior can only be confirmed at runtime.

### Gaps Summary

No gaps remain. All four ROADMAP success criteria are implemented and all automated tests pass. The previous gap (2 failing cache unit tests due to vi.fn() arrow function constructor incompatibility with vitest v4.1.5) is closed — the mock now uses `vi.fn(function () { return mockRedisInstance })`.

Two runtime verification items require a human with live credentials (Valve API key, Upstash Redis) to confirm the end-to-end pipeline and the browser health check. These are not implementation gaps; they are smoke tests that confirm the wired code operates against real external services.

**All three WR bugs from earlier verifications are closed:**
- WR-01: `const redisUrl` is inside `try {` block — malformed URL degrades gracefully.
- WR-02: `server/src/index.ts` imports `env.ts` — startup validation triggers on server start.
- WR-03: `zod` is in `dependencies` (not `devDependencies`) in `shared/package.json`.

---

_Verified: 2026-04-23T01:45:00Z_
_Verifier: Claude (gsd-verifier)_
_Mode: Re-verification after cache.test.ts vi.fn() mock constructor fix_
