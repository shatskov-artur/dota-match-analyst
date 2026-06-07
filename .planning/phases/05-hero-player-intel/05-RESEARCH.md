# Phase 5: Hero & Player Intel — Research

**Researched:** 2026-04-25
**Domain:** OpenDota API integration, React tooltip positioning, TanStack Query v5 static-data hooks, Hono BFF aggregator route, hidden-profile short-circuit
**Confidence:** HIGH (codebase verified) / MEDIUM (OpenDota field names verified via third-party SDK, not live endpoint)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Stats badge overlay at bottom edge of DraftPortrait, pick slots only. Format: `52% · 18%` (winrate · pickrate). No timeline layout changes.
- **D-02:** Badge visible for pick slots only — not bans. Bans already have a red X overlay.
- **D-03:** Badge hidden for empty/placeholder slots (heroId undefined or heroStats not loaded).
- **D-04:** Hover a drafted pick portrait → custom positioned card (not browser `title`). Contains: player name + hero stats (top), counterpicks (bottom).
- **D-05:** Show top-3 counterpicks ranked by disadvantage score from `/heroes/{heroId}/matchups`. Each entry: hero portrait (~32px) + hero name.
- **D-06:** "Known to play" flag — `⚠` indicator next to hero name with opposing player name. Computed server-side.
- **D-07:** Tooltip positioned above portrait by default; flips below when portrait `getBoundingClientRect().top < 180`. Closes on mouse-leave.
- **D-08:** Tooltip top section: player name, then `{N} games · {W}% winrate on {HeroName}` from OpenDota `/players/{accountId}/heroes`.
- **D-08b:** Hidden profiles show player name with `—` for games/winrate. No OpenDota call. No error state.
- **D-09:** "Known to play" threshold: `games >= 10 AND win/games > 0.5`. Applied server-side. Client receives `known_to_play: boolean`.
- **D-10:** Route `GET /api/heroes/stats` — calls OpenDota `/api/heroStats`, cached `TTL.HERO_STATS` (6h). Returns `{ [heroId]: { win_rate, pick_rate } }`.
- **D-11:** Route `GET /api/live/intel/:matchId` — reads picks_bans from existing live games cache, fetches per-player hero histories via `Promise.allSettled`, hidden profiles short-circuited, combined payload cached `TTL.PLAYER_STATS` (15min) per match_id.
- **D-12:** Counterpick matchup data per hero_id, cached `TTL.HERO_STATS` (6h). Intel route triggers these fetches for all picks and merges.
- **D-13:** All new OpenDota calls use `cached()` with keys: `hero:stats`, `hero:matchups:{heroId}`, `player:heroes:{accountId}`. Never call OpenDota directly.

### Claude's Discretion

- Exact tooltip card dimensions and positioning CSS (dark theme: `#0a0a0a` bg, `#1a1a1a` border, `#d8d8d8` text).
- Badge font size and opacity (recommend `text-[10px]` with `rgba(0,0,0,0.72)` scrim).
- Whether to show a loading skeleton in the tooltip while intel loads (recommend: player name only + static placeholder).
- Exact zod schema field names for new OpenDota responses.
- Whether `getPlayerHeroes` accepts a `?date=90` param (use if available, fall back to all-time).
- Whether to create `server/src/routes/heroes.ts` or add new routes to existing `live.ts`.

### Deferred Ideas (OUT OF SCOPE)

- Hero name tooltip on portrait (Phase 4 carry-over).
- Tournament-scoped hero winrate (REQUIREMENTS.md v2).
- OpenDota `?date=90` param — use if endpoint confirms support, otherwise all-time stats.
- Patch winrate sparkline (trend over time) — Phase 5 shows only current snapshot.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DRAFT-03 | Current patch winrate and pro pickrate next to each drafted hero | OpenDota `/api/heroStats` → `pro_win/pro_pick` ratio; badge overlay on DraftPortrait |
| DRAFT-04 | Hover drafted hero → top counterpicks + "known to play" flag against enemy roster | `/heroes/{heroId}/matchups` + `/players/{accountId}/heroes`; BFF aggregator; `IntelTooltip` component |
| PLAYER-01 | Per-player stats on currently-drafted hero: total games + winrate | `/players/{accountId}/heroes` filtered by hero_id; shown in tooltip stat line |
| PLAYER-02 | Hidden-profile players (account_id = 4294967295) show name, no OpenDota stats, no crash | `hiddenProfile()` guard at BFF aggregator; `null` stats propagated to client |
</phase_requirements>

---

## Summary

Phase 5 layers contextual stats onto the already-built DraftTimeline and HeroPlayerGrid surfaces. The implementation has two distinct axes: (1) a **BFF data pipeline** adding two new Hono routes backed by three new OpenDota service calls, all funnelled through the existing `cached()` decorator; and (2) a **UI overlay** adding a stats badge and hover tooltip to the existing `DraftPortrait` component without changing its layout or the DraftTimeline/DraftColumn structure.

