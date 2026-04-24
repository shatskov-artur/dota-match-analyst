---
phase: 02-live-matches-list
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - client/src/App.tsx
  - client/src/components/ErrorBanner.tsx
  - client/src/components/LeagueAccordion.tsx
  - client/src/components/MatchRow.tsx
  - client/src/components/SkeletonRow.tsx
  - client/src/components/StatusTag.tsx
  - client/src/hooks/useLiveGames.test.ts
  - client/src/hooks/useLiveGames.ts
  - client/src/main.tsx
  - client/src/pages/HomePage.tsx
  - client/src/pages/MatchPlaceholder.tsx
  - client/src/utils/formatDuration.test.ts
  - client/src/utils/formatDuration.ts
  - client/src/utils/gameState.test.ts
  - client/src/utils/gameState.ts
  - server/src/routes/live.ts
  - server/src/schemas/bff.ts
  - server/src/schemas/openDota.ts
  - server/src/services/openDotaApi.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-23
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Phase 2 delivers a clean, well-structured live matches list with proper use of TanStack Query v5, zod schemas with `.passthrough()`, and the `cached()` decorator pattern. The frontend component hierarchy is sound, keyboard accessibility is handled on the accordion, and all zod schemas follow the CLAUDE.md conventions. The utility functions (`formatDuration`, `getStatusLabel`, `getSeriesLabel`) are fully tested with good edge-case coverage.

Four warnings were found. The most impactful is the missing `try/catch` on the route handler in `live.ts` combined with `.parse()` (throwing) in `valveApi.ts` — together these produce an unformatted 500 crash response rather than a clean JSON error that the client can display. A secondary concern is the use of a non-unique `leagueName` string as the React `key` for league accordion sections when `league_id` (already available) would be correct.

## Warnings

### WR-01: Route handler has no error boundary — uncaught throws produce raw 500

**File:** `server/src/routes/live.ts:16`
**Issue:** `liveRoutes.get('/games', async (c) => { ... })` has no `try/catch`. `getLiveLeagueGames()` can throw a `ZodError` (via `.parse()` in `valveApi.ts`) or a network `Error`. When it throws, Hono emits an unstructured 500 with no JSON body. The client's `fetchLiveGames` checks `!res.ok` and throws `new Error(...)` correctly, but the UI ends up in the error state with no useful diagnostic, and server logs may expose stack frames.

**Fix:**
```typescript
liveRoutes.get('/games', async (c) => {
  let data: Awaited<ReturnType<typeof getLiveLeagueGames>>
  try {
    data = await getLiveLeagueGames()
  } catch (err) {
    console.error('[live] getLiveLeagueGames failed:', (err as Error).message)
    return c.json({ error: 'upstream_unavailable' }, 503)
  }

  const games = data.result.games ?? []
  // ... rest of handler unchanged
})
```

---

### WR-02: Non-unique `leagueName` used as React `key` for `LeagueAccordion`

**File:** `client/src/pages/HomePage.tsx:50`
**Issue:** `key={leagueName}` is a string that is not guaranteed unique. Two different leagues could share the same display name (e.g. both fall back to the `League #${id}` pattern if OpenDota returns null, or genuinely share a name). React uses `key` to identify list items across renders — a duplicate key causes silent reconciliation bugs (wrong accordion state, missed re-renders). The correct identifier is `league_id`, which is the key already used by `groupByLeague` internally.

**Fix:** Surface `leagueId` from `groupByLeague` and use it as the key:

In `useLiveGames.ts`, update the return type and mapping:
```typescript
export function groupByLeague(
  games: EnrichedGame[],
): Array<{ leagueId: number; leagueName: string; matches: EnrichedGame[] }> {
  const map = new Map<number, { leagueId: number; leagueName: string; matches: EnrichedGame[] }>()
  for (const game of games) {
    if (!map.has(game.league_id)) {
      map.set(game.league_id, { leagueId: game.league_id, leagueName: game.league_name, matches: [] })
    }
    map.get(game.league_id)!.matches.push(game)
  }
  return Array.from(map.values())
}
```

In `HomePage.tsx`:
```tsx
{grouped.map(({ leagueId, leagueName, matches }) => (
  <LeagueAccordion
    key={leagueId}
    leagueName={leagueName}
    matches={matches}
  />
))}
```

---

### WR-03: Client-side BFF response cast without runtime validation

**File:** `client/src/hooks/useLiveGames.ts:25`
**Issue:** `res.json() as Promise<LiveGamesResponse>` is a TypeScript-only assertion with no runtime check. If the BFF returns an unexpected shape (schema mismatch, partial response during a redeploy), the app will silently misrender or crash at property access. The CLAUDE.md project convention states "TypeScript + zod everywhere — parse every external API response." The server already exports `LiveGamesResponseSchema` in `server/src/schemas/bff.ts` — the client should define its own equivalent or share a validated schema.

