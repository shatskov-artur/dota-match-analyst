# Phase 3: Match Core - Pattern Map

**Mapped:** 2026-04-24
**Files analyzed:** 11 (8 new, 3 modified)
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `client/src/utils/heroMapper.ts` | utility | transform | `shared/heroMapper.ts` | exact (browser-safe rewrite) |
| `client/src/utils/formatGoldDiff.ts` | utility | transform | `client/src/utils/formatDuration.ts` | role-match |
| `client/src/hooks/useMatchDetail.ts` | hook | request-response | `client/src/hooks/useLiveGames.ts` | exact |
| `client/src/pages/MatchPage.tsx` | page | request-response | `client/src/pages/MatchPlaceholder.tsx` | exact (replaces) |
| `client/src/components/ScoreHeader.tsx` | component | request-response | `client/src/components/MatchRow.tsx` | role-match |
| `client/src/components/HeroPlayerGrid.tsx` | component | request-response | `client/src/pages/HomePage.tsx` | role-match |
| `client/src/components/PlayerRow.tsx` | component | request-response | `client/src/components/MatchRow.tsx` | exact |
| `client/src/components/SkeletonPlayerRow.tsx` | component | request-response | `client/src/components/SkeletonRow.tsx` | exact |
| `client/src/components/BuildingsSection.tsx` | component | transform | `client/src/components/ErrorBanner.tsx` | partial |
| `server/src/schemas/valve.ts` | schema | — | self (extend PlayerSchema) | exact |
| `client/src/App.tsx` | config/router | — | self (swap import) | exact |

---

## Pattern Assignments

### `client/src/utils/heroMapper.ts` (utility, transform)

**Analog:** `shared/heroMapper.ts`

**Reason for new file:** The shared version uses `createRequire` from Node.js `module` built-in (line 1: `import { createRequire } from 'module'`; line 9: `const require = createRequire(import.meta.url)`). Vite cannot bundle this for the browser. The client needs a parallel file that uses Vite's native JSON import instead.

**Imports pattern** (from `shared/heroMapper.ts` lines 1-10, adapted):
```typescript
// client/src/utils/heroMapper.ts
// DO NOT import from @shared/heroMapper — it uses createRequire (Node.js only)
import heroes from '../../../shared/heroes.json'

export interface HeroInfo {
  name: string
  portrait: string
}
```

**Core pattern** (from `shared/heroMapper.ts` lines 17-19, adapted):
```typescript
export function heroMapper(id: number): HeroInfo | null {
  return (heroes as Record<string, HeroInfo>)[String(id)] ?? null
}
```

**Usage in components:** Always import from `'../utils/heroMapper'` (relative), never from `'@shared/heroMapper'`.

---

### `client/src/utils/formatGoldDiff.ts` (utility, transform)

**Analog:** `client/src/utils/formatDuration.ts`

**Imports pattern** (from `formatDuration.ts` — no imports, pure function file):
```typescript
// client/src/utils/formatGoldDiff.ts
// No imports — pure functions only, exportable for unit tests
```

**Core pattern** (modeled on `formatDuration.ts` lines 9-13 — pure exported function with JSDoc):
```typescript
export type GoldDiffResult = {
  text: string
  color: '#4ade80' | '#ef4444' | '#303030'
}

/**
 * Computes and formats net-worth gold difference for display.
 * Radiant leading → '+X,XXX' in #4ade80 (radiant).
 * Dire leading    → '−X,XXX' in #ef4444 (dire). Note: Unicode minus U+2212, NOT hyphen.
 * Equal           → '±0' in #303030 (ink-3).
 */
export function formatGoldDiff(radiantNW: number, direNW: number): GoldDiffResult {
  const diff = radiantNW - direNW
  if (diff === 0) return { text: '±0', color: '#303030' }
  if (diff > 0) return { text: `+${diff.toLocaleString()}`, color: '#4ade80' }
  return { text: `−${Math.abs(diff).toLocaleString()}`, color: '#ef4444' }
}
```

**Test file pattern** (copy structure from existing test files in `client/src/utils/`):
The test must cover: Radiant leading, Dire leading, equal (zero), and large numbers with commas.

