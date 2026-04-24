# Phase 2: Live Matches List - Research

**Researched:** 2026-04-23
**Domain:** React polling UI + BFF enrichment route + React Router v7 declarative setup
**Confidence:** HIGH (core APIs verified via official docs and installed package inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Table row style (dense horizontal), not cards. Each row shows: Team A vs Team B | series score (e.g. "1-0 Bo3") | status tag (Live / Draft / Post-game) | game duration.
- **D-02:** Status tag derives from `game_state`: 2 → "Draft", 5 → "Live", 6 → "Post-game". Any other value → "Unknown" or omit tag.
- **D-03:** Series format derives from `series_type`: 0 → "Bo1", 1 → "Bo3", 2 → "Bo5". Series score from `radiant_series_wins`/`dire_series_wins`.
- **D-04:** Game duration displayed as MM:SS from the `duration` field (seconds elapsed). Hidden when `duration` is absent (draft/lobby state).
- **D-05:** Spectator count is NOT shown — keep the row minimal.
- **D-06:** The Valve API only provides `league_id` per match — no `league_name`. The BFF adds enrichment (either inline in `/api/live/games` or a separate route) that fetches league names from OpenDota `/leagues/{id}`, cached 6h server-side by `league_id`.
- **D-07:** Matches grouped by tournament using accordion sections. All sections expanded by default on load.
- **D-08:** If a league name lookup fails or returns null, fall back to "League #<league_id>" as the display label.
- **D-09:** TanStack Query's `refetchInterval: 30000` handles auto-refresh silently — no spinner, no row flash.
- **D-10:** A small last-updated timestamp (e.g. "Updated 2:41 PM") shown in the page header, updates after each successful fetch. Format: time only (no date).
- **D-11:** Clicking a match row navigates to `/match/:matchId` using React Router v7 `<Link>` or `useNavigate`.
- **D-12:** The `/match/:matchId` placeholder page displays the raw JSON payload for that match (looked up from the cached `/api/live/games` response). Useful for Phase 3 development. Label it clearly as a dev placeholder.

### Claude's Discretion

- Exact visual styling of the status tag (color, badge shape) — stay consistent with the dark theme.
- Loading skeleton or spinner while initial data loads.
- Whether league name enrichment happens in the existing `/api/live/games` route (response shape extended) or a separate `/api/leagues/:id` BFF route.
- Error state when the Valve API is unreachable.
- Accordion open/close state management approach (local useState or URL-based).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOME-01 | User can see a list of all currently-live pro tournament matches with team names, series score (e.g. 1-0 Bo3), and match status tag (Live / Draft / Post-game) | LiveGameSchema already exposes `radiant_team.team_name`, `dire_team.team_name`, `game_state`, `series_type`, `radiant_series_wins`, `dire_series_wins`. Row layout and format specified in D-01–D-04 and UI-SPEC. |
| HOME-02 | User can see a list of active tournaments and browse their matches | `league_id` in LiveGameSchema used as group key; league name fetched from OpenDota `/leagues/{id}` and cached 6h. Accordion component per D-07. |
| HOME-03 | Home page auto-refreshes every 30 seconds without user action | `refetchInterval: 30000` in TanStack Query v5 `useQuery` call — verified correct signature below. No spinner on refetch per D-09. |
</phase_requirements>

---

## Summary

Phase 2 builds on the complete Phase 1 pipeline. The BFF already exposes `GET /api/live/games` returning parsed, cached Valve data. This phase wires up the React client: sets up `QueryClientProvider` + React Router v7 declarative routing in `main.tsx`, creates a home page that polls the BFF every 30 seconds, enriches match data with league names from OpenDota, and groups results in accordion sections.

The key research finding is the **TanStack Query v5 breaking change to `refetchInterval`**: the callback signature changed from `(data, query) => number | false` to `(query) => number | false`. Additionally, `onSuccess` was removed in v5 — the correct pattern for tracking the last-fetch timestamp is the `dataUpdatedAt` property on the query result (a millisecond epoch timestamp updated automatically on each successful fetch).

The league name enrichment decision is the main architectural choice left to Claude's discretion. Inline enrichment (extending `/api/live/games` response) minimizes client round-trips and is simpler. A separate `/api/leagues/:id` route is more composable but adds complexity. Given the 6h TTL and small user base, **inline enrichment is recommended**.

**Primary recommendation:** Extend the existing `/api/live/games` route to return `league_name` alongside `league_id`. Keep all client polling through a single `useQuery` call. Set up `BrowserRouter` + `Routes` in `main.tsx`, wrapping inside `QueryClientProvider`. Use `dataUpdatedAt` (formatted with `date-fns format()`) to drive the last-updated timestamp display.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch live matches from Valve | API / Backend | — | Already implemented: `getLiveLeagueGames()` + `cached()` in server. Client never calls Valve directly. |
| Enrich league names from OpenDota | API / Backend | — | OpenDota is an upstream service; enrichment belongs at the BFF layer so it is cached and shared across all clients. |
| Group matches by league | Browser / Client | — | Pure data transform on already-enriched response — no upstream involved. `useMemo` in the home page component. |
| Auto-refresh polling | Browser / Client | — | TanStack Query `refetchInterval` drives client-side polling. Backend just serves cached data. |
| Client routing | Browser / Client | — | React Router v7 declarative mode handles `/` and `/match/:matchId`. |
| Match detail placeholder | Browser / Client | — | Looks up match from cached query data by `match_id`; renders raw JSON. No new BFF route. |

---

## Standard Stack

### Core (already installed — no new packages needed)

| Library | Installed Version | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| `@tanstack/react-query` | 5.99.2 [VERIFIED: npm list] | Server state + polling | Purpose-built `refetchInterval`, request deduplication, stale-while-revalidate |
| `react-router` | 7.14.2 [VERIFIED: npm list] | Client routing | Declarative mode: `BrowserRouter` + `Routes` + `Route` |
| `clsx` | ^2.0.0 [VERIFIED: package.json] | Conditional classNames | Essential for status tag color switching |
| `date-fns` | ^4.0.0 [VERIFIED: package.json] | Format timestamps | `format(new Date(dataUpdatedAt), 'h:mm a')` for "Updated 2:41 PM" |
| `zod` | ^3.0.0 [VERIFIED: package.json] | Schema validation | OpenDota league response parsed through new `LeagueSchema` |

### No New Packages Required

All libraries needed for Phase 2 are installed. The phase adds no new npm dependencies.

**Version verification:**
- `@tanstack/react-query`: 5.99.2 (latest as of research date: 5.99.2) [VERIFIED: `npm view` + `npm list`]
- `react-router`: 7.14.2 (latest as of research date: 7.14.2) [VERIFIED: `npm view` + `npm list`]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (React)                BFF (Hono)                    Upstream
─────────────────              ────────────────              ────────────
main.tsx                       
  └─ QueryClientProvider
     └─ BrowserRouter
        ├─ / → <HomePage>
        │    useQuery({         GET /api/live/games ──────→ cached('live_games', 30s)
        │      queryKey,        ←─ LiveGame[] + league_name   └─ Valve GetLiveLeagueGames
        │      queryFn,                                        └─ OpenDota /leagues/{id}
        │      refetchInterval: 30000                             cached('league:{id}', 6h)
        │    })
        │    dataUpdatedAt → "Updated 2:41 PM"
        │    group by league_name
        │    render <LeagueAccordion>
        │      └─ <MatchRow> → <Link to="/match/:matchId">
        │
        └─ /match/:matchId → <MatchPlaceholder>
             useParams() → matchId
             find match in query cache
             render raw JSON
```

### Recommended Project Structure

New files to create (additions to existing structure):

```
client/src/
├── main.tsx               MODIFY — add QueryClientProvider + BrowserRouter
├── App.tsx                MODIFY — replace placeholder with <Routes>
├── hooks/
│   └── useLiveGames.ts    NEW — useQuery wrapper for GET /api/live/games
├── pages/
│   ├── HomePage.tsx        NEW — home page, accordion grouping
│   └── MatchPlaceholder.tsx NEW — raw JSON dev placeholder
└── components/
    ├── StatusTag.tsx       NEW — colored pill badge (Draft/Live/Post-game)
    ├── MatchRow.tsx        NEW — single match table row
    ├── LeagueAccordion.tsx NEW — collapsible section per tournament
    ├── SkeletonRow.tsx     NEW — loading placeholder row
    └── ErrorBanner.tsx     NEW — full-width error bar

server/src/
├── routes/
│   └── live.ts            MODIFY — inline league name enrichment
├── services/
│   └── openDotaApi.ts     NEW — fetchLeagueName() + cached wrapper
└── schemas/
    └── openDota.ts        NEW — LeagueSchema (leagueid, name, tier)
```

### Pattern 1: TanStack Query v5 `refetchInterval` (VERIFIED)

**Critical breaking change from v4:** The callback now receives only `query`, not `(data, query)`.

```typescript
// Source: https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5
// Source: https://tanstack.com/query/v5/docs/framework/react/guides/polling

// v4 (WRONG in v5 — second parameter removed):
// refetchInterval: (data, query) => 30_000

// v5 CORRECT — data accessed via query.state.data:
const { data, dataUpdatedAt, isLoading, isError } = useQuery({
  queryKey: ['live-games'],
  queryFn: () => fetch('/api/live/games').then(r => r.json()),
  refetchInterval: 30_000,           // simple number for fixed interval
  // OR dynamic (for Phase 4 draft polling):
  // refetchInterval: (query) => {
  //   const gameState = query.state.data?.games?.[0]?.game_state
  //   if (gameState === 2) return 5_000
  //   if (gameState === 6) return false
  //   return 30_000
  // },
})
```

For Phase 2, `refetchInterval: 30_000` (a plain number) is correct. Dynamic intervals are Phase 4 scope.

### Pattern 2: Last-Updated Timestamp via `dataUpdatedAt` (VERIFIED)

`onSuccess` was removed in TanStack Query v5. The correct replacement for tracking last-fetch time is `dataUpdatedAt` — a built-in property of the query result, typed as `number` (milliseconds epoch).

```typescript
// Source: https://tanstack.com/query/v5/docs/framework/react/reference/useQuery
// Source: https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5

import { format } from 'date-fns'

const { data, dataUpdatedAt } = useQuery({ ... })

// dataUpdatedAt is 0 until first successful fetch, then millisecond timestamp
const lastUpdated = dataUpdatedAt > 0
  ? `Updated ${format(new Date(dataUpdatedAt), 'h:mm a')}`
  : null
```

No `useEffect` needed. `dataUpdatedAt` is reactively updated by TanStack Query on each successful fetch.

### Pattern 3: React Router v7 Declarative Mode (VERIFIED)

Phase 2 uses library/declarative mode (not the framework/data router). The installed package `react-router` 7.14.2 supports this.

```typescript
// Source: https://reactrouter.com/start/library/installation
// Source: https://reactrouter.com/start/library/routing

// client/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)

// client/src/App.tsx
import { Routes, Route } from 'react-router'
import HomePage from './pages/HomePage'
import MatchPlaceholder from './pages/MatchPlaceholder'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/match/:matchId" element={<MatchPlaceholder />} />
    </Routes>
  )
}