The codebase is well-prepared for this phase. `TTL.HERO_STATS` and `TTL.PLAYER_STATS` already exist in `server/src/cache.ts`. The `hiddenProfile()` guard is in `shared/hiddenProfile.ts`. The `DraftPortrait` component is a standalone leaf node that accepts props cleanly. Both new client hooks (`useHeroStats`, `useMatchIntel`) follow the existing `useDraftDetail` pattern directly.

The main technical risks are: (a) confirming the exact OpenDota field names (`pro_win`, `pro_pick`, `hero_id` in heroStats; `hero_id`, `games`, `win` in playerHeroes; `hero_id2`, `games_played`, `wins` in matchups) — these are MEDIUM confidence from third-party SDK inspection, not verified against a live API call in this session; and (b) the viewport-flip tooltip positioning (no external library) which requires a `useRef` + `getBoundingClientRect` pattern that needs to fire after the tooltip renders in the DOM.

**Primary recommendation:** Implement in a 3-wave structure: Wave 0 (test stubs for new pure helpers), Wave 1 (BFF routes + schemas + service functions), Wave 2 (client hooks + DraftPortrait badge + IntelTooltip component + MatchPage wiring).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hero patch stats fetch + cache | API / Backend | — | N viewers → 1 upstream call per TTL; must be server-side |
| Player hero history fetch + "known to play" compute | API / Backend | — | Batched per match; server-side caching by match_id prevents per-user fan-out |
| Badge overlay rendering | Browser / Client | — | Pure display layer — heroStats prop received from parent |
| Tooltip positioning (viewport flip) | Browser / Client | — | Requires `getBoundingClientRect` — browser-only |
| Tooltip data (player stats + counters) | Browser / Client | API / Backend | Client fetches pre-computed payload from BFF |
| Hidden-profile short-circuit | API / Backend | Browser / Client | Primary: BFF aggregator never calls OpenDota for hidden profiles; secondary: client shows `—` in tooltip |

---

## Standard Stack

### Core (all already in use — no new installs needed)

| Library | Version | Purpose | Role in Phase 5 |
|---------|---------|---------|-----------------|
| Hono | ^4.0.0 | BFF router | Two new route handlers in `live.ts` or new `heroes.ts` |
| zod | ^3.0.0 | Schema validation | Three new schemas with `.passthrough()` |
| ioredis (via `cached()`) | ^5.0.0 | Cache decorator | Cache keys `hero:stats`, `hero:matchups:{heroId}`, `player:heroes:{accountId}` |
| TanStack Query v5 | ^5.0.0 | Client data fetching | `useHeroStats()` (staleTime: Infinity, no polling), `useMatchIntel(matchId)` (dynamic refetchInterval) |
| React 19 | ^19.2.0 | Component tree | `DraftPortrait` extension, new `IntelTooltip` component |
| Tailwind 4 | ^4.1.0 | Styling | Badge scrim (inline style for alpha), tooltip card |

### No New Packages Required

Phase 5 requires **zero new npm packages**. The tooltip is hand-rolled per UI-SPEC. Floating UI / Popper.js / react-tooltip are explicitly not used — the custom `getBoundingClientRect` flip logic is intentional per D-07 and the UI-SPEC constraint.

**Verification:** `npm view @floating-ui/react version` is irrelevant — the project does not use this library and must not add it.

---

## Architecture Patterns

### System Architecture Diagram

```
Client (Browser)
│
├── MatchPage.tsx
│   ├── useHeroStats()          → GET /api/heroes/stats          → cached('hero:stats', 6h)
│   │                                                               → OpenDota /api/heroStats
│   │                                                               → returns { [heroId]: { win_rate, pick_rate } }
│   │
│   ├── useMatchIntel(matchId)  → GET /api/live/intel/:matchId   → cached('intel:{matchId}', 15min)
│   │                                                               → reads picks_bans from live game
│   │                                                               ├── per pick: hiddenProfile() check
│   │                                                               ├── getPlayerHeroes(accountId) — cached 15min
│   │                                                               │   → OpenDota /players/{id}/heroes
│   │                                                               └── getHeroMatchups(heroId) — cached 6h
│   │                                                                   → OpenDota /heroes/{id}/matchups
│   │                                                                   → returns top-3 counters with knownPlayers[]
│   │
│   └── DraftSection
│       └── DraftTimeline / DraftColumn
│           └── DraftPortrait (per slot)
│               ├── [badge strip] — rendered when kind=pick AND heroStats defined
│               └── [IntelTooltip] — rendered on hover when kind=pick AND playerIntel defined
│                   ├── player stat line (or — — for hidden)
│                   └── top-3 counter rows with ⚠ flag
```

### Recommended Project Structure (additions only)

