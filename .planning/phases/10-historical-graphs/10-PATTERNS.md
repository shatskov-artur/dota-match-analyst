# Phase 10: Historical Graphs - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 8 (4 NEW + 4 MODIFIED)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|---------|------|-----------|----------------|---------------|
| `client/src/components/HistoryGraphs.tsx` | NEW | SVG component | request-response (props in, render only) | `client/src/components/DotaMapView.tsx` (SVG primitives) + `client/src/components/WinProbBar.tsx` (self-gating) + `client/src/components/IntelTooltip.tsx` (anchored hover tooltip) + `client/src/components/RoshanBlock.tsx` (1Hz client tick) | composite-exact |
| `server/src/services/historySampler.ts` | NEW | service (Redis time-series writer/reader) | event-driven (called inline from `/api/live/games`) | `server/src/services/roshanState.ts` | exact (same shape: read/write + pure detector) |
| `server/src/schemas/bff.ts` | MODIFIED | zod schema | transform | existing `RoshanStateSchema` + `EnrichedLiveGameSchema.extend` block (same file) | exact |
| `server/src/routes/live.ts` (handler in `liveRoutes.get('/games')`) | MODIFIED | route | request-response | itself — Roshan piggyback at lines 108-151 | exact (in-place addition) |
| `client/src/hooks/useMatchDetail.ts` | MODIFIED | hook | request-response | itself — `EnrichedLiveGame` type already flows; no shape change beyond the BFF-side `history` field | exact |
| `client/src/pages/MatchPage.tsx` | MODIFIED | page mount | layout | itself — sibling mount pattern around `<RoshanBlock>` (line 153) and `<WinProbBar>` (line 77) | exact |
| `server/src/services/historySampler.test.ts` | NEW | test | unit | `server/src/services/roshanState.test.ts` | exact |
| `client/src/components/HistoryGraphs.test.tsx` | NEW | test | unit | `client/src/components/RoshanBlock.test.tsx` | exact |

---

## Pattern Assignments

### `client/src/components/HistoryGraphs.tsx` (SVG component)

**Primary analog:** `client/src/components/DotaMapView.tsx` — hand-rolled SVG with `viewBox`, `<rect>`, `<image>`, `<defs>`/`<clipPath>`, inline-styled `<text>` labels. No chart library imports anywhere in the repo (verified by `Grep("polyline|<line ") → 3 hits, all hand-rolled`).

**Self-gating analog:** `client/src/components/WinProbBar.tsx` lines 72-77 — return `null` when data is too thin (≤2 history points → skeleton instead).

**Tooltip analog:** `client/src/components/IntelTooltip.tsx` — `useLayoutEffect` + `anchorRef.current.getBoundingClientRect()` for crosshair positioning; `useState` for the projected point; absolute-positioned panel with `pointerEvents: 'none'`.

**Live-tick analog:** `client/src/components/RoshanBlock.tsx` lines 75-78 — `useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])` for the "Накапливаем историю… ({elapsed}/30с)" countdown.

**Imports pattern** (from `DotaMapView.tsx` lines 1-3 + `WinProbBar.tsx` no imports + `IntelTooltip.tsx` line 1):
```typescript
import { useLayoutEffect, useRef, useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
```
No chart library. No `@shared/*` imports unless the schema lives there. Match the existing project convention.

**Component signature pattern** (from `WinProbBar.tsx` lines 1-12 + `RoshanBlock.tsx` lines 6-13):
```typescript
export interface HistoryGraphsProps {
  history: Array<{ t: number; gold: number; xp: number }>  // game-clock seconds; signed Radiant-positive
  gameDuration: number | undefined
  gameState: number | undefined
}

export default function HistoryGraphs({ history, gameDuration, gameState }: HistoryGraphsProps) {
  // Self-gate: skeleton state when history.length < 2 (D-23, D-24)
  if (history.length < 2) {
    return <SkeletonHistoryBlock gameDuration={gameDuration} />
  }
  // ...
}
```

