# Phase 6: Win Probability - Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 10 (4 new, 6 modified)
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/services/stratzApi.ts` | service | request-response | `server/src/services/openDotaApi.ts` | exact |
| `server/src/schemas/stratz.ts` | model | transform | `server/src/schemas/openDota.ts` | exact |
| `client/src/components/WinProbBar.tsx` | component | request-response | `client/src/components/ScoreHeader.tsx` | role-match |
| `client/src/hooks/useWinProbability.ts` | hook | request-response | `client/src/hooks/useMatchIntel.ts` | exact |
| `server/src/env.ts` | config | — | self (modify) | exact |
| `server/src/cache.ts` | config | — | self (modify) | exact |
| `server/src/routes/live.ts` | route | request-response | self (modify) | exact |
| `server/src/services/openDotaApi.ts` | service | request-response | self (modify — remove matchups) | exact |
| `server/src/schemas/openDota.ts` | model | transform | self (modify — remove HeroMatchupSchema) | exact |
| `client/src/pages/MatchPage.tsx` | component | request-response | self (modify — insert WinProbBar) | exact |

---

## Pattern Assignments

### `server/src/services/stratzApi.ts` (service, request-response)

**Analog:** `server/src/services/openDotaApi.ts`

**Imports pattern** (`server/src/services/openDotaApi.ts` lines 1-4):
```typescript
import { z } from 'zod'
import { cached, TTL } from '../cache.js'
import { StratzWinProbResponseSchema, StratzMatchupResponseSchema } from '../schemas/stratz.js'
import { env } from '../env.js'
```

**Base URL + fetch pattern** (`server/src/services/openDotaApi.ts` lines 6-33):
```typescript
const STRATZ_BASE = 'https://api.stratz.com/graphql'