**Fix:**
```typescript
import { z } from 'zod'

// Minimal client-side schema (mirrors server BFF contract)
const EnrichedGameSchema = z.object({
  match_id: z.number(),
  league_id: z.number(),
  league_name: z.string(),
  game_state: z.number().optional(),
  duration: z.number().optional(),
  series_type: z.number().optional(),
  radiant_series_wins: z.number().optional(),
  dire_series_wins: z.number().optional(),
  radiant_team: z.object({ team_name: z.string().optional() }).optional(),
  dire_team: z.object({ team_name: z.string().optional() }).optional(),
}).passthrough()

const LiveGamesResponseSchema = z.object({ games: z.array(EnrichedGameSchema) })

async function fetchLiveGames(): Promise<LiveGamesResponse> {
  const res = await fetch('/api/live/games')
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  const raw: unknown = await res.json()
  return LiveGamesResponseSchema.parse(raw)
}
```

---

### WR-04: `valveApi.ts` uses `.parse()` (throws) instead of `.safeParse()` — uncaught on schema drift

**File:** `server/src/services/valveApi.ts:16`
**Issue:** `LiveLeagueGamesSchema.parse(raw)` throws a `ZodError` if Valve's response shape changes. This error propagates out of `fetchLiveLeagueGames`, through `cached()` (which correctly does not suppress it), and reaches the route handler which has no `try/catch` (WR-01). The combined effect is an unhandled exception crash for all clients until the server restarts. Using `.safeParse()` allows the service to log the parse failure and surface a controlled error rather than a raw crash.

**Fix:**
```typescript
async function fetchLiveLeagueGames(): Promise<LiveLeagueGames> {
  const url = `${STEAM_API_BASE}/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${env.VALVE_API_KEY}&partner=1`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Valve API error: ${res.status} ${res.statusText}`)
  }
  const raw: unknown = await res.json()
  const parsed = LiveLeagueGamesSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[valveApi] Schema parse failure:', parsed.error.issues.map(i => i.message).join('; '))
    throw new Error('Valve API response failed schema validation')
  }
  return parsed.data
}
```

## Info

### IN-01: Test file re-declares `EnrichedGame` interface instead of importing the exported type

**File:** `client/src/hooks/useLiveGames.test.ts:4-9`
**Issue:** The test file defines a local `interface EnrichedGame` with a subset of fields instead of importing `type { EnrichedGame }` from `../hooks/useLiveGames`. If new required fields are added to the exported type, test data will remain valid locally but won't reflect the actual contract, allowing tests to pass against a stale definition.

**Fix:**
```typescript
import { describe, it, expect } from 'vitest'
import { groupByLeague, type EnrichedGame } from '../hooks/useLiveGames'

// Remove the local interface declaration — use the exported type directly
```

---

### IN-02: `ErrorBanner.tsx` hardcodes "30 seconds" — will drift if refetch interval changes

**File:** `client/src/components/ErrorBanner.tsx:5`
**Issue:** The banner copy "Retrying in 30 seconds" is a magic literal. The actual interval is defined as `refetchInterval: 30_000` in `useLiveGames.ts`. If the interval changes in a future phase (e.g., Phase 4 dynamic intervals), the copy will silently become incorrect. Low severity because this is user-facing copy rather than logic, but worth aligning.

**Fix:** Either accept the string as intentional product copy (document it as such) or derive it from a shared constant:
```typescript
// In useLiveGames.ts
export const LIVE_REFETCH_INTERVAL_MS = 30_000

// In ErrorBanner.tsx — accept interval as prop or import the constant
import { LIVE_REFETCH_INTERVAL_MS } from '../hooks/useLiveGames'
const seconds = LIVE_REFETCH_INTERVAL_MS / 1000
// "Retrying in {seconds} seconds."
```

---

### IN-03: `MatchPlaceholder.tsx` renders raw JSON in a `<pre>` tag — appropriate for dev, flag for Phase 3 removal

**File:** `client/src/pages/MatchPlaceholder.tsx:30`
**Issue:** `JSON.stringify(match, null, 2)` renders full match data including all nested fields. The component already carries a clear `DEV PLACEHOLDER — Phase 3 will replace this view.` label, so this is expected. No security issue (this is not user-generated content; it is data from the app's own BFF). Note for Phase 3: this entire component should be replaced, not extended.

**Fix:** No action required now. Ensure Phase 3 plan includes full replacement of `MatchPlaceholder.tsx`, not patching.

---

_Reviewed: 2026-04-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
