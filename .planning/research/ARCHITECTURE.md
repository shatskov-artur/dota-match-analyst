# Architecture

**Project:** Dota 2 Real-Time Tournament Match Analytics
**Researched:** 2026-04-21
**Confidence:** HIGH (derived from validated prior technical guide + established BFF + cache-aside patterns)

---

## High-Level Shape

The app is a **client → BFF → cache → upstream APIs** pipeline. The backend is a thin aggregator and rate-limit firewall — it exists because upstream APIs cannot safely be called from the browser (key exposure, CORS, and rate limits are shared across all clients).

```
React SPA (Vite + Tailwind + React Query)
  Pages: Home (live list), Match (draft + in-game)
      |
      | HTTP/JSON — refetchInterval: 5s draft / 30s in-game
      v
Node.js + Hono BFF (port 3001)
  Routes:      /api/live, /api/heroes, /api/players, /api/matches, /api/constants
  Aggregation: composes 2-3 upstream calls into one UI-ready payload
  Services:    valveApi | openDotaApi | stratzApi
  Cross-cut:   cache (Redis) | rateLimiter | heroMapper | buildingDecoder
      |
      +-- Redis cache (per-key TTLs)
      +-- Valve Web API      (100k/day, live matches)
      +-- OpenDota API       (50k/month, stats)
      +-- Stratz API         (500/hour, win probability)
```

---

## Component Boundaries

### Backend — 5 strict layers (one-way dependency: top → bottom)

| Layer | Responsibility | Depends on | Must NOT touch |
|---|---|---|---|
| **Routes** (`routes/*.ts`) | HTTP parsing, param validation, response shaping | Aggregators, Services | Redis directly, upstream APIs directly |
| **Aggregators** (`aggregators/*.ts`) | Compose multiple service calls into one UI-ready payload | Services, Utils | `req`/`res`, Redis |
| **Services** (`services/{valve,openDota,stratz}Api.ts`) | One per upstream. Owns `fetch` client, auth header, cache-key scheme, TTL policy | Cache, RateLimiter | Other services |
| **Cross-cutting** (`services/cache`, `utils/heroMapper`, `utils/buildingDecoder`) | Redis client, hero ID→name/image mapping, bitmask decoder | Redis driver | Services |
| **Config** (`.env`, `config.ts`) | API keys, TTLs, poll intervals | — | Anything |

### Frontend — 3 layers

| Layer | Responsibility |
|---|---|
| **Pages** (`Home.tsx`, `Match.tsx`) | Route containers. No data-fetching logic. |
| **Hooks** (`useLiveMatch`, `useHeroMatchups`, `useDraftState`) | `useQuery` wrappers. Own `queryKey`, `refetchInterval`, `staleTime`. |
| **Components** (`LiveMatchCard`, `DraftBoard`, `HeroTooltip`, `WinProbBar`, `PlayerStatus`) | Presentational — props in, JSX out. No fetch calls. |

**Rule:** `fetch` imports live in exactly two places — `frontend/src/lib/apiClient.ts` and `backend/src/services/*.ts`. Any other direct fetch call is a smell.

---

## Data Flows

### Primary: "show me this live match"
```
User opens /match/:id
  → useLiveMatch(id) [React Query, every 30s] → GET /api/live/match/:id
      → Aggregator: matchDetails(id)
          ├─ valveApi.getLiveMatchDetails(id)
          │     Redis `live_match_${id}` (TTL 30s)
          │           miss → Valve GetLiveLeagueGames
          └─ stratzApi.getWinProbability(id)   [best-effort, try/catch]
                Redis `win_prob_${id}` (TTL 30s)
                      miss → Stratz /match/:id/breakdown
      → { match, winProbability } → HTTP 200 → UI renders
```

Each upstream is hit at most once per TTL per match, regardless of how many tabs are open.

### Secondary: "counterpick tooltip on hover"
```
User hovers hero in DraftBoard
  → useHeroMatchups(heroId) [staleTime 6h] → GET /api/heroes/:id/matchups
      → openDotaApi.getHeroMatchups(heroId)
            Redis `hero_matchups_${id}` (TTL 6h)
                  miss → OpenDota /heroes/:id/matchups

Client joins matchups with current enemyHeroIds from draft state
  → "⚠ Enemy has counterpick: X"
```