// All Stratz calls share this boilerplate — POST with JSON body + Bearer auth.
// NEVER call fetch() from routes directly; service layer is the only path to Stratz.
async function fetchWinProbability(matchId: number): Promise<number | null> {
  let res: Response
  try {
    res = await fetch(STRATZ_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.STRATZ_TOKEN}`,
      },
      body: JSON.stringify({
        query: `query WinProb($matchId: Long!) {
          live { match(matchId: $matchId) {
            liveWinRateValues { time winRate }
          }}
        }`,
        variables: { matchId },
      }),
    })
  } catch (err) {
    console.error('[stratzApi] Network error fetching winprob:', (err as Error).message)
    return null
  }
  if (!res.ok) {
    console.error(`[stratzApi] winprob fetch error: ${res.status} ${res.statusText}`)
    return null
  }
  // ...
}
```

**Error handling + zod parse pattern** (`server/src/services/openDotaApi.ts` lines 26-33):
```typescript
// COPY EXACTLY — this try/catch + safeParse + null-return is the project standard.
// Never throw from a service function. Never return partial data without schema validation.
  const raw: unknown = await res.json()
  const parsed = StratzWinProbResponseSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[stratzApi] StratzWinProbSchema parse failure for match', matchId)
    return null
  }
  const values = parsed.data.data?.live?.match?.liveWinRateValues
  if (!values || values.length === 0) return null
  return values[values.length - 1].winRate ?? null
```

**cached() export wrapper pattern** (`server/src/services/openDotaApi.ts` lines 41-43, 93-95, 125-127):
```typescript
// Public API: always cached() — N callers = 1 upstream call per TTL.
// Key format: 'stratz:winprob:{matchId}' (D-07), 'stratz:matchups:{heroId}' (D-11)
export function getWinProbability(matchId: number): Promise<number | null> {
  return cached(`stratz:winprob:${matchId}`, TTL.WIN_PROB, () => fetchWinProbability(matchId))
}

export function getHeroMatchupsStratz(heroId: number): Promise<StratzMatchupEntry[] | null> {
  return cached(`stratz:matchups:${heroId}`, TTL.HERO_STATS, () => fetchHeroMatchupsStratz(heroId))
}
```

**Pure transform helper pattern** (`server/src/services/openDotaApi.ts` lines 53-65, `server/src/services/intel.ts` lines 31-40):
```typescript
// Export pure transform helpers for unit testing (Wave 0 stratzApi.test.ts).
// rankCountersStratz replaces rankCounters for the Stratz nested data shape.
// Input: StratzHeroDryadType[] from heroVsHeroMatchup.advantage
// Flatten: advantage[i].vs[*].winRateHeroId1 < 0.5 means heroId1 (our hero) loses more.
// Sort winRateHeroId1 ascending → top 3 are hardest counters.
export function rankCountersStratz(advantage: StratzHeroDryadEntry[]): CounterHeroResult[] {
  return advantage
    .flatMap(entry => (entry.vs ?? []).map(v => ({
      heroId: entry.heroId ?? 0,
      winRateHeroId1: v.winRateHeroId1 ?? 0.5,
    })))
    .filter(e => e.heroId !== 0)
    .sort((a, b) => a.winRateHeroId1 - b.winRateHeroId1)
    .slice(0, 3)
    .map(e => ({ heroId: e.heroId, disadvantageScore: 1 - e.winRateHeroId1 }))
}
```

---

### `server/src/schemas/stratz.ts` (model, transform)

**Analog:** `server/src/schemas/openDota.ts`

**File header + schema structure** (`server/src/schemas/openDota.ts` lines 1-11):
```typescript
import { z } from 'zod'

// CRITICAL: .passthrough() — Stratz adds fields without notice.
// CRITICAL: all fields .optional() — avoid hard failures on partial responses.
// CRITICAL: field names are camelCase (GraphQL JSON) — NOT PascalCase (C# models).
```

**Nested schema with passthrough** (`server/src/schemas/openDota.ts` lines 20-28, pattern to replicate):
```typescript
// Win probability — live.match response
export const StratzWinRateDetailSchema = z.object({
  time: z.number().optional(),
  winRate: z.number().optional(),
}).passthrough()

export const StratzWinProbResponseSchema = z.object({
  data: z.object({
    live: z.object({
      match: z.object({
        liveWinRateValues: z.array(StratzWinRateDetailSchema).optional(),
      }).passthrough().optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough()

// Hero matchup — heroStats.heroVsHeroMatchup response
// NOTE: Field names are [ASSUMED camelCase] — verify vs actual JSON on first API call.
export const StratzHeroVsHeroEntrySchema = z.object({
  heroId1: z.number().optional(),
  heroId2: z.number().optional(),
  winRateHeroId1: z.number().optional(),
  winRateHeroId2: z.number().optional(),
  matchCount: z.number().optional(),
  winCount: z.number().optional(),
}).passthrough()

export const StratzHeroDryadSchema = z.object({
  heroId: z.number().optional(),
  vs: z.array(StratzHeroVsHeroEntrySchema).optional(),
}).passthrough()

export const StratzMatchupResponseSchema = z.object({
  data: z.object({
    heroStats: z.object({
      heroVsHeroMatchup: z.object({
        advantage: z.array(StratzHeroDryadSchema).optional(),
        disadvantage: z.array(StratzHeroDryadSchema).optional(),
      }).passthrough().optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough()

// Inferred types for use in service layer
export type StratzHeroDryadEntry = z.infer<typeof StratzHeroDryadSchema>
export type StratzHeroVsHeroEntry = z.infer<typeof StratzHeroVsHeroEntrySchema>
```

---

### `client/src/components/WinProbBar.tsx` (component, request-response)

**Analog:** `client/src/components/ScoreHeader.tsx`

**Inline style pattern** (`client/src/components/ScoreHeader.tsx` lines 40-53):
```typescript
// Project uses inline style={{ }} for ALL color/theme values — never Tailwind color classes.
// Dark theme constants: #0a0a0a bg, #d8d8d8 text, #4ade80 Radiant, #ef4444 Dire, #1a1a1a borders.
// Tailwind className used only for layout utilities (flex, items-center, gap-*, w-full, etc.).
```

**Props interface + early-return gate pattern** (`client/src/components/ScoreHeader.tsx` lines 6-20):
```typescript
// WinProbBar: prop name is `gameDuration` (NOT `gameTime`) — matches EnrichedGame.duration field.
// CRITICAL: gate check must use match.duration, not match.game_time (field does not exist).
export interface WinProbBarProps {
  radiantWinProb: number | null       // from useWinProbability (null = Stratz unavailable)
  gameDuration: number | undefined    // match.duration from Valve payload — NOT game_time
  gameState: number | undefined       // match.game_state
}

export default function WinProbBar({ radiantWinProb, gameDuration, gameState }: WinProbBarProps) {
  // D-06: hide when not in-game, before 5 min, or Stratz unavailable.
  // Silent hide — no placeholder, no error message.
  if (gameState !== 5 || (gameDuration ?? 0) <= 300 || radiantWinProb === null) {
    return null
  }
  // ...
}
```

**Gradient bar inline style pattern** (from CONTEXT.md D-05, RESEARCH.md §WinProbBar Component Structure):
```typescript
// Full-width bar: height 8px, border-radius 4px, linear-gradient split at radiantPct%.
// CSS transition for smooth probability shifts (Claude's discretion — D-05 animation).
const radiantPct = Math.round(radiantWinProb * 100)
const direPct = 100 - radiantPct

// Outer container — matches ScoreHeader's borderBottom spacing convention
<div className="w-full mt-4 mb-6">
  {/* Gradient bar */}
  <div
    role="progressbar"
    aria-valuenow={radiantPct}
    aria-valuemin={0}
    aria-valuemax={100}
    style={{
      height: 8,
      borderRadius: 4,
      background: `linear-gradient(to right, #4ade80 ${radiantPct}%, #ef4444 ${radiantPct}%)`,
      transition: 'background 500ms ease',
    }}
  />
  {/* Labels row — Radiant left, Dire right */}
  <div className="flex justify-between mt-1">
    <span className="text-xs font-mono tabular-nums" style={{ color: '#4ade80' }}>
      {radiantPct}%
    </span>
    <span className="text-xs font-mono tabular-nums" style={{ color: '#ef4444' }}>
      {direPct}%
    </span>
  </div>
  {/* Team name labels */}
  <div className="flex justify-between mt-0.5">
    <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: '#4ade80' }}>
      Radiant
    </span>
    <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: '#ef4444' }}>
      Dire
    </span>
  </div>