**SVG body pattern** (from `DotaMapView.tsx` lines 36-39, 151-152):
```typescript
const W = 640, H = 160, PAD_L = 40, PAD_R = 12, PAD_T = 12, PAD_B = 24
return (
  <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
    style={{ borderRadius: 6, display: 'block' }}>
    {/* Solid backdrop */}
    <rect width={W} height={H} fill="#0f0f0f" rx={6} />
    {/* Zero axis */}
    <line x1={PAD_L} y1={H/2} x2={W-PAD_R} y2={H/2} stroke="#2a2a2a" strokeWidth={1} />
    {/* Filled area Radiant (above zero, green) */}
    <path d={pathRadiantFill} fill="#4ade80" fillOpacity={0.15} />
    {/* Filled area Dire (below zero, red) */}
    <path d={pathDireFill} fill="#ef4444" fillOpacity={0.15} />
    {/* Line on top */}
    <polyline points={pointsStr} fill="none" stroke="#d8d8d8" strokeWidth={1.5} />
    {/* Axis ticks every 5 min */}
    <text x={...} y={H-6} fontSize={10} fill="#888888" fontFamily="monospace" textAnchor="middle">
      {formatMmSs(t)}
    </text>
  </svg>
)
```

**Color palette** (Radiant green / Dire red — already used throughout the codebase, do NOT invent):
```typescript
// from DotaMapView.tsx line 23, RoshanBlock palette, WinProbBar.tsx lines 35,51,60
const RADIANT_GREEN = '#4ade80'   // alive radiant
const DIRE_RED      = '#ef4444'   // alive dire
const NEUTRAL_FG    = '#d8d8d8'   // primary text
const SECONDARY_FG  = '#888888'   // axis labels (ScoreHeader uses #555555 for >= secondary; ≥#555 floor)
const PANEL_BG      = '#0f0f0f'   // panel background (WinProbBar.tsx line 50)
const GRID_STROKE   = '#1a1a1a'   // subtle gridlines (matches WinProbBar.tsx line 86 border)
```

**Tooltip pattern** (from `IntelTooltip.tsx` lines 30-43, 67-82):
```typescript
const [hoverX, setHoverX] = useState<number | null>(null)
const svgRef = useRef<SVGSVGElement>(null)

const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
  const rect = svgRef.current?.getBoundingClientRect()
  if (!rect) return
  setHoverX(e.clientX - rect.left)
}
// onMouseLeave: setHoverX(null)

// Tooltip JSX (absolute, parent must be position:relative WITHOUT overflow-hidden — Pitfall 4):
<div style={{
  position: 'absolute', zIndex: 50,
  left: tooltipX, top: tooltipY,
  background: '#111111', border: '1px solid #1a1a1a',
  borderRadius: 4, padding: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
  pointerEvents: 'none',          // CRITICAL — never capture clicks (IntelTooltip line 79)
}}>
  <span style={{ fontSize: 10, fontWeight: 700, color: '#d8d8d8' }}>
    {formatMmSs(point.t)} — {point.gold > 0 ? 'Radiant' : 'Dire'} {formatK(Math.abs(point.gold))}k gold,
    {' '}{formatK(Math.abs(point.xp))}k xp
  </span>
</div>
```

**Skeleton + countdown pattern** (from `RoshanBlock.tsx` lines 75-78 for the 1Hz tick; new wording per CONTEXT D-23):
```typescript
function SkeletonHistoryBlock({ gameDuration }: { gameDuration: number | undefined }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsed = Math.min(30, ((gameDuration ?? 0) % 30))
  return (
    <div style={{ height: 160, background: '#0f0f0f', borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#888888', fontSize: 12 }}>
        Накапливаем историю… ({elapsed}/30с)
      </span>
    </div>
  )
}
```

**Helper formatters** (parallel to `RoshanBlock.tsx` `formatMmSs` lines 40-45):
```typescript
function formatMmSs(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
function formatK(value: number): string {
  // 12345 → "12.3"; caller appends "k"
  return (value / 1000).toFixed(1)
}
```

---

### `server/src/services/historySampler.ts` (service, event-driven)

**Analog:** `server/src/services/roshanState.ts` — same role (Redis-backed mutable state per match), same data flow (called inline by `/api/live/games`), same idioms (graceful null when `redis === null`, JSON encoding, EX-based TTL, pure detector + I/O wrappers).

**Imports pattern** (from `roshanState.ts` lines 1):
```typescript
import { redis } from '../cache.js'
import { logger } from '../logger.js'
```

