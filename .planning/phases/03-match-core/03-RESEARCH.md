# Phase 3: Match Core - Research

**Researched:** 2026-04-24
**Domain:** React 19 + TanStack Query v5 + Tailwind 4 — match detail page, TQ cache-read pattern, bitmask rendering, conditional polling
**Confidence:** HIGH — all findings verified directly from project source files; no stale-training assumptions for project-specific claims

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Top-to-bottom section order: Back nav + match title → Score header → Hero/player grid → Buildings section.
- **D-02:** Gold difference shown as a number only (e.g. `+4,200`). No bar visualization.
- **D-03:** Delay disclosure is a subtle label near the score row (e.g. `~2min delay`). Not a banner.
- **D-04:** Page top has Back nav (← back to matches) + an H1 match title (`Team A vs Team B`).
- **D-05:** MATCH-02 and MATCH-05 are merged into one row per player: hero portrait | alive/dead + respawn countdown | K/D/A | net worth. No separate hero grid and player table.
- **D-06:** Dead hero indication: greyed-out portrait (`opacity: 0.3`) + respawn countdown number below the portrait. No red tint.
- **D-07:** Hidden-profile player (`account_id === 4294967295`): show Valve-provided name + hero portrait + match KDA. Never fetch or show OpenDota stats. Never crash.
- **D-08:** Also show per-player: hero level, GPM/XPM, last hits/denies. These fields arrive via `.passthrough()` — treat as optional (show only if present).
- **D-09:** Tower and barracks state rendered as schematic lane layout using `buildingDecoder()` output directly.
- **D-10:** When `buildingDecoder` returns `unavailable: true`, hide the buildings section entirely. No placeholder text.
- **D-11:** No new BFF route. Reuse `/api/live/games` filtered client-side. Implementation: `useQueryClient().getQueryData(['live-games'])`, trigger refetch if match not found.
- **D-12:** `refetchInterval: 30_000` (plain number) for Phase 3. Set to `false` when `game_state === 6`.
- **D-13:** Draft state (`game_state === 2`): show ScoreHeader with available data; 5 empty portrait slots per side — no crash.
- **D-14:** Post-game (`game_state === 6`): freeze last known stats; polling stops silently; StatusTag shows "Post-game".
- **D-15:** Match not in cache (direct URL nav): trigger fresh `/api/live/games` refetch. If still not found after fetch, redirect to home page.

### Claude's Discretion

- Loading state on the match page (skeleton rows vs minimal spinner) — stay consistent with the dark aesthetic.
- Exact color used for Radiant gold diff vs Dire gold diff — use established green/red spectrum within the dark palette.
- Column ordering within the player row (hero portrait, level, K/D/A, net worth, GPM, XPM, LH/DN) — prioritize K/D/A + net worth as the most-scanned columns.
- Whether GPM, XPM, last hits, denies are shown inline or as a secondary row per player.

### Deferred Ideas (OUT OF SCOPE)

- Spectator count (Phase 7 if useful)
- GPM/XPM sparkline / trend
- Roshan respawn timer (v2)
- Draft pick timer (Phase 4)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MATCH-01 | User can see team score (kills) per side and net-worth gold difference in real time | `radiant_score`, `dire_score` on `LiveGameSchema` (verified); net_worth sum-by-team from `players[]` array (verified in valve.ts); 30s refetch via TQ v5 `refetchInterval` pattern |
| MATCH-02 | User can see each hero's portrait with alive/dead status and respawn countdown timer | `hero_id` → `heroMapper()` → portrait URL (verified); `respawn_timer === 0` = alive, `> 0` = dead (verified in valve.ts comment); overlay `opacity: 0.3` pattern specified in UI-SPEC |
| MATCH-03 | User can see tower and barracks state per lane for both sides, decoded from `building_state`, with a graceful placeholder when the field is absent | `buildingDecoder(tower_state, barracks_state)` already built and tested (verified); `unavailable: true` when `tower_state` is `undefined` (verified); hide section when unavailable |
| MATCH-04 | User can see the current series score and a disclosure that data is delayed ~2 minutes | `radiant_series_wins`, `dire_series_wins`, `series_type` on `LiveGameSchema` (verified); `stream_delay_s` (verified, typically 120); delay label from `stream_delay_s` value, fall back to 120 |
| MATCH-05 | User can see per-player K/D/A and net worth for all ten players | `kills`, `death`, `assists`, `net_worth` on `PlayerSchema` (verified); `.passthrough()` carries level/gpm/xpm/lh/dn — treated as optional runtime fields |
</phase_requirements>

---

## Summary

Phase 3 replaces the `MatchPlaceholder` page at `/match/:matchId` with a fully functional in-game match screen. The phase is **pure client-side work**: no new BFF routes, no schema changes — all data is already present in `/api/live/games` as returned by the existing `LiveGameSchema` + `PlayerSchema` with `.passthrough()`.

The core data flow is: TanStack Query reads the existing `['live-games']` cache key via `useQueryClient().getQueryData()`, filters to the single match by `match_id`, and builds a derived `useMatchDetail` hook that handles the "not in cache" case (D-15), conditional `refetchInterval` (D-12), and post-game freeze (D-14). No new network routes are needed; the hook simply re-uses the same `fetchLiveGames` function that `useLiveGames` already calls, with the TQ cache acting as the single upstream source.

The UI is composed from five new components (`ScoreHeader`, `HeroPlayerGrid`, `PlayerRow`, `SkeletonPlayerRow`, `BuildingsSection`) plus one new page root (`MatchPage`). All existing Phase 2 shared utilities (`formatDuration`, `getStatusLabel`, `getSeriesLabel`, `StatusTag`, `SkeletonRow`) are reused without modification. The shared primitives from Phase 1 (`buildingDecoder`, `heroMapper`, `hiddenProfile`) are consumed directly by the new components.