</div>
```

---

### `client/src/hooks/useWinProbability.ts` (hook, request-response)

**Analog:** `client/src/hooks/useMatchIntel.ts`

**Pure interval helper + export** (`client/src/hooks/useMatchIntel.ts` lines 33-36):
```typescript
// Pure helper — ALWAYS export for unit testing (Wave 0 useWinProbability.test.ts).
// Mirrors computeIntelInterval / computeDraftInterval pattern exactly.
// CRITICAL: game_state === 6 MUST return false FIRST (CLAUDE.md §Critical Pitfalls).
export function computeWinProbInterval(
  gameState: number | undefined,
  duration: number | undefined,
): number | false {
  if (gameState === 6) return false          // MUST be first guard
  if (gameState === 5 && (duration ?? 0) > 300) return 30_000
  return false
}
```

**Response interface pattern** (`client/src/hooks/useMatchIntel.ts` lines 4-21):
```typescript
export interface WinProbResponse {
  radiantWinProb: number | null   // null = Stratz unavailable (D-08, D-13)
  gameState: number | null        // from Valve payload — for refetchInterval callback
  duration: number | null         // from Valve payload — for refetchInterval callback
}
```

**Fetch function pattern** (`client/src/hooks/useMatchIntel.ts` lines 38-42):
```typescript
// BFF endpoint is a separate route for cache isolation (Claude's discretion per D-15).
async function fetchWinProb(matchId: string): Promise<WinProbResponse> {
  const res = await fetch(`/api/live/winprob/${matchId}`)
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<WinProbResponse>
}
```

**useQuery v5 hook pattern** (`client/src/hooks/useMatchIntel.ts` lines 52-61):
```typescript
// CRITICAL (TQ v5): refetchInterval callback reads q.state.data — NOT a select-transformed view.
// staleTime slightly below cadence (25_000 < 30_000) — mirrors useMatchDetail pattern.
export function useWinProbability(matchId: string | undefined) {
  return useQuery<WinProbResponse>({
    queryKey: ['win-prob', matchId],
    queryFn: () => fetchWinProb(matchId!),
    enabled: !!matchId,
    refetchInterval: (q: Query<WinProbResponse>) =>
      computeWinProbInterval(
        q.state.data?.gameState ?? undefined,
        q.state.data?.duration ?? undefined,
      ),
    staleTime: 25_000,
  })
}
```

**Import block** (`client/src/hooks/useMatchIntel.ts` line 1):
```typescript
import { useQuery, type Query } from '@tanstack/react-query'
```

---

### `server/src/env.ts` (config, modify)

**Analog:** `server/src/env.ts` (self)

**Field addition pattern** (`server/src/env.ts` lines 3-8):
```typescript
// Add STRATZ_TOKEN as a required .min(1) field — server MUST refuse to start without it (D-01).
// Matches the style of VALVE_API_KEY on line 7.
const EnvSchema = z.object({
  PORT: z.string().default('3001'),
  UPSTASH_REDIS_URL: z.string().min(1, 'UPSTASH_REDIS_URL is required. Get it from https://console.upstash.com'),
  UPSTASH_REDIS_TOKEN: z.string().min(1, 'UPSTASH_REDIS_TOKEN is required. Get it from https://console.upstash.com'),
  VALVE_API_KEY: z.string().min(1, 'VALVE_API_KEY is required. Get it from https://steamcommunity.com/dev/apikey'),
  STRATZ_TOKEN: z.string().min(1, 'STRATZ_TOKEN is required. Get it from https://stratz.com/api'),  // D-01
})
```

---

### `server/src/cache.ts` (config, modify)

**Analog:** `server/src/cache.ts` (self)

**TTL constant addition pattern** (`server/src/cache.ts` lines 33-38):
```typescript
// Add WIN_PROB = 60 as the last entry in the TTL object.
// TTL.HERO_STATS = 21_600 is already used for stratz:matchups:{heroId} (D-11).
export const TTL = {
  LIVE_MATCH: 30,
  DRAFT: 4,
  HERO_STATS: 21_600,
  PLAYER_STATS: 900,
  WIN_PROB: 60,        // D-07: 2× the 30s client poll cadence → 1 Stratz call/min per match
} as const
```

---

### `server/src/routes/live.ts` (route, request-response — modify)

**Analog:** `server/src/routes/live.ts` lines 69-91 (existing `/draft/:matchId` route)

**matchId validation + 400 pattern** (`server/src/routes/live.ts` lines 70-74):
```typescript
// COPY EXACTLY — same guard used in /draft/:matchId and /intel/:matchId.
const rawMatchId = c.req.param('matchId')
const parsedId = Number(rawMatchId)
if (!Number.isFinite(parsedId)) {
  return c.json({ error: 'Invalid matchId' }, 400)
}
```

**New route shape for `/winprob/:matchId`** (`server/src/routes/live.ts` lines 76-91, pattern):
```typescript
// New route — add AFTER /intel/:matchId, BEFORE export default liveRoutes.
// Returns { radiantWinProb, gameState, duration } so client can compute refetchInterval
// without a separate useMatchDetail read.
liveRoutes.get('/winprob/:matchId', async (c) => {
  const rawMatchId = c.req.param('matchId')
  const parsedId = Number(rawMatchId)
  if (!Number.isFinite(parsedId)) {
    return c.json({ error: 'Invalid matchId' }, 400)
  }
  try {
    const [winProb, data] = await Promise.all([
      getWinProbability(parsedId),
      getLiveLeagueGamesFast(),
    ])
    const game = data.result.games?.find(g => g.match_id === parsedId)
    return c.json({
      radiantWinProb: winProb,
      gameState: game?.game_state ?? null,
      duration: game?.duration ?? null,
    })
  } catch {
    return c.json({ error: 'Upstream error' }, 502)
  }
})
```

**Intel aggregator modification** (`server/src/routes/live.ts` lines 3-4, 156-160):
```typescript
// CHANGE import line 3:
//   FROM: import { getLeagueName, getPlayerHeroes, getHeroMatchups } from '../services/openDotaApi.js'
//   TO:   import { getLeagueName, getPlayerHeroes } from '../services/openDotaApi.js'
//         import { getHeroMatchupsStratz, rankCountersStratz } from '../services/stratzApi.js'