**Key helper + TTL pattern** (from `roshanState.ts` lines 9-13):
```typescript
const TTL_SECONDS = 7200           // D-12: 2h, refreshed on every write
const TIMESERIES_LIMIT = 240       // D-11: ~2h of 30s samples
const SAMPLE_GATE_SECONDS = 5      // D-06

function tsKey(matchId: number): string { return `timeseries:${matchId}` }
function gateKey(matchId: number): string { return `lastSample:${matchId}` }
```

**Read pattern** (from `roshanState.ts` lines 22-32 — adapt `redis.get` → `redis.lrange`):
```typescript
export async function readHistory(matchId: number): Promise<HistorySample[]> {
  if (!redis) return []
  try {
    const raw = await redis.lrange(tsKey(matchId), 0, -1)
    return raw.map(s => JSON.parse(s) as HistorySample)
  } catch (err) {
    console.error(`[history] read error for ${matchId}:`, (err as Error).message)
    return []
  }
}
```

**Write pattern with NX-gated throttle** (D-06, D-10, D-11, D-12 — adapts `roshanState.ts` lines 38-45 with RPUSH/LTRIM/EXPIRE chain):
```typescript
export async function tryWriteSample(
  matchId: number,
  sample: HistorySample,
): Promise<boolean> {
  if (!redis) return false
  try {
    // D-06: NX SET acts as a 5s gate — only one writer per match per 5s window.
    // ioredis: redis.set(key, val, 'EX', N, 'NX') returns 'OK' on acquire, null otherwise.
    const acquired = await redis.set(gateKey(matchId), '1', 'EX', SAMPLE_GATE_SECONDS, 'NX')
    if (acquired !== 'OK') return false
    const k = tsKey(matchId)
    await redis.rpush(k, JSON.stringify(sample))      // D-10
    await redis.ltrim(k, -TIMESERIES_LIMIT, -1)       // D-11
    await redis.expire(k, TTL_SECONDS)                // D-12
    return true
  } catch (err) {
    console.error(`[history] write error for ${matchId}:`, (err as Error).message)
    return false                                       // D-09: never break caller
  }
}
```

**Cleanup pattern** (D-13 — `game_state === 6`):
```typescript
export async function deleteHistory(matchId: number): Promise<void> {
  if (!redis) return
  try { await redis.del(tsKey(matchId), gateKey(matchId)) }
  catch (err) { console.error(`[history] del error for ${matchId}:`, (err as Error).message) }
}
```

**Pure aggregator** (parallel to `detectRoshanKill` lines 53-96 — pure, no I/O, easy to unit-test):
```typescript
export interface HistorySample { t: number; gold: number; xp: number }

export function buildSample(game: {
  scoreboard?: { radiant?: { players?: Array<{ net_worth?: number; xpm?: number }> },
                  dire?:    { players?: Array<{ net_worth?: number; xpm?: number }> },
                  duration?: number },
  duration?: number,
  game_state?: number,
}): HistorySample | null {
  // D-08: skip when not in-game
  if (game.game_state !== 5) return null
  const duration = game.scoreboard?.duration ?? game.duration ?? 0
  if (!duration) return null                          // D-08: duration null/0 → skip
  const r = game.scoreboard?.radiant?.players ?? []
  const d = game.scoreboard?.dire?.players ?? []
  if (r.length === 0 || d.length === 0) return null
  const sumNw = (ps: typeof r) => ps.reduce((s, p) => s + (p.net_worth ?? 0), 0)
  const teamXp = (ps: typeof r) => ps.reduce((s, p) => s + ((p.xpm ?? 0) * duration / 60), 0) // D-15
  // D-18: missing xpm contributes 0 — better undercount than crash
  return {
    t: Math.floor(duration),                          // D-07
    gold: sumNw(r) - sumNw(d),
    xp:   Math.round(teamXp(r) - teamXp(d)),          // D-16
  }
}
```

---

### `server/src/schemas/bff.ts` (zod schema, MODIFIED)

**Analog:** the same file's existing `RoshanStateSchema` + `EnrichedLiveGameSchema.extend` block (lines 13-23).

