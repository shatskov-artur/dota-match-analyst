# Phase 1: Foundations - Research

**Researched:** 2026-04-22
**Domain:** Monorepo scaffold, TypeScript BFF, Redis cache decorator, Valve API, shared primitives
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Flat directory structure — `client/`, `server/`, `shared/` at repo root. Each has its own `package.json`. No npm workspaces.
- **D-02:** Shared zod schemas and TypeScript types live in `shared/`. Both `client` and `server` reference them via tsconfig `paths` aliases (`@shared/*` → `../shared/*`).
- **D-03:** Root `package.json` has a `dev` script using `concurrently` to start both client and server in one terminal.
- **D-04:** `heroMapper` is backed by a static `shared/heroes.json` file — no runtime network call. Portrait URLs: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{internal_name}.png`.
- **D-05:** One-time seed script `scripts/seed-heroes.ts` fetches from OpenDota `/heroes`, writes `shared/heroes.json`, committed to repo.
- **D-06:** `heroMapper(id: number)` returns `{ name: string, portrait: string } | null`. Never throws.
- **D-07 (Claude's Discretion):** Local Redis — Upstash dev instance or Docker Compose. Planner picks based on onboarding friction. (Note: Docker is NOT available in this environment — Upstash dev instance is the only viable option.)
- **D-08:** TTLs: 30s live match data, 6h hero stats, 15min player stats.
- **D-09:** `buildingDecoder(bitmask: number | undefined): BuildingState` — handles absent `building_state` gracefully.
- **D-10:** `hiddenProfile(account_id: number): boolean` — returns `true` when `account_id === 4294967295`.
- **D-11:** All three primitives are pure functions in `shared/` and unit-tested with vitest.

### Claude's Discretion
- Local dev Redis approach (Upstash dev instance vs Docker Compose local) — Docker is NOT available in this machine's environment, so Upstash dev instance is the correct choice.
- Exact tsconfig `paths` alias names — standard `@shared/*` convention preferred.
- ESLint / Prettier configuration details — use standard defaults.
- Test file co-location (adjacent to source vs `__tests__/`) — planner decides.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 1 establishes the foundational typed pipeline for the entire application. It is a pure infrastructure phase: no UI components, no end-user features. The deliverables — a working Hono BFF, a Redis-backed `cached()` decorator, and three unit-tested shared primitives — are the load-bearing structures every subsequent phase builds on.

The monorepo layout (flat `client/` + `server/` + `shared/` without npm workspaces) requires careful tsconfig `paths` coordination. The `@shared/*` alias must be declared in each sub-package's `tsconfig.json` and mirrored in Vite's resolver (via `vite-tsconfig-paths`) and in Vitest's config. This is the most error-prone part of setup.

The `cached()` decorator is the single most important architectural primitive: it is the only path to upstream APIs and enforces N-viewer → 1 upstream call per TTL. It must be implemented with graceful Redis failure fallthrough (if Redis errors, call upstream directly rather than crashing).

**Primary recommendation:** Use Upstash dev instance for local Redis (Docker is not available in this environment). Implement `cached()` before any service method. Seed `heroes.json` once with the seed script and commit it. All three shared primitives must be pure functions with no side effects.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Monorepo layout + tsconfig paths | Dev tooling | — | Build-time concern; no runtime tier |
| `cached()` decorator | API / Backend | — | Upstream calls live exclusively server-side |
| Redis connection | API / Backend | — | Upstash TLS from Node.js server |
| `heroMapper` (pure function) | Shared lib | Frontend + Backend | Imported by both; no I/O at call time |
| `buildingDecoder` (pure function) | Shared lib | Backend (aggregator) | Decoding done at service layer, not in UI |
| `hiddenProfile` guard | Shared lib | Backend (aggregator) | Short-circuit before OpenDota calls |
| Valve API zod schema + fetch | API / Backend | — | All upstream traffic via BFF only |
| Vitest unit tests | Dev tooling | — | Run in `shared/` package |
| Health endpoint (`GET /health`) | API / Backend | — | BFF route; client uses as smoke test |

---

## Standard Stack

### Core Backend
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | 4.12.14 | HTTP framework | TypeScript-first, faster than Express, built-in CORS |
| @hono/node-server | 2.0.0 | Node.js adapter | Required to run Hono on Node.js (vs Bun/Deno) |
| ioredis | 5.10.1 | Redis client | Supports TLS (Upstash requires it), battle-tested |
| zod | 4.3.6 | Runtime validation | Parse every external API response |
| pino | 10.3.1 | Structured logging | Fast JSON logging; pino-pretty for dev |
| tsx | 4.21.0 | TS dev runner | `tsx watch` = hot-reload without ts-node complexity |
| typescript | 6.0.3 | Type safety | End-to-end types shared between client and server |
| vitest | 4.1.5 | Unit testing | Works in non-Vite packages, drop-in Jest API |

[VERIFIED: npm registry — all versions confirmed 2026-04-22]

### Core Frontend
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite | 8.0.9 | Dev server + bundler | Native ESM, fast HMR |
| @vitejs/plugin-react | 6.0.1 | React fast refresh | Standard React + Vite pairing |
| react | 19.2.5 | UI framework | Current stable |
| react-dom | 19.2.5 | DOM renderer | Paired with react |
| @tanstack/react-query | 5.99.2 | Server state + polling | `refetchInterval` is the exact primitive needed |
| react-router | 7.14.2 | Routing | Declarative mode for this 3-route SPA |
| zustand | 5.0.12 | Client state | UI-only state (selected match, hovered hero) |
| tailwindcss | 4.2.4 | Styling | CSS-first, no PostCSS |
| @tailwindcss/vite | 4.2.4 | Tailwind Vite plugin | Required for Tailwind v4 with Vite |
| vite-tsconfig-paths | 6.1.1 | Path alias resolution | Reads tsconfig paths, enables @shared/* in Vite |

[VERIFIED: npm registry — all versions confirmed 2026-04-22]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| concurrently | 9.2.1 | Parallel scripts | Root dev script to start client + server |
| pino-pretty | 13.1.3 | Log formatting | Dev only; attach with `| pino-pretty` |
| date-fns | 4.1.0 | Date/duration formatting | Match clock, series timestamps |
| clsx | 2.1.1 | className utility | Conditional Tailwind classes |

[VERIFIED: npm registry — all versions confirmed 2026-04-22]

**Note on Vite version:** npm registry shows Vite 8.0.9, which is significantly newer than the 6.x mentioned in prior research docs. The Vite plugin ecosystem (including @tailwindcss/vite 4.2.4) tracks the current Vite version. Use current latest rather than pinning to 6.x.

**Note on zod version:** npm registry shows zod 4.3.6. Prior research documented zod 3.x. Zod 4 introduced breaking API changes. See pitfalls section.

**Note on TypeScript version:** npm registry shows 6.0.3. This is ahead of what prior research documented (5.6.x). Both major version jumps may require tsconfig adjustments — verify before finalizing package.json.

### Installation

**Root:**
```bash
npm init -y
npm install -D concurrently
```

**Server (`server/`):**
```bash
cd server
npm init -y
npm install hono @hono/node-server ioredis zod pino
npm install -D typescript tsx vitest @types/node pino-pretty eslint @typescript-eslint/eslint-plugin prettier eslint-config-prettier
```

**Client (`client/`):**
```bash
npm create vite@latest . -- --template react-ts
npm install @tanstack/react-query @tanstack/react-query-devtools react-router zustand clsx date-fns
npm install -D tailwindcss @tailwindcss/vite vite-tsconfig-paths
```

**Shared (`shared/`):**
```bash
cd shared
npm init -y
npm install zod
npm install -D typescript vitest
```

---

## Architecture Patterns

### System Architecture Diagram

```
Developer terminal
  → "npm run dev" (root concurrently script)
      ├── client/ Vite dev server (port 5173)
      │     React SPA → fetch → http://localhost:3001
      └── server/ tsx watch (port 3001)
            Hono BFF
              ├── GET /health  (smoke test)
              └── GET /api/live/games
                    ↓
                cached("live_games", 30, valveApi.getLiveLeagueGames)
                    ↓ cache miss
                Valve Web API
                https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/
                    ↓
                zod parse (LiveLeagueGamesSchema.passthrough())
                    ↓
                Redis SET "live_games" TTL 30s
                    ↓
                return typed payload → BFF route → HTTP 200 → client
```

Data flow: all upstream calls flow through `cached()` — the Redis check happens before any network call.

### Recommended Project Structure

```
dota_stats/
├── package.json               # root — dev script with concurrently
├── client/
│   ├── package.json
│   ├── tsconfig.json          # paths: { "@shared/*": ["../shared/src/*"] }
│   ├── vite.config.ts         # plugins: [react(), tailwindcss(), tsconfigPaths()]
│   └── src/
│       ├── main.tsx
│       ├── index.css          # @import "tailwindcss"; @theme { ... }
│       └── lib/
│           └── apiClient.ts   # ONLY place fetch is called in frontend
├── server/
│   ├── package.json
│   ├── tsconfig.json          # paths: { "@shared/*": ["../shared/src/*"] }
│   ├── .env                   # STEAM_API_KEY, REDIS_URL — gitignored
│   └── src/
│       ├── index.ts           # Hono app + serve()
│       ├── routes/
│       │   └── live.ts        # GET /api/live/games
│       ├── services/
│       │   ├── cache.ts       # Redis client + cached() decorator
│       │   └── valveApi.ts    # GetLiveLeagueGames with cached()
│       └── schemas/
│           └── valve.ts       # LiveLeagueGamesSchema (zod)
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   ├── heroes.json            # seeded by scripts/seed-heroes.ts
│   └── src/
│       ├── heroMapper.ts      # heroMapper(id) → { name, portrait } | null
│       ├── buildingDecoder.ts # buildingDecoder(bitmask?) → BuildingState
│       ├── hiddenProfile.ts   # hiddenProfile(accountId) → boolean
│       └── index.ts           # barrel export
└── scripts/
    └── seed-heroes.ts         # one-time: fetch OpenDota /heroes → heroes.json
```

### Pattern 1: tsconfig paths for @shared/* (server and client identical)

```jsonc
// server/tsconfig.json and client/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "paths": {
      "@shared/*": ["../shared/src/*"]
    }
  }
}
```

For the client, Vite needs `vite-tsconfig-paths` to honor these paths at build time:
```ts
// client/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
})
```

[CITED: https://github.com/aleclarson/vite-tsconfig-paths]

### Pattern 2: `cached()` decorator

```ts
// server/src/services/cache.ts
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!) // rediss:// URL from Upstash

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  try {
    const raw = await redis.get(key)
    if (raw !== null) return JSON.parse(raw) as T
  } catch (err) {
    // Redis failure → fall through to upstream (degrade gracefully)
    console.error('[cache] get failed, bypassing:', err)
  }

  const value = await fn()

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value))
  } catch (err) {
    // Cache write failure is non-fatal — return value anyway
    console.error('[cache] set failed:', err)
  }

  return value
}
```

[ASSUMED] — implementation derived from architectural spec in ARCHITECTURE.md; exact error handling pattern is a convention choice.

Key design constraints:
- Key naming: `live_games`, `live_match_{id}`, `hero_matchups_{heroId}`, `player_heroes_{accountId}` — always namespaced by data type
- Never use per-user keys (violates the N-viewer → 1 upstream call invariant)
- Redis failure must degrade to uncached, not throw (P16 pitfall prevention)

### Pattern 3: Valve API zod schema with `.passthrough()`

```ts
// server/src/schemas/valve.ts
import { z } from 'zod'

const PlayerSchema = z.object({
  account_id: z.number(),
  name: z.string(),
  hero_id: z.number(),
  team: z.number().int(), // 0=Radiant, 1=Dire, 2=Broadcaster, 4=Unassigned
}).passthrough()

const TeamSchema = z.object({
  team_name: z.string().optional(),
  team_id: z.number().optional(),
  team_logo: z.string().optional(),
  complete: z.boolean().optional(),
}).passthrough()

export const LiveGameSchema = z.object({
  match_id: z.number(),
  lobby_id: z.number(),
  league_id: z.number(),
  spectators: z.number().optional(),
  game_state: z.number().int().optional(),     // see game_state reference below
  stream_delay_s: z.number().optional(),
  radiant_score: z.number().optional(),
  dire_score: z.number().optional(),
  duration: z.number().optional(),
  tower_state: z.number().optional(),          // 32-bit; see buildingDecoder
  barracks_state: z.number().optional(),       // 8-bit; see buildingDecoder
  building_state: z.number().optional(),       // alias used in some API versions
  players: z.array(PlayerSchema).optional(),
  radiant_team: TeamSchema.optional(),
  dire_team: TeamSchema.optional(),
}).passthrough()   // CRITICAL: .passthrough() on every Valve schema

export const LiveLeagueGamesSchema = z.object({
  result: z.object({
    games: z.array(LiveGameSchema),
    status: z.number().optional(),
  }).passthrough(),
}).passthrough()

export type LiveGame = z.infer<typeof LiveGameSchema>
export type LiveLeagueGames = z.infer<typeof LiveLeagueGamesSchema>
```

[ASSUMED] — field list from training knowledge of Valve API; `.passthrough()` pattern is architectural requirement from CLAUDE.md.

### Pattern 4: Hono app entry point

```ts
// server/src/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

const app = new Hono()

app.use('*', cors({ origin: 'http://localhost:5173' }))
app.use('*', logger())

app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

// Mount routes
import liveRoutes from './routes/live.js'
app.route('/api/live', liveRoutes)

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('Server running on http://localhost:3001')
})
```

[CITED: https://hono.dev/docs/getting-started/nodejs]

**Note:** With `"module": "NodeNext"` in tsconfig, local imports require `.js` extension even for `.ts` files. This is a common Node.js ESM gotcha.

### Pattern 5: Root `concurrently` dev script

```jsonc
// root package.json
{
  "scripts": {
    "dev": "concurrently --names \"client,server\" --prefix-colors \"cyan,yellow\" \"npm run dev --prefix client\" \"npm run dev --prefix server\""
  },
  "devDependencies": {
    "concurrently": "^9.2.1"
  }
}
```

[CITED: https://www.npmjs.com/package/concurrently]

### Pattern 6: Vitest for shared/ pure functions

```ts
// shared/vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

```jsonc
// shared/package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

[CITED: https://v2.vitest.dev/guide/]

### Anti-Patterns to Avoid

- **Direct upstream fetch in routes:** Routes MUST call aggregators/services, never `fetch()` directly. `fetch` in routes is a code smell.
- **Per-user cache keys:** Never suffix cache keys with session/user identifiers. N viewers = 1 cache entry.
- **Missing `.passthrough()` on Valve schemas:** Zod without passthrough silently drops fields Valve adds in patches; worse, it may reject valid responses.
- **Redis crash = app crash:** If `redis.get()` throws, log and continue to upstream. Never let Redis failure propagate to the HTTP response.
- **Importing `shared/` by relative path:** Always use `@shared/heroMapper` not `../../shared/src/heroMapper`. The alias exists to prevent this.
- **`"type": "module"` without `.js` extensions in imports:** NodeNext module resolution requires explicit `.js` extensions on local relative imports in TypeScript ESM.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis serialization | Custom JSON wrapper | `JSON.stringify/parse` in `cached()` | ioredis stores strings; no binary needed |
| Path alias resolution in Vite | Manual `resolve.alias` config | `vite-tsconfig-paths` plugin | Plugin reads tsconfig automatically; manual aliases drift |
| Parallel dev process management | Custom shell script | `concurrently` | Cross-platform, colored output, exit code forwarding |
| TypeScript execution in dev | `ts-node` + `nodemon` | `tsx watch` | tsx is 10x faster; no `--esm` flag wrestling |
| CORS middleware | Manual `Access-Control` headers | `hono/cors` | One import, handles preflight automatically |
| HTTP logging | Manual middleware | `hono/logger` | Built-in; pairs with pino for structured output |
| Building state decoding | `if (bitmask & 1)` scattered everywhere | `buildingDecoder()` in shared/ | One canonical decoder; unit-tested with all edge cases |

**Key insight:** The `cached()` decorator is the one piece worth carefully hand-rolling — it's 30 lines and must match the exact error-fallthrough contract. Everything around it (Redis client, HTTP framework, path resolution) uses standard libraries.

---

## Valve API Reference

### GetLiveLeagueGames Endpoint

```
GET https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/
    ?key={STEAM_API_KEY}
    &partner=1    # optional: filter to partner leagues only
```

[CITED: https://wiki.teamfortress.com/wiki/WebAPI/GetLiveLeagueGames]

**Note:** App ID is `570` for Dota 2. The `IDOTA2Match_570` interface is the correct one for production. `IDOTA2Match_205790` is for the testing app.

### game_state Values (DOTA_GAMERULES_STATE enum)

| Value | Constant | Meaning |
|-------|----------|---------|
| 0 | INIT | Initializing |
| 1 | WAIT_FOR_PLAYERS_TO_LOAD | Lobby loading |
| 2 | HERO_SELECTION | Draft phase — use 5s poll |
| 3 | STRATEGY_TIME | Strategy phase |
| 4 | PRE_GAME | Pre-game (before horn) |
| 5 | GAME_IN_PROGRESS | In-game — use 30s poll |
| 6 | POST_GAME | Post-game — STOP polling |
| 7 | DISCONNECT | Disconnected |

[CITED: GameTracking-Dota2/Protobufs/dota_shared_enums.proto via SteamDatabase GitHub]

**Critical:** `refetchInterval` must return `false` when `game_state === 6`. This is the quota-drain prevention mechanism.

### Key Response Fields

| Field | Type | Notes |
|-------|------|-------|
| `match_id` | number | Match identifier |
| `lobby_id` | number | Lobby identifier |
| `league_id` | number | League (non-zero = valid tournament match) |
| `game_state` | number | See table above; may be absent |
| `stream_delay_s` | number | Typically 120 (2 min); display to user |
| `radiant_score` | number | Kill count |
| `dire_score` | number | Kill count |
| `duration` | number | Seconds elapsed |
| `tower_state` | number | 32-bit bitmask (see buildingDecoder) |
| `barracks_state` | number | 8-bit bitmask (see buildingDecoder) |
| `building_state` | number | May appear in place of tower_state in some contexts |
| `players[].account_id` | number | `4294967295` = hidden profile |
| `players[].hero_id` | number | Map with heroMapper |
| `players[].net_worth` | number | Available during in-game state |
| `players[].respawn_timer` | number | Seconds until respawn; 0 if alive |
| `radiant_series_wins` | number | Series score |
| `dire_series_wins` | number | Series score |
| `series_type` | number | 0=BO1, 1=BO3, 2=BO5 |

[ASSUMED] — field list compiled from training knowledge of Valve API; exact field availability per `game_state` value may vary. Zod schemas with `.passthrough()` + `.optional()` handle absent fields.

**Gotcha:** Most nested fields (`players`, `radiant_team`, `dire_team`, draft fields) are absent during lobby/pre-game states. ALL nested object fields must be `.optional()` in zod schemas.

---

## buildingDecoder — Exact Bitmask Layout

The Valve API exposes two separate integers: `tower_state` (per-team, 16-bit) and `barracks_state` (per-team, 8-bit). Both are returned as a single integer per team in some API versions, and as separate fields in others. The implementation must handle both.

### tower_state bit layout (per team — same structure for Radiant and Dire)

| Bit | Tower |
|-----|-------|
| 0 | Top Tier 1 (outermost) |
| 1 | Top Tier 2 |
| 2 | Top Tier 3 (inner) |
| 3 | Middle Tier 1 |
| 4 | Middle Tier 2 |
| 5 | Middle Tier 3 |
| 6 | Bottom Tier 1 |
| 7 | Bottom Tier 2 |
| 8 | Bottom Tier 3 |
| 9 | Ancient Top |
| 10 | Ancient Bottom |
| 11–15 | Unused |

**Interpretation:** `1` = tower standing (alive), `0` = tower destroyed.

[CITED: https://wiki.teamfortress.com/wiki/WebAPI/GetMatchDetails — tower_state encoding]

### barracks_state bit layout (per team)

| Bit | Barracks |
|-----|----------|
| 0 | Top Melee |
| 1 | Top Ranged |
| 2 | Middle Melee |
| 3 | Middle Ranged |
| 4 | Bottom Melee |
| 5 | Bottom Ranged |
| 6–7 | Unused |

**Interpretation:** `1` = barracks standing (alive), `0` = barracks destroyed. When both melee and ranged in a lane are `0`, the opponent has mega creeps in that lane.

[CITED: https://wiki.teamfortress.com/wiki/WebAPI/GetMatchDetails — barracks_state encoding]

### buildingDecoder implementation

```ts
// shared/src/buildingDecoder.ts

export interface LaneBuildings {
  tier1: boolean
  tier2: boolean
  tier3: boolean
  meleeRax: boolean
  rangedRax: boolean
}

export interface TeamBuildings {
  top: LaneBuildings
  mid: LaneBuildings
  bot: LaneBuildings
  ancientTop: boolean
  ancientBottom: boolean
}

export interface BuildingState {
  radiant: TeamBuildings
  dire: TeamBuildings
  unavailable: boolean
}

const ALL_ALIVE: TeamBuildings = {
  top: { tier1: true, tier2: true, tier3: true, meleeRax: true, rangedRax: true },
  mid: { tier1: true, tier2: true, tier3: true, meleeRax: true, rangedRax: true },
  bot: { tier1: true, tier2: true, tier3: true, meleeRax: true, rangedRax: true },
  ancientTop: true,
  ancientBottom: true,
}

function decodeTowerState(ts: number): Omit<TeamBuildings, 'top' | 'mid' | 'bot'> & Pick<TeamBuildings, 'top' | 'mid' | 'bot'> {
  return {
    top: {
      tier1: !!(ts & (1 << 0)),
      tier2: !!(ts & (1 << 1)),
      tier3: !!(ts & (1 << 2)),
      meleeRax: false, // filled by decodeBarracksState
      rangedRax: false,
    },
    mid: {
      tier1: !!(ts & (1 << 3)),
      tier2: !!(ts & (1 << 4)),
      tier3: !!(ts & (1 << 5)),
      meleeRax: false,
      rangedRax: false,
    },
    bot: {
      tier1: !!(ts & (1 << 6)),
      tier2: !!(ts & (1 << 7)),
      tier3: !!(ts & (1 << 8)),
      meleeRax: false,
      rangedRax: false,
    },
    ancientTop: !!(ts & (1 << 9)),
    ancientBottom: !!(ts & (1 << 10)),
  }
}

function mergeBarracks(
  towers: ReturnType<typeof decodeTowerState>,
  bs: number
): TeamBuildings {
  return {
    ...towers,
    top: { ...towers.top, meleeRax: !!(bs & (1 << 0)), rangedRax: !!(bs & (1 << 1)) },
    mid: { ...towers.mid, meleeRax: !!(bs & (1 << 2)), rangedRax: !!(bs & (1 << 3)) },
    bot: { ...towers.bot, meleeRax: !!(bs & (1 << 4)), rangedRax: !!(bs & (1 << 5)) },
  }
}

/**
 * Decodes Valve's tower_state and barracks_state bitmasks into a structured object.
 * Handles absent fields gracefully per D-09.
 *
 * @param towerState  - radiant tower bits in lower 11, dire in upper 11 (or undefined)
 * @param barracksState - radiant barracks bits in lower 6, dire in upper 6 (or undefined)
 */