// CHANGE line 4 (rankCounters import):
//   FROM: import { rankCounters, applyKnownToPlay } from '../services/intel.js'
//   TO:   import { applyKnownToPlay } from '../services/intel.js'
//   (rankCounters is replaced by rankCountersStratz)

// CHANGE lines 156-160 (matchup fetch in intel aggregator):
//   FROM: Promise.allSettled(uniqueHeroIds.map(heroId => getHeroMatchups(heroId)))
//   TO:   Promise.allSettled(uniqueHeroIds.map(heroId => getHeroMatchupsStratz(heroId)))

// CHANGE matchup transform (lines 192-198):
//   FROM: matchupByHero.set(heroId, rankCounters(result.value))
//   TO:   matchupByHero.set(heroId, rankCountersStratz(result.value.advantage ?? []))
```

---

### `server/src/services/openDotaApi.ts` (service, modify — remove matchup functions)

**Analog:** `server/src/services/openDotaApi.ts` (self)

**Lines to remove** (`server/src/services/openDotaApi.ts` lines 1-4, 129-158):
```typescript
// REMOVE from import line 3:
//   HeroMatchupSchema  (no longer needed in this file)

// REMOVE entirely (lines 129-158):
//   async function fetchHeroMatchups(heroId: number): Promise<...> { ... }
//   export function getHeroMatchups(heroId: number): Promise<...> { ... }
```

---

### `server/src/schemas/openDota.ts` (model, modify — remove HeroMatchupSchema)

**Analog:** `server/src/schemas/openDota.ts` (self)

**Lines to remove** (`server/src/schemas/openDota.ts` lines 43-51):
```typescript
// REMOVE entirely:
//   export const HeroMatchupSchema = z.object({ ... }).passthrough()
//   export type HeroMatchup = z.infer<typeof HeroMatchupSchema>
//
// ALSO REMOVE from bottom (lines 62-66):
//   export interface CounterHeroEntry { ... }  — if only used by matchup transform, remove too.
//   (Verify nothing else imports HeroMatchupSchema or CounterHeroEntry before deleting)
```

---

### `client/src/pages/MatchPage.tsx` (component, modify — insert WinProbBar)

**Analog:** `client/src/pages/MatchPage.tsx` (self)

**Import additions** (`client/src/pages/MatchPage.tsx` lines 1-11):
```typescript
// ADD after existing imports:
import WinProbBar from '../components/WinProbBar'
import { useWinProbability } from '../hooks/useWinProbability'
```

**Hook call addition** (`client/src/pages/MatchPage.tsx` lines 14-17):
```typescript
// ADD after existing hook calls (useMatchIntel line 17):
const winProb = useWinProbability(matchId)
```

**WinProbBar insertion** (`client/src/pages/MatchPage.tsx` lines 65-71):
```tsx
// INSERT between <ScoreHeader> (line 67) and <DraftSection> (line 71).
// D-04: position is immediately under ScoreHeader.
// D-06: WinProbBar self-gates (returns null when conditions not met).
{match && (
  <ScoreHeader match={match} />
)}