---

### `client/src/hooks/useMatchDetail.ts` (hook, request-response)

**Analog:** `client/src/hooks/useLiveGames.ts`

**Imports pattern** (from `useLiveGames.ts` lines 1-3, extended):
```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { buildingDecoder } from '@shared/buildingDecoder'
import type { LiveGamesResponse } from './useLiveGames'
import type { LiveGame } from '../../server/src/schemas/valve'  // or define MatchGame locally
```

**Core TQ v5 hook pattern** (from `useLiveGames.ts` lines 54-72 — the `useQuery` call and return shape):
```typescript
// CRITICAL (v5): refetchInterval is plain number — NOT a callback. Phase 4 upgrades to dynamic.
// CRITICAL (v5): onSuccess removed — derive state from query.data reactively.
// CRITICAL: Keep enabled unset (default true) — setting enabled:!!matchFromCache breaks D-15 cache-miss refetch.

export function useMatchDetail(matchId: string | undefined) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Synchronous cache read — does NOT trigger a fetch (TQ v5: getQueryData is read-only)
  const cached = queryClient.getQueryData<LiveGamesResponse>(['live-games'])
  const matchFromCache = cached?.games?.find((g) => String(g.match_id) === matchId)

  // useQuery uses the SAME queryKey ['live-games'] as useLiveGames — shares the cache
  const query = useQuery<LiveGamesResponse>({
    queryKey: ['live-games'],
    queryFn: () => fetch('/api/live/games').then((r) => r.json()),
    refetchInterval: matchFromCache?.game_state === 6 ? false : 30_000,
    staleTime: 25_000, // matches useLiveGames — avoids redundant refetch on navigation
  })

  const match = query.data?.games?.find((g) => String(g.match_id) === matchId)

  // Redirect only after fetch completes AND match still absent (isFetched guards premature redirect)
  useEffect(() => {
    if (!query.isLoading && query.isFetched && !match) {
      navigate('/')
    }
  }, [query.isLoading, query.isFetched, match, navigate])

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

**Critical anti-patterns (verified from RESEARCH.md and useLiveGames.ts):**
- Do NOT set `enabled: !!matchFromCache` — prevents refetch on cache miss (breaks D-15)
- Do NOT use `onSuccess` — removed in TQ v5 (confirmed in useLiveGames.ts lines 50-51 comments)
- Always pass `match?.tower_state` to `buildingDecoder`, NOT `match?.building_state`
- Filter players strictly to `team === 0` and `team === 1` — exclude `team === 2` (Broadcaster) and `team === 4` (Unassigned)

---

### `client/src/pages/MatchPage.tsx` (page, request-response)

**Analog:** `client/src/pages/MatchPlaceholder.tsx` (this file REPLACES MatchPlaceholder)

**Imports pattern** (from `MatchPlaceholder.tsx` lines 1-4, extended):
```typescript
import { useParams } from 'react-router'
import { Link } from 'react-router'
import { useMatchDetail } from '../hooks/useMatchDetail'
import { getStatusLabel } from '../utils/gameState'
import StatusTag from '../components/StatusTag'
import ScoreHeader from '../components/ScoreHeader'
import HeroPlayerGrid from '../components/HeroPlayerGrid'
import SkeletonPlayerRow from '../components/SkeletonPlayerRow'
import BuildingsSection from '../components/BuildingsSection'
```

**Page wrapper + ambient glow pattern** (from `MatchPlaceholder.tsx` lines 13-26 — copy verbatim):
```tsx
<div
  className="min-h-screen p-8 relative"
  style={{ background: '#0a0a0a', color: '#d8d8d8' }}
>
  {/* Ambient top glow */}
  <div
    className="absolute pointer-events-none"
    style={{
      top: 0, left: 0, right: 0, height: 300,
      background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(176,48,48,0.03) 0%, transparent 100%)',
    }}
  />
```

**Back nav pattern** (from `MatchPlaceholder.tsx` lines 28-36 — copy verbatim):
```tsx
<Link
  to="/"
  className="inline-flex items-center gap-2 mb-12 text-[11px] uppercase tracking-[0.25em]"
  style={{ color: '#303030', transition: 'color 160ms ease' }}
  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#b03030')}
  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#303030')}