```
server/src/
├── routes/
│   ├── live.ts                    # add GET /api/heroes/stats + GET /api/live/intel/:matchId
│   │                              # OR split into heroes.ts (Claude's discretion)
├── services/
│   └── openDotaApi.ts             # add getHeroStats(), getPlayerHeroes(accountId), getHeroMatchups(heroId)
└── schemas/
    └── openDota.ts                # add HeroStatsSchema, PlayerHeroSchema, HeroMatchupSchema

client/src/
├── hooks/
│   ├── useHeroStats.ts            # NEW — static fetch, staleTime: Infinity
│   └── useMatchIntel.ts           # NEW — dynamic refetchInterval matching draft cadence
└── components/
    ├── DraftPortrait.tsx           # MODIFY — add heroStats, playerIntel props + badge strip + tooltip trigger
    ├── IntelTooltip.tsx            # NEW — positioned card with viewport flip
    ├── DraftTimeline.tsx           # MODIFY — pass heroStats and playerIntel slices down
    └── DraftColumn.tsx             # MODIFY — same, pass new props through
```

### Pattern 1: OpenDota Service Function (follow existing `getLeagueName` pattern exactly)

```typescript
// Source: server/src/services/openDotaApi.ts (verified in codebase)
async function fetchHeroStats(): Promise<HeroStatsMap | null> {
  let res: Response
  try {
    res = await fetch(`${OPENDOTA_BASE}/heroStats`)
  } catch (err) {
    console.error('[openDotaApi] Network error fetching heroStats:', (err as Error).message)
    return null
  }
  if (!res.ok) {
    console.error(`[openDotaApi] heroStats fetch error: ${res.status} ${res.statusText}`)
    return null
  }
  const raw: unknown = await res.json()
  const parsed = z.array(HeroStatsSchema).safeParse(raw)
  if (!parsed.success) {
    console.error('[openDotaApi] HeroStatsSchema parse failure')
    return null
  }
  // Server-side transform: array → map keyed by hero_id
  const map: HeroStatsMap = {}
  for (const h of parsed.data) {
    if (h.id !== undefined && h.pro_pick !== undefined && h.pro_pick > 0) {
      map[h.id] = {
        win_rate: (h.pro_win ?? 0) / h.pro_pick,
        pick_rate: h.pro_pick,  // raw count; client may normalize if needed
      }
    }
  }
  return map
}

export function getHeroStats(): Promise<HeroStatsMap | null> {
  return cached('hero:stats', TTL.HERO_STATS, fetchHeroStats)
}
```

**Key discipline:** `return null` on any error. Never throw to the BFF route handler from a service function. The route handler wraps with `try/catch` and returns 502.

### Pattern 2: Promise.allSettled Aggregator (intel route)

```typescript
// Source: server/src/routes/live.ts (pattern derived from existing route structure)
liveRoutes.get('/intel/:matchId', async (c) => {
  const rawMatchId = c.req.param('matchId')
  const parsedId = Number(rawMatchId)
  if (!Number.isFinite(parsedId)) {
    return c.json({ error: 'Invalid matchId' }, 400)
  }

  try {
    // Step 1: Read live game from existing 30s cache (no new Valve call)
    const liveData = await getLiveLeagueGames()
    const game = liveData.result.games?.find((g) => g.match_id === parsedId)
    if (!game) return c.json({ error: 'Match not live' }, 404)

    // Step 2: Extract picks from scoreboard
    const radiantPicks = game.scoreboard?.radiant?.picks ?? []
    const direPicks = game.scoreboard?.dire?.picks ?? []
    const allPicks = [...radiantPicks, ...direPicks]

    // Step 3: Batch fetch — all unique hero matchups + all player hero histories
    // Wrapped in cached() per D-13; hidden profiles short-circuit per D-11
    const intelPayload = await cached(`intel:${parsedId}`, TTL.PLAYER_STATS, async () => {
      const players = game.players ?? []
      const heroIds = [...new Set(allPicks.map(p => p.hero_id).filter(Boolean))]

      const [playerResults, matchupResults] = await Promise.all([
        Promise.allSettled(
          players
            .filter(p => p.team === 0 || p.team === 1)
            .map(async (p) => {
              if (!p.account_id || hiddenProfile(p.account_id)) {
                return { accountId: p.account_id, heroId: p.hero_id, stats: null }
              }
              const heroes = await getPlayerHeroes(p.account_id)
              const heroStat = heroes?.find(h => h.hero_id === p.hero_id) ?? null
              return { accountId: p.account_id, heroId: p.hero_id, stats: heroStat }
            })
        ),
        Promise.allSettled(
          heroIds.map(heroId => getHeroMatchups(heroId!))
        )
      ])
      // ... merge and return combined payload
    })

    return c.json(intelPayload)
  } catch {
    return c.json({ error: 'Upstream error' }, 502)
  }
})
```

### Pattern 3: Static Data Hook (useHeroStats)