export function buildingDecoder(
  towerState: number | undefined,
  barracksState: number | undefined
): BuildingState {
  if (towerState === undefined) {
    return { radiant: ALL_ALIVE, dire: ALL_ALIVE, unavailable: true }
  }

  // Lower 16 bits = Radiant, upper 16 bits = Dire
  const radiantTower = towerState & 0xFFFF
  const direTower = (towerState >> 16) & 0xFFFF
  const radiantBarracks = barracksState !== undefined ? barracksState & 0xFF : 0x3F  // default all-alive
  const direBarracks = barracksState !== undefined ? (barracksState >> 8) & 0xFF : 0x3F

  return {
    radiant: mergeBarracks(decodeTowerState(radiantTower), radiantBarracks),
    dire: mergeBarracks(decodeTowerState(direTower), direBarracks),
    unavailable: false,
  }
}
```

[ASSUMED] — The split of Radiant/Dire within the 32-bit integer (lower 16 = Radiant, upper 16 = Dire) is based on training knowledge and the bit layout documented in the official wiki. The exact split MUST be verified against a real API response before considering this decoder complete. Write a unit test that uses a known game state (e.g., all towers standing = 0x7FF7FF) to verify.

**Critical edge case:** `building_state === 0` means ALL towers and barracks are destroyed (not absent data). The `unavailable` flag must only be set when the field is `undefined`, not `0`.

---

## heroMapper — Seed Script and Implementation

### OpenDota /heroes endpoint response shape

```
GET https://api.opendota.com/api/heroes
```

Returns an array of hero objects. Key fields per hero:

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `id` | number | `1` | Valve hero_id — matches GetLiveLeagueGames |
| `name` | string | `"npc_dota_hero_antimage"` | Internal name (strip `npc_dota_hero_` prefix for CDN URL) |
| `localized_name` | string | `"Anti-Mage"` | Display name |
| `img` | string | `"/apps/dota2/images/dota_react/heroes/antimage.png?"` | Relative path; prepend CDN base |
| `icon` | string | `"/apps/dota2/images/dota_react/heroes/icons/antimage.png?"` | Small icon |
| `primary_attr` | string | `"agi"` | "str", "agi", "int", "all" |
| `cm_enabled` | boolean | `true` | Captain's Mode availability |

[CITED: https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json]

**CDN pattern:** The `img` field is a relative path with a trailing `?`. Strip the `?`, prepend the CDN base:
```
https://cdn.cloudflare.steamstatic.com + img.replace('?', '')
```
This produces: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/antimage.png`