>
  ← Back to matches
</Link>
```

**Match title pattern** (from `MatchPlaceholder.tsx` lines 46-60 — adapt, remove dev label):
```tsx
<h1
  className="font-black leading-none tracking-tight mb-10"
  style={{
    fontSize: 'clamp(2rem, 6vw, 4.5rem)',
    color: '#303030',         // ink-3 per UI-SPEC (MatchPlaceholder used #1c1c1c — UI-SPEC overrides)
    letterSpacing: '-0.03em',
  }}
>
  {match?.radiant_team?.team_name ?? 'TBD'}
  <span style={{ color: '#141414' }}> vs </span>
  {match?.dire_team?.team_name ?? 'TBD'}
</h1>
```

**Loading state pattern** (from `HomePage.tsx` lines 131-137 — skeleton array):
```tsx
{isLoading && (
  <div className="mt-4">
    {Array.from({ length: 10 }).map((_, i) => (
      <SkeletonPlayerRow key={i} />
    ))}
  </div>
)}
```

**Section spacing:** `mt-12` (48px) between ScoreHeader, HeroPlayerGrid, BuildingsSection — per UI-SPEC.

---

### `client/src/components/ScoreHeader.tsx` (component, request-response)

**Analog:** `client/src/components/MatchRow.tsx`

**Imports pattern** (from `MatchRow.tsx` lines 1-5, adapted):
```typescript
import { getStatusLabel, getSeriesLabel } from '../utils/gameState'
import StatusTag from './StatusTag'
import { formatGoldDiff } from '../utils/formatGoldDiff'
import type { LiveGame } from '../../server/src/schemas/valve'  // or pass props directly
```

**Props interface pattern** (modeled on `MatchRow.tsx` lines 7-9):
```typescript
interface ScoreHeaderProps {
  match: LiveGame               // full match object
  radiantPlayers: PlayerDetail[]
  direPlayers: PlayerDetail[]
}
```

**Core display pattern** (from `MatchRow.tsx` lines 40-61 — flex layout with meta cluster, adapted):
```tsx
// Container: flex items-center justify-between, inherits page px-8
// Left block: Radiant team name + kill score (color: #4ade80)
// Center block: gold diff + delay disclosure
// Right block: Dire kill score + team name (color: #ef4444)
// Divider below: border-b style={{ borderColor: '#1a1a1a' }}

const goldDiff = formatGoldDiff(
  radiantPlayers.reduce((s, p) => s + (p.net_worth ?? 0), 0),
  direPlayers.reduce((s, p) => s + (p.net_worth ?? 0), 0),
)
const delayLabel = match.stream_delay_s !== undefined
  ? `~${match.stream_delay_s}s delay`
  : '~120s delay'
const seriesLabel = getSeriesLabel(match.series_type)
const seriesScore = `${match.radiant_series_wins ?? 0}–${match.dire_series_wins ?? 0}${seriesLabel ? ` · ${seriesLabel}` : ''}`
```

**Typography for kill scores** (from UI-SPEC):
- Kill score numbers: `text-[28px] font-bold tabular-nums font-mono`, `color: #d8d8d8`
- Team name: `text-sm font-bold uppercase tracking-[0.15em]`
- Gold diff: `text-sm tabular-nums font-mono` + inline `style={{ color: goldDiff.color }}`
- Delay disclosure: `text-[10px] tracking-[0.15em] uppercase`, `color: #303030`
- Series score: `text-[10px] tracking-[0.1em] tabular-nums`, `color: #303030`

---

### `client/src/components/HeroPlayerGrid.tsx` (component, request-response)

**Analog:** `client/src/pages/HomePage.tsx` (two-group list pattern)

**Imports pattern:**
```typescript
import PlayerRow from './PlayerRow'
import SkeletonPlayerRow from './SkeletonPlayerRow'
```