```typescript
// Source: derived from useLiveGames.ts pattern [VERIFIED: codebase]
// TanStack Query v5 — staleTime: Infinity = never consider stale until manual invalidation
export function useHeroStats(): Record<number, { winRate: number; pickRate: number }> | undefined {
  const query = useQuery<HeroStatsResponse>({
    queryKey: ['hero-stats'],
    queryFn: async () => {
      const res = await fetch('/api/heroes/stats')
      if (!res.ok) throw new Error(`BFF error: ${res.status}`)
      return res.json()
    },
    staleTime: Infinity,      // [VERIFIED: TanStack docs] never stale — 6h BFF TTL manages freshness
    refetchInterval: false,   // no timer-based polling for static patch data
  })
  return query.data
}
```

### Pattern 4: Dynamic refetchInterval Hook (useMatchIntel)

```typescript
// Source: derived from useDraftDetail.ts pattern [VERIFIED: codebase]
// CRITICAL (v5): refetchInterval callback reads query.state.data — same as useDraftDetail
export function useMatchIntel(matchId: string | undefined) {
  return useQuery<MatchIntelResponse>({
    queryKey: ['match-intel', matchId],
    queryFn: async () => {
      const res = await fetch(`/api/live/intel/${matchId}`)
      if (!res.ok) throw new Error(`BFF error: ${res.status}`)
      return res.json()
    },
    enabled: !!matchId,
    refetchInterval: (q: Query<MatchIntelResponse>) =>
      q.state.data?.game_state === 2 ? 5_000 : false,
    staleTime: 4_000,  // PF-2: strictly below 5s cadence so interval fires every cycle
  })
}
```

### Pattern 5: Tooltip Positioning (viewport flip with useRef)

```typescript
// Source: derived from UI-SPEC D-07 spec [VERIFIED: 05-UI-SPEC.md]
// useLayoutEffect fires synchronously after DOM paint — required for getBoundingClientRect accuracy
export default function IntelTooltip({ playerIntel, anchorRef }: IntelTooltipProps) {
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

  return (
    <div
      ref={tooltipRef}
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
    >
      {/* card content */}
    </div>
  )
}
```

**Critical note:** Use `useLayoutEffect` (not `useEffect`) for the positioning measurement. `useEffect` fires after the browser paints, causing a single-frame flash of the wrong position. `useLayoutEffect` fires synchronously after DOM updates but before the browser paints. [VERIFIED: React docs]

### Anti-Patterns to Avoid

- **Calling OpenDota directly from route handler without `cached()`:** Every OpenDota call MUST go through `cached()` per CLAUDE.md. Direct calls defeat the N-viewers → 1-upstream guarantee.
- **Caching the intel route by `account_id`:** D-11 explicitly caches by `match_id` only. Per-user caching would exhaust Upstash quota with N viewers.
- **Computing `known_to_play` client-side:** D-09 specifies server-side computation. Client receives pre-computed `knownPlayers: string[]`.
- **Using `useEffect` instead of `useLayoutEffect` for tooltip positioning:** `useEffect` fires after paint → one-frame position flash.
- **Polling `useHeroStats`:** Hero stats are patch-level data changing every ~2 weeks. `refetchInterval: false` + BFF 6h TTL is correct. Polling wastes quota.
- **Rendering tooltip on ban slots or empty slots:** Only `kind === 'pick'` AND `heroId` defined AND `playerIntel` defined.
- **Throwing from service functions:** All `getHeroStats()`, `getPlayerHeroes()`, `getHeroMatchups()` must `catch` and `return null`. The BFF route's `try/catch` handles null gracefully with a 502 only if the orchestration itself fails.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis caching with TTL | Custom Redis wrapper | Existing `cached()` in `server/src/cache.ts` | Already handles GET errors, SET errors, JSON parse, graceful degradation |
| Hero ID → portrait URL mapping | Inline object or fetch | Existing `heroMapper` in `client/src/utils/heroMapper.ts` | Used in DraftTimeline, DraftPortrait — same import path required per CLAUDE.md |
| Hidden profile detection | `=== 4294967295` inline | `hiddenProfile()` from `shared/hiddenProfile.ts` | Defined in Phase 1 for this exact purpose |
| Concurrent fan-out fetches | Custom Promise wrapper | `Promise.allSettled` (native) | Native, handles partial failure without rejection propagation |
| Tooltip library | Floating UI / Popper | `useRef` + `getBoundingClientRect` | UI-SPEC explicitly prohibits external tooltip libs for Phase 5 |

**Key insight:** The existing codebase primitives (`cached()`, `heroMapper`, `hiddenProfile()`) are specifically designed to be reused by Phase 5. The worst mistake is reimplementing them inline.

---

## OpenDota API: Verified Field Names

> Confidence: MEDIUM — verified via Go SDK struct inspection (github.com/jasonodonnell/go-opendota), not a live API call.

### GET /api/heroStats

Returns: Array of hero objects.