**Primary recommendation:** Build wave-by-wave — Wave 0 creates test stubs for two new pure functions (`formatGoldDiff`, `selectMatchPlayers`), Wave 1 implements the `useMatchDetail` hook, Waves 2–3 build the UI components bottom-up (PlayerRow first, then HeroPlayerGrid and ScoreHeader, then BuildingsSection, then MatchPage assembly + router swap).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Match data fetch | Frontend Client (TQ hook) | — | Data already in BFF endpoint; hook reads TQ cache, triggers refetch on cache miss |
| Polling control (30s / stop on game_state=6) | Frontend Client (TQ hook) | — | `refetchInterval` computed from match state in the hook |
| Cache-miss redirect (D-15) | Frontend Client (hook + React Router) | — | `useNavigate()` redirect to `/` when match absent post-refetch |
| Gold diff calculation | Frontend Client (util function) | — | Sum `net_worth` per team from `players[]`; pure function, testable |
| Building state decode | Shared Primitive (already built) | Frontend Client | `buildingDecoder()` from `shared/` consumed in `BuildingsSection` |
| Hero portrait resolution | Shared Primitive (already built) | Frontend Client | `heroMapper()` from `shared/` consumed in `PlayerRow` |
| Hidden profile guard | Shared Primitive (already built) | Frontend Client | `hiddenProfile()` from `shared/` consumed in `PlayerRow` |
| Player team assignment | Frontend Client (filter utility) | — | Filter `players[]` by `team === 0` (Radiant) and `team === 1` (Dire) |
| Respawn state display | Frontend Client (PlayerRow component) | — | `respawn_timer > 0` = dead; static display of last-fetched value (no client countdown in Phase 3) |
| Building section visibility | Frontend Client (BuildingsSection component) | — | Render-gates on `buildingDecoder().unavailable` |

---

## Standard Stack

### Core (already installed — no new dependencies for Phase 3)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-query` | ^5.0.0 | Data fetching + cache | Already in use; `useQueryClient().getQueryData()` is the v5 cache-read API |
| `react-router` | ^7.0.0 | Navigation + `useParams`, `useNavigate` | Already in use; route `/match/:matchId` already registered in App.tsx |
| `tailwindcss` | ^4.1.0 | Styling | Already configured; `@theme` tokens already declared in `index.css` |
| `vitest` | ^2.0.0 | Unit testing | Already in use; test runner for Wave 0 stubs |

[VERIFIED: client/package.json, client/vite.config.ts — read directly from codebase]

**No new npm installs required for Phase 3.**

### Supporting (already in use)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | ^4.0.0 | Date formatting | Used in `useLiveGames` for `lastUpdatedLabel`; not needed in Phase 3 |
| `react-error-boundary` | ^4.0.0 | Error boundaries | Available but Phase 3 defers error boundaries to Phase 7 |

---

## Architecture Patterns

### System Architecture Diagram

```
URL: /match/:matchId
        │
        ▼
  MatchPage (React component)
  useParams() → matchId (string)
        │
        ▼
  useMatchDetail(matchId)
  ┌─────────────────────────────────────────────────────────┐
  │  1. useQueryClient().getQueryData(['live-games'])        │
  │     → match found? → use it (cache hit)                 │
  │     → match absent? → queryClient.fetchQuery(['live-games'])  │
  │                       → still absent? → useNavigate('/') │
  │  2. filter players by team (0=Radiant, 1=Dire)          │
  │  3. refetchInterval = game_state === 6 ? false : 30_000 │
  │  4. return { match, radiantPlayers, direPlayers,         │
  │              buildings, isLoading }                     │
  └─────────────────────────────────────────────────────────┘
        │
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  MatchPage Layout                                        │
  │  ├── Ambient glow (static radial-gradient)               │
  │  ├── Back nav (<Link to="/">)                            │
  │  ├── <h1> match title                                   │
  │  ├── <ScoreHeader>                                      │
  │  │     radiant_score, dire_score                        │
  │  │     Σnet_worth Radiant − Σnet_worth Dire             │
  │  │     series score + delay disclosure                  │
  │  ├── <HeroPlayerGrid>                                   │
  │  │     isLoading? → <SkeletonPlayerRow> × 10            │
  │  │     data?      → Radiant group + Dire group          │
  │  │                  each → <PlayerRow> × 5              │
  │  │                  draft? → empty portrait slots        │
  │  └── <BuildingsSection> (hidden if unavailable)         │
  │        buildingDecoder(tower_state, barracks_state)      │
  │        two-column lane schematic                         │
  └──────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
client/src/
├── hooks/
│   ├── useLiveGames.ts          # existing — no change
│   └── useMatchDetail.ts        # NEW — Phase 3
├── pages/
│   ├── HomePage.tsx             # existing — no change
│   └── MatchPage.tsx            # NEW — replaces MatchPlaceholder.tsx
├── components/
│   ├── SkeletonRow.tsx          # existing — no change
│   ├── StatusTag.tsx            # existing — no change (Post-game already mapped)
│   ├── ErrorBanner.tsx          # existing — no change
│   ├── LeagueAccordion.tsx      # existing — no change
│   ├── MatchRow.tsx             # existing — no change
│   ├── ScoreHeader.tsx          # NEW
│   ├── HeroPlayerGrid.tsx       # NEW
│   ├── PlayerRow.tsx            # NEW
│   ├── SkeletonPlayerRow.tsx    # NEW
│   └── BuildingsSection.tsx     # NEW
└── utils/
    ├── gameState.ts             # existing — no change
    ├── formatDuration.ts        # existing — no change
    └── formatGoldDiff.ts        # NEW — pure util, testable
```

Files changed outside `client/src/`:
- `client/src/App.tsx` — swap `MatchPlaceholder` import to `MatchPage`