The CONTEXT.md specifies portrait URLs as `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png` where `{name}` is the internal name without the `npc_dota_hero_` prefix. Using the `img` field directly (with CDN prefix) is cleaner than string manipulation of the `name` field.

### Seed script

```ts
// scripts/seed-heroes.ts
import { writeFileSync } from 'fs'
import { join } from 'path'

const CDN_BASE = 'https://cdn.cloudflare.steamstatic.com'

interface OdotaHero {
  id: number
  name: string           // "npc_dota_hero_antimage"
  localized_name: string // "Anti-Mage"
  img: string            // "/apps/dota2/images/dota_react/heroes/antimage.png?"
}

interface HeroEntry {
  name: string
  portrait: string
}

async function seedHeroes() {
  const res = await fetch('https://api.opendota.com/api/heroes')
  if (!res.ok) throw new Error(`OpenDota /heroes failed: ${res.status}`)
  const heroes: OdotaHero[] = await res.json()

  const heroMap: Record<number, HeroEntry> = {}
  for (const hero of heroes) {
    heroMap[hero.id] = {
      name: hero.localized_name,
      portrait: CDN_BASE + hero.img.replace('?', ''),
    }
  }

  const outPath = join(__dirname, '../shared/heroes.json')
  writeFileSync(outPath, JSON.stringify(heroMap, null, 2))
  console.log(`Seeded ${heroes.length} heroes to shared/heroes.json`)
}

seedHeroes().catch(console.error)
```