**Fields used:**
| JSON field | Go SDK field | Type | Purpose |
|------------|-------------|------|---------|
| `id` | `HeroID int` | number | Hero identifier (note: `id`, not `hero_id`, in heroStats array items) |
| `pro_win` | `ProWin int` | number | Pro match wins |
| `pro_pick` | `ProPick int` | number | Pro match picks |
| `pro_ban` | `ProBan int` | number | Pro match bans (not used in Phase 5 badge) |
| `localized_name` | `LocalizedName string` | string | Human-readable hero name |

**Server-side transform:** `win_rate = pro_win / pro_pick` (guard: `pro_pick > 0`).

**Important:** The field is `id` (not `hero_id`) in the heroStats array. [ASSUMED — must validate on first real API call]

### GET /api/players/{account_id}/heroes

Returns: Array of player-hero stat objects.

**Fields used:**
| JSON field | Go SDK field | Type | Purpose |
|------------|-------------|------|---------|
| `hero_id` | `HeroID string` | number/string | Hero identifier — filter by this |
| `games` | `Games int` | number | Total games played on hero |
| `win` | `Win int` | number | Total wins on hero |
| `last_played` | `LastPlayed int` | Unix timestamp | Optional — not used in Phase 5 |

**Note:** Go SDK shows `HeroID` as `string` type. Treat as `z.union([z.string(), z.number()])` in zod schema or coerce to number. [ASSUMED — verify on first call]

**Query param `?date=N`:** Supported per CONTEXT.md deferred section. Allows windowing to last N days (e.g., `?date=90`). If OpenDota supports it, use for recency. [ASSUMED — verify before implementing]

### GET /api/heroes/{hero_id}/matchups

Returns: Array of hero vs. hero matchup objects.

**Fields used:**
| JSON field | Go SDK field | Type | Purpose |
|------------|-------------|------|---------|
| `hero_id` | `HeroID int` | number | The counter hero's ID |
| `games_played` | `GamesPlayed int` | number | Games where hero1 faced hero_id |
| `wins` | `Wins int` | number | Wins from hero1's opponent perspective |

**Ranking logic:** Sort by `wins / games_played DESC` → top-3 = highest disadvantage score for the original hero. Guard: `games_played > 0`.

**Note:** The field is `hero_id` (not `hero_id2`) in the matchups array. CONTEXT.md §Specific Ideas mentions `hero_id2` — this may be an older API version naming. Zod schema should try `hero_id` first. [ASSUMED — field name needs verification]

### Rate Limits

- **Anonymous (no API key):** 50,000 calls/month, 60 req/min [CITED: blog.opendota.com/2018/04/17/changes-to-the-api/]
- **With free API key:** same monthly limit, higher burst
- **Phase 5 strategy:** All three endpoints are cached aggressively (6h hero stats, 15min player stats). For a small group viewing 5–10 matches simultaneously, the quota impact is minimal. The intel route's `Promise.allSettled` fan-out calls up to 10 player-history endpoints per match — all individually cached by `player:heroes:{accountId}`, so repeat viewers of the same match hit cache.

---

## Common Pitfalls

### Pitfall 1: heroStats `id` vs `hero_id` field name

**What goes wrong:** Zod schema uses `hero_id` but the actual field is `id` → entire heroStats map empty, all badges missing.
**Why it happens:** OpenDota's `/api/heroStats` returns items with `id`, while `/players/{id}/heroes` returns items with `hero_id` — inconsistent across endpoints.
**How to avoid:** Log the first raw response element during development. Add a defensive zod schema that accepts both: `z.number().optional()` on `id` AND `hero_id` separately.
**Warning signs:** `useHeroStats()` returns a populated object but badge strips never appear.

### Pitfall 2: intel route caching the wrong scope

**What goes wrong:** Cache key includes `accountId` instead of `matchId` → N viewers of same match = N upstream calls per player.
**Why it happens:** Per-player caching feels natural but breaks the CLAUDE.md "N viewers → 1 upstream call per TTL" rule.
**How to avoid:** Cache key must be `intel:{matchId}` (TTL.PLAYER_STATS = 15min). Individual player hero histories cached separately as `player:heroes:{accountId}` with the same TTL. Two-level caching: outer by match, inner per player.

### Pitfall 3: `useEffect` instead of `useLayoutEffect` for tooltip position

**What goes wrong:** Tooltip appears above for one frame then flips below (or vice versa) — visible flash.
**Why it happens:** `useEffect` fires after browser paint. `getBoundingClientRect` is read correctly but position state update triggers a second paint.
**How to avoid:** Use `useLayoutEffect` for positioning measurement. Import from React directly (`import { useLayoutEffect } from 'react'`).
**Warning signs:** Single-frame position flash on hover.

### Pitfall 4: Tooltip renders on DraftTimeline 48px portraits — overflow clipping

