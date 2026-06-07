# Phase 4: Draft UX - Pattern Map

**Mapped:** 2026-04-24
**Files analyzed:** 13 (10 new, 3 modified)
**Analogs found:** 13 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/schemas/valve.ts` | schema | — | self (extend `LiveGameSchema`, mirror `PlayerSchema`/`TeamSchema`) | exact (extension) |
| `server/src/cache.ts` | config/cache | — | self (extend `TTL` const object) | exact (extension) |
| `server/src/routes/live.ts` | BFF route | request-response | self (same file — sibling handler `GET /games`) | exact |
| `client/src/hooks/useDraftDetail.ts` | hook | request-response (polling) | `client/src/hooks/useMatchDetail.ts` | exact |
| `client/src/hooks/useMatchDetail.ts` | hook | request-response | self (remove stale comment, no logic change) | exact |
| `client/src/utils/draftOrder.ts` | utility | transform (pure) | `client/src/utils/formatGoldDiff.ts` | role-match |
| `client/src/components/DraftSection.tsx` | component | request-response (presentational) | `client/src/components/HeroPlayerGrid.tsx` | exact |
| `client/src/components/DraftColumn.tsx` | component | transform | `client/src/components/BuildingsSection.tsx` (two-column mirror) + `MatchRow.tsx` (ember hover) | role-match (glow pattern) |
| `client/src/components/DraftPortrait.tsx` | component | transform | `client/src/components/PlayerRow.tsx` (portrait cell, lines 45-64) | role-match |
| `client/src/components/DraftTurnIndicator.tsx` | component | transform | `client/src/components/StatusTag.tsx` | role-match |
| `client/src/pages/MatchPage.tsx` | page | request-response | self (insert `<DraftSection>` between lines 54 and 57) | exact |
| `client/src/utils/draftOrder.test.ts` | test | — | `client/src/utils/formatGoldDiff.test.ts` | exact |
| `server/src/schemas/valve.test.ts` | test | — | `server/src/cache.test.ts` (vitest + `import('./module.js')` pattern) | role-match (new test file) |

**Hook test & component tests:** CONTEXT mentions `useDraftDetail.test.ts` and `DraftPortrait.test.tsx`. **WARNING:** `client/package.json` does NOT include `@testing-library/react`, `@testing-library/react-hooks`, or `jsdom`. Zero `.test.tsx` files exist in the project. All current client tests are pure-function unit tests (`utils/*.test.ts`, `hooks/useLiveGames.test.ts` which tests the exported pure `groupByLeague`). The planner should either (a) keep tests pure-function only — cover `useDraftDetail` by extracting its logic into a testable `computeDraftInterval(data)` helper and testing that via vitest, or (b) explicitly add `@testing-library/react` + `jsdom` deps before writing `.test.tsx`. Prefer (a) to match existing conventions.

---

## Pattern Assignments

### `server/src/schemas/valve.ts` (schema extension)

**Analog:** self — mirror the existing `PlayerSchema` (lines 6-24) and `TeamSchema` (lines 26-33) style.

**Imports pattern** (line 1 — already in file):
```typescript
import { z } from 'zod'
```

**Schema declaration pattern** (copy exactly — from `PlayerSchema` lines 6-24 and `TeamSchema` lines 26-33):
```typescript
// Every sub-schema is .passthrough(); every field is .optional() (pre-lock / pre-draft safe).
// CRITICAL: .passthrough() on EVERY schema — Valve adds fields silently each patch.
const DraftItemSchema = z
  .object({
    hero_id: z.number().optional(), // optional per .passthrough() discipline — picks pre-lock can arrive without it
  })
  .passthrough()

const TeamScoreboardSchema = z
  .object({
    picks: z.array(DraftItemSchema).optional(),
    bans: z.array(DraftItemSchema).optional(),
    // score, tower_state, barracks_state, heroes — all pass through silently (Phase 4 does not type them)
  })
  .passthrough()

const ScoreboardSchema = z
  .object({
    radiant: TeamScoreboardSchema.optional(),
    dire: TeamScoreboardSchema.optional(),
  })
  .passthrough()
```

**Integration pattern** (copy form from `LiveGameSchema` line 52 where `players` is declared):
```typescript
// Inside LiveGameSchema, alongside existing `players` field (line 52):
scoreboard: ScoreboardSchema.optional(),
```

**Type export pattern** (line 69-70 of `valve.ts` — mirror for new types if needed):
```typescript
// Do NOT add a type export unless the server or shared code imports it directly.
// Consumers already get the shape via LiveGame (z.infer<typeof LiveGameSchema>).
```

---

### `server/src/cache.ts` (TTL constant extension)

**Analog:** self — extend the `TTL` const object at line 33-37.

**Core pattern** (extend lines 33-37):
```typescript
// Current:
export const TTL = {
  LIVE_MATCH: 30,
  HERO_STATS: 21_600,  // 6 hours
  PLAYER_STATS: 900,   // 15 minutes
} as const

// After D-15:
export const TTL = {
  LIVE_MATCH: 30,
  DRAFT: 4,            // 1s below the 5s client poll cadence → every client poll sees fresh upstream
  HERO_STATS: 21_600,  // 6 hours
  PLAYER_STATS: 900,   // 15 minutes
} as const
```

**No other changes to `cache.ts`.** The `cached()` function is ttl-agnostic — reuse as-is.

---

### `server/src/routes/live.ts` — new handler `GET /draft/:matchId`

**Analog:** self — mirror the shape of `liveRoutes.get('/games', ...)` (lines 16-39).

**Imports pattern** (lines 1-3 already include what's needed):
```typescript
import { Hono } from 'hono'
import { getLiveLeagueGames } from '../services/valveApi.js'
// NO getLeagueName import — draft route does NOT enrich league_name (per D-16)
```

**Core pattern** (model on `liveRoutes.get('/games', ...)` lines 16-39, but no league enrichment):
```typescript
/**
 * GET /api/live/draft/:matchId
 * Returns draft state (game_state + scoreboard) for a single live match.
 * Valve data cached TTL.DRAFT (4s) — 1 upstream call per 4s regardless of viewer count.
 * 404 if the match is not currently in the live-games payload.
 * Response shape: { match_id, game_state, scoreboard }
 *
 * Rationale (D-16): thin pass-through, NO league_name enrichment.
 * MatchPage gets league_name via the separate useMatchDetail/live-games cache.
 */