### heroMapper implementation

```ts
// shared/src/heroMapper.ts
import heroData from '../heroes.json'

export interface HeroInfo {
  name: string
  portrait: string
}

// heroes.json shape: { "1": { name: "Anti-Mage", portrait: "https://..." }, ... }
const heroes = heroData as Record<string, HeroInfo>

/**
 * Maps a Valve hero_id to display name and portrait URL.
 * Returns null for unknown IDs — never throws.
 */
export function heroMapper(id: number): HeroInfo | null {
  return heroes[String(id)] ?? null
}
```

**Notes:**
- `heroes.json` is indexed by string keys (JSON keys are always strings) — use `String(id)` for lookup.
- The `heroes.json` file is committed to the repo so there is no runtime network dependency.
- After a patch with new heroes, re-run `scripts/seed-heroes.ts` and re-commit.

---

## hiddenProfile Guard

```ts
// shared/src/hiddenProfile.ts

/**
 * Returns true if the account_id represents a Steam-anonymized (hidden) profile.
 * account_id 4294967295 = 0xFFFFFFFF = Steam's sentinel for private accounts.
 * 
 * When this returns true, skip ALL OpenDota API calls for this player.
 * Use the Valve-provided player.name for display; never crash the UI.
 */
export function hiddenProfile(accountId: number): boolean {
  return accountId === 4294967295
}
```