**Pattern to copy** (lines 13-23 of `bff.ts`):
```typescript
// ADD to bff.ts:
export const HistorySampleSchema = z.object({
  t: z.number().int().nonnegative(),       // game-clock seconds (D-07)
  gold: z.number().int(),                  // signed; Radiant-positive (D-16)
  xp: z.number().int(),                    // signed; Radiant-positive (D-16)
})

// EXTEND existing EnrichedLiveGameSchema (already has roshan: RoshanStateSchema.nullable()):
export const EnrichedLiveGameSchema = LiveGameSchema.extend({
  league_name: z.string(),
  roshan: RoshanStateSchema.nullable(),
  history: z.array(HistorySampleSchema),   // NEW; always an array (empty when redis miss)
})

export type HistorySample = z.infer<typeof HistorySampleSchema>
```

**Critical:** do NOT touch `server/src/schemas/valve.ts` — `history` is a BFF-side construct, not a Valve passthrough field (CONTEXT `code_context` "Established Patterns").

---

### `server/src/routes/live.ts` (route, MODIFIED)

**Analog:** itself — the Roshan piggyback block at lines 108-151 demonstrates exactly the inline-piggyback shape required by D-05.

**Pattern to graft into the `enriched` map** (after Roshan block, before the `return { ...g, ... }` at line 153):
```typescript
// Phase 10: history sampler — fire-and-forget piggyback (D-05, D-09).
// MUST NOT throw. MUST run AFTER game_state is derived (we need the inferred value).
let history: HistorySample[] = []
if (typeof g.match_id === 'number') {
  const matchId = g.match_id
  try {
    if (derivedGameState === 6) {
      // D-13: explicit cleanup on post-game observation
      await deleteHistory(matchId)
    } else if (derivedGameState === 5) {
      const sample = buildSample({
        scoreboard: g.scoreboard as never,
        duration: g.duration,
        game_state: derivedGameState,
      })
      if (sample) {
        const wrote = await tryWriteSample(matchId, sample)
        if (wrote) {
          logger.info({ matchId, t: sample.t, gold: sample.gold, xp: sample.xp }, 'history sample written')
        }
      }
    }
    history = await readHistory(matchId)
  } catch (err) {
    // D-09: fire-and-forget — never break the live response
    logger.error({ matchId, err: (err as Error).message }, 'history sampler failed')
  }
}

return {
  ...g,
  game_state: derivedGameState,
  duration: g.duration ?? sbDuration,
  roshan_respawn_timer: sbRoshanTimer,
  roshan,
  players,
  league_name: nameMap[g.league_id] ?? `League #${g.league_id}`,
  history,                              // NEW
}
```

**Imports to add** at top of `live.ts` (next to existing `roshanState` import on line 10):
```typescript
import { readHistory, tryWriteSample, deleteHistory, buildSample } from '../services/historySampler.js'
import type { HistorySample } from '../schemas/bff.js'
```

**Critical (from CONTEXT `code_context` "Polling stops..."):** the sampler runs inside the `enriched.map(async (g) => …)` for every live game on every poll — there is no separate match-detail handler in the codebase today (verified: no `/api/match/:id` route exists; `useMatchDetail` reads from the shared `['live-games']` cache via `useLiveGames`). History therefore rides on `/api/live/games`, not a new endpoint.

---

### `client/src/hooks/useMatchDetail.ts` (hook, MODIFIED)

**Analog:** itself — no new fetch logic. Only the type carried by `LiveGamesResponse` widens. Because `LiveGamesResponse` is re-exported from `useLiveGames` and ultimately resolves to `EnrichedLiveGame` from `server/src/schemas/bff.ts`, **adding `history` to `EnrichedLiveGameSchema` is sufficient** — no edit to `useMatchDetail.ts` itself unless we want to surface `match.history` as a destructured return.

**Optional return surface** (drop into the existing `return { ... }` at lines 61-69):
```typescript
return {
  match,
  radiantPlayers,
  direPlayers,
  buildings,
  history: match?.history ?? [],          // NEW — always an array
  isLoading: query.isLoading,
  gameState: match?.game_state,
}
```

---

### `client/src/pages/MatchPage.tsx` (page, MODIFIED)

**Analog:** itself — sibling-mount pattern around `<RoshanBlock>` (line 153) and `<WinProbBar>` (lines 77-83).

**Layout-preservation memory (project memory `feedback_layout_preservation`):** **DO NOT silently restructure the existing match page.** Mount `<HistoryGraphs>` as a single new `<section>` whose placement should be confirmed with the user during execution. CONTEXT suggests "below score header / above player rows" but defers final placement to the planner — planner MUST surface the choice as a dedicated decision in the plan, not hide it.

**Mount pattern** (parallel to `WinProbBar` mount at lines 77-83):
```typescript
{/* Phase 10: historical graphs — self-gates internally (skeleton when history.length < 2) */}
<HistoryGraphs
  history={match?.history ?? []}
  gameDuration={match?.duration}
  gameState={match?.game_state}