**Note:** `MatchPlaceholder.tsx` is REPLACED (deleted or overwritten) by `MatchPage.tsx`. The existing Back nav and ambient glow HTML in `MatchPlaceholder` are the structural scaffold — copy verbatim, then remove the dev placeholder content.

[VERIFIED: App.tsx, MatchPlaceholder.tsx — read directly from codebase]

---

### Pattern 1: TanStack Query v5 Cache-Read + Refetch on Miss

**What:** The `useMatchDetail` hook reads from the existing `['live-games']` cache without triggering a separate network request on cache hit. On cache miss (direct URL navigation), it calls `queryClient.fetchQuery()` to ensure data is loaded, then redirects if the match is still absent.

**When to use:** When the match detail page data is a subset of already-fetched list data — avoids a redundant BFF call when navigating from the home page.

**Critical v5 API facts (verified from useLiveGames.ts):**
- `refetchInterval` is a **plain number** in v5 — NOT a callback function. Phase 4 upgrades this to a dynamic callback. [VERIFIED: useLiveGames.ts line 58 comment]
- `onSuccess` is **removed** in v5. Use `dataUpdatedAt` for last-fetch time. [VERIFIED: useLiveGames.ts lines 50-51 comments]
- `useQueryClient().getQueryData<T>(key)` returns `T | undefined` — always guard for `undefined`.

```typescript
// Source: pattern derived from client/src/hooks/useLiveGames.ts + CONTEXT.md D-11, D-12, D-15
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useEffect } from 'react'
import type { LiveGamesResponse } from './useLiveGames'
import { buildingDecoder } from '@shared/buildingDecoder'

export function useMatchDetail(matchId: string | undefined) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Step 1: read from existing cache
  const cached = queryClient.getQueryData<LiveGamesResponse>(['live-games'])
  const matchFromCache = cached?.games?.find((g) => String(g.match_id) === matchId)

  // Step 2: if not in cache, trigger a refetch of the list
  const query = useQuery<LiveGamesResponse>({
    queryKey: ['live-games'],
    queryFn: () => fetch('/api/live/games').then((r) => r.json()),
    // refetchInterval: stop polling when post-game (game_state === 6)
    refetchInterval: matchFromCache?.game_state === 6 ? false : 30_000,
    staleTime: 25_000,
    // enabled: always enabled so cache miss triggers a fetch
  })

  const match = query.data?.games?.find((g) => String(g.match_id) === matchId)

  // Step 3: redirect if still not found after fetch completes
  useEffect(() => {
    if (!query.isLoading && !match) {
      navigate('/')
    }
  }, [query.isLoading, match, navigate])

  const radiantPlayers = match?.players?.filter((p) => p.team === 0) ?? []
  const direPlayers = match?.players?.filter((p) => p.team === 1) ?? []
  const buildings = buildingDecoder(match?.tower_state, match?.barracks_state)

  return {
    match,
    radiantPlayers,
    direPlayers,
    buildings,
    isLoading: query.isLoading,
    gameState: match?.game_state,
  }
}
```

**Implementation note on D-11 vs D-15:** `getQueryData` does not trigger a fetch — it is a synchronous cache read. When it returns `undefined` (cache miss), `useQuery` will fetch because the cache is empty. The `useEffect` redirect fires only when `isLoading` has settled to `false` AND `match` is still `undefined`. This correctly handles: (a) cache hit → immediate render, (b) cache miss + fetch succeeds → render, (c) cache miss + fetch succeeds but match absent → redirect.

**Pitfall:** If you set `enabled: !!matchFromCache`, you prevent the refetch on cache miss (D-15 breaks). Keep `enabled` absent (defaults to `true`).

[VERIFIED: useLiveGames.ts, MatchPlaceholder.tsx — read directly; TQ v5 API pattern]

---

### Pattern 2: Optional `.passthrough()` Fields — level, gpm, xpm, lh, dn

**What:** These five fields are NOT declared in `PlayerSchema` — they arrive only via `.passthrough()`. The TypeScript inferred type from `z.infer<typeof PlayerSchema>` will type them as `unknown` (passthrough fields are untyped).

**Approach for Phase 3 (D-08):** Extend `PlayerSchema` to add these five fields as `z.number().optional()`. This gives full TypeScript safety without breaking `.passthrough()` behavior.

```typescript
// Source: server/src/schemas/valve.ts — extend PlayerSchema
const PlayerSchema = z
  .object({
    account_id: z.number().optional(),
    hero_id: z.number().optional(),
    name: z.string().optional(),
    team: z.number().int().optional(),
    kills: z.number().optional(),
    death: z.number().optional(),
    assists: z.number().optional(),
    net_worth: z.number().optional(),
    respawn_timer: z.number().optional(),
    // D-08: optional extended stats — present in-game, absent during draft
    level: z.number().optional(),
    gpm: z.number().optional(),
    xpm: z.number().optional(),
    lh: z.number().optional(),     // last hits
    dn: z.number().optional(),     // denies
  })
  .passthrough()
```

**Why not use runtime guards on `unknown`?** The alternative — casting to `unknown` and using `typeof val === 'number'` guards in the component — works but pollutes every call site. Declaring in schema once is cleaner and type-propagates automatically to `LiveGame` type consumers.

**Client-side type:** `EnrichedGame` in `useLiveGames.ts` defines only the fields used by the home page. Phase 3 needs the full player data. The `useMatchDetail` hook should consume the `LiveGame` type from `server/src/schemas/valve.ts` (or a shared equivalent) rather than `EnrichedGame`. **However**, since `EnrichedGame` only covers the home page list fields and `LiveGame` is a server-side type, Phase 3 should define a `MatchGame` interface in `useMatchDetail.ts` that extends the relevant fields, or export `LiveGame` type as a shared type.

