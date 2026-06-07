# Phase 5: Hero & Player Intel - Pattern Map

**Mapped:** 2026-04-25
**Files analyzed:** 14 (8 new, 6 modified)
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/schemas/openDota.ts` (MODIFY) | schema | transform | `server/src/schemas/openDota.ts` (LeagueSchema) | exact |
| `server/src/services/openDotaApi.ts` (MODIFY) | service | request-response | `server/src/services/openDotaApi.ts` (getLeagueName) | exact |
| `server/src/routes/live.ts` (MODIFY) | route/controller | request-response | `server/src/routes/live.ts` (/draft/:matchId) | exact |
| `client/src/hooks/useHeroStats.ts` (NEW) | hook | request-response | `client/src/hooks/useLiveGames.ts` (useLiveGames) | role-match |
| `client/src/hooks/useMatchIntel.ts` (NEW) | hook | request-response | `client/src/hooks/useDraftDetail.ts` (useDraftDetail) | exact |
| `client/src/components/IntelTooltip.tsx` (NEW) | component | event-driven | `client/src/components/DraftPortrait.tsx` | role-match |
| `client/src/components/DraftPortrait.tsx` (MODIFY) | component | event-driven | `client/src/components/DraftPortrait.tsx` | exact |
| `client/src/components/DraftTimeline.tsx` (MODIFY) | component | transform | `client/src/components/DraftTimeline.tsx` | exact |
| `client/src/components/DraftColumn.tsx` (MODIFY) | component | transform | `client/src/components/DraftColumn.tsx` | exact |
| `client/src/pages/MatchPage.tsx` (MODIFY) | page/container | request-response | `client/src/pages/MatchPage.tsx` | exact |
| `client/src/utils/winrateColor.ts` (NEW) | utility | transform | `client/src/utils/heroMapper.ts` | role-match |
| `client/src/utils/winrateColor.test.ts` (NEW) | test | — | `client/src/hooks/useDraftDetail.test.ts` | exact |
| `server/src/services/intel.test.ts` (NEW) | test | — | `client/src/hooks/useDraftDetail.test.ts` | role-match |
| `client/src/hooks/useMatchIntel.test.ts` (NEW) | test | — | `client/src/hooks/useDraftDetail.test.ts` | exact |

---

## Pattern Assignments

### `server/src/schemas/openDota.ts` (MODIFY — schema, transform)

**Analog:** `server/src/schemas/openDota.ts` (existing LeagueSchema)

**Existing schema pattern** (lines 1–11 — the whole file):
```typescript
import { z } from 'zod'

// CRITICAL: .passthrough() — OpenDota adds fields without notice.
// CRITICAL: all fields .optional() — avoid hard failures on partial responses.
export const LeagueSchema = z.object({
  leagueid: z.number().optional(),
  name: z.string().nullable().optional(),
  tier: z.string().optional(),
}).passthrough()

export type League = z.infer<typeof LeagueSchema>
```

**Three new schemas to add (copy structure exactly):**
```typescript
export const HeroStatsSchema = z.object({
  id: z.number().optional(),          // heroStats uses 'id', not 'hero_id'
  hero_id: z.number().optional(),     // defensive: accept either field name
  pro_win: z.number().optional(),
  pro_pick: z.number().optional(),
  pro_ban: z.number().optional(),
  localized_name: z.string().optional(),
}).passthrough()

export const PlayerHeroSchema = z.object({
  hero_id: z.union([z.string(), z.number()]).optional(), // SDK shows string; API may return number
  games: z.number().optional(),
  win: z.number().optional(),
  last_played: z.number().optional(),
}).passthrough()

export const HeroMatchupSchema = z.object({
  hero_id: z.number().optional(),     // counter hero ID
  hero_id2: z.number().optional(),    // defensive: accept older field name
  games_played: z.number().optional(),
  wins: z.number().optional(),
}).passthrough()