// client/src/pages/MatchPlaceholder.tsx
import { useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'

export default function MatchPlaceholder() {
  const { matchId } = useParams()
  const queryClient = useQueryClient()
  const games = queryClient.getQueryData<LiveGamesResponse>(['live-games'])
  const match = games?.games?.find(g => String(g.match_id) === matchId)
  // render JSON.stringify(match, null, 2) in <pre>
}
```

`QueryClientProvider` wraps `BrowserRouter` (outer-to-inner order does not matter for correctness, but QueryClientProvider outer allows router-level data prefetching patterns in future phases).

### Pattern 4: League Name Enrichment — Inline in `/api/live/games` (RECOMMENDED)

Two viable approaches exist. Inline enrichment is recommended for Phase 2:

**Option A — Inline enrichment (RECOMMENDED):** Extend the existing `GET /api/live/games` response to include `league_name` per game.

```typescript
// server/src/routes/live.ts
liveRoutes.get('/games', async (c) => {
  const data = await getLiveLeagueGames()
  const games = data.result.games

  // Collect unique league IDs, fetch names concurrently
  const leagueIds = [...new Set(games.map(g => g.league_id))]
  const nameMap = Object.fromEntries(
    await Promise.all(
      leagueIds.map(async (id) => [id, await getLeagueName(id)])
    )
  )

  const enriched = games.map(g => ({
    ...g,
    league_name: nameMap[g.league_id] ?? `League #${g.league_id}`,
  }))

  return c.json({ games: enriched })
})
```

**Option B — Separate `/api/leagues/:id` route:** Client fetches league names individually. More round-trips, more complex client logic, but more reusable. Overkill for Phase 2.

**Rationale for Option A:** Single client `useQuery` call. League names cached server-side at 6h — even if 10 leagues are active, that's 10 Redis lookups at most (cached hits after first call). OpenDota `/leagues/{id}` rate limit is 60 req/min which is not a concern at this scale.

### Pattern 5: OpenDota League Name Service

```typescript
// server/src/services/openDotaApi.ts
import { cached, TTL } from '../cache.js'
import { z } from 'zod'

const OPENDOTA_BASE = 'https://api.opendota.com/api'

const LeagueSchema = z.object({
  leagueid: z.number().optional(),
  name: z.string().nullable().optional(),
  tier: z.string().optional(),
}).passthrough()

async function fetchLeagueName(leagueId: number): Promise<string | null> {
  const res = await fetch(`${OPENDOTA_BASE}/leagues/${leagueId}`)
  if (!res.ok) return null
  const raw: unknown = await res.json()
  const parsed = LeagueSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data.name ?? null
}

export function getLeagueName(leagueId: number): Promise<string | null> {
  return cached(`league:${leagueId}`, TTL.HERO_STATS, () => fetchLeagueName(leagueId))
}
// TTL.HERO_STATS = 21_600 seconds = 6 hours — exact match for D-06/D-08 requirement
```

### Pattern 6: BFF Response Schema Extension

The existing `LiveGameSchema` uses `.passthrough()` — adding `league_name` to the route response does not require schema modification. However, a new response envelope schema should wrap the enriched array:

```typescript
// server/src/schemas/bff.ts (new file)
import { z } from 'zod'
import { LiveGameSchema } from './valve.js'

export const EnrichedLiveGameSchema = LiveGameSchema.extend({
  league_name: z.string(),
})

export const LiveGamesResponseSchema = z.object({
  games: z.array(EnrichedLiveGameSchema),
})

export type EnrichedLiveGame = z.infer<typeof EnrichedLiveGameSchema>
export type LiveGamesResponse = z.infer<typeof LiveGamesResponseSchema>
```

### Pattern 7: Client Data Transform — Grouping

```typescript
// client/src/hooks/useLiveGames.ts
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { EnrichedLiveGame } from '@shared/bff'  // or inline type

export function useLiveGames() {
  const query = useQuery({
    queryKey: ['live-games'],
    queryFn: async () => {
      const res = await fetch('/api/live/games')
      if (!res.ok) throw new Error(`BFF error: ${res.status}`)
      return res.json() as Promise<LiveGamesResponse>
    },
    refetchInterval: 30_000,
    staleTime: 25_000,    // consider data fresh for 25s to avoid redundant renders
  })

  const grouped = useMemo(() => {
    if (!query.data?.games) return []
    const map = new Map<string, { leagueName: string; matches: EnrichedLiveGame[] }>()
    for (const game of query.data.games) {
      const key = String(game.league_id)
      if (!map.has(key)) map.set(key, { leagueName: game.league_name, matches: [] })
      map.get(key)!.matches.push(game)
    }
    return Array.from(map.values())
  }, [query.data])

  return { ...query, grouped }
}
```

### Anti-Patterns to Avoid

- **Calling OpenDota from the client directly:** OpenDota has no CORS headers for browser requests; all upstream calls must go through the BFF. [ASSUMED — OpenDota CORS policy not verified by direct request but consistent with CLAUDE.md BFF-proxy mandate]
- **Using `onSuccess` in `useQuery`:** Removed in v5. Use `dataUpdatedAt` for timestamp tracking, `useEffect` watching query state for other side effects.
- **Using `(data, query) =>` signature for `refetchInterval`:** v4 only. v5 is `(query) => ...`; data is at `query.state.data`.
- **Calling `getLiveLeagueGames()` without `cached()`:** CLAUDE.md mandates cached() is the only upstream path. Direct calls bypass the 30s TTL and expose the API key.
- **Fetching league names per-render:** Fetch once inside the BFF route response, not on every client render or accordion open.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling with retry | Custom `setInterval` + error catch | `useQuery({ refetchInterval })` | Handles visibility, blur, reconnect, deduplication automatically |
| Duration formatting | Manual pad/floor math | `Math.floor(s/60)` + `String(s%60).padStart(2,'0')` | Simple enough to do inline — but verify edge case: `duration` is absent in lobby/draft pre-lock state (D-04) |
| Timestamp formatting | `new Date().toLocaleTimeString()` | `date-fns format(new Date(dataUpdatedAt), 'h:mm a')` | Consistent format, tree-shakeable, already installed |
| Conditional class names | String concatenation | `clsx(...)` | Already installed, handles undefined/false gracefully |
| React context for query data | Zustand or context | `useQueryClient().getQueryData(...)` | Match placeholder can read from TanStack Query cache directly — no extra store needed |

**Key insight:** TanStack Query already handles the hard parts of polling (deduplication, background refetch, stale-while-revalidate, error states, window focus refetch). Custom polling code would re-implement these incorrectly within hours.

---

## Common Pitfalls

### Pitfall 1: `refetchInterval` Callback Signature Mismatch (v4 → v5)

**What goes wrong:** `refetchInterval: (data, query) => ...` is silently ignored in v5 because TypeScript will infer the first arg as `Query` (the query object), not data — the data variable will always be the Query instance, causing the condition to always return the same value or throw.

**Why it happens:** TanStack Query v5 removed the `data` parameter from this callback to avoid confusion when `select` transforms are applied.

**How to avoid:** Always use `(query) => query.state.data?....` in v5. For Phase 2 the static `refetchInterval: 30_000` avoids this entirely.

**Warning signs:** Polling interval never changes despite game_state changing; TypeScript type error if `@types` are up to date.

[VERIFIED: https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5]

### Pitfall 2: Using `onSuccess` to Track Last-Updated Time

**What goes wrong:** `onSuccess` does not exist in TanStack Query v5. Calling it as an option is silently ignored (TypeScript error in strict mode). The timestamp never updates.

**Why it happens:** `onSuccess` was removed across query hooks in v5 (it still exists for `useMutation`).

**How to avoid:** Use `dataUpdatedAt` from the `useQuery` return value directly. It is `0` before the first fetch, then a millisecond epoch updated after each successful fetch.

**Warning signs:** Last-updated label never changes; TypeScript error `Object literal may only specify known properties`.

[VERIFIED: https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5]

### Pitfall 3: `duration` Absent During Draft State

**What goes wrong:** `duration` field is absent (not `0`) when a match is in draft phase (`game_state === 2`). Rendering `MM:SS` of `undefined` produces "NaN:NaN".

**Why it happens:** Valve only starts the duration clock after draft completes.

**How to avoid:** D-04 mandates hiding duration when absent. Guard: `{game.duration !== undefined && <span>...</span>}`. Check `!== undefined`, not falsy, because `0` is a valid duration at game start.

**Warning signs:** "NaN:NaN" appearing in match rows during draft phase.

[VERIFIED: server/src/schemas/valve.ts — `duration: z.number().optional()`]

### Pitfall 4: `team_name` Absent During Lobby/Pre-lock

**What goes wrong:** `radiant_team.team_name` and `dire_team.team_name` are optional strings; both `radiant_team` and `dire_team` are themselves optional objects (absent during lobby).

**Why it happens:** Valve doesn't populate team data until teams are locked in.

**How to avoid:** Fallback: `game.radiant_team?.team_name ?? 'TBD'` and same for dire. The `vs` separator still renders; rows do not crash.

**Warning signs:** Runtime TypeError "Cannot read properties of undefined".

[VERIFIED: server/src/schemas/valve.ts — `radiant_team: TeamSchema.optional()`]

### Pitfall 5: OpenDota `/leagues/{id}` May Return 404 or Empty `name`

**What goes wrong:** Some league IDs active in Valve's system may not exist in OpenDota's database, or `name` may be `null`. Passing this directly to the UI renders "null" or crashes.

**Why it happens:** OpenDota's league coverage lags Valve's — new or minor leagues may be absent.

**How to avoid:** D-08 mandates fallback to "League #<league_id>". The `fetchLeagueName` service returns `null` on any error or missing name, and the route-level enrichment applies the fallback string before sending to the client. The client never receives `null` for `league_name`.

**Warning signs:** "League #null" or "undefined" in accordion headers.

### Pitfall 6: React Router v7 Declarative vs Data/Framework Mode Confusion

**What goes wrong:** Documentation for React Router v7 covers three modes (Declarative, Data, Framework). The `createBrowserRouter` + `RouterProvider` pattern is the Data mode — it has a different import structure and enables loaders/actions. Mixing modes causes runtime errors or missing context.

**Why it happens:** React Router v7 marketing emphasizes the Framework/Data mode; Declarative (library) mode docs are secondary.

**How to avoid:** For Phase 2, use `<BrowserRouter>` + `<Routes>` + `<Route>` from `react-router`. Do NOT use `createBrowserRouter` unless Phase 3+ requires loader-based data fetching.

[VERIFIED: https://reactrouter.com/start/library/installation]

### Pitfall 7: Accordion State Losing Context on Refetch

**What goes wrong:** If accordion open/close state is derived from query data structure, a refetch that changes the league list (new league appears or disappears) can reset all accordions to defaults.

**Why it happens:** Keyed state inside a `.map()` render loses position when array order changes.

**How to avoid:** Accordion state is local `useState` keyed by `league_id` (stable), not by array index. `useState<Record<number, boolean>>({})` with default `true` for any unseen key.

---

## Code Examples

### Full `useLiveGames` Hook

```typescript
// client/src/hooks/useLiveGames.ts
// Source: verified TanStack Query v5 docs + installed version 5.99.2

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { format } from 'date-fns'

interface EnrichedGame {
  match_id: number
  league_id: number
  league_name: string
  game_state?: number
  duration?: number
  series_type?: number
  radiant_series_wins?: number
  dire_series_wins?: number
  radiant_team?: { team_name?: string }
  dire_team?: { team_name?: string }
}

interface LiveGamesResponse {
  games: EnrichedGame[]
}

async function fetchLiveGames(): Promise<LiveGamesResponse> {
  const res = await fetch('/api/live/games')
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json()
}

export function useLiveGames() {
  const query = useQuery<LiveGamesResponse>({
    queryKey: ['live-games'],
    queryFn: fetchLiveGames,
    refetchInterval: 30_000,   // v5: plain number, not callback — Phase 4 upgrades to dynamic
    staleTime: 25_000,
  })

  // dataUpdatedAt: 0 before first fetch, millisecond epoch after each success
  const lastUpdatedLabel = query.dataUpdatedAt > 0
    ? `Updated ${format(new Date(query.dataUpdatedAt), 'h:mm a')}`
    : null

  const grouped = useMemo(() => {
    if (!query.data?.games) return []
    const map = new Map<number, { leagueName: string; matches: EnrichedGame[] }>()
    for (const game of query.data.games) {
      if (!map.has(game.league_id)) {
        map.set(game.league_id, { leagueName: game.league_name, matches: [] })
      }
      map.get(game.league_id)!.matches.push(game)
    }
    return Array.from(map.values())
  }, [query.data])

  return { ...query, grouped, lastUpdatedLabel }
}
```

### Duration Formatter (Inline Utility)

```typescript
// client/src/utils/formatDuration.ts
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
// Guard at call site: {game.duration !== undefined && formatDuration(game.duration)}
```

### Status Tag Label Map

```typescript
// client/src/utils/gameState.ts
export function getStatusLabel(gameState: number | undefined): 'Draft' | 'Live' | 'Post-game' | 'Unknown' {
  if (gameState === 2) return 'Draft'
  if (gameState === 5) return 'Live'
  if (gameState === 6) return 'Post-game'
  return 'Unknown'
}

export function getSeriesLabel(seriesType: number | undefined): string {
  if (seriesType === 0) return 'Bo1'
  if (seriesType === 1) return 'Bo3'
  if (seriesType === 2) return 'Bo5'
  return ''
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `refetchInterval: (data, query) =>` | `refetchInterval: (query) =>` | TanStack Query v5 (Oct 2023) | data arg removed; access via `query.state.data` |
| `onSuccess` callback in `useQuery` | `dataUpdatedAt` property + `useEffect` | TanStack Query v5 (Oct 2023) | Side effects require explicit `useEffect` watching query state |
| React Router `<BrowserRouter>` as primary | Data mode `createBrowserRouter` as primary | React Router v6.4+ / v7 | Declarative mode still fully supported and correct for SPAs without loaders |
| OpenDota API: unauthenticated unlimited | Rate limited: 60 req/min, 50k/month free | 2018 | Server-side caching mandatory; 6h TTL covers this at any realistic scale |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenDota `/leagues/{id}` does not send CORS headers permitting browser requests — all calls must go through BFF | Don't Hand-Roll, Pitfall 5 | Low: CLAUDE.md already mandates BFF proxy for all upstream calls; this is belt-and-suspenders reasoning |
| A2 | OpenDota `name` field is present and non-null for major active tournaments | Pattern 5 | Low: D-08 mandates "League #id" fallback when null; code already handles this |
| A3 | The existing Vite proxy (`/api` → `http://localhost:3001`) covers the extended `/api/live/games` response without config changes | Architecture Patterns | Low: proxy is path-prefix based, not schema-based; any `/api/*` response passes through |

**Verified claims (no assumptions):**
- TanStack Query v5 `refetchInterval` callback signature [VERIFIED: official migration docs]
- `dataUpdatedAt` as replacement for `onSuccess` timestamp tracking [VERIFIED: official useQuery reference]
- `onSuccess` removed from `useQuery` in v5 [VERIFIED: official migration docs]
- React Router v7 declarative mode: `BrowserRouter` + `Routes` + `Route` + `useParams` [VERIFIED: official library docs]
- Installed package versions 5.99.2 (TanStack) and 7.14.2 (React Router) [VERIFIED: npm list]
- OpenDota league response fields: `leagueid`, `name`, `tier` [CITED: go-opendota pkg.go.dev, Go struct matches observed API shape]

---

## Open Questions

1. **League name enrichment: inline vs separate route**
   - What we know: Both approaches work. Inline is simpler and the only client query call.
   - What's unclear: User left this to Claude's discretion (CONTEXT.md).
   - Recommendation: Use inline enrichment. A separate route adds a second query key, second loading state, and join logic on the client — none of which adds value for Phase 2.

2. **Match detail placeholder: re-use query cache or separate fetch**
   - What we know: `useQueryClient().getQueryData(['live-games'])` retrieves the cached data client-side without a new request. The match_id URL param identifies the specific match.
   - What's unclear: N/A — this is the correct pattern per D-12.
   - Recommendation: Use `getQueryData` — no new BFF endpoint needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | BFF runtime | Yes | v25.9.0 | — |
| `@tanstack/react-query` | Client polling | Yes | 5.99.2 | — |
| `react-router` | Client routing | Yes | 7.14.2 | — |
| `clsx`, `date-fns` | UI utilities | Yes (package.json) | ^2.0.0, ^4.0.0 | — |
| OpenDota API | League name enrichment | Assumed reachable | — | "League #id" fallback (D-08) |
| Upstash Redis | 6h league name caching | Reachable (Phase 1 verified) | — | `cached()` degrades gracefully without Redis |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- OpenDota API: 6h server-side cache means even transient unavailability only affects first lookup; fallback label ensures no UI crash.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^2.0.0 (installed in both client and server) |
| Config file | none — uses package.json `"test": "vitest"` script |
| Quick run command | `cd client && npm test -- --run` |
| Full suite command | `cd shared && npm test -- --run && cd ../client && npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOME-01 | `getStatusLabel` returns correct label for game_state 2/5/6/other | unit | `cd client && npm test -- --run src/utils/gameState.test.ts` | ❌ Wave 0 |
| HOME-01 | `getSeriesLabel` returns "Bo1"/"Bo3"/"Bo5" for series_type 0/1/2 | unit | `cd client && npm test -- --run src/utils/gameState.test.ts` | ❌ Wave 0 |
| HOME-01 | `formatDuration` renders "MM:SS" correctly including zero-pad | unit | `cd client && npm test -- --run src/utils/formatDuration.test.ts` | ❌ Wave 0 |
| HOME-02 | `useLiveGames` grouped output correct for multi-league fixture | unit | `cd client && npm test -- --run src/hooks/useLiveGames.test.ts` | ❌ Wave 0 |
| HOME-03 | BFF `/api/live/games` returns enriched response with `league_name` field | integration (manual) | `curl http://localhost:3001/api/live/games` | — manual-only |
| HOME-03 | `refetchInterval: 30_000` wired (visual verification) | smoke | Launch app, observe network tab for 30s refetch | — manual-only |

**Manual-only justification for HOME-03 BFF integration:** Integration test would require live Valve API key and Redis; smoke test suffices for this phase. Visual verification in browser is reliable for polling behavior.

### Sampling Rate

- **Per task commit:** `cd client && npm test -- --run`
- **Per wave merge:** `cd shared && npm test -- --run && cd client && npm test -- --run`
- **Phase gate:** Full client + shared suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `client/src/utils/gameState.test.ts` — covers HOME-01 status/series labels
- [ ] `client/src/utils/formatDuration.test.ts` — covers HOME-01 duration format
- [ ] `client/src/hooks/useLiveGames.test.ts` — covers HOME-02 grouping logic (mock fetch)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in Phase 2 |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | Public read-only page |
| V5 Input Validation | Yes | zod `LeagueSchema.safeParse()` on OpenDota response; `EnrichedLiveGameSchema` on BFF output |
| V6 Cryptography | No | No crypto operations |

### Known Threat Patterns for Phase 2 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| OpenDota returns malformed/injected JSON | Tampering | `LeagueSchema.safeParse()` — invalid shape returns `null`, fallback label used |
| League name contains script tags | Tampering | React JSX renders strings as text nodes, not innerHTML — XSS not applicable |
| BFF leaks Valve API key in error logs | Information Disclosure | Per T-04-04 in `valveApi.ts` — log `status/statusText` only, never full URL |
| Infinite polling on post-game match | DoS (self-inflicted) | Phase 2 uses static `refetchInterval: 30_000`; dynamic stop-on-post-game is Phase 4 |

---

## Sources

### Primary (HIGH confidence)

- TanStack Query v5 migration guide — `refetchInterval` v4→v5 signature change, `onSuccess` removal, `dataUpdatedAt` as replacement
  https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5
- TanStack Query v5 `useQuery` reference — `dataUpdatedAt`, `isFetching`, return type
  https://tanstack.com/query/v5/docs/framework/react/reference/useQuery
- TanStack Query v5 polling guide — `refetchInterval` function form receiving `query`
  https://tanstack.com/query/v5/docs/framework/react/guides/polling
- React Router v7 library mode installation — `BrowserRouter` declarative mode confirmation
  https://reactrouter.com/start/library/installation
- React Router v7 routing guide — `Routes`, `Route`, `useParams` code examples
  https://reactrouter.com/start/library/routing
- Installed package inspection (npm list): `@tanstack/react-query@5.99.2`, `react-router@7.14.2`

### Secondary (MEDIUM confidence)

- OpenDota league response fields (`leagueid`, `name`, `tier`, `ticket`, `banner`) — go-opendota package docs cross-referenced with search results
  https://pkg.go.dev/github.com/jasonodonnell/go-opendota
- OpenDota rate limits: 60 req/min, 50k/month free tier — from OpenDota blog and pyopendota docs
  https://blog.opendota.com/2018/04/17/changes-to-the-api/

### Tertiary (LOW confidence)

- OpenDota CORS policy for browser requests — not directly verified; assumed server-side proxy required per CLAUDE.md mandate and common API practice [A1]

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions verified via `npm list` and `npm view`
- TanStack Query v5 API: HIGH — verified via official migration and reference docs
- React Router v7 declarative mode: HIGH — verified via official library docs
- OpenDota league response shape: MEDIUM — cross-referenced via Go package docs, not direct API call (403 on direct fetch)
- Architecture patterns: HIGH — derived from verified APIs + existing codebase inspection

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (TanStack Query v5 and React Router v7 are stable; OpenDota API schema is slow-moving)