**Two-group layout pattern** (from `HomePage.tsx` lines 141-150 — grouped list, adapted):
```tsx
// Section label above Radiant group
<p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2"
   style={{ color: '#4ade80' }}>Radiant</p>

// Column headers (once above Radiant block, aligned to PlayerRow columns)
<div className="flex items-center gap-4 px-0 text-[10px] uppercase tracking-[0.2em]"
     style={{ color: '#303030' }}>
  {/* portrait spacer 48px, name flex-1, then: LVL, K/D/A, NW, GPM, XPM, LH/DN */}
</div>

{radiantPlayers.map((p, i) => <PlayerRow key={i} player={p} hasGpm={hasGpm} hasXpm={hasXpm} hasLhDn={hasLhDn} />)}
```

**Optional column detection pattern** (from RESEARCH.md Pitfall 6 — detect at grid level):
```typescript
// Check once at grid level — all players or none show the optional columns
const allPlayers = [...radiantPlayers, ...direPlayers]
const hasGpm = allPlayers.some((p) => (p as any).gpm !== undefined)
const hasXpm = allPlayers.some((p) => (p as any).xpm !== undefined)
const hasLhDn = allPlayers.some((p) => (p as any).lh !== undefined)
```

**Group separation:** `mt-8` between Radiant and Dire blocks (per UI-SPEC).

---

### `client/src/components/PlayerRow.tsx` (component, request-response)

**Analog:** `client/src/components/MatchRow.tsx` (closest flex-row data display component)

**Imports pattern** (from `MatchRow.tsx` lines 1-5, adapted):
```typescript
import { heroMapper } from '../utils/heroMapper'     // client-side version, NOT @shared
import { hiddenProfile } from '@shared/hiddenProfile'
```

**Row container pattern** (from `MatchRow.tsx` lines 20-32 — flex row with hover):
```tsx
<div
  className="flex items-center gap-4 px-0 min-h-[52px] border-b border-[#1e1e1e]"
  style={{ transition: 'background 160ms ease' }}
  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#0f0f0f')}
  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
>
```

Note: No ember accent bar on player rows — that treatment is reserved for home page MatchRow only (per UI-SPEC).

**Hero portrait pattern** (from RESEARCH.md Pattern 4 + UI-SPEC):
```tsx
const heroInfo = player.hero_id !== undefined ? heroMapper(player.hero_id) : null
const isDraftSlot = player.hero_id === undefined  // distinct from unknown ID (heroMapper returns null)
const isDead = player.respawn_timer !== undefined && player.respawn_timer > 0

// Portrait column (48px fixed)
<div className="relative shrink-0" style={{ width: 48 }}>
  {heroInfo ? (
    <img
      src={heroInfo.portrait}
      alt={heroInfo.name}
      className="w-12 h-12 object-cover rounded-sm"
      style={{ opacity: isDead ? 0.3 : 1 }}  // D-06: opacity only, no filter/tint
    />
  ) : (
    <div className="w-12 h-12 rounded-sm" style={{ background: '#141414' }} />
  )}
  {isDead && (
    <span
      className="absolute bottom-0 left-0 right-0 text-[10px] text-center"
      style={{ color: '#585858' }}
    >
      {player.respawn_timer}s
    </span>
  )}
</div>
```

**K/D/A pattern** (from `MatchRow.tsx` lines 40-61 — tabular-nums data display, adapted):
```tsx
// K/D/A: 64px fixed, 12px font-mono tabular-nums
<span className="text-[12px] font-mono tabular-nums shrink-0" style={{ width: 64 }}>
  <span style={{ color: '#d8d8d8' }}>{player.kills ?? '—'}</span>
  <span style={{ color: '#303030' }}>/</span>
  <span style={{ color: '#ef4444' }}>{player.death ?? '—'}</span>   {/* field is 'death', not 'deaths' */}
  <span style={{ color: '#303030' }}>/</span>
  <span style={{ color: '#d8d8d8' }}>{player.assists ?? '—'}</span>
</span>
```

**Net worth pattern:**
```tsx
// NW: 56px fixed, 12px tabular-nums
<span className="text-[12px] tabular-nums shrink-0" style={{ width: 56, color: '#d8d8d8' }}>
  {player.net_worth !== undefined ? player.net_worth.toLocaleString() : '—'}
</span>
```