export type HeroStats = z.infer<typeof HeroStatsSchema>
export type PlayerHero = z.infer<typeof PlayerHeroSchema>
export type HeroMatchup = z.infer<typeof HeroMatchupSchema>
```

**Rules:** Every field `.optional()`. Always `.passthrough()`. Both `id` and `hero_id` fields on HeroStatsSchema (pitfall A1). `z.union([z.string(), z.number()])` on PlayerHeroSchema.hero_id (pitfall A2).

---

### `server/src/services/openDotaApi.ts` (MODIFY — service, request-response)

**Analog:** `server/src/services/openDotaApi.ts` (existing `getLeagueName` / `fetchLeagueName`)

**Core service pattern** (lines 1–41, full file):
```typescript
import { cached, TTL } from '../cache.js'
import { LeagueSchema } from '../schemas/openDota.js'

const OPENDOTA_BASE = 'https://api.opendota.com/api'

async function fetchLeagueName(leagueId: number): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(`${OPENDOTA_BASE}/leagues/${leagueId}`)
  } catch (err) {
    console.error(`[openDotaApi] Network error fetching league ${leagueId}:`, (err as Error).message)
    return null
  }
  if (!res.ok) {
    console.error(`[openDotaApi] League fetch error: ${res.status} ${res.statusText}`)
    return null
  }
  const raw: unknown = await res.json()
  const parsed = LeagueSchema.safeParse(raw)
  if (!parsed.success) {
    console.error(`[openDotaApi] LeagueSchema parse failure for league ${leagueId}`)
    return null
  }
  return parsed.data.name ?? null
}

export function getLeagueName(leagueId: number): Promise<string | null> {
  return cached(`league:${leagueId}`, TTL.HERO_STATS, () => fetchLeagueName(leagueId))
}
```

**Three new service functions follow the same pattern:**

```typescript
// getHeroStats — cache key 'hero:stats', TTL.HERO_STATS (6h)
// fetchHeroStats returns HeroStatsMap | null
// CRITICAL: server-side transform array → map keyed by hero id; guard pro_pick > 0

// getPlayerHeroes(accountId) — cache key `player:heroes:${accountId}`, TTL.PLAYER_STATS (15min)
// fetchPlayerHeroes returns PlayerHero[] | null

// getHeroMatchups(heroId) — cache key `hero:matchups:${heroId}`, TTL.HERO_STATS (6h)
// fetchHeroMatchups returns HeroMatchup[] | null
```

**SECURITY pattern from existing service** (lines 17–18):
```typescript
// Log status/statusText only — NEVER the full URL (may contain API key)
console.error(`[openDotaApi] League fetch error: ${res.status} ${res.statusText}`)
```

**Error handling rule:** All `fetch*` functions: `try/catch` → `return null`. All `.safeParse()` failures → `return null`. Never throw. The BFF route `catch` handles null → 502.

**Cache key convention (D-13):**
- `hero:stats` — singleton, TTL.HERO_STATS
- `hero:matchups:{heroId}` — per hero, TTL.HERO_STATS
- `player:heroes:{accountId}` — per player, TTL.PLAYER_STATS

---

### `server/src/routes/live.ts` (MODIFY — route/controller, request-response)

**Analog:** `server/src/routes/live.ts` (existing `/draft/:matchId` route)

**Input validation pattern** (lines 66–71):
```typescript
liveRoutes.get('/draft/:matchId', async (c) => {
  const rawMatchId = c.req.param('matchId')
  const parsedId = Number(rawMatchId)
  if (!Number.isFinite(parsedId)) {
    return c.json({ error: 'Invalid matchId' }, 400)
  }
  // ...
})
```

**Error handling pattern** (lines 83–88):
```typescript
  try {
    const data = await getLiveLeagueGamesFast()
    const game = data.result.games?.find((g) => g.match_id === parsedId)
    if (!game) {
      return c.json({ error: 'Match not live' }, 404)
    }
    return c.json({ match_id: game.match_id, game_state: game.game_state, scoreboard: game.scoreboard })
  } catch {
    return c.json({ error: 'Upstream error' }, 502)
  }