The cross-reference is done **on the frontend** — backend serves raw matchups, UI joins to live draft.

### Tertiary: "player stats on drafted hero"
```
Match page renders PlayerRow
  → GET /api/players/:accountId/hero/:heroId/stats?leagueId=X
      Aggregator issues IN PARALLEL (Promise.all):
        ├─ openDotaApi.getPlayerHeroes(accountId)     (15min TTL)
        ├─ openDotaApi.getHeroStats()                 (6h TTL, shared across users)
        └─ openDotaApi.getLeagueHeroStats(leagueId)   (30min TTL)
      Merge → { playerPicks, playerWinRate, globalWinRate, tournamentWinRate }
```

---

## Patterns

### P1: Cache-Aside per Service Method
Every upstream call: check Redis → return hit; else fetch → set → return.
Key scheme: `<resource>_<id>[_<variant>]`. Flat strings, no JSON keys.

### P2: Tiered TTLs by Volatility

| Volatility | TTL | Examples |
|---|---|---|
| Live game state | 30s | live match details, win probability, draft state |
| Per-tournament aggregates | 15–30 min | league_hero_stats, player match history |
| Per-patch stats | 6h | hero matchups, global hero winrate |
| Static-ish | 24h | completed match details, league listing |
| Truly static | in-memory forever | hero constants (id → name/image) |

### P3: BFF Aggregation (one UI need = one endpoint)
Browser makes one HTTP call per logical view. BFF fans out internally. `/api/live/match/:id` returns `{ match, winProbability }` — the browser never knows Stratz exists.

### P4: React Query as Frontend Cache
```ts
// Dynamic interval — keys to quota discipline
refetchInterval: (query) => {
  const s = query.state.data?.match?.game_state
  if (s === 2) return 5_000   // draft phase
  if (s === 5) return 30_000  // in-game
  if (s === 6) return false   // post-game: stop
  return 30_000
}
refetchOnWindowFocus: false   // prevents thundering herd on tab focus
staleTime: 21_600_000         // hero matchups — match backend TTL
```

### P5: Rate-Limit Queue per Upstream
Promise queue with per-upstream delay. Stratz tightest: 500/hr ≈ pad to 7.5s between distinct keys. OpenDota: 200ms safety net. Valve: typically no queue needed (100k/day with 30s TTL ≈ 2880/day). Redis dedupes concurrent same-key requests — queue handles distinct keys only.

### P6: Defensive Decoding at the Edge
Decode `building_state` bitmask, parse draft dict, handle missing fields — once at the service/aggregator layer. Never in the UI. One place to fix "Valve sometimes omits building_state."