{/* Phase 6 D-04: Win probability bar — self-hides when Stratz unavailable or before 5 min */}
<WinProbBar
  radiantWinProb={winProb.data?.radiantWinProb ?? null}
  gameDuration={match?.duration}
  gameState={match?.game_state}
/>

{draft.scoreboard && (
  <DraftSection ... />
)}
```

---

## Shared Patterns

### Service Error Handling (try/catch → return null)
**Source:** `server/src/services/openDotaApi.ts` lines 14-33
**Apply to:** ALL functions in `stratzApi.ts`
```typescript
// Every fetch function follows this exact structure. Never throw. Never return partial data.
async function fetchXxx(...): Promise<T | null> {
  let res: Response
  try {
    res = await fetch(...)
  } catch (err) {
    console.error('[stratzApi] Network error fetching xxx:', (err as Error).message)
    return null
  }
  if (!res.ok) {
    console.error(`[stratzApi] xxx fetch error: ${res.status} ${res.statusText}`)
    return null
  }
  const raw: unknown = await res.json()
  const parsed = XxxSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[stratzApi] XxxSchema parse failure for id', id)
    return null
  }
  return parsed.data.data?.... ?? null
}
```

### cached() Wrapper (only path to upstream)
**Source:** `server/src/cache.ts` lines 53-82, `server/src/services/openDotaApi.ts` lines 41-43
**Apply to:** All exported functions in `stratzApi.ts`
```typescript
// Public export is ALWAYS cached(). Never export the raw fetch function.
// Cache key format: 'stratz:{type}:{id}' — content-keyed, never per-user.
export function getXxx(id: number): Promise<T | null> {
  return cached(`stratz:xxx:${id}`, TTL.XXX, () => fetchXxx(id))
}
```

### Route matchId Validation (400 guard)
**Source:** `server/src/routes/live.ts` lines 70-74
**Apply to:** New `/winprob/:matchId` route
```typescript
const rawMatchId = c.req.param('matchId')
const parsedId = Number(rawMatchId)
if (!Number.isFinite(parsedId)) {
  return c.json({ error: 'Invalid matchId' }, 400)
}
```

### Route Opaque 502 Error
**Source:** `server/src/routes/live.ts` lines 88-90
**Apply to:** New `/winprob/:matchId` route
```typescript
} catch {
  return c.json({ error: 'Upstream error' }, 502)
}
// NEVER forward Stratz error details in response — info disclosure risk.
```

### Zod Schema Conventions
**Source:** `server/src/schemas/openDota.ts` lines 1-9, `server/src/schemas/valve.ts` lines 1-4
**Apply to:** `server/src/schemas/stratz.ts`
```typescript
// Rule 1: EVERY schema has .passthrough() at the end.
// Rule 2: EVERY field is .optional() — never required fields on external API responses.
// Rule 3: Nested objects also get .passthrough().optional() — not just the top level.
// Rule 4: Export inferred TypeScript types alongside schemas (export type X = z.infer<typeof XSchema>).
```

### TanStack Query v5 Hook Pattern
**Source:** `client/src/hooks/useMatchIntel.ts` lines 52-61
**Apply to:** `client/src/hooks/useWinProbability.ts`
```typescript
// Rule 1: Always export pure computeXxxInterval() helper for unit testing.
// Rule 2: refetchInterval callback reads q.state.data (v5 API) — not a select view.
// Rule 3: staleTime slightly below polling cadence (25_000 for 30s polls).
// Rule 4: game_state === 6 check MUST come first in interval function (CLAUDE.md pitfall).
// Rule 5: enabled: !!matchId — never fire without an ID.
```

### Dark Theme Inline Styles
**Source:** `client/src/components/ScoreHeader.tsx` lines 48-53, `client/src/pages/MatchPage.tsx` lines 27-29
**Apply to:** `client/src/components/WinProbBar.tsx`
```typescript
// #4ade80 = Radiant green, #ef4444 = Dire red
// #0a0a0a = page background, #1a1a1a = border/divider, #d8d8d8 = body text
// Use Tailwind only for layout (flex, gap-*, w-full, mt-*, mb-*)
// Use inline style={{ }} for ALL colors and pixel values
```

### Server Test Mocking Pattern
**Source:** `server/src/services/openDotaApi.test.ts` lines 1-19
**Apply to:** `server/src/services/stratzApi.test.ts` (Wave 0 gap file)
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('ioredis', () => {
  const RedisMock = vi.fn(function () {
    return { get: vi.fn(), set: vi.fn(), on: vi.fn() }
  })
  return { Redis: RedisMock, default: RedisMock }
})

vi.mock('../env.js', () => ({
  env: {
    PORT: '3001',
    UPSTASH_REDIS_URL: 'rediss://test.upstash.io:6380',
    UPSTASH_REDIS_TOKEN: 'test-token',
    VALVE_API_KEY: 'test-key',
    STRATZ_TOKEN: 'test-stratz-token',  // ADD this for Phase 6
  },
}))
```