/>
```

---

### `server/src/services/historySampler.test.ts` (test, NEW)

**Analog:** `server/src/services/roshanState.test.ts` lines 1-19 (mock setup) + lines 21-96 (pure-detector tests).

**Mock + import pattern** (lines 1-19):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../cache.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    rpush: vi.fn(),
    ltrim: vi.fn(),
    expire: vi.fn(),
    lrange: vi.fn(),
    del: vi.fn(),
  },
}))

import { buildSample, tryWriteSample, readHistory, deleteHistory } from './historySampler.js'
import { redis } from '../cache.js'

beforeEach(() => { vi.clearAllMocks() })
```

**Pure-aggregator test pattern** (parallel to `detectRoshanKill` block lines 21-96):
```typescript
describe('buildSample — pure aggregator (D-07, D-08, D-15..D-18)', () => {
  it('game_state !== 5 → null (D-08)', () => {
    expect(buildSample({ game_state: 2, duration: 600 } as never)).toBeNull()
  })
  it('duration 0 → null (D-08)', () => {
    expect(buildSample({ game_state: 5, duration: 0 } as never)).toBeNull()
  })
  it('symmetric Radiant/Dire net_worth → gold=positive, signed', () => { /* ... */ })
  it('missing xpm on one Radiant player → that player contributes 0 (D-18)', () => { /* ... */ })
  it('t equals floor(scoreboard.duration) (D-07)', () => { /* ... */ })
})

describe('tryWriteSample — Redis throttle + cap (D-06, D-10, D-11, D-12)', () => {
  it('NX gate releases → RPUSH + LTRIM(0,-240) + EXPIRE(7200) called in order', async () => { /* ... */ })
  it('NX gate held (returns null) → no RPUSH, returns false', async () => { /* ... */ })
  it('redis === null → returns false silently', async () => { /* ... */ })
  it('redis throws → returns false, never propagates (D-09)', async () => { /* ... */ })
})

describe('deleteHistory — cleanup (D-13)', () => {
  it('DEL both timeseries:{id} and lastSample:{id}', async () => { /* ... */ })
})
```

---

### `client/src/components/HistoryGraphs.test.tsx` (test, NEW)

**Analog:** `client/src/components/RoshanBlock.test.tsx` lines 1-60.

**Imports + 1Hz tick pattern** (lines 1-12, 41-53):
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import HistoryGraphs from './HistoryGraphs'

afterEach(() => { vi.useRealTimers() })