liveRoutes.get('/draft/:matchId', async (c) => {
  const matchId = c.req.param('matchId')
  const parsedId = Number(matchId)
  if (!Number.isFinite(parsedId)) {
    return c.json({ error: 'Invalid matchId' }, 400)
  }

  // getLiveLeagueGames() is already wrapped in cached('live_games', TTL.LIVE_MATCH, ...).
  // Phase 4 needs a SECOND cache lane (TTL.DRAFT = 4s) keyed differently so draft
  // polling does not evict the 30s live-games cache. Planner call:
  //   Option A (recommended): add a new service `getLiveLeagueGamesFast()` in valveApi.ts
  //     that calls cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames).
  //   Option B: inline the cached() wrap here (less clean — duplicates upstream path).
  // Use Option A to keep valveApi.ts as the single upstream gatekeeper (CLAUDE.md §Key Patterns).

  const data = await getLiveLeagueGamesFast()
  const game = data.result.games?.find((g) => g.match_id === parsedId)
  if (!game) {
    return c.json({ error: 'Match not live' }, 404)
  }

  return c.json({
    match_id: game.match_id,
    game_state: game.game_state,
    scoreboard: game.scoreboard,
  })
})
```

**Error-shape pattern** — Valve route returns JSON `{ error: string }` + status code. There is no existing 404 in `live.ts`, so no in-file analog. Use `c.json(payload, status)` — Hono idiomatic form.

**Cache key pattern** (copy verbatim from `valveApi.ts` line 26):
```typescript
// In valveApi.ts — add alongside existing getLiveLeagueGames:
export function getLiveLeagueGamesFast(): Promise<LiveLeagueGames> {
  return cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames)
}
// Distinct cache key — does NOT collide with 'live_games' (30s).
```

---

### `client/src/hooks/useDraftDetail.ts` (hook, request-response/polling)

**Analog:** `client/src/hooks/useMatchDetail.ts` — nearly identical TQ v5 structure; `useDraftDetail` differs only in (a) dynamic `refetchInterval` callback, (b) different endpoint, (c) different query key.

**Imports pattern** (model on `useMatchDetail.ts` lines 1-5 and `useLiveGames.ts` line 1):
```typescript
import { useQuery, type Query } from '@tanstack/react-query'
import { inferActiveTeam, inferFirstPickFromHistory } from '../utils/draftOrder'
```

**Response type pattern** (mirror `LiveGamesResponse` in `useLiveGames.ts` lines 43-45 — declare the draft-route shape):
```typescript
export interface DraftItem {
  hero_id?: number
  [key: string]: unknown // .passthrough() — never strip unknown fields
}

export interface TeamScoreboard {
  picks?: DraftItem[]
  bans?: DraftItem[]
  [key: string]: unknown
}

export interface Scoreboard {
  radiant?: TeamScoreboard
  dire?: TeamScoreboard
  [key: string]: unknown
}

export interface DraftResponse {
  match_id: number
  game_state?: number
  scoreboard?: Scoreboard
}
```

**Fetch function pattern** (copy from `useLiveGames.ts` lines 47-51):
```typescript
async function fetchDraft(matchId: string): Promise<DraftResponse> {
  const res = await fetch(`/api/live/draft/${matchId}`)
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<DraftResponse>
}
```

**Core pattern — dynamic `refetchInterval`** (extend `useMatchDetail.ts` lines 31-37 to use the callback form per D-12 + RESEARCH §1):
```typescript
/**
 * TanStack Query v5 hook — polls GET /api/live/draft/:matchId.
 * Dynamic cadence (D-12):
 *   game_state === 2 → 5_000 ms (draft live)
 *   anything else    → false   (one fetch, no polling — scoreboard frozen after draft)
 * CLAUDE.md §Critical Pitfalls: polling MUST stop on game_state === 6.
 * CRITICAL (v5): read data via query.state.data — the callback does NOT get the select-transformed view.
 */