**Simplest approach:** In `useMatchDetail.ts`, define a local `PlayerDetail` interface that matches the extended schema fields, and cast `match.players` via a type assertion after schema validation. The server validates and strips/adds nothing — `.passthrough()` guarantees all fields present in API response arrive in the parsed object.

[VERIFIED: server/src/schemas/valve.ts — read directly; passthrough behavior confirmed]

---

### Pattern 3: Gold Diff Calculation and Formatting

**What:** Gold diff = (sum of `net_worth` for all Radiant players) − (sum of `net_worth` for all Dire players). Format with the sign-and-comma pattern from D-02 / UI-SPEC.

**Copywriting contract (from UI-SPEC):**
- Radiant leading: `+{X,XXX}` in `color: #4ade80` (radiant)
- Dire leading: `−{X,XXX}` in `color: #ef4444` (dire) — **use minus sign `−` (U+2212), not hyphen `-`**
- Equal: `±0` in `color: #303030` (ink-3)

```typescript
// Source: derived from CONTEXT.md D-02, UI-SPEC copywriting contract
// client/src/utils/formatGoldDiff.ts

export type GoldDiffResult = {
  text: string
  color: '#4ade80' | '#ef4444' | '#303030'
}

export function formatGoldDiff(
  radiantPlayers: Array<{ net_worth?: number }>,
  direPlayers: Array<{ net_worth?: number }>,
): GoldDiffResult {
  const radiantNW = radiantPlayers.reduce((s, p) => s + (p.net_worth ?? 0), 0)
  const direNW = direPlayers.reduce((s, p) => s + (p.net_worth ?? 0), 0)
  const diff = radiantNW - direNW

  if (diff === 0) return { text: '±0', color: '#303030' }
  if (diff > 0) return { text: `+${diff.toLocaleString()}`, color: '#4ade80' }
  return { text: `−${Math.abs(diff).toLocaleString()}`, color: '#ef4444' }
}
```

**Testable:** This is a pure function — ideal for Wave 0 test stubs.

[VERIFIED: server/src/schemas/valve.ts `net_worth` on PlayerSchema; UI-SPEC gold diff color rule]

---

### Pattern 4: Respawn Timer and Alive/Dead State

**What:** `respawn_timer === 0` means alive; `respawn_timer > 0` means dead with that many seconds remaining. The field can be `undefined` during draft.

```typescript
// Source: CONTEXT.md §Specifics, valve.ts PlayerSchema comment
const isDead = (respawnTimer: number | undefined): boolean =>
  respawnTimer !== undefined && respawnTimer > 0
```

**Dead state display (D-06, UI-SPEC):**
- Portrait `<img>` opacity: `0.3` (inline `style={{ opacity: 0.3 }}`)
- Respawn countdown: `<span>{respawnTimer}s</span>` below portrait, `color: #585858`, `text-[10px]`
- All stat columns remain visible when dead (data is still valid)
- Phase 3: static display of last-fetched `respawn_timer` value — no client-side countdown

[VERIFIED: valve.ts PlayerSchema `respawn_timer` comment; CONTEXT.md §Specifics]

---

### Pattern 5: Draft State Empty Slots (D-13)

**What:** During `game_state === 2`, players array may have entries with no `hero_id` and no stats. Render gracefully.

```typescript
// Source: UI-SPEC draft state spec
// PlayerRow: draft slot when hero_id is undefined
const heroInfo = player.hero_id !== undefined ? heroMapper(player.hero_id) : null
const isDraftSlot = heroInfo === null && player.hero_id === undefined

// Portrait: 48x48 gray box when isDraftSlot
// All stats: '—' (em dash) when draft slot
```

**Note:** `heroMapper` also returns `null` for unknown IDs (not just undefined `hero_id`). The draft-slot check must be `hero_id === undefined`, not `heroMapper() === null`, to distinguish "not yet picked" from "unknown hero ID".

[VERIFIED: shared/heroMapper.ts — returns `null` for unknown IDs; CONTEXT.md D-13]

---

### Pattern 6: BuildingsSection — Direct `buildingDecoder()` Usage

**What:** `buildingDecoder(tower_state, barracks_state)` returns `BuildingState` with `{ radiant, dire, unavailable }`. When `unavailable: true`, hide the section. When `unavailable: false`, render the lane schematic.

**Confirmed `LaneBuildings` interface (verified from source):**
```typescript
// Source: shared/buildingDecoder.ts
interface LaneBuildings {
  tier1: boolean    // T1 tower
  tier2: boolean    // T2 tower
  tier3: boolean    // T3 tower
  meleeRax: boolean // melee barracks
  rangedRax: boolean // ranged barracks
}
```

**UI-SPEC building dot layout (per lane, left-to-right Radiant / mirrored Dire):**
- T1, T2, T3, meleeRax, rangedRax → 5 dots per lane per team
- Standing: `background: #4ade80` (radiant) or `#ef4444` (dire), `opacity: 1`
- Destroyed: `background: #303030`, `opacity: 0.25`
- Dot size: 8px × 8px (`w-2 h-2 rounded-full`)

**Render order for Radiant (left column):** T1 → T2 → T3 → meleeRax → rangedRax (nearest to base on right)
**Render order for Dire (right column, mirrored):** rangedRax → meleeRax → T3 → T2 → T1 (nearest to base on left)

[VERIFIED: shared/buildingDecoder.ts — read directly]

---

### Pattern 7: StatusTag Reuse for Post-game

**What:** `StatusTag` already handles `'Post-game'` with the style `{ dot: '#303030', text: '#484848' }`. No new variant needed.

```typescript
// Source: client/src/components/StatusTag.tsx — verified
// 'Post-game' maps to: { dot: '#303030', text: '#484848' }
// 'Unknown' maps to: { dot: '#252525', text: '#383838' }
```