### P7: `cached()` Decorator
Structurally prevent uncached upstream calls:
```ts
const cached = <T>(key: string | ((...args: unknown[]) => string), ttl: number, fn: (...args: unknown[]) => Promise<T>) =>
  async (...args: unknown[]): Promise<T> => {
    const k = typeof key === 'function' ? key(...args) : key
    const hit = await cache.get<T>(k)
    if (hit) return hit
    const val = await fn(...args)
    await cache.set(k, val, ttl)
    return val
  }
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Prevention |
|---|---|
| Fetch on every render (`useEffect` + manual state) | Always `useQuery` |
| Per-user cache keys (`user_123_hero_matchups_5`) | Scope keys only to data's variance axes (not user) |
| Browser calling upstreams directly | All upstream traffic via BFF |
| Stratz treated as required | Wrap in try/catch; return `null`; UI conditionally renders |
| Polling finished matches | `refetchInterval` returns `false` on `game_state === 6` |
| Large raw Valve payloads over the wire | BFF projects to slim `LiveGameSummary` before responding |
| Implicit hero-ID assumptions | Always go through `heroMapper` seeded from OpenDota constants |

---

## Build Order

### Hard dependencies (must be sequential)
| Must exist | Before you can build |
|---|---|
| Redis + `cache.get/set` | Any service method |
| `valveApi.getLiveLeagueGames` + Redis | `/api/live/games` route |
| `/api/live/games` | Home page |
| `heroMapper` seeded | Any hero rendering (image, name) |
| `buildingDecoder` | Match page towers display |
| React Query provider + `apiClient.ts` | Any `useQuery` hook |
| Match page MVP | Draft overlay, counterpick tooltip |
| `openDotaApi.getHeroMatchups` | Counterpick tooltip |

### MVP critical path (10 steps to "user sees a live match")
1. Redis + `cache.ts`
2. `valveApi.getLiveLeagueGames` with Redis
3. `GET /api/live/games`
4. Vite/React scaffold + React Query provider
5. `useLiveGames` + Home page list
6. `valveApi.getLiveMatchDetails`
7. `GET /api/live/match/:id`
8. `useLiveMatch` + Match page (raw fields)
9. `heroMapper` + hero images
10. `buildingDecoder` + towers UI

Everything beyond step 10 (Stratz, matchups, player stats, series history) is **enrichment**, not MVP.

---

## Suggested Phase Split

| Phase | Name | Deliverable |
|---|---|---|
| **P0** | Foundations | Repo, backend/frontend scaffolds, Redis via Docker, .env, hero constants loader |
| **P1** | Live List | Home page shows real live tournament matches, auto-refresh 30s |
| **P2** | Match Core | Click a match → live in-game state: score, gold diff, hero alive/dead, towers, series score |
| **P3** | Draft UX | In pick phase, bans/picks update live every 5s |
| **P4** | Hero Intel | Hover drafted hero → counterpick tooltip + patch winrate |
| **P5** | Player Intel | Each player row shows "N games, W% on this hero" |
| **P6** | Win Probability | Radiant/Dire probability bar with graceful-degrade on Stratz failure |
| **P7** | Harden & Deploy | Rate-limit queues, error boundaries, 429 backoff, Vercel + Railway deploy |

### Phase dependency DAG
```
P0 → P1 → P2 → P3
               ├── P4  (hero intel — independent after P2)
               ├── P5  (player intel — independent after P2)
               ├── P6  (win prob — independent after P2)
               └── P7  (final; depends on all)
```

P4, P5, P6 are safe parallel tracks after P2 lands.

---

## Critical Integration Points

1. **Valve response projection** — BFF always returns slim `LiveGameSummary`, never raw Valve shape.
2. **Hero ID resolution** — `heroMapper.get(heroId)` is the single source of truth. Hydrated at boot from OpenDota `/constants/heroes`.
3. **Hidden-profile short-circuit** — Aggregator checks `accountId === 4294967295` before touching OpenDota; returns `{ hidden: true, stats: null }`.
4. **Draft state detection** — `refetchInterval` reads server-returned `game_state`, not a local flag. If match not found, stop polling.
5. **Stratz failure isolation** — `winProbability` is always `value | null`, never throws. Frontend hides the bar on `null`.
6. **Frontend ↔ backend type drift** — `shared/types.ts` documents every response shape for v1. Consider tRPC/generated types in v2.

---

## Scalability Headroom

| Concern | 1 user | 10 users | 100 users |
|---|---|---|---|
| Valve rate limit | Fine | Fine (Redis dedupes) | Fine — 1 call per match per 30s regardless of users |
| OpenDota limit | Fine (mostly 6h cache) | Fine | Approaching on heavy tournament days |
| Stratz limit | Tight on LAN days | Tight | Breaks — drop or cache longer; paid tier |
| Redis memory | <10MB | <50MB | <500MB |

Rate-limit ceiling is a function of **distinct live matches being watched**, not user count. Scales to ~100 concurrent users on a $5 VPS without changes — well above the "small group of friends" target.

---

## What Could Change the Architecture

| Trigger | Implication |
|---|---|
| User accounts arrive | Postgres needed; CSRF/auth middleware |
| Historical analytics across completed matches | Writer (cron/event ingest) + Postgres |
| Mobile app | Add versioned `/api/v1/*` prefix |
| Stratz becomes paid-only | Swap win-prob source; BFF boundary isolates this cleanly |
| Valve adds WebSocket (unlikely) | Backend becomes relay; frontend swaps polling for subscription |