**What goes wrong:** `DraftTimeline` portrait wrapper has `overflow-hidden` on the `w-12 h-12` cell → tooltip clipped by parent.
**Why it happens:** DraftTimeline renders the portrait with `overflow-hidden` on the cell itself (verified in `DraftTimeline.tsx` line 62). The tooltip is `position: absolute` inside this element → clipped.
**How to avoid:** The tooltip container must be positioned relative to a parent that does NOT have `overflow-hidden`. Options: (a) render the tooltip in the column-wrapper div (has `relative` but no overflow clip), or (b) elevate overflow-hidden to allow the tooltip to escape. Best approach: render `IntelTooltip` as a sibling of the portrait `div`, in the outer `relative flex flex-col items-center` wrapper (line 33 in `DraftTimeline.tsx`) — this wrapper has no `overflow-hidden`.
**Warning signs:** Tooltip appears partially or not at all on timeline portraits.

### Pitfall 5: `picks_bans` vs `scoreboard.radiant.picks` confusion

**What goes wrong:** Intel route reads `picks_bans` (flat array) but Valve API puts draft data under `scoreboard.radiant.picks` and `scoreboard.dire.picks`.
**Why it happens:** CONTEXT.md mentions `picks_bans` as a general concept but the Valve API schema (verified in `server/src/schemas/valve.ts`) uses `scoreboard.radiant.picks` / `scoreboard.dire.picks`.
**How to avoid:** Read from `game.scoreboard?.radiant?.picks ?? []` and `game.scoreboard?.dire?.picks ?? []`. The `scoreboard` field is already parsed and typed via `ScoreboardSchema` in `valve.ts`.
**Warning signs:** Empty picks arrays in the intel payload despite a live draft being active.

### Pitfall 6: DraftColumn also renders DraftPortrait — must receive new props

**What goes wrong:** Badge strips appear in DraftTimeline but not in DraftColumn (fallback path) — or vice versa.
**Why it happens:** Two rendering paths exist in `DraftSection`: timeline path (primary) and column path (fallback). Both `DraftTimeline.tsx` and `DraftColumn.tsx` render `DraftPortrait` independently. Prop threading must happen in both.
**How to avoid:** When modifying `DraftSection` to pass `heroStats` and `playerIntel` down, thread props into BOTH `DraftTimeline` AND `DraftColumn`. The MatchPage composition passes new hooks' data to `DraftSection`, which forwards to both children.

### Pitfall 7: `pro_pick === 0` division by zero for hero win_rate

**What goes wrong:** Server computes `pro_win / pro_pick` → `NaN` or `Infinity` for heroes never picked in pro play.
**Why it happens:** New or niche heroes may have `pro_pick: 0` in the heroStats array.
**How to avoid:** Guard in server transform: `if (h.pro_pick !== undefined && h.pro_pick > 0)`. Skip entries with zero picks — they simply won't appear in the returned map, and the badge strip won't render for those heroes (badge condition already requires `heroStats` to be defined for the hero).

---

## Code Examples

### Zod Schemas for New OpenDota Endpoints

```typescript
// Source: derived from existing LeagueSchema pattern [VERIFIED: server/src/schemas/openDota.ts]
// CRITICAL: .passthrough() — OpenDota adds fields without notice
// CRITICAL: all fields .optional() — avoid hard failures on partial responses

export const HeroStatsSchema = z.object({
  id: z.number().optional(),         // heroStats uses 'id', not 'hero_id'
  hero_id: z.number().optional(),    // defensive: accept either field name
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
  hero_id: z.number().optional(),        // counter hero ID
  hero_id2: z.number().optional(),       // defensive: accept older field name
  games_played: z.number().optional(),
  wins: z.number().optional(),
}).passthrough()
```

### Badge Strip Render Condition

```typescript
// Source: derived from UI-SPEC §Badge strip [VERIFIED: 05-UI-SPEC.md]
// Only renders on pick slots with heroId AND heroStats loaded
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

function winrateColor(winRate: number): string {
  if (winRate > 0.52) return '#4ade80'  // radiant green
  if (winRate < 0.48) return '#ef4444'  // dire red
  return '#888888'                       // neutral
}
```

### Counterpick Ranking Computation (server-side)