**Draft slot pattern** (from RESEARCH.md Pattern 5):
```tsx
// When isDraftSlot — render em-dash placeholders, not empty string or zero
<span style={{ color: '#303030' }}>—</span>
```

**Hidden profile pattern** (from `shared/hiddenProfile.ts` + CONTEXT.md D-07):
```tsx
// hiddenProfile guard — show name + portrait + KDA from Valve data; never crash
const isHidden = player.account_id !== undefined && hiddenProfile(player.account_id)
// Render player.name if available regardless of hiddenProfile status
// Do NOT fetch or show any OpenDota stats — silently omit if absent
```

---

### `client/src/components/SkeletonPlayerRow.tsx` (component, request-response)

**Analog:** `client/src/components/SkeletonRow.tsx` (copy verbatim pattern, extend with portrait area)

**Core pattern** (from `SkeletonRow.tsx` lines 1-28 — the entire file):
```tsx
// Three shimmer bars per row matching UI-SPEC:
// - Portrait area: 48px wide (w-12 shrink-0)
// - Name area: flex-1
// - Stats cluster: fixed width right (w-32 shrink-0)
// Same skshimmer keyframe, same gradient colors, same 1px bar height

export default function SkeletonPlayerRow() {
  return (
    <div className="flex items-center gap-4 px-0 min-h-[52px] border-b border-[#1e1e1e]">
      {/* Portrait skeleton */}
      <div
        className="w-12 h-[1px] rounded-full shrink-0"
        style={{
          background: 'linear-gradient(90deg, #181818 0%, #222222 50%, #181818 100%)',
          animation: 'skshimmer 2.4s ease-in-out infinite',
        }}
      />
      {/* Name skeleton */}
      <div
        className="flex-1 h-[1px] rounded-full"
        style={{
          background: 'linear-gradient(90deg, #181818 0%, #222222 50%, #181818 100%)',
          animation: 'skshimmer 2.4s ease-in-out infinite 0.2s',
        }}
      />
      {/* Stats cluster skeleton */}
      <div
        className="w-32 h-[1px] rounded-full shrink-0"
        style={{
          background: '#181818',
          animation: 'skshimmer 2.4s ease-in-out infinite 0.4s',
        }}
      />
      <style>{`
        @keyframes skshimmer {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 1;   }
        }
      `}</style>
    </div>
  )
}
```

**Note:** The `<style>` tag with `@keyframes skshimmer` is duplicated from `SkeletonRow.tsx`. This is acceptable per RESEARCH.md Pattern 8 — duplicate keyframe declarations cause no runtime error. The alternative (moving to `index.css`) is also acceptable but is a discretionary refactor.

---

### `client/src/components/BuildingsSection.tsx` (component, transform)

**Analog:** `client/src/components/ErrorBanner.tsx` (closest standalone display component with conditional render)

**Conditional render pattern** (from `ErrorBanner.tsx` lines 1-19 — standalone presentational component):
```tsx
// BuildingsSection: hidden entirely when unavailable (D-10). No placeholder text.
// Caller pattern (in MatchPage):
{!buildings.unavailable && <BuildingsSection buildings={buildings} />}
```

**Core building decoder consumption** (from `shared/buildingDecoder.ts` lines 1-21 — the exported interfaces):
```typescript
import { buildingDecoder } from '@shared/buildingDecoder'
import type { BuildingState, LaneBuildings } from '@shared/buildingDecoder'

// Render order (per UI-SPEC and RESEARCH.md Pattern 6):
const RADIANT_ORDER: Array<keyof LaneBuildings> = ['tier1', 'tier2', 'tier3', 'meleeRax', 'rangedRax']
const DIRE_ORDER: Array<keyof LaneBuildings> = ['rangedRax', 'meleeRax', 'tier3', 'tier2', 'tier1']
const LANES: Array<'top' | 'mid' | 'bot'> = ['top', 'mid', 'bot']
```