The UI-SPEC notes that "Post-game" maps to the existing "Post-game" slot (already declared) — no code change to `StatusTag.tsx` required.

[VERIFIED: StatusTag.tsx — read directly]

---

### Pattern 8: SkeletonPlayerRow (extends SkeletonRow pattern)

**What:** Three shimmer bars per row matching the UI-SPEC: portrait area (48px wide), name area (flex-1), stats cluster (fixed width right). Same `skshimmer` keyframe animation as `SkeletonRow`.

**Important:** `SkeletonRow` defines `@keyframes skshimmer` inside a `<style>` tag. To avoid duplicate injection in `SkeletonPlayerRow`, either:
- (a) Move the keyframe definition to `index.css` (preferred — single source)
- (b) Keep it co-located in `SkeletonPlayerRow.tsx` (acceptable since it's the only new skeleton)

The existing `SkeletonRow` uses `<style>` with inline keyframes — Phase 3 should follow the same pattern for consistency.

[VERIFIED: SkeletonRow.tsx — read directly]

---

### Pattern 9: Series Score Formatting

**What:** Combine `radiant_series_wins`, `dire_series_wins`, `series_type` into a display string. Existing `getSeriesLabel()` utility covers the Bo1/Bo3/Bo5 part.

```typescript
// Source: gameState.ts getSeriesLabel() + UI-SPEC copywriting contract
// Format: "{radiantWins}–{direWins} · {Bo3/Bo5/Bo1}"
// e.g. "1–0 · Bo3"
function formatSeriesScore(
  radiantWins: number | undefined,
  direWins: number | undefined,
  seriesType: number | undefined,
): string {
  const r = radiantWins ?? 0
  const d = direWins ?? 0
  const label = getSeriesLabel(seriesType)
  if (!label) return `${r}–${d}`
  return `${r}–${d} · ${label}`
}
```

[VERIFIED: gameState.ts exports `getSeriesLabel`; valve.ts has `radiant_series_wins`, `dire_series_wins`, `series_type`]

---

### Anti-Patterns to Avoid

- **Setting `enabled: !!matchFromCache` in `useQuery`:** This prevents the refetch-on-cache-miss behavior required by D-15. Keep `enabled` unset (default `true`).
- **Using `onSuccess` callback:** Removed in TanStack Query v5. Use derived state from `query.data` instead. [VERIFIED: useLiveGames.ts v5 comment]
- **Passing `refetchInterval` as a function in Phase 3:** v5 allows functions for `refetchInterval`, but Phase 3 uses a plain number only. Phase 4 upgrades to dynamic. [VERIFIED: useLiveGames.ts v5 comment]
- **Checking `building_state` instead of `tower_state`:** The schema has BOTH `tower_state` and `building_state` (alternate field name). `buildingDecoder` expects `tower_state`. Always pass `match?.tower_state` to `buildingDecoder`, not `match?.building_state`. [VERIFIED: valve.ts comment — "alternate field name in some API versions"]
- **Rendering `towerState === 0` as "unavailable":** Zero means ALL towers destroyed, NOT absent data. Only `undefined` means unavailable. [VERIFIED: buildingDecoder.ts CRITICAL comment]
- **Computing gold diff from `radiant_score`/`dire_score`:** Those are KILL scores, not gold. Gold diff must be computed from `players[].net_worth`. [VERIFIED: valve.ts schema field names]
- **Using `p.deaths` instead of `p.death`:** The field is `death` (singular) in `PlayerSchema`, not `deaths`. [VERIFIED: valve.ts PlayerSchema]
- **Using hyphen `-` for Dire gold diff:** UI-SPEC specifies the Unicode minus sign `−` (U+2212). [VERIFIED: UI-SPEC copywriting contract]
- **Showing a "match not found" error page:** D-15 specifies a silent redirect to `/`. No error page.
- **Rendering player rows for `team === 2` (Broadcaster) or `team === 4` (Unassigned):** Filter strictly to `team === 0` and `team === 1`. [VERIFIED: valve.ts PlayerSchema team comment]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Building bitmask decode | Custom bit-parse logic | `buildingDecoder()` from `@shared/buildingDecoder` | Already built, tested, handles edge cases (towerState=0, absent barracksState) |
| Hero portrait URL | CDN URL construction | `heroMapper()` from `@shared/heroMapper` | Handles unknown IDs gracefully, returns null |
| Hidden profile detection | `accountId === 4294967295` inline | `hiddenProfile()` from `@shared/hiddenProfile` | Semantic intent, single source of truth |
| Duration formatting | Custom MM:SS formatter | `formatDuration()` from `client/src/utils/formatDuration.ts` | Already built and tested |
| Status label mapping | `gameState === 5 ? 'Live' : ...` inline | `getStatusLabel()` from `client/src/utils/gameState.ts` | Already built and tested |
| Series format label | Inline ternary | `getSeriesLabel()` from `client/src/utils/gameState.ts` | Already built and tested |
| Skeleton animation keyframe | New CSS animation | Reuse `skshimmer` pattern from `SkeletonRow.tsx` | Animation already established; duplicate keyframes cause no runtime error but add bytes |

**Key insight:** Phase 1 and Phase 2 pre-built every utility needed for Phase 3. This phase is purely composition — assembling existing primitives into new UI components. No algorithm invention required.

---

## Common Pitfalls

### Pitfall 1: `building_state` vs `tower_state` Field Name Confusion

**What goes wrong:** Developer passes `match?.building_state` to `buildingDecoder()` instead of `match?.tower_state`. Result: buildings section always shows `unavailable: true` because `building_state` is a different (alternate) field.

**Why it happens:** `LiveGameSchema` has BOTH `tower_state` and `building_state` as optional fields with a comment "alternate field name in some API versions". Easy to use the wrong one.

**How to avoid:** Always call `buildingDecoder(match?.tower_state, match?.barracks_state)`. The decoder signature makes `towerState` the first parameter.

**Warning signs:** BuildingsSection never renders even when match data is clearly in-game.

[VERIFIED: valve.ts — both fields present; buildingDecoder.ts — first parameter is towerState]

---

### Pitfall 2: Polling Continues After `game_state === 6`

**What goes wrong:** `refetchInterval` stays at `30_000` after game ends. Every 30s, a fetch hits `/api/live/games`, which hits Valve upstream (or Redis cache). Finished matches drain quota.

**Why it happens:** `refetchInterval` is set once at hook creation; it must be dynamically computed from current match state.

**How to avoid:** In `useQuery`, compute `refetchInterval` from the current match's `game_state`:
```typescript
refetchInterval: match?.game_state === 6 ? false : 30_000,
```

**Warning sign:** Network tab shows periodic fetches after game ends.

[VERIFIED: CONTEXT.md D-12; CLAUDE.md Critical Pitfalls — "Polling must stop on game_state === 6"]

---

### Pitfall 3: Cache Miss Redirect Fires Before Fetch Completes

**What goes wrong:** The `useEffect` redirect fires immediately on mount when cache is empty — before the `useQuery` fetch can complete. User gets redirected to home instead of waiting for the data.

**Why it happens:** On first render, `query.isLoading` may be `false` briefly before the query is recognized as loading (depends on TQ timing), or the `useEffect` runs before the query initiates.

**How to avoid:** Gate the redirect on both `!query.isLoading` AND `query.isFetched` being `true`:
```typescript
useEffect(() => {
  if (!query.isLoading && query.isFetched && !match) {
    navigate('/')
  }
}, [query.isLoading, query.isFetched, match, navigate])
```

`isFetched` is `true` only after the first successful or failed fetch attempt. This ensures the redirect only happens after the network call completes.

[ASSUMED — TQ v5 internal timing; based on TQ v5 query state machine knowledge]

---

### Pitfall 4: `EnrichedGame` Type Does Not Include Player Data

**What goes wrong:** `useLiveGames` returns `EnrichedGame[]`, which only has home-page list fields — no `players`, `tower_state`, `radiant_score`, etc.

**Why it happens:** `EnrichedGame` is intentionally minimal for the home page list.

**How to avoid:** `useMatchDetail` must use `LiveGamesResponse` (the full response) and access `game.players`, NOT go through the `EnrichedGame` interface. The BFF endpoint `/api/live/games` returns the full enriched game including all player data — `EnrichedGame` is just a TypeScript interface that doesn't capture all fields.

**Pattern:** Define a `MatchDetail` interface in `useMatchDetail.ts` with the fields Phase 3 needs, and cast from the raw response. Or import and extend the server-side `LiveGame` type if a shared type export is added.

[VERIFIED: useLiveGames.ts `EnrichedGame` interface — only 7 fields; valve.ts `LiveGameSchema` has far more]

---

### Pitfall 5: `death` vs `deaths` Field Name

**What goes wrong:** Rendering `player.deaths` in JSX — this is `undefined` because the Valve field is `death` (singular).

**How to avoid:** Always use `player.death` when reading the kill count. The UI-SPEC shows `K / D / A` format — the D is `player.death`.

[VERIFIED: valve.ts PlayerSchema — field named `death`, not `deaths`]

---

### Pitfall 6: Column-Level Hiding for Optional Stats (GPM/XPM/LH/DN)

**What goes wrong:** Hiding GPM column for one player but showing for another causes misaligned column headers.

**How to avoid:** Per UI-SPEC: "If a field is absent, hide that column for ALL rows in that match (not row-by-row). Detect at grid level before rendering headers." Check at `HeroPlayerGrid` level whether any player has `gpm` defined — if yes, show GPM column for all rows; if no, omit column and header.

```typescript
// In HeroPlayerGrid: detect once, pass as prop to PlayerRow
const hasGpm = [...radiantPlayers, ...direPlayers].some(
  (p) => (p as any).gpm !== undefined
)
```

[VERIFIED: UI-SPEC — "GPM/XPM/LH/DN optional display rule" section]

---

## Code Examples

### Complete `formatGoldDiff` Utility (Wave 0 testable)

```typescript
// Source: derived from CONTEXT.md D-02, UI-SPEC copywriting contract
// client/src/utils/formatGoldDiff.ts

export type GoldDiffResult = {
  text: string
  color: '#4ade80' | '#ef4444' | '#303030'
}

export function formatGoldDiff(radiantNW: number, direNW: number): GoldDiffResult {
  const diff = radiantNW - direNW
  if (diff === 0) return { text: '±0', color: '#303030' }    // ±0
  if (diff > 0) return { text: `+${diff.toLocaleString()}`, color: '#4ade80' }
  return { text: `−${Math.abs(diff).toLocaleString()}`, color: '#ef4444' } // −X,XXX
}
```

### App.tsx Router Swap (minimal change)

```typescript
// Source: client/src/App.tsx — swap import only
import MatchPage from './pages/MatchPage'  // was: MatchPlaceholder

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/match/:matchId" element={<MatchPage />} />
    </Routes>
  )
}
```

### BuildingsSection Lane Render

```typescript
// Source: derived from shared/buildingDecoder.ts LaneBuildings + UI-SPEC BuildingsSection spec
// Rendering one team's lane buildings
const LANES: Array<'top' | 'mid' | 'bot'> = ['top', 'mid', 'bot']
const RADIANT_BUILDING_ORDER: Array<keyof LaneBuildings> = [
  'tier1', 'tier2', 'tier3', 'meleeRax', 'rangedRax'
]
const DIRE_BUILDING_ORDER: Array<keyof LaneBuildings> = [
  'rangedRax', 'meleeRax', 'tier3', 'tier2', 'tier1'
]

function BuildingDot({ standing, team }: { standing: boolean; team: 'radiant' | 'dire' }) {
  const standingColor = team === 'radiant' ? '#4ade80' : '#ef4444'
  return (
    <span
      className="w-2 h-2 rounded-full"
      style={{
        background: standing ? standingColor : '#303030',
        opacity: standing ? 1 : 0.25,
      }}
    />
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TQ v4 `onSuccess` callback | No callback — use `query.data` reactively | TQ v5 | `onSuccess` removed; all side effects from data changes must go in `useEffect` or derived state |
| TQ v4 `refetchInterval: (data) => ...` function | TQ v5 still supports function; Phase 3 uses plain number | TQ v5 | Phase 4 will use function form for dynamic 5s/30s/false switching |
| CSS `filter: grayscale(1)` for dead heroes | `opacity: 0.3` (D-06) | Phase 3 decision | Simpler, no CSS filter performance cost, monochromatic aesthetic |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `query.isFetched` distinguishes "never fetched" from "fetch complete, match absent" in TQ v5 redirect logic | Pitfall 3 | Redirect fires prematurely or never; test manually on direct URL navigation |
| A2 | `toLocaleString()` formats numbers with commas in the browser locale (en-US) | Pattern 3 (formatGoldDiff) | Numbers may format differently in non-en locales; use explicit `Intl.NumberFormat` if needed |

**Previously assumed A3** (BFF full player data): VERIFIED — `server/src/routes/live.ts` uses `...g` spread which includes all Valve fields: `players`, `tower_state`, `barracks_state`, `radiant_score`, `dire_score`, etc. Full match data reaches the client. No new BFF route needed.

---

## Known Blockers

### BLOCKER: `heroMapper.ts` Cannot Be Bundled by Vite for Browser Clients

**Verified by:** Reading `shared/heroMapper.ts`, `shared/tsconfig.json`, `client/vite.config.ts`, `client/tsconfig.json`.

**Root cause:** `shared/heroMapper.ts` uses `createRequire` from Node.js's `module` built-in to load `heroes.json`. `createRequire` is a Node.js API — it does not exist in browser environments. `shared/tsconfig.json` uses `"module": "NodeNext"` confirming it is designed for server-side consumption. When Vite follows the `@shared/heroMapper` alias and tries to bundle this file for the browser, it will fail at runtime (or build time if Vite Node compat is not enabled).

**Evidence:**
- `shared/heroMapper.ts` line 1: `import { createRequire } from 'module'`
- `shared/heroMapper.ts` line 9: `const require = createRequire(import.meta.url)`
- `shared/tsconfig.json`: `"module": "NodeNext"`
- `client/tsconfig.json`: `"lib": ["ES2022", "DOM", "DOM.Iterable"]` — browser-only libs, no Node built-ins

**Prescribed solution for Wave 0:** Create a browser-compatible heroMapper in the client. Two options:

**Option A (recommended — Vite native JSON import):** Create `client/src/utils/heroMapper.ts` that imports `heroes.json` via Vite's native JSON import support:

```typescript
// client/src/utils/heroMapper.ts
import heroes from '../../shared/heroes.json'

export interface HeroInfo {
  name: string
  portrait: string
}

export function heroMapper(id: number): HeroInfo | null {
  return (heroes as Record<string, HeroInfo>)[String(id)] ?? null
}
```

Vite bundles JSON files natively — no `createRequire` needed. The `heroes.json` is accessed via relative path or via `@shared` alias if Vite resolves JSON correctly through it.

**Option B (alternative):** Extend the BFF to include `hero_name` and `hero_portrait` in the enriched game response. Server-side Node.js can use `shared/heroMapper.ts` without issue. Downside: increases BFF response payload, harder to cache per-hero.

**Recommendation:** Option A. It is zero-overhead (JSON is imported statically), keeps hero data client-side without server changes, and the client function is a drop-in replacement with the same signature.

**Wave 0 task:** Create `client/src/utils/heroMapper.ts` with Option A. In all client components, import from `../utils/heroMapper` — NEVER from `@shared/heroMapper`.

[VERIFIED: shared/heroMapper.ts, shared/tsconfig.json, client/tsconfig.json, client/vite.config.ts — read directly]

---

## Open Questions

All open questions resolved during research.

1. **Full player data in BFF response?** — RESOLVED: `server/src/routes/live.ts` confirmed to use `...g` spread on every game object, including all Valve API fields. Full `players`, `tower_state`, `barracks_state`, `radiant_score`, `dire_score` etc. reach the client. [VERIFIED: server/src/routes/live.ts]

2. **`heroMapper.ts` client bundling?** — RESOLVED as a KNOWN BLOCKER. See "Known Blockers" section above. Prescribed fix: create `client/src/utils/heroMapper.ts` using Vite's native JSON import instead of `createRequire`. [VERIFIED: shared/heroMapper.ts, shared/tsconfig.json]

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — Phase 3 is purely client-side code using already-running dev server and existing BFF. No new services, CLIs, or runtimes required.)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^2.0.0 |
| Config file | none separate — Vitest resolves via `vite.config.ts` |
| Quick run command | `cd client && npx vitest run` |
| Full suite command | `cd client && npx vitest run` |

[VERIFIED: client/package.json `"test": "vitest"`; no separate vitest.config.ts found]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MATCH-01 (gold diff) | `formatGoldDiff(radiantNW, direNW)` formats correctly for Radiant lead / Dire lead / equal | unit | `cd client && npx vitest run src/utils/formatGoldDiff.test.ts` | ❌ Wave 0 |
| MATCH-01 (score display) | ScoreHeader renders kill scores from match data | visual / manual | — | manual |
| MATCH-02 (alive state) | `respawn_timer === 0` → no overlay; `> 0` → opacity 0.3 + countdown | visual / manual | — | manual |
| MATCH-03 (buildings) | `buildingDecoder()` tests already cover bitmask logic | unit | `cd shared && npx vitest run buildingDecoder.test.ts` | ✅ shared/buildingDecoder.test.ts |
| MATCH-03 (section hidden) | When `unavailable: true`, BuildingsSection not rendered | visual / manual | — | manual |
| MATCH-04 (series + delay) | Series score formats as `{r}–{d} · {Bo3}` | unit | `cd client && npx vitest run src/utils/gameState.test.ts` | ✅ (getSeriesLabel covered) |
| MATCH-04 (delay label) | `stream_delay_s` used in label; falls back to 120 | visual / manual | — | manual |
| MATCH-05 (player data) | PlayerRow renders K/D/A and net worth for all 10 players | visual / manual | — | manual |
| D-15 (redirect) | Match absent after refetch → navigate('/') | integration / manual | — | manual |

### Sampling Rate

- **Per task commit:** `cd client && npx vitest run`
- **Per wave merge:** `cd client && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `client/src/utils/heroMapper.ts` — browser-compatible heroMapper using Vite JSON import (BLOCKER — required before any hero portrait rendering in Wave 2+)
- [ ] `client/src/utils/formatGoldDiff.ts` + `client/src/utils/formatGoldDiff.test.ts` — covers MATCH-01 gold diff formatting (Radiant lead, Dire lead, equal, zero)
- [ ] `client/src/hooks/useMatchDetail.ts` stub — empty hook that TypeScript-compiles cleanly
- [ ] All new component files as empty stubs (`ScoreHeader.tsx`, `HeroPlayerGrid.tsx`, `PlayerRow.tsx`, `SkeletonPlayerRow.tsx`, `BuildingsSection.tsx`, `MatchPage.tsx`) — prevents TypeScript compilation errors when `App.tsx` is updated in Wave 0

---

## Security Domain

> `security_enforcement` not set to false in config.json — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in scope (REQUIREMENTS.md Out of Scope) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | Public read-only tool |
| V5 Input Validation | yes (low risk) | `matchId` from URL params used only as a string comparison (`String(g.match_id) === matchId`) — no SQL, no eval, no server-side use in Phase 3 |
| V6 Cryptography | no | No crypto in Phase 3 |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| URL param injection | Tampering | `matchId` is compared as string to `match_id.toString()` — no server-side use in Phase 3, no XSS vector |
| XSS via team name | Tampering | React renders all string values as text nodes by default — no `dangerouslySetInnerHTML` used |
| Prototype pollution via `JSON.parse` | Tampering | Zod `.passthrough()` parses Valve API response — passthrough fields are on the object directly, not on prototype |

Phase 3 has minimal security surface — purely display-layer, no user input processed.

---

## Sources

### Primary (HIGH confidence — verified from project source files)

- `client/src/hooks/useLiveGames.ts` — TQ v5 pattern, `refetchInterval` plain number, `onSuccess` removed, cache key `['live-games']`
- `shared/buildingDecoder.ts` — `BuildingState` interface, `LaneBuildings` fields, `unavailable: true` semantics
- `shared/heroMapper.ts` — return type `HeroInfo | null`; `createRequire` usage verified as Node.js-only (see Known Blockers)
- `shared/tsconfig.json` — `"module": "NodeNext"` confirms shared/ is designed for Node.js; client must use browser-safe workaround
- `shared/hiddenProfile.ts` — sentinel `4294967295`
- `shared/index.ts` — export paths for `@shared/` imports
- `server/src/routes/live.ts` — `...g` spread confirms all Valve fields (players, tower_state, etc.) pass through to client; no stripping
- `server/src/schemas/valve.ts` — `PlayerSchema` fields, `LiveGameSchema` fields, `.passthrough()` usage
- `client/src/pages/MatchPlaceholder.tsx` — scaffold HTML, Back nav, ambient glow, `getQueryData` usage
- `client/src/App.tsx` — route registration for `/match/:matchId`
- `client/src/utils/gameState.ts` — `getStatusLabel`, `getSeriesLabel` return types
- `client/src/utils/formatDuration.ts` — `formatDuration(seconds)` signature
- `client/src/components/StatusTag.tsx` — `Status` type, `styleMap`, Post-game already mapped
- `client/src/components/SkeletonRow.tsx` — `skshimmer` keyframe, shimmer gradient colors
- `client/src/index.css` — all `@theme` color tokens, `Oswald` font family on body
- `client/package.json` — exact dependency versions
- `.planning/phases/03-match-core/03-CONTEXT.md` — all 15 decisions (D-01..D-15)
- `.planning/phases/03-match-core/03-UI-SPEC.md` — component specs, color rules, typography, copywriting contract

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — MATCH-01..MATCH-05 acceptance criteria
- `.planning/ROADMAP.md` — Phase 3 success criteria

### Tertiary (LOW confidence — ASSUMED)

- TQ v5 `isFetched` flag behavior for redirect timing (A1) — not directly tested in codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in package.json
- Architecture patterns: HIGH — verified from source files; patterns derived directly from existing code
- Building decoder interface: HIGH — read directly from shared/buildingDecoder.ts
- BFF full data pass-through: HIGH — verified from server/src/routes/live.ts (`...g` spread)
- heroMapper browser compat: HIGH (verified as Node.js only) — Known Blockers section prescribes fix (Wave 0 task)
- Pitfalls: HIGH (most verified from source) / MEDIUM (Pitfall 3 timing — A1 assumption)

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (stable stack — TQ v5, Tailwind 4, React 19 are not in rapid flux)