### Client Test Pattern (pure helper)
**Source:** `client/src/hooks/useMatchIntel.test.ts` lines 1-2
**Apply to:** `client/src/hooks/useWinProbability.test.ts` (Wave 0 gap file)
```typescript
import { describe, it, expect } from 'vitest'
import { computeWinProbInterval } from './useWinProbability'
// No vi.mock needed — pure function, no React mounting required.
```

---

## No Analog Found

All files have close codebase analogs. No files require fallback to RESEARCH.md patterns only.

---

## Critical Pitfalls (from RESEARCH.md — executor must read)

| Pitfall | File | Guard Required |
|---|---|---|
| `match.game_time` does not exist — use `match.duration` | `WinProbBar.tsx`, `MatchPage.tsx` | Prop named `gameDuration`, read `match?.duration` |
| `game_state === 6` polling must stop FIRST | `useWinProbability.ts` | `if (gameState === 6) return false` as first guard in `computeWinProbInterval` |
| `liveWinRateValues` may be empty array | `stratzApi.ts` | `if (!values || values.length === 0) return null` |
| `bracketIds: [PROFESSIONAL]` enum value does not exist | `stratzApi.ts` | Use `bracketBasicIds: [DIVINE_IMMORTAL]` or omit filter; verify at runtime |
| `advantage[].vs[]` is nested, not flat | `stratzApi.ts`, `intel.ts` | Flatten with `.flatMap(entry => entry.vs ?? [])` |
| Stratz token leakage to client | `stratzApi.ts`, routes | Token only in `env.ts` server-side; never returned in response body |

---

## Metadata

**Analog search scope:** `server/src/services/`, `server/src/schemas/`, `server/src/routes/`, `server/src/`, `client/src/hooks/`, `client/src/components/`, `client/src/pages/`
**Files scanned:** 16 server + 34 client = 50 files
**Pattern extraction date:** 2026-04-26