**Building dot pattern** (from RESEARCH.md Pattern 6 code example + UI-SPEC):
```tsx
// Dot: w-2 h-2 rounded-full (8px × 8px per UI-SPEC)
function BuildingDot({ standing, team }: { standing: boolean; team: 'radiant' | 'dire' }) {
  const standingColor = team === 'radiant' ? '#4ade80' : '#ef4444'
  return (
    <span
      className="w-2 h-2 rounded-full"
      style={{
        background: standing ? standingColor : '#303030',
        opacity: standing ? 1 : 0.25,    // UI-SPEC: destroyed = 0.25 opacity
      }}
    />
  )
}
```

**Layout:** Two-column grid (Radiant | Dire), three rows (Top/Mid/Bot). Container: `px-0 py-4`, section label `text-[10px] uppercase tracking-[0.3em] color: #303030 mb-4`, lane labels `text-[10px] uppercase tracking-[0.2em] color: #303030`.

**Anti-pattern to avoid:** Never pass `match?.building_state` to `buildingDecoder` — the parameter is `tower_state`. Using the wrong field causes `unavailable: true` permanently even during in-game state. (Verified: `valve.ts` has both `tower_state` and `building_state` as separate optional fields.)

---

### `server/src/schemas/valve.ts` — extend PlayerSchema (schema, CRUD)

**Analog:** self (extend existing `PlayerSchema`)

**Current PlayerSchema** (lines 6-18 — read directly):
```typescript
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
  })
  .passthrough()
```

**Extension for D-08** (add after `respawn_timer`):
```typescript
    // D-08: optional extended stats — present in-game, absent during draft
    level: z.number().optional(),
    gpm: z.number().optional(),
    xpm: z.number().optional(),
    lh: z.number().optional(),     // last hits
    dn: z.number().optional(),     // denies
```

**Key constraint:** `.passthrough()` on line after the object close MUST be preserved. The extension does NOT break existing consumers — all new fields are `optional()`.

---

### `client/src/App.tsx` — swap MatchPlaceholder import (config/router)

**Analog:** self (minimal one-line import swap)

**Current state** (lines 1-12 — read directly):
```typescript
import MatchPlaceholder from './pages/MatchPlaceholder'
// ...
<Route path="/match/:matchId" element={<MatchPlaceholder />} />
```

**Change required** (replace import + JSX reference):
```typescript
import MatchPage from './pages/MatchPage'
// ...
<Route path="/match/:matchId" element={<MatchPage />} />
```

Route path `/match/:matchId` and position in Routes stay unchanged.

---

## Shared Patterns

### Dark Theme Baseline
**Source:** `client/src/pages/MatchPlaceholder.tsx` lines 14-16, `client/src/pages/HomePage.tsx` line 12
**Apply to:** All new page and component files
```tsx
// Page wrapper
style={{ background: '#0a0a0a', color: '#d8d8d8' }}

// Established token values (use inline style where Tailwind token not available):
// background: #0a0a0a (void) | #0f0f0f (surface, hover) | #141414 (panel) | #1a1a1a (lift, borders)
// text: #d8d8d8 (ink) | #585858 (ink-2) | #303030 (ink-3)
// accent: #b03030 (ember) | #4ade80 (radiant) | #ef4444 (dire)
```

### Back Nav + Hover Pattern
**Source:** `client/src/pages/MatchPlaceholder.tsx` lines 28-36
**Apply to:** `MatchPage.tsx` (copy verbatim)
```tsx
<Link
  to="/"
  className="inline-flex items-center gap-2 mb-12 text-[11px] uppercase tracking-[0.25em]"
  style={{ color: '#303030', transition: 'color 160ms ease' }}
  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#b03030')}
  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#303030')}
>
  ← Back to matches
</Link>
```

### Ambient Top Glow
**Source:** `client/src/pages/MatchPlaceholder.tsx` lines 19-26
**Apply to:** `MatchPage.tsx` (copy verbatim)
```tsx
<div
  className="absolute pointer-events-none"
  style={{
    top: 0, left: 0, right: 0, height: 300,
    background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(176,48,48,0.03) 0%, transparent 100%)',
  }}
/>
```