describe('HistoryGraphs', () => {
  it('returns null/skeleton when history.length < 2 (D-23, D-24)', () => {
    const { container } = render(<HistoryGraphs history={[]} gameDuration={120} gameState={5} />)
    expect(container.textContent).toMatch(/Накапливаем историю/)
  })
  it('skeleton countdown ticks 1Hz', () => {
    vi.useFakeTimers()
    render(<HistoryGraphs history={[]} gameDuration={5} gameState={5} />)
    act(() => { vi.advanceTimersByTime(2000) })
    // assert countdown text updated
  })
  it('with ≥2 samples renders <polyline> for gold and xp', () => { /* ... */ })
  it('symmetric Y-axis — positive value above midline, negative below', () => { /* ... */ })
  it('formats Y axis labels as "Xk" with one decimal', () => { /* ... */ })
  it('hover tooltip shows MM:SS — Radiant +X.Xk gold, +X.Xk xp', () => { /* ... */ })
  it('hover tooltip swaps to "Dire +X.Xk …" when point is negative', () => { /* ... */ })
})
```

---

## Shared Patterns

### Self-gating components
**Source:** `client/src/components/WinProbBar.tsx` lines 72-77, `client/src/components/RoshanBlock.tsx` line 80
**Apply to:** `HistoryGraphs.tsx`
```typescript
// Component renders empty/null when its inputs are insufficient — never the parent's job.
if (gameState !== 5 || (gameDuration ?? 0) <= 300) return null   // WinProbBar
if (roshan === null) return null                                  // RoshanBlock
if (history.length < 2) return <SkeletonHistoryBlock ... />       // HistoryGraphs (D-23, D-24)
```

### Redis-backed per-match state with graceful degradation
**Source:** `server/src/services/roshanState.ts` lines 22-45
**Apply to:** `historySampler.ts`
- `if (!redis) return ...` short-circuit at the top of every read/write
- `try/catch` with `console.error` and a safe fallback return — never throw to the route
- TTL via `'EX', N` argument to `redis.set` / `redis.expire`
- JSON encode/decode at the boundary

### Inline-piggyback handler extension
**Source:** `server/src/routes/live.ts` lines 108-151 (Roshan block)
**Apply to:** the same handler, immediately after the Roshan block
- Read prior state → compute → conditionally write → ALWAYS read back what's stored → attach to response
- Wrap the whole block in try/catch; never break the live response (D-09)
- Use `logger.info` / `logger.error` (pino) — never `console.log`

### zod BFF schema extension
**Source:** `server/src/schemas/bff.ts` lines 13-23 (RoshanStateSchema + EnrichedLiveGameSchema.extend)
**Apply to:** `HistorySampleSchema` + `EnrichedLiveGameSchema.extend({ history: z.array(...) })`
- Define the inner shape as its own exported schema (keeps `z.infer` clean)
- Always `.extend` the existing `EnrichedLiveGameSchema` — never duplicate the base schema
- Type alias via `z.infer<typeof X>` exported alongside the schema

### Color palette (no new colors)
**Source:** `client/src/components/DotaMapView.tsx` line 23, `client/src/components/WinProbBar.tsx` lines 35-60, `client/src/components/IntelTooltip.tsx` lines 74-80
**Apply to:** `HistoryGraphs.tsx`
- Radiant green `#4ade80`, Dire red `#ef4444`
- Panel background `#0f0f0f`, border `#1a1a1a`
- Primary text `#d8d8d8`, secondary `#888888` (axis labels — must be ≥ #555555 per Phase 3 contrast floor)
- Tooltip styling — copy IntelTooltip's container styles verbatim

### Test mock harness
**Source:** `server/src/services/roshanState.test.ts` lines 7-9 + `server/src/routes/live.roshan.test.ts` lines 12-26 (in-memory redis store across calls)
**Apply to:** `historySampler.test.ts` and any future integration test on `/api/live/games` that exercises the sampler
```typescript
const redisStore = new Map<string, string[]>()  // list-shaped store for RPUSH/LRANGE
vi.mock('../cache.js', () => ({
  redis: {
    rpush: vi.fn(async (k, v) => { (redisStore.get(k) ?? redisStore.set(k, []).get(k)!).push(v); return 1 }),
    lrange: vi.fn(async (k) => redisStore.get(k) ?? []),
    ltrim:  vi.fn(async () => 'OK'),
    expire: vi.fn(async () => 1),
    set:    vi.fn(async () => 'OK'),
    del:    vi.fn(async (k) => { redisStore.delete(k); return 1 }),
  },
}))
```

---

## No Analog Found

None. Every required new file maps to a strong existing analog in the codebase.

---

## Metadata

**Analog search scope:** `client/src/components`, `client/src/hooks`, `client/src/pages`, `server/src/routes`, `server/src/services`, `server/src/schemas`
**Files scanned:** ~25 (full glob over the four directories above plus targeted reads of 9 analogs)
**Pattern extraction date:** 2026-05-09
**Sources of truth:** `.planning/phases/10-historical-graphs/10-CONTEXT.md` (D-01..D-25), `CLAUDE.md` Critical Pitfalls, project memory `feedback_layout_preservation` + `feedback_cooldown_ticking`