```typescript
// Source: derived from CONTEXT.md §Specific Ideas [VERIFIED: 05-CONTEXT.md]
function rankCounters(matchups: HeroMatchup[]): CounterHero[] {
  return matchups
    .filter(m => (m.games_played ?? 0) > 0)
    .map(m => ({
      heroId: m.hero_id ?? m.hero_id2 ?? 0,
      disadvantageScore: (m.wins ?? 0) / (m.games_played ?? 1),
    }))
    .sort((a, b) => b.disadvantageScore - a.disadvantageScore)
    .slice(0, 3)  // D-05: top-3 only
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| TanStack Query v4 `onSuccess` callback | v5: derive all state from `query.data` reactively | useDraftDetail already uses v5 pattern — follow exactly |
| TanStack Query v4 `cacheTime` | v5: renamed to `gcTime` | Not used in Phase 5 — but don't confuse the names |
| `refetchInterval` as plain number always | v5: function callback `(q) => q.state.data?.x` | useMatchIntel must use function form for dynamic cadence |
| Floating UI / Popper for tooltips | Hand-rolled `getBoundingClientRect` + `useLayoutEffect` | UI-SPEC decision — no external lib added in Phase 5 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenDota heroStats array items use field `id` (not `hero_id`) for the hero identifier | OpenDota API: Verified Field Names | Badge map keyed incorrectly → all badges missing; zod schema has `hero_id` defensive fallback to mitigate |
| A2 | OpenDota `/players/{id}/heroes` returns `hero_id` as a string (per Go SDK) | OpenDota API: Verified Field Names | Filter by `hero_id` fails type comparison → player stats always null; mitigated by `z.union([z.string(), z.number()])` schema |
| A3 | OpenDota `/heroes/{heroId}/matchups` field is `hero_id` (not `hero_id2`) | OpenDota API: Verified Field Names | Counter hero IDs parsed incorrectly → wrong portrait rendered; schema accepts both |
| A4 | OpenDota `/players/{id}/heroes` supports `?date=N` query param for windowing | Deferred (optional use) | Falls back to all-time stats — acceptable per CONTEXT.md §Deferred |
| A5 | OpenDota rate limit is 60 req/min for anonymous; BFF server-side caching stays well under this | Common Pitfalls | Quota exhaustion during high-traffic tournament session; mitigated by 6h and 15min TTLs |

---

## Open Questions (RESOLVED)

1. **`id` vs `hero_id` in heroStats response**
   - What we know: Go SDK uses `id` field; CONTEXT.md mentions `hero_id` in the description
   - What's unclear: Which field name does the live API actually return?
   - Recommendation: Wave 0 or Wave 1 task should log the first raw item from `/api/heroStats` and verify before building the transform. Zod schema accepts both fields defensively.
   - **RESOLVED:** Defensive dual-field zod schema accepts both `id` and `hero_id` — `HeroStatsSchema` has both fields as `.optional()`. Server transform uses `h.id ?? h.hero_id` to extract the hero identifier regardless of which field the API returns.

2. **`hero_id` type in player heroes (string vs. number)**
   - What we know: Go SDK declares `HeroID` as `string`; Valve and most OpenDota endpoints use `number`
   - What's unclear: Whether the live API returns a string-coerced number (e.g., `"1"`) or a number (`1`)
   - Recommendation: Use `z.union([z.string(), z.number()])` and coerce to number with `Number()` during transform.
   - **RESOLVED:** `PlayerHeroSchema` uses `z.union([z.string(), z.number()]).optional()` for `hero_id`. All comparisons use `Number(h.hero_id) === heroId` to coerce regardless of the returned type.

3. **Overflow clipping in DraftTimeline**
   - What we know: The portrait cell (48×48) has `overflow-hidden`. The tooltip is `position: absolute`.
   - What's unclear: Whether the tooltip should be rendered inside the portrait cell, in the column wrapper, or via a React Portal.
   - Recommendation: Render tooltip in the outer `relative flex flex-col items-center` div (the one that wraps step number, portrait, and team label). This has no `overflow-hidden` and is large enough. Avoids React Portal complexity for Phase 5.
   - **RESOLVED:** `IntelTooltip` is rendered as a sibling of the portrait `div` inside the outer `relative flex flex-col items-center` wrapper (which has no `overflow-hidden`), not inside the `w-12 h-12 overflow-hidden` portrait cell. No React Portal needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | BFF server | ✓ | v25.9.0 | — |
| npm | Package management | ✓ | 11.12.1 | — |
| OpenDota API | Hero stats, player history, matchups | External (not locally installed) | Public API | Cache keeps serving stale data for TTL duration on failure |
| Upstash Redis | `cached()` decorator | External (env var required) | — | `cached()` degrades gracefully without Redis (falls through to fn()) |

No new local dependencies. All external dependencies already integrated in prior phases.

---

## Validation Architecture

> `nyquist_validation: true` in `.planning/config.json`

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^2.0.0 |
| Config file | none — Vitest discovers tests via `vite.config.ts` (client) and `vitest` script (server) |
| Quick run command — client | `cd client && npm test -- --run` |
| Quick run command — server | `cd server && npm test -- --run` |
| Full suite command | `cd client && npm test -- --run && cd ../server && npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DRAFT-03 | `winrateColor(winRate)` returns correct color at thresholds (>0.52, <0.48, between) | unit | `cd client && npm test -- --run src/utils/winrateColor.test.ts` | ❌ Wave 0 |
| DRAFT-03 | heroStats map transform: `id` field → `{ win_rate, pick_rate }`, zero-pick guard | unit | `cd server && npm test -- --run src/services/openDotaApi.test.ts` | ❌ Wave 0 |
| DRAFT-04 | `rankCounters()`: sorts by disadvantage DESC, slices top-3, guards division-by-zero | unit | `cd server && npm test -- --run src/services/intel.test.ts` | ❌ Wave 0 |
| DRAFT-04 | `applyKnownToPlay()`: threshold `games >= 10 AND win/games > 0.5` applied correctly | unit | `cd server && npm test -- --run src/services/intel.test.ts` | ❌ Wave 0 |
| PLAYER-01 | `useMatchIntel` refetchInterval: 5000 when game_state=2, false otherwise | unit | `cd client && npm test -- --run src/hooks/useMatchIntel.test.ts` | ❌ Wave 0 |
| PLAYER-02 | `hiddenProfile(4294967295)` returns true; `hiddenProfile(12345)` returns false | unit | Already tested in shared tests from Phase 1 | ✓ (verify) |
| PLAYER-02 | Intel route skips OpenDota call for hidden profile player; returns null stats in payload | unit | `cd server && npm test -- --run src/services/intel.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd client && npm test -- --run` (client tests only, fast)
- **Per wave merge:** `cd client && npm test -- --run && cd ../server && npm test -- --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `client/src/utils/winrateColor.test.ts` — covers DRAFT-03 badge color logic
- [ ] `server/src/services/openDotaApi.test.ts` (extend) — covers heroStats transform, zero-pick guard
- [ ] `server/src/services/intel.test.ts` — covers rankCounters(), applyKnownToPlay(), hidden-profile skip
- [ ] `client/src/hooks/useMatchIntel.test.ts` — covers computeIntelInterval() pure helper (same pattern as computeDraftInterval)

**Note:** `hiddenProfile` tests from Phase 1 should be verified still green. No new framework installs required.

---

## Security Domain

> `security_enforcement` not set to `false` — section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in this phase or project (out of scope per REQUIREMENTS.md) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No user-specific access control |
| V5 Input Validation | yes | `matchId` path param validated via `Number() + Number.isFinite()` (pattern already established in `/api/live/draft/:matchId`) |
| V6 Cryptography | no | No crypto operations |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `matchId` path param injection (non-numeric) | Tampering | `Number.isFinite()` guard — return 400 (identical to existing draft route pattern) |
| Stack trace leak via unhandled exception | Information Disclosure | `catch { return c.json({ error: 'Upstream error' }, 502) }` — no details exposed (existing pattern) |
| OpenDota API key exposure in logs | Information Disclosure | No API key needed for OpenDota public endpoints — no key to protect. Log `status/statusText` only, never full URL. |
| Upstream response injection (malformed JSON) | Tampering | `.safeParse()` on all responses — invalid shape returns null, not thrown to client |
| DoS via per-user fan-out | Denial of Service | Cache key `intel:{matchId}` (not per-user) — N viewers = 1 upstream call per TTL per match |

---

## Sources

### Primary (HIGH confidence — verified in codebase)

- `server/src/services/openDotaApi.ts` — existing service function pattern (`getLeagueName`)
- `server/src/cache.ts` — `cached()` implementation, TTL constants (`TTL.HERO_STATS = 21600`, `TTL.PLAYER_STATS = 900`)
- `shared/hiddenProfile.ts` — `hiddenProfile(accountId)` function signature
- `client/src/components/DraftPortrait.tsx` — existing props, positioning context (`relative overflow-hidden`)
- `client/src/components/DraftTimeline.tsx` — overflow-hidden on 48×48 portrait cell (line 62)
- `client/src/hooks/useDraftDetail.ts` — `computeDraftInterval()` pattern, `Query<T>` callback form
- `server/src/schemas/openDota.ts` — LeagueSchema pattern (`.passthrough()`, all `.optional()`)
- `.planning/phases/05-hero-player-intel/05-UI-SPEC.md` — component props, positioning spec, copywriting
- `.planning/phases/05-hero-player-intel/05-CONTEXT.md` — all 13 locked decisions

### Secondary (MEDIUM confidence — verified via third-party SDK, not live API)

- `github.com/jasonodonnell/go-opendota` — `HeroMatchup`, `PlayerHero` struct field names
- TanStack Query v5 docs (tanstack.com/query/v5) — `staleTime: Infinity` behavior, `refetchInterval: false`
- React docs (react.dev/reference/react/useLayoutEffect) — `useLayoutEffect` fires before browser paint

### Tertiary (LOW confidence — search results only, needs verification)

- OpenDota rate limits: 50,000/month, 60/min for anonymous — from 2018 blog post; may have changed
- `pro_pick_rate` vs raw `pro_pick` count in heroStats — CONTEXT.md says "pickrate" but field is raw count; server must normalize

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new packages
- Architecture: HIGH — directly mirrors Phase 3/4 patterns verified in codebase
- OpenDota field names: MEDIUM — verified via Go SDK struct inspection, not a live API call
- Tooltip positioning: HIGH — `useLayoutEffect` + `getBoundingClientRect` is standard React pattern, documented by React team
- Pitfalls: HIGH — derived from direct codebase inspection of `DraftTimeline.tsx`, `DraftPortrait.tsx`, existing patterns

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (stable stack; OpenDota API field names may shift on major endpoint version change)