### TanStack Query v5 Hook Structure
**Source:** `client/src/hooks/useLiveGames.ts` lines 54-72
**Apply to:** `useMatchDetail.ts`
```typescript
// v5 constraints verified in useLiveGames.ts:
// - refetchInterval: plain number (NOT callback) in Phase 3
// - NO onSuccess callback (removed in v5) — use query.data reactively
// - staleTime: 25_000 (matches useLiveGames to avoid duplicate fetches on navigation)
// - queryKey: ['live-games'] (same key — shares the cache with useLiveGames)
```

### Skeleton Shimmer Animation
**Source:** `client/src/components/SkeletonRow.tsx` lines 1-28
**Apply to:** `SkeletonPlayerRow.tsx`
```tsx
// Animation: 'skshimmer 2.4s ease-in-out infinite' with staggered delay per bar
// Gradient: 'linear-gradient(90deg, #181818 0%, #222222 50%, #181818 100%)'
// Bar height: h-[1px] (minimalist — matches existing pattern)
// Keyframe: @keyframes skshimmer { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
```

### StatusTag Consumption
**Source:** `client/src/components/StatusTag.tsx` lines 1-35, `client/src/utils/gameState.ts` lines 1-12
**Apply to:** `ScoreHeader.tsx` or `MatchPage.tsx`
```typescript
// getStatusLabel(match.game_state) returns 'Draft' | 'Live' | 'Post-game' | 'Unknown'
// 'Post-game' already mapped in StyleMap: { dot: '#303030', text: '#484848' }
// No changes to StatusTag.tsx required — 'Post-game' is already a valid Status type
```

### Utility Import Convention
**Source:** `client/src/components/MatchRow.tsx` lines 1-5
**Apply to:** All new component files
```typescript
// Pattern: relative imports for local utils, @shared/ alias for shared primitives
import { getStatusLabel, getSeriesLabel } from '../utils/gameState'
import { formatDuration } from '../utils/formatDuration'
import StatusTag from './StatusTag'
import type { EnrichedGame } from '../hooks/useLiveGames'
// For Phase 3: import heroMapper from '../utils/heroMapper' (client-side version)
// For Phase 3: import { hiddenProfile } from '@shared/hiddenProfile' (Node-safe)
// For Phase 3: import { buildingDecoder } from '@shared/buildingDecoder' (Node-safe)
```

---

## No Analog Found

All files have analogs. No entries in this section.

---

## Critical Pitfall Summary (for Planner)

| Pitfall | Affected File | Guard |
|---|---|---|
| `heroMapper` uses Node.js `createRequire` | `PlayerRow.tsx`, `HeroPlayerGrid.tsx` | Import from `client/src/utils/heroMapper.ts` ONLY — never `@shared/heroMapper` |
| `building_state` vs `tower_state` | `BuildingsSection.tsx`, `useMatchDetail.ts` | Always call `buildingDecoder(match?.tower_state, ...)` not `building_state` |
| `p.deaths` vs `p.death` | `PlayerRow.tsx` | The Valve field is `death` (singular) — verified in `valve.ts` line 12 |
| Polling after `game_state === 6` | `useMatchDetail.ts` | `refetchInterval: match?.game_state === 6 ? false : 30_000` |
| Premature redirect on cache miss | `useMatchDetail.ts` | Gate `useEffect` on both `!query.isLoading && query.isFetched && !match` |
| `enabled: !!matchFromCache` disables D-15 | `useMatchDetail.ts` | Keep `enabled` unset (default `true`) |
| Unicode minus in gold diff | `formatGoldDiff.ts` | Use `−` (U+2212), not hyphen `-` |
| `towerState === 0` is not unavailable | `BuildingsSection.tsx` | Zero = all destroyed; only `undefined` = unavailable |
| Broadcasting/Unassigned players in grid | `HeroPlayerGrid.tsx` | Filter `team === 0` and `team === 1` only; exclude `2` and `4` |

---

## Metadata

**Analog search scope:** `client/src/`, `server/src/schemas/`, `shared/`
**Files scanned:** 13 source files read directly
**Pattern extraction date:** 2026-04-24