This is the simplest of the three primitives. Its value is in being the single canonical check, unit-tested, imported by every aggregator that touches player data.

---

## Redis / Upstash Setup

### Why Upstash dev instance (not Docker)

Docker is NOT available in this development environment (confirmed: `command -v docker` returns not found). The Upstash free tier provides:
- HTTPS Redis endpoint (Upstash enforces TLS — cannot be disabled)
- Free tier: generous command count sufficient for development
- Same connection string format works in dev and production (no local/prod config divergence)

[CITED: https://upstash.com/docs/redis/howto/connectclient]

### ioredis connection with Upstash TLS

```ts
// server/src/services/cache.ts
import Redis from 'ioredis'

// REDIS_URL format: rediss://:PASSWORD@ENDPOINT:PORT
// "rediss://" (with double-s) = TLS enabled automatically
const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (err) => {
  // Log but don't crash — cache failures are non-fatal
  console.error('[redis] connection error:', err.message)
})
```

**Important:** Upstash recommends `rediss://` URL scheme (double-s) which ioredis maps to `{ tls: {} }`. If TLS is not auto-detected from the URL, add `tls: {}` explicitly to the ioredis config object.

[CITED: https://upstash.com/docs/redis/howto/connectclient]

### Environment variable

```bash
# server/.env
REDIS_URL=rediss://:your_password@your-endpoint.upstash.io:6379
STEAM_API_KEY=your_steam_api_key_here
```

Both files must be in `server/.gitignore` (and root `.gitignore`). Adding these to `.gitignore` is the first commit in Phase 1 — before any `.env` file is created.

---

## Common Pitfalls

### Pitfall 1: zod 4.x Breaking API Changes
**What goes wrong:** Code written for zod 3.x fails at runtime with "z.string is not a function" or similar. Prior research documented zod 3.x; npm registry now shows zod 4.3.6.
**Why it happens:** Zod 4 (released 2025) has a different internal API. The surface-level `z.object()`, `z.string()` API is similar but not identical to v3.
**How to avoid:** Pin to a specific zod major version in `package.json`. If using zod 4, verify `.passthrough()` still works as expected — check the zod 4 migration guide before implementation.
**Warning signs:** TypeScript errors on `.passthrough()` or `.infer<>`; zod schema construction at module load time failing.
**Confidence:** LOW — zod 4 specifics not verified against official docs. Verify before implementation.

### Pitfall 2: NodeNext module resolution requires `.js` extensions
**What goes wrong:** Import `./cache` in TypeScript causes "Cannot find module" at runtime even though the file exists.
**Why it happens:** With `"module": "NodeNext"` in tsconfig, Node.js ESM requires explicit `.js` extensions for local imports. TypeScript honors this requirement.
**How to avoid:** Use `import { cached } from './cache.js'` even when the file is `cache.ts`.
**Warning signs:** Runs fine with `tsx` but fails after `tsc` build; or fails with Node.js ERR_MODULE_NOT_FOUND.

### Pitfall 3: `building_state === 0` is not the same as absent
**What goes wrong:** All towers and barracks render as "unavailable" when the bitmask is `0` (all destroyed).
**Why it happens:** `bitmask === 0` is falsy in JS — a check like `if (!bitmask)` treats 0 as absent.
**How to avoid:** Always check `bitmask === undefined` (not `!bitmask`) before setting `unavailable: true`.
**Warning signs:** In a game where Dire's base is fully destroyed, towers show "data unavailable" instead of "all destroyed".

### Pitfall 4: Upstash `rediss://` URL not triggering TLS
**What goes wrong:** ioredis attempts a non-TLS connection and Upstash rejects it, causing ECONNREFUSED or AUTH failures.
**Why it happens:** Some versions of ioredis's URL parser don't correctly read the `rediss://` protocol and fall back to non-TLS.
**How to avoid:** If connection fails, add `tls: {}` explicitly alongside the URL: `new Redis(url, { tls: {} })`.
**Warning signs:** Connection errors immediately on startup; Upstash dashboard shows no connections despite correct credentials.

### Pitfall 5: `@shared/*` paths not resolved in Vitest
**What goes wrong:** Unit tests in `shared/` fail with "Cannot find module '@shared/heroMapper'".
**Why it happens:** Vitest doesn't automatically read tsconfig paths unless `vite-tsconfig-paths` is in the Vitest plugin list.
**How to avoid:** Add `vite-tsconfig-paths` to `shared/vitest.config.ts` plugins array (same plugin, same syntax as vite.config.ts).
**Warning signs:** Tests fail with module resolution errors but the TypeScript compiler reports no errors.

### Pitfall 6: `building_state` field name vs `tower_state`/`barracks_state`
**What goes wrong:** Decoder receives `undefined` even when building data is present in the API response.
**Why it happens:** The Valve API is inconsistent — some responses use `tower_state` + `barracks_state` (separate fields), others use `building_state` (combined). The field name may also have changed between Dota 2 versions.
**How to avoid:** The zod schema should accept all three field names as optional. The decoder should accept the raw game object and try all three field locations.
**Warning signs:** Building state shows "unavailable" for matches that clearly have a live game going.

### Pitfall 7: Vite version mismatch with Tailwind plugin
**What goes wrong:** `@tailwindcss/vite` fails to load with a peer dependency error.
**Why it happens:** npm registry shows Vite 8.0.9 (ahead of the 6.x documented in prior research). The `@tailwindcss/vite` 4.2.4 plugin must match the Vite major version.
**How to avoid:** Run `npm install` and check for peer dependency warnings. Use `npm view @tailwindcss/vite peerDependencies` to verify Vite compatibility.
**Warning signs:** Vite dev server fails on startup with plugin loading errors.

### Pitfall 8: TypeScript 6.x changes
**What goes wrong:** tsconfig options that worked in TS 5.x are deprecated or removed in TS 6.x.
**Why it happens:** npm registry shows TypeScript 6.0.3, which is a major version ahead of what prior research documented (5.6.x). TypeScript major versions can remove deprecated options.
**How to avoid:** Use `tsc --init` to generate a fresh tsconfig for TS 6. Check the TS 6 migration guide before copying tsconfig from older templates.
**Warning signs:** `tsc` reports "Unknown compiler option" for options from older tsconfig templates.

---

## Code Examples

### Valve API service with `cached()`

```ts
// server/src/services/valveApi.ts
import { cached } from './cache.js'
import { LiveLeagueGamesSchema, type LiveLeagueGames } from '../schemas/valve.js'

const STEAM_API_KEY = process.env.STEAM_API_KEY!
const BASE_URL = 'https://api.steampowered.com'

async function fetchLiveLeagueGames(): Promise<LiveLeagueGames> {
  const url = `${BASE_URL}/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${STEAM_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Valve API error: ${res.status}`)
  const raw = await res.json()
  return LiveLeagueGamesSchema.parse(raw)  // throws ZodError if schema broken
}

export const getLiveLeagueGames = () =>
  cached('live_games', 30, fetchLiveLeagueGames)
```

### Unit test structure for shared primitives

```ts
// shared/src/heroMapper.test.ts
import { describe, it, expect } from 'vitest'
import { heroMapper } from './heroMapper.js'

describe('heroMapper', () => {
  it('returns name and portrait for a known hero_id', () => {
    const result = heroMapper(1)  // Anti-Mage — always in heroes.json
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Anti-Mage')
    expect(result?.portrait).toMatch(/^https:\/\/cdn\.cloudflare\.steamstatic\.com/)
  })

  it('returns null for an unknown hero_id without throwing', () => {
    expect(heroMapper(99999)).toBeNull()
  })

  it('returns null for hero_id 0 (no hero selected)', () => {
    expect(heroMapper(0)).toBeNull()
  })
})
```

```ts
// shared/src/buildingDecoder.test.ts
import { describe, it, expect } from 'vitest'
import { buildingDecoder } from './buildingDecoder.js'

describe('buildingDecoder', () => {
  it('returns unavailable:true and all-alive placeholder when towerState is undefined', () => {
    const state = buildingDecoder(undefined, undefined)
    expect(state.unavailable).toBe(true)
    expect(state.radiant.top.tier1).toBe(true)  // all-alive placeholder
  })

  it('does NOT set unavailable when towerState is 0 (all destroyed)', () => {
    const state = buildingDecoder(0, 0)
    expect(state.unavailable).toBe(false)
    expect(state.radiant.top.tier1).toBe(false)  // all destroyed
  })

  it('correctly decodes a known partial state', () => {
    // Radiant top T1 destroyed (bit 0 = 0), all else standing
    // Radiant tower_state: 0b11111111110 = 0x7FE = 2046
    const radiantTowerState = 0x7FE
    const direTowerState = 0x7FF  // all standing
    const towerState = (direTowerState << 16) | radiantTowerState
    const state = buildingDecoder(towerState, undefined)
    expect(state.radiant.top.tier1).toBe(false)
    expect(state.radiant.top.tier2).toBe(true)
  })
})

describe('hiddenProfile', () => {
  it('returns true for the sentinel value', () => {
    // tested in hiddenProfile.test.ts
  })
})
```

```ts
// shared/src/hiddenProfile.test.ts
import { describe, it, expect } from 'vitest'
import { hiddenProfile } from './hiddenProfile.js'

describe('hiddenProfile', () => {
  it('returns true for account_id 4294967295', () => {
    expect(hiddenProfile(4294967295)).toBe(true)
  })

  it('returns false for a normal account_id', () => {
    expect(hiddenProfile(123456789)).toBe(false)
  })

  it('returns false for 0', () => {
    expect(hiddenProfile(0)).toBe(false)
  })
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express + ts-node + nodemon | Hono + tsx watch | 2023–2024 | Faster startup, no ESM config wrestling |
| React 18 + Vite 4–5 | React 19 + Vite 8 | 2024–2025 | Stable concurrent features; faster build |
| Tailwind v3 (PostCSS config) | Tailwind v4 (CSS @import, Vite plugin) | Jan 2025 | No `tailwind.config.js`; use `@theme` in CSS |
| zod 3.x | zod 4.x | 2025 | Breaking API changes — verify before using |
| TypeScript 5.x | TypeScript 6.x | 2025 | May remove deprecated tsconfig options |
| Manual path alias in `vite.config.ts` | `vite-tsconfig-paths` plugin | 2023+ | Single source of truth in tsconfig.json |

**Deprecated/outdated:**
- `ts-node`: replaced by `tsx` — tsx is 10x faster and doesn't require `--esm` flag juggling
- `nodemon`: replaced by `tsx watch` — one tool for both compilation and watch
- Tailwind `tailwind.config.js`: replaced by `@theme` in CSS file for v4
- npm workspaces for this project: explicitly rejected per D-01; flat directories with path aliases chosen instead

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cached()` error fallthrough implementation (try/catch wrapping get and set separately) | Code Examples | Redis errors propagate to HTTP 500 instead of gracefully degrading |
| A2 | Valve API field names: `tower_state`, `barracks_state`, `building_state`, `radiant_score`, `dire_score`, `players[].net_worth`, `players[].respawn_timer`, `series_type` | Valve API Reference | Fields absent at runtime; zod parse succeeds but application breaks when accessing fields |
| A3 | Radiant/Dire tower_state split: lower 16 bits = Radiant, upper 16 bits = Dire | buildingDecoder | Building state decoded backwards (Radiant shown as Dire and vice versa) |
| A4 | `img` field in OpenDota /heroes response has trailing `?` that should be stripped | heroMapper seed script | Portrait URLs have trailing `?` causing CDN request to fail or return wrong image |
| A5 | zod 4.x API is compatible with `.passthrough()`, `.optional()`, `.infer<>` as shown in examples | Standard Stack / Zod schema examples | Runtime errors building schemas; blocking implementation |
| A6 | TypeScript 6.x `"module": "NodeNext"` tsconfig is still the correct setting for Node.js ESM | Architecture Patterns | Import resolution fails; `tsx` or `tsc` errors |
| A7 | Vite 8.x is compatible with `@tailwindcss/vite` 4.2.4 and `vite-tsconfig-paths` 6.1.1 | Standard Stack | Vite dev server fails to start due to plugin version mismatch |

---

## Open Questions

1. **zod 4 vs zod 3 compatibility**
   - What we know: npm registry shows zod 4.3.6 as current. Prior research assumed zod 3.x.
   - What's unclear: Whether zod 4 has the same `.passthrough()` behavior for Valve schemas.
   - Recommendation: Before writing any schema, run `npm view zod version` in each package and check the zod 4 changelog. If breaking, pin to `"zod": "^3.24.0"` explicitly.

2. **TypeScript 6 tsconfig options**
   - What we know: npm shows TypeScript 6.0.3. Prior research assumed 5.6.x.
   - What's unclear: Which tsconfig options changed or were removed.
   - Recommendation: In Wave 0, run `npx tsc@6 --init` to generate a valid TS6 tsconfig rather than copying from older templates.

3. **Exact Valve API field names at runtime**
   - What we know: Documented field names from wiki and training knowledge.
   - What's unclear: Whether `tower_state` vs `barracks_state` vs `building_state` is the current field name in API responses.
   - Recommendation: In Wave 0, make one live call to GetLiveLeagueGames and log the raw response to confirm field names before writing the zod schema.

4. **buildingDecoder Radiant/Dire split**
   - What we know: Bit 0–10 = one team's towers; the 32-bit integer must encode both teams.
   - What's unclear: The exact bit position where the Dire team's bits begin (bit 16? bit 11?).
   - Recommendation: Write the decoder with a clear comment marking the assumed split, and add a unit test that can be validated against a real API response in Wave 0.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v25.9.0 (above Node 24 LTS target) | — |
| npm | Package manager | ✓ | 11.12.1 | — |
| Git | Version control | ✓ | 2.49.0 | — |
| Docker | Local Redis option | ✗ | — | Upstash dev instance (forced choice) |
| Upstash Redis | Cache layer | Requires signup | — | None — required for cached() |

**Missing dependencies with no fallback:**
- Upstash dev instance credentials — developer must sign up at upstash.com and create a Redis database before starting. This produces the `REDIS_URL` env var. No other local Redis option is available without Docker.

**Missing dependencies with fallback:**
- None beyond Docker (which has the Upstash fallback).

**Node.js version note:** The machine runs Node.js v25.9.0, which is ahead of the Node 24 LTS target. Node 25 is a current-release (not LTS) version. All Node 24 features are available. No compatibility issues expected — ioredis, Hono, and tsx are all compatible with Node 24+. If CI/CD targets Node 24 LTS specifically, install Node 24 via nvm for parity.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `shared/vitest.config.ts` (Wave 0 creation) |
| Quick run command | `cd shared && npm test -- --run` |
| Full suite command | `cd shared && npm test` |

### Phase Requirements → Test Map

Phase 1 has no formal REQ-IDs (infrastructure phase), but the success criteria map to testable behaviors:

| Success Criterion | Behavior | Test Type | Automated Command | File Exists? |
|-------------------|----------|-----------|-------------------|-------------|
| SC-1: BFF reachable | `GET /health` returns 200 | smoke | `curl localhost:3001/health` | ❌ Wave 0 |
| SC-2: Valve API zod parse | `LiveLeagueGamesSchema.parse()` accepts passthrough fields | unit | `cd shared && npm test -- --run` | ❌ Wave 0 |
| SC-3: cached() single upstream | Mock Redis hit returns cached value; miss calls fn once | unit | `cd server && npm test -- --run` | ❌ Wave 0 |
| SC-4a: heroMapper | Returns correct name/portrait; returns null for unknown ID | unit | `cd shared && npm test -- --run` | ❌ Wave 0 |
| SC-4b: buildingDecoder | Correct bit decoding; graceful on undefined; 0 ≠ absent | unit | `cd shared && npm test -- --run` | ❌ Wave 0 |
| SC-4c: hiddenProfile | Returns true for 4294967295, false for others | unit | `cd shared && npm test -- --run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd shared && npm test -- --run`
- **Per wave merge:** `cd shared && npm test -- --run && cd server && npm test -- --run`
- **Phase gate:** All unit tests green + manual smoke test of `GET /health` before marking phase complete

### Wave 0 Gaps
- [ ] `shared/vitest.config.ts` — Vitest config with tsconfigPaths plugin
- [ ] `shared/src/heroMapper.test.ts` — heroMapper unit tests
- [ ] `shared/src/buildingDecoder.test.ts` — buildingDecoder unit tests (including bit verification)
- [ ] `shared/src/hiddenProfile.test.ts` — hiddenProfile unit tests
- [ ] `server/src/services/cache.test.ts` — cached() with mocked Redis (optional but recommended)
- [ ] Framework install: `cd shared && npm install -D vitest vite-tsconfig-paths`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user auth in v1 |
| V3 Session Management | No | No sessions in v1 |
| V4 Access Control | No | Small group tool; no ACL needed in v1 |
| V5 Input Validation | Yes | zod schemas on all Valve/OpenDota responses |
| V6 Cryptography | No | No custom crypto; TLS via Upstash rediss:// |
| V9 Communication | Partial | STEAM_API_KEY in env var, not code |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure in git | Information Disclosure | `.gitignore` for `.env` files — first commit before any key exists |
| Valve response injection (malformed JSON) | Tampering | zod `.parse()` throws on invalid shape; never use raw response directly |
| SSRF via match_id or league_id params | Elevation of Privilege | BFF constructs all upstream URLs internally; never interpolates user input into URL without validation |
| Redis key collision | Tampering | Namespaced keys (`live_games`, `live_match_{id}`) prevent cross-data contamination |

**Phase 1 specific:** The `.gitignore` additions (`.env`, `node_modules/`, `dist/`) must be the very first commit. No API key should ever touch git history.

---

## Project Constraints (from CLAUDE.md)

| Directive | Enforcement in Phase 1 |
|-----------|----------------------|
| TypeScript + zod everywhere | Every file is `.ts`; Valve schema uses zod with `.passthrough()` |
| `cached()` decorator wraps all upstream calls | valveApi.ts must use `cached()` — direct `fetch` in routes is forbidden |
| `.passthrough()` on all Valve zod schemas | All schemas in `server/src/schemas/valve.ts` must call `.passthrough()` |
| `building_state` can be absent | `buildingDecoder` signature is `(bitmask: number | undefined)` |
| Hidden profiles short-circuit at aggregator | `hiddenProfile()` guard checked before any OpenDota call |
| Stratz 500 req/hr — cache by match_id only | Not applicable in Phase 1 (no Stratz calls yet) |
| Polling stops on game_state === 6 | Not applicable in Phase 1 (no polling yet; established in Phase 2) |

---

## Sources

### Primary (HIGH confidence)
- npm registry (2026-04-22) — all package versions verified via `npm view`
- [https://wiki.teamfortress.com/wiki/WebAPI/GetLiveLeagueGames](https://wiki.teamfortress.com/wiki/WebAPI/GetLiveLeagueGames) — Valve API endpoint, tower_state bit layout
- [https://wiki.teamfortress.com/wiki/WebAPI/GetMatchDetails](https://wiki.teamfortress.com/wiki/WebAPI/GetMatchDetails) — tower_state and barracks_state bit encoding (11 bits/6 bits per team)
- [https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json](https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json) — OpenDota hero response fields (id, name, localized_name, img, icon)
- [https://upstash.com/docs/redis/howto/connectclient](https://upstash.com/docs/redis/howto/connectclient) — ioredis + Upstash TLS connection pattern
- [https://hono.dev/docs/getting-started/nodejs](https://hono.dev/docs/getting-started/nodejs) — Hono Node.js adapter setup
- [https://v2.vitest.dev/guide/](https://v2.vitest.dev/guide/) — Vitest configuration for standalone packages

### Secondary (MEDIUM confidence)
- SteamDatabase/GameTracking-Dota2 Protobufs — game_state enum values (2=HERO_SELECTION, 5=GAME_IN_PROGRESS, 6=POST_GAME) confirmed via search results cross-referencing multiple sources
- [https://github.com/aleclarson/vite-tsconfig-paths](https://github.com/aleclarson/vite-tsconfig-paths) — vite-tsconfig-paths plugin usage
- [https://www.npmjs.com/package/concurrently](https://www.npmjs.com/package/concurrently) — concurrently script patterns

### Tertiary (LOW confidence — flag for validation)
- Valve API field names (`radiant_score`, `dire_score`, `players[].net_worth`, etc.) — training knowledge; not verified against a live API call in this session
- buildingDecoder Radiant/Dire 32-bit split (lower 16 = Radiant) — derived from 16-bit-per-team structure; exact split boundary needs live verification
- zod 4.x API compatibility with `.passthrough()` — zod 4 is a major version bump; training knowledge may not reflect actual v4 API

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry
- Architecture patterns: HIGH — derived from verified prior research docs + official framework docs
- Valve API field names: MEDIUM — documented from official wiki for primary fields; LOW for nested player/team fields
- buildingDecoder bitmask: HIGH for bit layout (wiki-cited); MEDIUM for Radiant/Dire 32-bit split
- Pitfalls: HIGH — confirmed from prior research + this session's version verification discoveries

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (30 days — stable infrastructure; zod/TS version changes may invalidate sooner)