export function useDraftDetail(matchId: string | undefined) {
  const query = useQuery<DraftResponse>({
    queryKey: ['draft', matchId],
    queryFn: () => fetchDraft(matchId!),
    enabled: !!matchId, // skip entirely when route param missing
    refetchInterval: (q: Query<DraftResponse>) => {
      const gs = q.state.data?.game_state
      return gs === 2 ? 5_000 : false
    },
    staleTime: 4_000, // strictly below 5s draft cadence so interval refetches always fire (RESEARCH §1 gotcha)
  })

  const scoreboard = query.data?.scoreboard
  const gameState = query.data?.game_state

  // Turn inference (D-08) — pure functions from utils/draftOrder.
  const firstPick = scoreboard ? inferFirstPickFromHistory(scoreboard) : null
  const radiant = scoreboard?.radiant ?? {}
  const dire = scoreboard?.dire ?? {}
  const inferred = inferActiveTeam(
    {
      rPicks: radiant.picks?.length ?? 0,
      dPicks: dire.picks?.length ?? 0,
      rBans: radiant.bans?.length ?? 0,
      dBans: dire.bans?.length ?? 0,
    },
    firstPick,
  )

  return {
    scoreboard,
    gameState,
    activeTeam: inferred?.team === 0 ? 'radiant' as const : inferred?.team === 1 ? 'dire' as const : null,
    action: inferred?.action ?? null,
    tentative: firstPick === null && gameState === 2, // D-08 — show best-guess with tentativeness marker
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
```

**Polling-stop pattern — load-bearing** (copy verbatim the CLAUDE.md pitfall guard — see `useMatchDetail.ts` line 35 for the `game_state === 6 ? false` idiom; here we extend it with the 5s branch):
```typescript
// game_state === 2  → 5_000    (draft)
// game_state === 5  → false    (in-game — scoreboard frozen; no more picks coming)
// game_state === 6  → false    (post-game — MUST stop per CLAUDE.md §Critical Pitfalls)
// undefined          → false    (pre-data — first fetch already in flight via enabled: true)
```

---

### `client/src/hooks/useMatchDetail.ts` (hook — MODIFY, no logic change)

**Analog:** self.

**Change:** Remove the now-stale comment on line 16 (`// Phase 4 upgrades to dynamic`) per D-13. Keep the plain `refetchInterval` number form (lines 34-35). The 5s polling concern moved to `useDraftDetail`.

**Diff:**
```typescript
// BEFORE (line 16):
 * CRITICAL (TQ v5): refetchInterval is a plain number — NOT a callback (Phase 4 upgrades to dynamic).

// AFTER:
 * CRITICAL (TQ v5): refetchInterval is a plain number. Draft-speed 5s polling lives in useDraftDetail (Phase 4 D-12/D-13).
```

**Everything else stays identical.** No other edits.

---

### `client/src/utils/draftOrder.ts` (utility, transform — pure)

**Analog:** `client/src/utils/formatGoldDiff.ts` (pure exported function with JSDoc header, no imports, fully testable in vitest).

**Imports pattern** (from `formatGoldDiff.ts` — no imports, pure module):
```typescript
// No imports — pure functions only, exportable for unit testing.
```

**Core pattern — constant table + pure inference** (style mirrors `gameState.ts` map pattern):
```typescript
// Captain's Mode 7.40 sequence (24 steps: 14 bans + 10 picks).
// Each entry: [actingTeam, action] where team is 0=Radiant, 1=Dire.
// Source: Liquipedia Game Modes (verified Apr 2026).
// RESEARCH.md §2 flagged first-pick ambiguity — sequence is for "team 0 (Radiant) first pick".
const CM_740_RADIANT_FIRST: ReadonlyArray<readonly [0 | 1, 'ban' | 'pick']> = [
  // Ban phase 1 (7 bans): R-D-R-D-R-D-R
  [0,'ban'],[1,'ban'],[0,'ban'],[1,'ban'],[0,'ban'],[1,'ban'],[0,'ban'],
  // Pick phase 1 (4 picks): R-D-D-R
  [0,'pick'],[1,'pick'],[1,'pick'],[0,'pick'],
  // Ban phase 2 (4 bans): D-R-D-R
  [1,'ban'],[0,'ban'],[1,'ban'],[0,'ban'],
  // Pick phase 2 (4 picks): D-R-D-R
  [1,'pick'],[0,'pick'],[1,'pick'],[0,'pick'],
  // Ban phase 3 (2 bans): D-R
  [1,'ban'],[0,'ban'],
  // Pick phase 3 (2 picks): R-D
  [0,'pick'],[1,'pick'],
]

function mirror(
  seq: ReadonlyArray<readonly [0 | 1, 'ban' | 'pick']>,
): ReadonlyArray<readonly [0 | 1, 'ban' | 'pick']> {
  return seq.map(([t, a]) => [t === 0 ? 1 : 0, a] as const)
}

/**
 * Pure inference: given per-team completed counts and the (maybe unknown) first-pick team,
 * return the team + action expected NEXT in the CM 7.40 sequence.
 * Returns null when the draft is complete, when counts exceed sequence length, or when
 * firstPickTeam is null (caller surfaces tentative state per D-08).
 */
export function inferActiveTeam(
  counts: { rPicks: number; dPicks: number; rBans: number; dBans: number },
  firstPickTeam: 0 | 1 | null,
): { team: 0 | 1; action: 'pick' | 'ban' } | null {
  if (firstPickTeam === null) return null
  const seq = firstPickTeam === 0 ? CM_740_RADIANT_FIRST : mirror(CM_740_RADIANT_FIRST)
  const completedSteps = counts.rPicks + counts.dPicks + counts.rBans + counts.dBans
  if (completedSteps >= seq.length) return null
  const entry = seq[completedSteps]
  return { team: entry[0], action: entry[1] }
}

/**
 * Heuristic: infer which team has first pick by comparing per-team counts against
 * both candidate sequences. Returns 0 (Radiant), 1 (Dire), or null when ambiguous
 * (both sequences match the observed counts — D-08 tentative state).
 */
export function inferFirstPickFromHistory(scoreboard: {
  radiant?: { picks?: unknown[]; bans?: unknown[] }
  dire?:    { picks?: unknown[]; bans?: unknown[] }
}): 0 | 1 | null {
  // Implementation sketch: for each candidate firstPick (0, 1), walk the sequence
  // and check that radiant/dire counts at every prefix are achievable. Return the
  // unique matching candidate, or null if both match or neither matches.
  // Full logic belongs in the executor plan — this file defines the contract.
  void scoreboard
  return null
}
```

**Why `formatGoldDiff.ts` is the analog:** both are pure, side-effect-free transforms with a narrow return type (`{ text, color }` there; `{ team, action } | null` here), both are exported for unit testing, both live in `client/src/utils/`. Style matches: leading JSDoc, explicit return-type annotation, no React imports.

---

### `client/src/components/DraftSection.tsx` (component — top-level draft widget)

**Analog:** `client/src/components/HeroPlayerGrid.tsx` — same "two team columns side by side with a group label per column" shape. Also references `MatchPage.tsx` for the `mt-12` section rhythm.

**Imports pattern** (model on `HeroPlayerGrid.tsx` lines 1-2):
```typescript
import DraftColumn from './DraftColumn'
import DraftTurnIndicator from './DraftTurnIndicator'
import type { Scoreboard } from '../hooks/useDraftDetail'
```

**Props interface** (model on `HeroPlayerGrid.tsx` lines 4-16 — explicit shape, no `any`):
```typescript
interface DraftSectionProps {
  scoreboard: Scoreboard           // caller already checked presence (D-10)
  gameState: number | undefined
  activeTeam: 'radiant' | 'dire' | null
  action: 'pick' | 'ban' | null
  tentative: boolean
}
```

**Core JSX pattern** (copy the `<section>` + two-column flex from UI-SPEC §Component Inventory):
```typescript
export default function DraftSection({
  scoreboard, gameState, activeTeam, action, tentative,
}: DraftSectionProps) {
  const radiantPicks = scoreboard.radiant?.picks ?? []
  const radiantBans  = scoreboard.radiant?.bans  ?? []
  const direPicks    = scoreboard.dire?.picks    ?? []
  const direBans     = scoreboard.dire?.bans     ?? []

  return (
    <section className="mt-12">
      <DraftTurnIndicator
        activeTeam={activeTeam}
        action={action}
        tentative={tentative}
        gameState={gameState}
      />
      <div className="flex items-start gap-6">
        <DraftColumn
          team="radiant"
          picks={radiantPicks}
          bans={radiantBans}
          isActive={activeTeam === 'radiant' && gameState === 2}
          tentative={tentative && activeTeam === 'radiant'}
        />
        <DraftColumn
          team="dire"
          picks={direPicks}
          bans={direBans}
          isActive={activeTeam === 'dire' && gameState === 2}
          tentative={tentative && activeTeam === 'dire'}
        />
      </div>
    </section>
  )
}
```

**Why HeroPlayerGrid is the analog:** both render a Radiant + Dire pair stacked identically, both use 10px uppercase group labels (already shown in `HeroPlayerGrid.tsx` lines 64-65 and 72-73 — `text-[10px] uppercase tracking-[0.3em] font-bold mb-2` with Radiant `#4ade80` / Dire `#ef4444`), both are conditionally rendered by their caller based on upstream availability.

---

### `client/src/components/DraftColumn.tsx` (component — one team's picks + bans grid with glow)

**Analog:**
1. `client/src/components/BuildingsSection.tsx` lines 33-73 — "two symmetric team columns with a label and a row of cells each" layout.
2. `client/src/components/MatchRow.tsx` lines 19-37 — the ember-border hover pattern to reuse for the active-column glow.

**Imports pattern** (model on `BuildingsSection.tsx` line 1-2 and `HeroPlayerGrid.tsx` line 1):
```typescript
import DraftPortrait from './DraftPortrait'
import type { DraftItem } from '../hooks/useDraftDetail'
```

**Props interface:**
```typescript
interface DraftColumnProps {
  team: 'radiant' | 'dire'
  picks: DraftItem[]
  bans: DraftItem[]
  isActive: boolean
  tentative: boolean
}
```

**Ember glow pattern** (copy verbatim the color + transition from `MatchRow.tsx` lines 22-31, adapt from hover-event → prop-driven):
```typescript
// MatchRow.tsx uses onMouseEnter/Leave to toggle:
//   background: '#111111', borderLeftColor: '#b03030'
// DraftColumn uses isActive prop instead of hover:
style={{
  borderLeft: isActive && !tentative ? '2px solid #b03030'
            : isActive && tentative  ? '2px dashed #b03030'
            : '2px solid transparent',
  boxShadow: isActive && !tentative ? '-4px 0 12px rgba(176,48,48,0.25)'
           : isActive && tentative  ? '-4px 0 12px rgba(176,48,48,0.10)'
           : 'none',
  background: isActive && !tentative ? '#111111' : 'transparent',
  transition: 'border 160ms ease, box-shadow 160ms ease, background 160ms ease',
}}
```

The 160ms transition matches the established MatchRow hover (`MatchRow.tsx` line 23: `transition: 'background 160ms ease'`) — do not invent a different timing.

**Column label pattern** (copy verbatim from `HeroPlayerGrid.tsx` lines 64-65 and 72-73):
```typescript
<p
  className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2"
  style={{ color: team === 'radiant' ? '#4ade80' : '#ef4444' }}
>
  {team === 'radiant' ? 'Radiant' : 'Dire'}
</p>
```

**Row rendering pattern** (copy the pad-to-fixed-count idiom from `BuildingsSection.tsx` lines 40-46 which maps a fixed `RADIANT_ORDER`/`DIRE_ORDER` list):
```typescript
{/* Picks row — always 5 slots (D-02) */}
<div className="flex items-center gap-1 mb-2">
  {Array.from({ length: 5 }).map((_, i) => (
    <DraftPortrait key={`pick-${i}`} kind="pick" heroId={picks[i]?.hero_id} />
  ))}
</div>

{/* Bans row — always 7 slots (D-02) */}
<div className="flex items-center gap-1">
  {Array.from({ length: 7 }).map((_, i) => (
    <DraftPortrait key={`ban-${i}`} kind="ban" heroId={bans[i]?.hero_id} />
  ))}
</div>
```

---

### `client/src/components/DraftPortrait.tsx` (component — single 56x56 portrait cell)

**Analog:** `client/src/components/PlayerRow.tsx` lines 45-64 (the portrait column, 48x48 with grey fallback). DraftPortrait scales up to 56x56 and adds the ban-X overlay.

**Imports pattern** (copy from `PlayerRow.tsx` line 1):
```typescript
import { heroMapper } from '../utils/heroMapper'
// DO NOT import from '@shared/heroMapper' — it uses createRequire (Node.js only, breaks Vite).
// See .planning/phases/03-match-core/03-PATTERNS.md — client-local copy is the canonical browser source.
```

**Hero resolution pattern** (copy verbatim from `PlayerRow.tsx` line 27):
```typescript
const heroInfo = heroId !== undefined ? heroMapper(heroId) : null
```

**Empty-slot pattern** (model on `PlayerRow.tsx` line 54 — same grey box fallback):
```typescript
// PlayerRow.tsx line 54:
//   <div className="w-12 h-12 rounded-sm" style={{ background: '#141414' }} />
// DraftPortrait scales to 56x56 (w-14 h-14) and adds a bordered ring per D-05:
if (!heroInfo) {
  return (
    <div
      className="w-14 h-14 shrink-0 rounded-sm"
      style={{
        background: '#141414',         // panel token — matches PlayerRow fallback
        border: '1px solid #1e1e1e',  // wire token — makes the slot readable as "empty placeholder"
      }}
    />
  )
}
```

**Filled portrait pattern** (copy from `PlayerRow.tsx` lines 47-52, adapt size 48→56):
```typescript
return (
  <div className="relative w-14 h-14 shrink-0 rounded-sm overflow-hidden">
    <img
      src={heroInfo.portrait}
      alt={heroInfo.name}
      className="w-14 h-14 object-cover rounded-sm"
    />
    {kind === 'ban' && (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{
          color: '#ef4444',                              // dire token
          opacity: 0.75,
          filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.7))',
        }}
      >
        <path d="M4 4 L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M20 4 L4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    )}
  </div>
)
```

**Size exception:** UI-SPEC locks 56x56 (`w-14 h-14`) — a deliberate departure from PlayerRow's 48x48 so hero identity is scannable mid-draft. Do not accidentally reuse `w-12 h-12`.

---

### `client/src/components/DraftTurnIndicator.tsx` (component — small 10px label)

**Analog:** `client/src/components/StatusTag.tsx` — same pattern of a small, styled, stateful text label driven by a discriminated prop. StatusTag uses a `Status` union + `styleMap` lookup; DraftTurnIndicator uses the `activeTeam` + `action` + `tentative` props to derive color/opacity inline.

**Imports pattern** (copy from `StatusTag.tsx` — no external imports):
```typescript
// No imports — presentational, receives pre-computed props from DraftSection.
```

**Props interface** (model on `StatusTag.tsx` lines 1-5):
```typescript
interface DraftTurnIndicatorProps {
  activeTeam: 'radiant' | 'dire' | null
  action:     'pick' | 'ban' | null
  tentative:  boolean
  gameState:  number | undefined
}
```

**Label styling pattern** (copy verbatim from `StatusTag.tsx` line 30 — 10px uppercase + tracking — and adjust the tracking per UI-SPEC which asks for 0.25em, not 0.18em):
```typescript
// StatusTag.tsx line 30: text-[10px] uppercase tracking-[0.18em] font-medium
// UI-SPEC §Typography: text-[10px] uppercase tracking-[0.25em] font-bold
<p
  className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2 text-center"
  style={{ color, opacity: tentative ? 0.6 : 1, transition: 'opacity 160ms ease' }}
>
  {label}
</p>
```

**Conditional-render pattern** (same early-return style as `PlayerRow.tsx` line 37 "return JSX only when ready"):
```typescript
export default function DraftTurnIndicator({ activeTeam, action, tentative, gameState }: Props) {
  // D-07 — hide entirely outside draft state
  if (gameState !== 2) return null

  // D-08 — no guess available but draft is active → show neutral placeholder (not null)
  if (!activeTeam || !action) {
    return (
      <p
        className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2 text-center"
        style={{ color: '#303030' }}
      >
        Draft in progress
      </p>
    )
  }

  const color = activeTeam === 'radiant' ? '#4ade80' : '#ef4444'
  const teamName = activeTeam === 'radiant' ? 'Radiant' : 'Dire'
  const label = `${teamName} — ${action === 'pick' ? 'picking' : 'banning'}${tentative ? ' ?' : ''}`

  return (
    <p
      className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2 text-center"
      style={{ color, opacity: tentative ? 0.6 : 1, transition: 'opacity 160ms ease' }}
    >
      {label}
    </p>
  )
}
```

**Em-dash pattern:** use `—` (U+2014) in the label string — matches the established copy style from `MatchRow.tsx` line 43 (`<span>vs</span>`). UI-SPEC §Copywriting locks this; do not use `-`.

---

### `client/src/pages/MatchPage.tsx` (page — insert DraftSection)

**Analog:** self — insert between `</ScoreHeader>` (line 54) and the HeroPlayerGrid wrapper (line 57).

**Imports pattern** (add two lines to the existing imports block lines 1-6):
```typescript
// Add after line 5 (after ScoreHeader import):
import DraftSection from '../components/DraftSection'
import { useDraftDetail } from '../hooks/useDraftDetail'
```

**Hook composition pattern** (copy the destructuring form from line 10 — two independent hook calls, no cross-wiring, TQ cache handles sharing per D-14):
```typescript
// Line 10 currently:
const { match, radiantPlayers, direPlayers, buildings, isLoading } = useMatchDetail(matchId)

// Add immediately below:
const draft = useDraftDetail(matchId)
```

**Insertion pattern** (between lines 54 and 57 — mirror the `{match && (...)}` conditional used for ScoreHeader on line 52-54):
```tsx
{/* Existing — ScoreHeader (lines 51-54) stays unchanged */}
{match && <ScoreHeader match={match} />}

{/* NEW — DraftSection. Render only when scoreboard present (D-10). */}
{draft.scoreboard && (
  <DraftSection
    scoreboard={draft.scoreboard}
    gameState={draft.gameState}
    activeTeam={draft.activeTeam}
    action={draft.action}
    tentative={draft.tentative}
  />
)}

{/* Existing — HeroPlayerGrid (lines 56-63) stays unchanged */}
<div className="mt-12">
  <HeroPlayerGrid ... />
</div>
```

**DO NOT edit `HeroPlayerGrid.tsx` or `BuildingsSection.tsx`** — Phase 4 only composes. The `mt-12` rhythm (line 57, line 67) is preserved because DraftSection itself uses `<section className="mt-12">` internally per UI-SPEC.

---

### `client/src/utils/draftOrder.test.ts` (test)

**Analog:** `client/src/utils/formatGoldDiff.test.ts` — same structure (describe + it blocks, no setup/mocks, pure input/output assertions).

**Imports pattern** (copy verbatim from `formatGoldDiff.test.ts` lines 1-2):
```typescript
import { describe, it, expect } from 'vitest'
import { inferActiveTeam, inferFirstPickFromHistory } from './draftOrder'
```

**Core test pattern** (model on `formatGoldDiff.test.ts` — one `describe` per exported function, each `it` is a single assertion about one input):
```typescript
describe('inferActiveTeam', () => {
  it('returns null when firstPickTeam is null (D-08 tentative escape hatch)', () => {
    expect(inferActiveTeam({ rPicks: 0, dPicks: 0, rBans: 0, dBans: 0 }, null)).toBeNull()
  })

  it('step 0 (Radiant first pick) → Radiant banning', () => {
    const r = inferActiveTeam({ rPicks: 0, dPicks: 0, rBans: 0, dBans: 0 }, 0)
    expect(r).toEqual({ team: 0, action: 'ban' })
  })

  it('step 7 (after 7 bans) → Radiant picking — first-pick Radiant gets step 8 = pick phase 1', () => {
    const r = inferActiveTeam({ rPicks: 0, dPicks: 0, rBans: 4, dBans: 3 }, 0)
    expect(r).toEqual({ team: 0, action: 'pick' })
  })

  it('mirrors for Dire first-pick: step 0 → Dire banning', () => {
    const r = inferActiveTeam({ rPicks: 0, dPicks: 0, rBans: 0, dBans: 0 }, 1)
    expect(r).toEqual({ team: 1, action: 'ban' })
  })

  it('returns null when draft is complete (all 24 steps done)', () => {
    const r = inferActiveTeam({ rPicks: 5, dPicks: 5, rBans: 7, dBans: 7 }, 0)
    expect(r).toBeNull()
  })
})

describe('inferFirstPickFromHistory', () => {
  it('returns null for pristine scoreboard (both candidates equally plausible)', () => {
    expect(inferFirstPickFromHistory({ radiant: {}, dire: {} })).toBeNull()
  })
  // ... further cases enumerate the disambiguation heuristic
})
```

**Minus-sign/Unicode gotcha pattern** (from `formatGoldDiff.test.ts` line 40-41 — reminds the planner to add pedantic unicode assertions when relevant): draftOrder has no such strings, but keep the style (explicit expected object literals, not `.toMatchObject()`) to match the project convention.

---

### `server/src/schemas/valve.test.ts` (test — NEW file)

**Analog:** `server/src/cache.test.ts` — same vitest structure, same `import('./module.js')` dynamic-import convention, same `describe`/`it`/`expect` pattern. No schema test file exists yet; this is the first.

**Imports pattern** (copy verbatim from `cache.test.ts` lines 1):
```typescript
import { describe, it, expect } from 'vitest'
import { LiveGameSchema } from './valve.js'
```

**No mocks needed** — pure schema validation. Do NOT copy `cache.test.ts` lines 4-25 (Redis mock setup) — irrelevant.

**Core test pattern** (style mirrors `formatGoldDiff.test.ts` — one `describe` per exported schema, `it` blocks for positive + negative cases):
```typescript
describe('LiveGameSchema — scoreboard extension (Phase 4)', () => {
  it('accepts a payload without scoreboard (pre-draft lobby)', () => {
    const raw = { match_id: 1, lobby_id: 2, league_id: 3 }
    expect(() => LiveGameSchema.parse(raw)).not.toThrow()
  })

  it('accepts scoreboard with both teams present and picks/bans arrays', () => {
    const raw = {
      match_id: 1, lobby_id: 2, league_id: 3,
      scoreboard: {
        radiant: { picks: [{ hero_id: 1 }, { hero_id: 14 }], bans: [{ hero_id: 99 }] },
        dire:    { picks: [],                                bans: [{ hero_id: 42 }] },
      },
    }
    const parsed = LiveGameSchema.parse(raw)
    expect(parsed.scoreboard?.radiant?.picks).toHaveLength(2)
    expect(parsed.scoreboard?.dire?.bans?.[0]?.hero_id).toBe(42)
  })

  it('passes through unknown fields on scoreboard (CLAUDE.md .passthrough() discipline)', () => {
    const raw = {
      match_id: 1, lobby_id: 2, league_id: 3,
      scoreboard: {
        radiant: { picks: [], bans: [], score: 7, tower_state: 2047 }, // score/tower_state not declared
        dire:    { picks: [], bans: [] },
      },
    }
    const parsed = LiveGameSchema.parse(raw)
    // score is preserved by .passthrough()
    expect((parsed.scoreboard?.radiant as any).score).toBe(7)
  })

  it('accepts scoreboard.radiant without picks or bans (both optional)', () => {
    const raw = {
      match_id: 1, lobby_id: 2, league_id: 3,
      scoreboard: { radiant: {}, dire: {} },
    }
    expect(() => LiveGameSchema.parse(raw)).not.toThrow()
  })

  it('accepts picks entry with hero_id undefined (draft pre-lock state)', () => {
    const raw = {
      match_id: 1, lobby_id: 2, league_id: 3,
      scoreboard: { radiant: { picks: [{}] }, dire: {} },
    }
    expect(() => LiveGameSchema.parse(raw)).not.toThrow()
  })
})
```

**Dynamic import style** (from `cache.test.ts` line 29 — `const { TTL } = await import('./cache.js')`): `cache.test.ts` uses dynamic imports because it mocks `ioredis` at module scope. `valve.test.ts` has no mocks, so a plain top-of-file import of `LiveGameSchema` is correct (simpler). This IS a deliberate departure from cache.test.ts — mirror the simpler static-import form.

---

## Shared Patterns

### `.passthrough()` on every Valve schema (CRITICAL)
**Source:** `server/src/schemas/valve.ts` lines 2-3 (file-level comment), applied on every schema (lines 24, 33, 56, 65, 67).
**Apply to:** ALL new schemas in `valve.ts` — `DraftItemSchema`, `TeamScoreboardSchema`, `ScoreboardSchema`.

```typescript
// CRITICAL: .passthrough() on EVERY schema — Valve adds fields silently each patch.
// CRITICAL: ALL nested fields are .optional() — they are absent during lobby/pre-game states.
// ...
  .passthrough()  // CRITICAL: never remove .passthrough()
```

### `cached()` wrapping on every upstream path (CRITICAL)
**Source:** `server/src/services/valveApi.ts` lines 25-27.
**Apply to:** Any new BFF service that reaches Valve (Phase 4 adds one: `getLiveLeagueGamesFast` with `cached('live_games:draft', TTL.DRAFT, ...)` — distinct cache key from `'live_games'`).

```typescript
export function getLiveLeagueGames(): Promise<LiveLeagueGames> {
  return cached('live_games', TTL.LIVE_MATCH, fetchLiveLeagueGames)
}
// Phase 4:
export function getLiveLeagueGamesFast(): Promise<LiveLeagueGames> {
  return cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames)
}
```

### Dynamic `refetchInterval` with CLAUDE.md `game_state === 6` stop
**Source:** conceptually from `useMatchDetail.ts` line 35 (`refetchInterval: matchFromCache?.game_state === 6 ? false : 30_000`); extend to the callback form for `useDraftDetail`.
**Apply to:** `client/src/hooks/useDraftDetail.ts` only. Per D-13, `useMatchDetail` stays on the plain number form.

```typescript
refetchInterval: (q: Query<DraftResponse>) => {
  const gs = q.state.data?.game_state
  return gs === 2 ? 5_000 : false
},
// gs === 6 → false (post-game; MUST stop per CLAUDE.md)
// gs === 5 → false (in-game; scoreboard frozen, no new picks)
// gs === 2 → 5_000 (draft live)
```

### 10px uppercase group-label typography
**Source:** `HeroPlayerGrid.tsx` lines 64-65 and 72-73; `LeagueAccordion.tsx` line 26; `BuildingsSection.tsx` line 28.
**Apply to:** `DraftSection` (via `DraftColumn`) — every Radiant/Dire label AND the turn indicator label.

```typescript
className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2"
style={{ color: team === 'radiant' ? '#4ade80' : '#ef4444' }}
```
**Tracking exception:** DraftTurnIndicator uses `tracking-[0.25em]` per UI-SPEC (matches StatusTag's 0.18em family but locked higher for the sentence-length label). Column labels stay at `tracking-[0.3em]` to match HeroPlayerGrid exactly.

### Ember glow on active element (ember `#b03030`, 160ms transition)
**Source:** `MatchRow.tsx` lines 22-31 (hover-triggered) and `index.css` line 14 (`--color-ember: #b03030`).
**Apply to:** `DraftColumn` active state — prop-driven, not hover-driven.

```typescript
// MatchRow.tsx hover pattern:
onMouseEnter: background '#111111' + borderLeftColor '#b03030'
transition: 'background 160ms ease'

// DraftColumn prop-driven active state (same colors, same 160ms):
borderLeft: '2px solid #b03030'
boxShadow:  '-4px 0 12px rgba(176,48,48,0.25)'
background: '#111111'
transition: 'border 160ms ease, box-shadow 160ms ease, background 160ms ease'
```

### Browser-safe heroMapper (never `@shared/heroMapper`)
**Source:** `client/src/utils/heroMapper.ts` lines 1-3 (and its comment warning).
**Apply to:** `DraftPortrait.tsx`. Any new component that needs hero metadata.

```typescript
import { heroMapper } from '../utils/heroMapper'
// DO NOT import from '@shared/heroMapper' — it uses createRequire (Node.js only, breaks Vite).
```

### `.optional()` on every scoreboard-derived field
**Source:** pattern from `valve.ts` (every field `.optional()`) + `useMatchDetail.ts` (every derived value has `?? default` or `?.`).
**Apply to:** `useDraftDetail.ts` (scoreboard?.radiant?.picks?.length ?? 0), `DraftSection.tsx` (scoreboard.radiant?.picks ?? []), `DraftColumn.tsx` (picks[i]?.hero_id).

---

## No Analog Found

No files in this phase lack an analog. The codebase has a complete set of precedents (routes, hooks, presentational components, pure utilities, schemas, tests) — every Phase 4 file maps to at least one existing file by role.

**One advisory (not a missing analog):** the planner should NOT write `.test.tsx` component tests for `DraftPortrait` / `DraftSection` unless the planner also adds `@testing-library/react` + `jsdom` to `client/package.json`. Current repo has zero `.tsx` tests; preferred approach is to extract any non-trivial logic out of the component (e.g. portrait-resolution into a helper) and unit-test the helper — matching the `groupByLeague` precedent in `useLiveGames.ts`/`useLiveGames.test.ts`.

---

## Metadata

**Analog search scope:**
- `d:\MateProjects\projects\dota\dota_stats\server\src\routes\`
- `d:\MateProjects\projects\dota\dota_stats\server\src\schemas\`
- `d:\MateProjects\projects\dota\dota_stats\server\src\services\`
- `d:\MateProjects\projects\dota\dota_stats\server\src\cache.ts`
- `d:\MateProjects\projects\dota\dota_stats\client\src\components\`
- `d:\MateProjects\projects\dota\dota_stats\client\src\hooks\`
- `d:\MateProjects\projects\dota\dota_stats\client\src\pages\`
- `d:\MateProjects\projects\dota\dota_stats\client\src\utils\`
- `d:\MateProjects\projects\dota\dota_stats\shared\`
- `d:\MateProjects\projects\dota\dota_stats\client\src\index.css` (design tokens)

**Files scanned:** 24 source files + 5 test files + index.css + package.json (client and server).

**Pattern extraction date:** 2026-04-24