```

**Promise.all de-dup pattern** (lines 27–37 of `/games` route):
```typescript
const uniqueLeagueIds = [...new Set(games.map((g) => g.league_id))]
const nameEntries = await Promise.all(
  uniqueLeagueIds.map(async (id) => {
    const name = await getLeagueName(id)
    return [id, name ?? `League #${id}`] as const
  }),
)
const nameMap = Object.fromEntries(nameEntries)
```

**Two new routes to add:**

`GET /api/heroes/stats` — no path param, calls `getHeroStats()`, returns the map directly, wraps in `try/catch → 502`.

`GET /api/live/intel/:matchId` — copy the `matchId` validation block from `/draft/:matchId` verbatim, then:
1. Read live game from existing cache via `getLiveLeagueGamesFast()`
2. 404 if game not found
3. Wrap the aggregation logic in `cached('intel:${parsedId}', TTL.PLAYER_STATS, async () => {...})`
4. Inside cached fn: `Promise.allSettled` for player hero histories (with `hiddenProfile()` guard), `Promise.allSettled` for hero matchups
5. Return merged payload

**SECURITY note (matching existing pattern):** Input validation at top (400), 404 for missing resource, catch-all 502 with no stack trace.

---

### `client/src/hooks/useHeroStats.ts` (NEW — hook, request-response)

**Analog:** `client/src/hooks/useLiveGames.ts` (useLiveGames hook structure)

**Import pattern** (lines 1–3 of useLiveGames.ts):
```typescript
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
```

**queryFn pattern** (lines 52–55 of useLiveGames.ts):
```typescript
async function fetchLiveGames(): Promise<LiveGamesResponse> {
  const res = await fetch('/api/live/games')
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<LiveGamesResponse>
}
```

**useQuery pattern** (lines 85–91 of useLiveGames.ts):
```typescript
const query = useQuery<LiveGamesResponse>({
  queryKey: ['live-games'],
  queryFn: fetchLiveGames,
  refetchInterval: 30_000,
  staleTime: 25_000,
})
```

**For useHeroStats — adapt the above with:**
- `queryKey: ['hero-stats']`
- `staleTime: Infinity` — patch data never stale in client
- `refetchInterval: false` — no polling (BFF TTL 6h manages freshness)
- Return type: `Record<number, { winRate: number; pickRate: number }> | undefined`
- Extract pure `fetchHeroStats` function for testability (mirrors `groupByLeague` precedent in useLiveGames)

---

### `client/src/hooks/useMatchIntel.ts` (NEW — hook, request-response)

**Analog:** `client/src/hooks/useDraftDetail.ts` (exact match — same dynamic refetchInterval pattern)

**Import pattern** (lines 1–2 of useDraftDetail.ts):
```typescript
import { useQuery, type Query } from '@tanstack/react-query'
```

**Pure helper pattern** (lines 48–51 of useDraftDetail.ts):
```typescript
export function computeDraftInterval(gameState: number | undefined): number | false {
  if (gameState === 2) return 5_000
  return false
}
```

**Dynamic refetchInterval pattern** (lines 69–75 of useDraftDetail.ts):
```typescript
const query = useQuery<DraftResponse>({
  queryKey: ['draft', matchId],
  queryFn: () => fetchDraft(matchId!),
  enabled: !!matchId,
  refetchInterval: (q: Query<DraftResponse>) => computeDraftInterval(q.state.data?.game_state),
  staleTime: 4_000, // PF-2 — strictly below draft cadence
})
```

**For useMatchIntel — copy exactly with:**
- `queryKey: ['match-intel', matchId]`
- `queryFn: () => fetch('/api/live/intel/${matchId}').then(...)`
- Same `enabled: !!matchId`
- Extract `computeIntelInterval(gameState)` pure helper (same logic as `computeDraftInterval`)
- Same `staleTime: 4_000` (PF-2 applies equally)
- Return type must include `game_state` field so the `refetchInterval` callback can read `q.state.data?.game_state`

**CRITICAL (v5):** `refetchInterval` callback reads `q.state.data` — NOT via select. This is the same v5 constraint documented in useDraftDetail.ts lines 56–59.

---

### `client/src/components/IntelTooltip.tsx` (NEW — component, event-driven)

**Analog:** `client/src/components/DraftPortrait.tsx` (positioned absolute child within relative parent)

**Absolute positioning within relative parent** (DraftPortrait.tsx lines 44–46):
```typescript
return (
  <div className="relative w-14 h-14 shrink-0 rounded-sm overflow-hidden">
```

**Inline style object pattern** (DraftPortrait.tsx lines 36–40):
```typescript
style={{
  background: '#141414',
  border: isActive ? '1px solid #b03030' : '1px solid #1e1e1e',
}}
```

**aria-hidden on decorative elements** (DraftPortrait.tsx lines 55–56, 68–69):
```typescript
aria-hidden="true"
```

**IntelTooltip-specific pattern (from 05-RESEARCH.md §Pattern 5):**
```typescript
// useLayoutEffect — NOT useEffect — required for getBoundingClientRect accuracy
// fires synchronously after DOM updates but before browser paints
import { useRef, useState, useLayoutEffect } from 'react'

const tooltipRef = useRef<HTMLDivElement>(null)
const [positionAbove, setPositionAbove] = useState(true)

useLayoutEffect(() => {
  if (!anchorRef.current) return
  const rect = anchorRef.current.getBoundingClientRect()
  // D-07 threshold: if portrait top < 180px from viewport top, flip below
  setPositionAbove(rect.top >= 180)
}, [anchorRef])

const positionStyle: React.CSSProperties = positionAbove
  ? { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
  : { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
```

**Card visual spec (dark theme tokens):**
```typescript
style={{
  position: 'absolute',
  zIndex: 50,
  minWidth: 160,
  maxWidth: 220,
  background: '#111111',
  border: '1px solid #1a1a1a',
  borderRadius: 4,
  padding: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
  ...positionStyle,
}}
```

**CRITICAL — overflow-hidden pitfall (05-RESEARCH.md Pitfall 4):** DraftTimeline portrait cell (line 63 of DraftTimeline.tsx) has `overflow-hidden`. Tooltip must be rendered as a sibling of the portrait `div`, inside the outer `relative flex flex-col items-center` wrapper (line 33 of DraftTimeline.tsx), NOT inside the portrait cell div.

**heroMapper usage in counterpick mini-portraits** (same as DraftPortrait.tsx line 1):
```typescript
import { heroMapper } from '../utils/heroMapper'
// CRITICAL: import from client/src/utils/heroMapper — NOT '@shared/heroMapper'.
// The @shared version uses Node.js createRequire and breaks Vite bundling.
```

---

### `client/src/components/DraftPortrait.tsx` (MODIFY — component, event-driven)

**Analog:** Self — the file being modified.

**Existing prop interface** (lines 5–10):
```typescript
interface DraftPortraitProps {
  kind: 'pick' | 'ban'
  heroId?: number
  isActive?: boolean
  ordinal?: string
}
```

**Existing ordinal badge inline style pattern** (lines 67–85 — copy this exactly for badge strip):
```typescript
{ordinal && (
  <span
    aria-hidden="true"
    style={{
      position: 'absolute',
      top: 2,
      left: 2,
      fontSize: 9,
      lineHeight: 1,
      fontWeight: 700,
      color: '#888',
      letterSpacing: '0.05em',
      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
      fontVariantNumeric: 'tabular-nums',
    }}
  >
    {ordinal}
  </span>
)}
```

**Badge strip to add (bottom edge, pick slots only):**
```typescript
{kind === 'pick' && heroId !== undefined && heroStats && (
  <div
    aria-hidden="true"
    style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'rgba(0,0,0,0.72)',
      padding: '4px 4px',
      textAlign: 'center',
      fontSize: 10,
      fontVariantNumeric: 'tabular-nums',
    }}
  >
    <span style={{ color: winrateColor(heroStats.winRate) }}>
      {Math.round(heroStats.winRate * 100)}%
    </span>
    <span style={{ color: '#888888' }}> · {Math.round(heroStats.pickRate * 100)}%</span>
  </div>
)}
```

**New props to add to interface:**
```typescript
heroStats?: { winRate: number; pickRate: number }
playerIntel?: {
  playerName: string
  games: number | null
  winRate: number | null
  heroName: string
  counters: CounterHero[]
}
```

**Hover state pattern (useState):**
```typescript
const [hovered, setHovered] = useState(false)
// on the outer relative div:
onMouseEnter={() => setHovered(true)}
onMouseLeave={() => setHovered(false)}
```

---

### `client/src/components/DraftTimeline.tsx` (MODIFY — component, transform)

**Analog:** Self — the file being modified.

**Existing props interface** (lines 12–15):
```typescript
interface DraftTimelineProps {
  slots: DraftTimelineSlot[]
  gameState: number | undefined
}
```

**Add two new optional props:**
```typescript
heroStatsMap?: Record<number, { winRate: number; pickRate: number }>
playerIntelMap?: Record<number, PlayerIntelSlice>  // keyed by hero_id or slot step
```

**Existing prop threading to DraftPortrait** (lines 71–110 — already passes `heroId`, slot data):
The new props are sliced per-slot and forwarded to `DraftPortrait`:
```typescript
heroStats={slot.heroId ? heroStatsMap?.[slot.heroId] : undefined}
playerIntel={playerIntelMap?.[slot.step]}
```

**overflow-hidden note (CRITICAL for tooltip):** Portrait cell at line 63 has `overflow-hidden`. Render IntelTooltip as sibling inside the outer `relative flex flex-col items-center` div (line 33), NOT inside the portrait cell.

---

### `client/src/components/DraftColumn.tsx` (MODIFY — component, transform)

**Analog:** Self — the file being modified.

**Existing DraftPortrait usage** (lines 63–70 for picks, lines 74–81 for bans):
```typescript
<DraftPortrait
  key={`pick-${i}`}
  kind="pick"
  heroId={picks[i]?.hero_id}
  isActive={i === activePickIndex}
  ordinal={`P${i + 1}`}
/>
```

**Thread new props through identically to DraftTimeline:**
```typescript
// Add to DraftColumnProps:
heroStatsMap?: Record<number, { winRate: number; pickRate: number }>
playerIntelMap?: Record<number, PlayerIntelSlice>

// Forward to each DraftPortrait (picks only — bans never get badge or tooltip per D-02):
heroStats={picks[i]?.hero_id ? heroStatsMap?.[picks[i].hero_id] : undefined}
playerIntel={...}
```

**IMPORTANT (Pitfall 6):** Both DraftTimeline AND DraftColumn render DraftPortrait. Both must receive the new props from DraftSection → MatchPage. The planner must thread props in both paths.

---

### `client/src/pages/MatchPage.tsx` (MODIFY — page/container, request-response)

**Analog:** Self — the file being modified.

**Existing hook composition pattern** (lines 12–13):
```typescript
const { match, radiantPlayers, direPlayers, buildings, isLoading } = useMatchDetail(matchId)
const draft = useDraftDetail(matchId)
```

**Add two new hook calls using the same pattern:**
```typescript
import { useHeroStats } from '../hooks/useHeroStats'
import { useMatchIntel } from '../hooks/useMatchIntel'

const heroStats = useHeroStats()
const intel = useMatchIntel(matchId)
```

**Existing DraftSection prop passing** (lines 60–67):
```typescript
{draft.scoreboard && (
  <DraftSection
    scoreboard={draft.scoreboard}
    gameState={draft.gameState}
    activeTeam={draft.activeTeam}
    action={draft.action}
    tentative={draft.tentative}
  />
)}
```

Add `heroStatsMap={heroStats}` and `playerIntelMap={intel.data?.players}` to DraftSection props.

---

### `client/src/utils/winrateColor.ts` (NEW — utility, transform)

**Analog:** `client/src/utils/heroMapper.ts` (pure function, typed, null-safe)

**heroMapper pattern** (lines 15–17):
```typescript
export function heroMapper(id: number): HeroInfo | null {
  return (heroes as Record<string, HeroInfo>)[String(id)] ?? null
}
```

**winrateColor follows the same pure-function export pattern:**
```typescript
/**
 * Returns the display color for a winrate value.
 * Thresholds per CONTEXT.md §Specific Ideas + UI-SPEC §Color:
 *   > 0.52  → '#4ade80' (radiant green — high winrate)
 *   < 0.48  → '#ef4444' (dire red — low winrate)
 *   else    → '#888888' (neutral — 48–52% band)
 * Pure function — no side effects, exported for unit testing.
 */
export function winrateColor(winRate: number): string {
  if (winRate > 0.52) return '#4ade80'
  if (winRate < 0.48) return '#ef4444'
  return '#888888'
}
```

---

### `client/src/utils/winrateColor.test.ts` (NEW — test)

**Analog:** `client/src/hooks/useDraftDetail.test.ts` (exact structure)

**Test file pattern** (lines 1–45 of useDraftDetail.test.ts):
```typescript
import { describe, it, expect } from 'vitest'
import { computeDraftInterval } from './useDraftDetail'

describe('computeDraftInterval (DRAFT-01 polling cadence — per D-12)', () => {
  it('returns 5000ms when game_state === 2 (draft live)', () => {
    expect(computeDraftInterval(2)).toBe(5_000)
  })
  // ... boundary cases
})
```

**winrateColor test covers (per 05-RESEARCH.md §Validation Architecture):**
- `winrateColor(0.53)` → `'#4ade80'` (above 0.52 threshold)
- `winrateColor(0.52)` → `'#888888'` (exactly 0.52 — NOT above)
- `winrateColor(0.50)` → `'#888888'` (neutral band)
- `winrateColor(0.48)` → `'#888888'` (exactly 0.48 — NOT below)
- `winrateColor(0.47)` → `'#ef4444'` (below 0.48 threshold)
- `winrateColor(1.0)` → `'#4ade80'` (max — does not crash)
- `winrateColor(0.0)` → `'#ef4444'` (zero — does not crash)

---

### `server/src/services/intel.test.ts` (NEW — test)

**Analog:** `client/src/hooks/useDraftDetail.test.ts` (pure helper test pattern)

**Extract two pure helpers from the intel route for testing:**

`rankCounters(matchups: HeroMatchup[]): CounterHero[]`
- Tests: sorts by `wins/games_played` DESC, slices top-3, skips entries with `games_played === 0`

`applyKnownToPlay(counters, players): CounterHero[]` (adds `knownPlayers` field)
- Tests: threshold `games >= 10 AND win/games > 0.5`, hidden profile skipped (returns no knownPlayer entry)

**Test pattern (mirrors useDraftDetail.test.ts):**
```typescript
import { describe, it, expect } from 'vitest'
import { rankCounters, applyKnownToPlay } from './intel'

describe('rankCounters', () => {
  it('sorts by disadvantage score DESC', () => { ... })
  it('slices to top-3', () => { ... })
  it('skips entries where games_played === 0', () => { ... })
})

describe('applyKnownToPlay (D-09 threshold)', () => {
  it('flags player when games >= 10 AND win/games > 0.5', () => { ... })
  it('does NOT flag player when games < 10', () => { ... })
  it('does NOT flag player when win/games <= 0.5', () => { ... })
  it('skips hidden profile players (null stats)', () => { ... })
})
```

---

### `client/src/hooks/useMatchIntel.test.ts` (NEW — test)

**Analog:** `client/src/hooks/useDraftDetail.test.ts` (exact mirror)

**Test the extracted `computeIntelInterval` pure helper:**
```typescript
import { describe, it, expect } from 'vitest'
import { computeIntelInterval } from './useMatchIntel'

describe('computeIntelInterval (PLAYER-01 polling cadence)', () => {
  it('returns 5000ms when game_state === 2 (draft live)', () => {
    expect(computeIntelInterval(2)).toBe(5_000)
  })
  it('returns false when game_state === 6 (post-game)', () => {
    expect(computeIntelInterval(6)).toBe(false)
  })
  it('returns false when game_state === 5 (in-game — frozen picks)', () => {
    expect(computeIntelInterval(5)).toBe(false)
  })
  it('returns false when game_state is undefined', () => {
    expect(computeIntelInterval(undefined)).toBe(false)
  })
})
```

---

## Shared Patterns

### cached() Decorator — Server Services
**Source:** `server/src/cache.ts` lines 53–82
**Apply to:** All three new service functions (`getHeroStats`, `getPlayerHeroes`, `getHeroMatchups`)

The exported function is always a thin wrapper:
```typescript
export function getX(param: T): Promise<Result | null> {
  return cached(`key:${param}`, TTL.RELEVANT, () => fetchX(param))
}
```
The `fetch*` inner function does all the work and returns null on any error. `cached()` handles Redis GET/SET transparently with graceful degradation.

### Error Handling — Server Route Handlers
**Source:** `server/src/routes/live.ts` lines 83–88
**Apply to:** Both new route handlers (`GET /api/heroes/stats`, `GET /api/live/intel/:matchId`)

```typescript
try {
  // ... business logic
  return c.json(result)
} catch {
  return c.json({ error: 'Upstream error' }, 502)
}
```
Never expose stack traces, upstream URLs, or error details. Constant error strings only.

### Input Validation — matchId Path Param
**Source:** `server/src/routes/live.ts` lines 66–71
**Apply to:** `GET /api/live/intel/:matchId`

```typescript
const rawMatchId = c.req.param('matchId')
const parsedId = Number(rawMatchId)
if (!Number.isFinite(parsedId)) {
  return c.json({ error: 'Invalid matchId' }, 400)
}
```
Copy verbatim — same security pattern (T-04-I1).

### hiddenProfile Guard
**Source:** `shared/hiddenProfile.ts` lines 1–8
**Apply to:** Intel route aggregator, before any `getPlayerHeroes` call

```typescript
import { hiddenProfile } from '@shared/hiddenProfile.js'

if (!p.account_id || hiddenProfile(p.account_id)) {
  return { accountId: p.account_id, heroId: p.hero_id, stats: null }
}
```
Short-circuit at aggregator — never call OpenDota for hidden profiles.

### heroMapper Import — Client Components
**Source:** `client/src/components/DraftPortrait.tsx` line 1, `client/src/components/DraftTimeline.tsx` line 1
**Apply to:** `IntelTooltip.tsx` (for counterpick mini-portraits)

```typescript
import { heroMapper } from '../utils/heroMapper'
// CRITICAL: import from client/src/utils/heroMapper — NOT '@shared/heroMapper'.
// The @shared version uses Node.js createRequire and breaks Vite bundling.
```

### TanStack Query v5 queryFn Pattern
**Source:** `client/src/hooks/useDraftDetail.ts` lines 31–35, `client/src/hooks/useLiveGames.ts` lines 52–55
**Apply to:** `useHeroStats.ts`, `useMatchIntel.ts`

```typescript
async function fetchX(): Promise<XResponse> {
  const res = await fetch('/api/path')
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<XResponse>
}
```
Throw on non-ok status (TanStack Query catches and sets `isError`). Never return null from queryFn — return null only from service functions.

### Dark Theme Inline Style Tokens
**Source:** `client/src/pages/MatchPage.tsx` line 18, `client/src/components/DraftColumn.tsx` lines 31–41
**Apply to:** `IntelTooltip.tsx`, badge strip in `DraftPortrait.tsx`

| Token | Value | Usage |
|-------|-------|-------|
| Page bg | `#0a0a0a` | Not used in new elements |
| Tooltip bg | `#111111` | IntelTooltip card background |
| Border | `#1a1a1a` | Tooltip border, separator line |
| Primary text | `#d8d8d8` | Player name, hero names |
| Secondary text | `#888888` | Stat line, pickrate value, muted text |
| Tertiary text | `#444444` | Section labels (COUNTERS), loading text |
| Radiant green | `#4ade80` | High winrate (>52%) |
| Dire red | `#ef4444` | Low winrate (<48%), ⚠ flag |
| Badge scrim | `rgba(0,0,0,0.72)` | Badge strip background |

---

## No Analog Found

All files have close analogs in the codebase. No entries in this section.

---

## Metadata

**Analog search scope:**
- `server/src/services/`, `server/src/schemas/`, `server/src/routes/`, `server/src/cache.ts`
- `client/src/hooks/`, `client/src/components/`, `client/src/pages/`, `client/src/utils/`
- `shared/hiddenProfile.ts`, `shared/heroMapper.ts`

**Files scanned:** 16 source files read directly
**Pattern extraction date:** 2026-04-25
