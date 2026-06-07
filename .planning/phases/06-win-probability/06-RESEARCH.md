# Phase 6: Win Probability - Research

**Researched:** 2026-04-26
**Domain:** Stratz GraphQL API, React component, TanStack Query v5, Hono BFF
**Confidence:** MEDIUM — Stratz GraphQL field names verified via C# model auto-generation (ekrug3r/StratzModels); GraphiQL endpoint blocked by Cloudflare during research

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stratz Service Setup**
- D-01: Add `STRATZ_TOKEN` to `server/src/env.ts` (required, startup-validated).
- D-02: Create `server/src/services/stratzApi.ts` — thin GraphQL wrapper. All requests use `Authorization: Bearer ${env.STRATZ_TOKEN}`. Error handling: `try/catch → return null`. All calls through `cached()`.
- D-03: Stratz GraphQL endpoint: `https://api.stratz.com/graphql` (POST, JSON body with `query` and `variables`).

**Win Probability Bar (MATCH-06)**
- D-04: Position: immediately under `<ScoreHeader>`, before `<DraftSection>`/`<HeroPlayerGrid>`.
- D-05: Visual: green/red gradient bar. Radiant `#4ade80`, Dire `#ef4444`. Percentage labels both ends. Full-width, 8px height.
- D-06: Show bar only when `game_state === 5` AND `game_time > 300` AND Stratz data non-null. Hidden otherwise.
- D-07: Server cache key: `stratz:winprob:{matchId}`. TTL: 60s.
- D-08: Stratz GraphQL `match` query with win prediction field. If Stratz returns null or errors, BFF returns `null` for winProb and client hides bar.

**Counterpick Data Upgrade**
- D-09: Full replacement of OpenDota `/heroes/{id}/matchups` with Stratz `heroVsHeroMatchup`. No OpenDota fallback — if Stratz unavailable, counterpick section hidden.
- D-10: Data scope: all pro matches (no patch filter).
- D-11: Server cache key: `stratz:matchups:{heroId}`. TTL: 6h (reuses `TTL.HERO_STATS`).
- D-12: Stratz `heroVsHeroMatchup` returns an `advantage` array. Sort counters by win rate ascending → top 3 are worst matchups.

**Graceful Degradation**
- D-13: When Stratz down/rate-limited/null — fully hide affected component. No error state.
- D-14: BFF routes use `Promise.allSettled` or equivalent — Stratz failure never crashes other endpoints.

**Polling**
- D-15: Win probability polling: 30s. May be bundled into `useMatchDetail` or a separate hook (Claude's discretion).
- D-16: Counterpick matchup data does NOT poll — `refetchInterval: false`, 6h TTL.

### Claude's Discretion
- Whether win probability is a separate BFF endpoint or bundled into the existing match detail route.
- Exact Stratz GraphQL query shape for win probability (verify against Stratz docs at runtime).
- Whether to add `TTL.WIN_PROB = 60` constant or inline the value.
- Bar animation: CSS `transition: width 500ms ease`.
- Whether `stratzApi.ts` uses raw `fetch` or a minimal helper — raw fetch is fine.

### Deferred Ideas (OUT OF SCOPE)
- Win probability sparkline (trend)
- Patch-filtered counterpick data
- Stratz player profiles
- Tournament-scoped hero winrate
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MATCH-06 | User can see win probability bar (Radiant vs Dire) powered by Stratz ML — hidden if Stratz unavailable or before 5 minutes game time | D-04–D-08 (bar), D-15 (polling), verified Stratz MatchLiveType and MatchType field shapes |
</phase_requirements>

---

## Summary

Phase 6 adds two Stratz-powered features: a win-probability bar on the match screen and an upgrade of Phase 5's counterpick data from OpenDota all-ranks to Stratz pro-match data. Both features share a single new service file (`stratzApi.ts`) that follows the established `openDotaApi.ts` pattern (raw `fetch`, `try/catch → return null`, `cached()` wrapper).

The critical research finding is a **schema discrepancy** between CONTEXT.md's described query shapes and what is verifiable in the Stratz C# model autogeneration. The C# models (sourced from the Stratz API schema) reveal:

1. **Win probability**: The `match(id:)` type has `PredictedWinRates: ICollection<double>` (array, per-minute) and `PredictedOutcomeWeight: byte`, NOT a scalar `predictedOutcomeAverage`. For live matches, the `live.match(id:)` type has `WinRateValues: ICollection<decimal>` and `LiveWinRateValues: [{time, winRate}]`. The correct query for real-time win probability is `live { match(matchId: $matchId) { winRateValues liveWinRateValues { time winRate } } }`.

2. **Hero matchup bracket filter**: The C# models show `RankBracketBasicEnum` (values: UNCALIBRATED, HERALD_GUARDIAN, CRUSADER_ARCHON, LEGEND_ANCIENT, DIVINE_IMMORTAL, FILTERED, ALL). There is **no PROFESSIONAL value** in this enum. The parameter is named `bracketBasicIds`, not `bracketIds`. "All pro matches" per D-10 maps to `bracketBasicIds: [DIVINE_IMMORTAL]` or omitting the filter entirely (`ALL`).

3. **Hero matchup structure**: The `heroVsHeroMatchup` return type `HeroMatchupType` contains `advantage: HeroDryadType[]` and `disadvantage: HeroDryadType[]`. Each `HeroDryadType` has `heroId` and a nested `vs: HeroStatsHeroDryadType[]` array. `HeroStatsHeroDryadType` carries `heroId1`, `heroId2`, `winRateHeroId1`, `winRateHeroId2`, `matchCount`, `winCount`. This nested structure differs from the flat `advantage[]{heroId2, winsCount, matchCount, winRateHeroId1}` described in CONTEXT.md.

4. **Field name conflict**: The match payload in this codebase uses `duration` (not `game_time`) for elapsed game seconds. The `EnrichedGame` interface and `LiveGameSchema` both use `duration`. CONTEXT.md and the UI-SPEC consistently say `game_time`. The `WinProbBar` component must use `match.duration` (not `match.game_time`) when reading from the existing `useMatchDetail` data.

**Primary recommendation:** Implement `stratzApi.ts` with raw `fetch` following `openDotaApi.ts` exactly, use the `live.match` Stratz endpoint for win probability (last value of `liveWinRateValues`), verify the exact heroVsHeroMatchup query shape at first execution against the live schema, and use `match.duration` (not `game_time`) for the 5-minute gate check.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stratz GraphQL requests | API / Backend (BFF) | — | Stratz token must never reach client; rate limit (500/hr) enforced server-side |
| Win probability cache | API / Backend | Redis (Upstash) | Per D-07: `stratz:winprob:{matchId}` TTL 60s — 1 Stratz call/min per match |
| Hero matchup cache | API / Backend | Redis (Upstash) | Per D-11: `stratz:matchups:{heroId}` TTL 6h |
| Win probability bar rendering | Browser / Client | — | `WinProbBar` component — pure display, no auth needed |
| Show/hide gate logic | Browser / Client | — | `gameState === 5 && duration > 300 && radiantWinProb !== null` — client-side conditional render |
| Polling cadence | Browser / Client | — | TanStack Query `refetchInterval` on `useWinProbability` hook |
| Counterpick data transform | API / Backend | — | `rankCounters` replacement / augmentation in `intel.ts` using Stratz data shape |
| Counterpick rendering | Browser / Client | — | Existing `IntelTooltip` — no Phase 6 changes to client counterpick UI |

---

## Standard Stack

### Core (all already installed — Phase 6 adds ZERO new npm dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | ^4.0.0 | BFF route handler | Project standard [VERIFIED: package.json] |
| `zod` | ^3.0.0 | Schema validation for Stratz responses | Project standard [VERIFIED: package.json] |
| `ioredis` / `cached()` | ^5.0.0 | Cache layer for Stratz calls | Project standard [VERIFIED: cache.ts] |
| `@tanstack/react-query` | ^5.0.0 | `useWinProbability` hook | Project standard [VERIFIED: package.json] |
| native `fetch` | Node 24 | Stratz GraphQL POST | Project standard — no graphql-request or Apollo |

**No new packages.** The Stratz GraphQL call is a plain `fetch` POST with JSON body, following the same pattern as `openDotaApi.ts` and `valveApi.ts`. [VERIFIED: codebase pattern]

---

## Architecture Patterns

### System Architecture Diagram

```
Client (MatchPage)
  │
  ├── useMatchDetail() ──────────────────────────► GET /api/live/games
  │     └── match.duration, match.game_state           │
  │           │                                         └── Valve API (cached 30s)
  │           │ (gate: state===5 && duration>300)
  │           ▼
  ├── useWinProbability(matchId) ───────────────► GET /api/live/winprob/:matchId
  │     └── { radiantWinProb: number | null }          │
  │                                                     ├── cached('stratz:winprob:{id}', 60s)
  │                                                     └── Stratz GraphQL: live.match.liveWinRateValues
  │
  └── WinProbBar(radiantWinProb, gameTime, gameState)
        └── null when gates fail (silent hide)

                                                  GET /api/live/intel/:matchId
                                                      │
                                                      ├── getHeroMatchupsStratz(heroId)  [NEW]
                                                      │     └── cached('stratz:matchups:{id}', 6h)
                                                      │           └── Stratz GraphQL: heroStats.heroVsHeroMatchup
                                                      │
                                                      └── getPlayerHeroes(accountId)  [unchanged]
```

### Recommended Project Structure (new files only)

```
server/src/
├── services/
│   └── stratzApi.ts          # NEW: getWinProbability(matchId) + getHeroMatchupsStratz(heroId)
├── schemas/
│   └── stratz.ts             # NEW: StratzWinProbSchema, StratzMatchupSchema (zod, .passthrough())
├── routes/
│   └── live.ts               # MODIFIED: add /winprob/:matchId route, update /intel/:matchId
├── env.ts                    # MODIFIED: add STRATZ_TOKEN field
└── cache.ts                  # MODIFIED: add TTL.WIN_PROB = 60

client/src/
├── components/
│   └── WinProbBar.tsx        # NEW: renders the gradient bar
├── hooks/
│   └── useWinProbability.ts  # NEW: GET /api/live/winprob/:matchId with 30s polling
└── pages/
    └── MatchPage.tsx         # MODIFIED: insert <WinProbBar> after <ScoreHeader>
```

### Pattern 1: stratzApi.ts Service (follows openDotaApi.ts exactly)

**What:** A thin wrapper around native `fetch` that posts GraphQL queries to Stratz and returns `null` on any error.
**When to use:** All Stratz calls — never call Stratz directly from routes.

```typescript
// Source: codebase pattern from server/src/services/openDotaApi.ts [VERIFIED]
const STRATZ_BASE = 'https://api.stratz.com/graphql'

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
  const raw: unknown = await res.json()
  const parsed = StratzWinProbResponseSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[stratzApi] StratzWinProbSchema parse failure for match', matchId)
    return null
  }
  const values = parsed.data.data?.live?.match?.liveWinRateValues
  if (!values || values.length === 0) return null
  // Last entry is the most current win rate (Radiant perspective)
  return values[values.length - 1].winRate ?? null
}

export function getWinProbability(matchId: number): Promise<number | null> {
  return cached(`stratz:winprob:${matchId}`, TTL.WIN_PROB, () => fetchWinProbability(matchId))
}
```

### Pattern 2: Hero Matchup Stratz Query

**What:** Replace `getHeroMatchups()` (OpenDota) with `getHeroMatchupsStratz()` (Stratz).
**When to use:** Called from `/api/live/intel/:matchId` aggregator for each unique picked hero.

```typescript
// Source: C# model analysis from ekrug3r/StratzModels repo [VERIFIED: HeroMatchupType, HeroDryadType, HeroStatsHeroDryadType]
// NOTE: The actual GraphQL parameter name and enum must be verified at first execution.
// The C# models show bracketBasicIds with RankBracketBasicEnum (no PROFESSIONAL value).
// CONTEXT.md says bracketIds: [PROFESSIONAL] — this is [ASSUMED] and must be verified.

async function fetchHeroMatchupsStratz(heroId: number): Promise<StratzMatchupEntry[] | null> {
  // ... same fetch boilerplate as above ...
  // Query shape (ASSUMED — verify at runtime):
  // query HeroMatchups($heroId: Short!) {
  //   heroStats {
  //     heroVsHeroMatchup(heroId: $heroId, bracketBasicIds: [DIVINE_IMMORTAL]) {
  //       advantage { heroId vs { heroId2 winRateHeroId1 matchCount winCount } }
  //     }
  //   }
  // }
}
```

### Pattern 3: useWinProbability Hook (follows useMatchIntel pattern)

**What:** TanStack Query v5 hook with dynamic `refetchInterval` — 30s in-game past 5 min, false otherwise.
**When to use:** Called in `MatchPage` to feed `<WinProbBar>`.

```typescript
// Source: codebase pattern from client/src/hooks/useMatchIntel.ts [VERIFIED]
// Pure helper — extracted for unit testing (mirrors computeIntelInterval / computeDraftInterval patterns)
export function computeWinProbInterval(
  gameState: number | undefined,
  duration: number | undefined,
): number | false {
  if (gameState === 6) return false     // MUST stop on postgame (CLAUDE.md pitfall)
  if (gameState === 5 && (duration ?? 0) > 300) return 30_000
  return false
}

export function useWinProbability(matchId: string | undefined) {
  return useQuery<WinProbResponse>({
    queryKey: ['win-prob', matchId],
    queryFn: () => fetchWinProbability(matchId!),
    enabled: !!matchId,
    refetchInterval: (q: Query<WinProbResponse>) =>
      computeWinProbInterval(q.state.data?.gameState, q.state.data?.duration),
    staleTime: 25_000,  // slightly below 30s cadence
  })
}
```

### Pattern 4: BFF Route — GET /api/live/winprob/:matchId

**What:** New Hono route that wraps `getWinProbability()` with matchId validation and 502 on error.
**When to use:** Win probability endpoint, separate from match detail for cache isolation.

```typescript
// Source: codebase pattern from server/src/routes/live.ts [VERIFIED]
liveRoutes.get('/winprob/:matchId', async (c) => {
  const rawMatchId = c.req.param('matchId')
  const parsedId = Number(rawMatchId)
  if (!Number.isFinite(parsedId)) {
    return c.json({ error: 'Invalid matchId' }, 400)
  }
  try {
    const winProb = await getWinProbability(parsedId)
    // Also read live game for gameState/duration to include in response
    // (client hook uses these to compute refetchInterval)
    const data = await getLiveLeagueGamesFast()
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

### Anti-Patterns to Avoid

- **Calling Stratz from a client hook directly:** Stratz token would be exposed. ALL Stratz calls go through the BFF. [VERIFIED: CLAUDE.md §Key Patterns]
- **Per-user cache keys:** `stratz:winprob:{matchId}:{userId}` would drain 500 req/hr fast. Cache by content only. [VERIFIED: CLAUDE.md §Critical Pitfalls]
- **Polling `game_state === 6` matches:** The useWinProbability hook MUST return `false` for `refetchInterval` when `gameState === 6`. [VERIFIED: CLAUDE.md §Critical Pitfalls]
- **Using `game_time` field name:** The Valve payload and `EnrichedGame` interface use `duration`, not `game_time`. CONTEXT.md and UI-SPEC say `game_time` but the actual field is `duration`. [VERIFIED: server/src/schemas/valve.ts, client/src/hooks/useLiveGames.ts]
- **Assuming `predictedOutcomeAverage` is a scalar on `match`:** C# model analysis shows `PredictedWinRates` is an array on completed match type, not a scalar. Live probability is on `live.match` via `liveWinRateValues`. [VERIFIED: StratzModels C# auto-generated models]
- **Using `bracketIds: [PROFESSIONAL]` without verification:** `RankBracketBasicEnum` has no PROFESSIONAL value. Must test actual query at runtime to confirm correct parameter name and available enum values.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stratz HTTP client | Custom GraphQL client class | Raw `fetch` with JSON body | Existing pattern; no graphql-request, no Apollo — keeps zero new deps [VERIFIED: CLAUDE.md] |
| Redis caching | Custom TTL store | `cached(key, TTL, fn)` from `cache.ts` | Thread-safe, graceful degradation built in [VERIFIED: cache.ts] |
| Win prob polling management | Manual setInterval | TanStack Query `refetchInterval` dynamic callback | Automatic stop on `game_state === 6`; consistent with all existing hooks [VERIFIED: useMatchIntel.ts] |
| Gradient bar | Canvas, SVG | Tailwind + inline `style` with `linear-gradient` | Matches project's hand-rolled approach; zero new deps [VERIFIED: UI-SPEC] |
| Schema validation | Manual type checking | zod `.passthrough()` + `.optional()` | Required project pattern for all external API responses [VERIFIED: CLAUDE.md] |

---

## Critical Schema Findings

### Finding 1: `duration` vs `game_time` Field Name Conflict

**Impact: HIGH — will cause silent gate logic failure if not caught**

The CONTEXT.md and UI-SPEC consistently reference `game_time` for elapsed seconds. The actual field in the codebase is `duration`:

- `server/src/schemas/valve.ts` line 70: `duration: z.number().optional() // seconds elapsed` [VERIFIED]
- `client/src/hooks/useLiveGames.ts` `EnrichedGame` interface: `duration?: number` [VERIFIED]
- `useMatchDetail.ts` returns `match` which has `match.duration`, not `match.game_time`

**Resolution:** The `WinProbBar` component props should use `gameDuration` (not `gameTime`) and read `match.duration` from `useMatchDetail`. The internal gate is `duration > 300`. The planner must name the prop correctly.

### Finding 2: Win Probability Field on Stratz is NOT a Scalar

**Impact: HIGH — the proposed `predictedOutcomeAverage` field does not exist as a scalar**

C# auto-generated models from Stratz schema (`ekrug3r/StratzModels/MatchType.cs`) show:
- `PredictedWinRates: ICollection<double>` — array of doubles (per-minute rates for completed matches)
- `PredictedOutcomeWeight: byte` — weight value (0–100), not a probability float

For LIVE matches (`MatchLiveType.cs`):
- `WinRateValues: ICollection<decimal>` — array of per-minute win rates
- `LiveWinRateValues: ICollection<{time: int, winRate: decimal}>` — timestamped entries

**Resolution:** Query `live { match(matchId: $matchId) { liveWinRateValues { time winRate } } }` and take the last `winRate` entry as current Radiant win probability. If the array is empty (pre-parse, very early game), return null and the bar is hidden. [ASSUMED — must verify at first API call, exact GraphQL field casing may differ from C# PascalCase]

### Finding 3: Hero Matchup Structure is Nested, Not Flat

**Impact: MEDIUM — transform logic in the planner's `rankCounters` replacement will need to account for this**

C# models show `HeroMatchupType` (returned by `heroVsHeroMatchup`) has:
```
advantage: HeroDryadType[]
  └── heroId: short               ← the opponent hero ID
      vs: HeroStatsHeroDryadType[]
           └── heroId1: short     ← the queried hero
               heroId2: short     ← the opponent hero
               winRateHeroId1: double  ← how often heroId1 wins
               winRateHeroId2: double
               matchCount: long
               winCount: long
               bracketBasicIds: RankBracketBasicEnum?
```

The `advantage` array contains items where `winRateHeroId1 < 0.5` means heroId1 (our hero) loses more. CONTEXT.md's described shape `advantage[]{heroId2, winsCount, matchCount, winRateHeroId1}` does not match — it's nested via `vs[]`. The planner needs to flatten this structure in the transform function. [VERIFIED: StratzModels C# models — confidence MEDIUM as casing/structure may differ slightly in GraphQL JSON]

### Finding 4: No PROFESSIONAL Bracket Enum Value

**Impact: MEDIUM — the query will error with unknown enum value if PROFESSIONAL is sent**

`RankBracketBasicEnum` values: UNCALIBRATED, HERALD_GUARDIAN, CRUSADER_ARCHON, LEGEND_ANCIENT, DIVINE_IMMORTAL, FILTERED, ALL. [VERIFIED: StratzModels RankBracketBasicEnum.cs]

The CONTEXT.md claim `bracketIds: [PROFESSIONAL]` uses a value that does not exist in this enum. The parameter name may also be `bracketBasicIds` rather than `bracketIds`. For "all pro matches" (D-10), the appropriate value is likely `DIVINE_IMMORTAL` (highest rank bracket) or omitting the filter (to use ALL). [ASSUMED — must test at runtime]

---

## Common Pitfalls

### Pitfall 1: Wrong Field Name for Game Duration
**What goes wrong:** `match.game_time` returns `undefined`; gate `game_time > 300` is `false` always; bar never appears even in valid in-game states.
**Why it happens:** CONTEXT.md and UI-SPEC use `game_time` but the Valve API field is `duration`. All codebase types use `duration`.
**How to avoid:** In `WinProbBar.tsx`, prop name `gameDuration: number | undefined`. In `MatchPage.tsx`, pass `gameDuration={match?.duration}`.
**Warning signs:** Bar never appears even after 10 minutes in-game.

### Pitfall 2: Polling Not Stopping on game_state === 6
**What goes wrong:** `useWinProbability` continues polling after match ends, draining Stratz quota.
**Why it happens:** `refetchInterval` not checking for `game_state === 6`.
**How to avoid:** `computeWinProbInterval` must return `false` for `gameState === 6` BEFORE checking `gameState === 5`. This is the first guard. [VERIFIED: CLAUDE.md §Critical Pitfalls]
**Warning signs:** Network tab shows `/api/live/winprob/` requests after match ends.

### Pitfall 3: Stratz liveWinRateValues Empty for Parsed Matches
**What goes wrong:** `liveWinRateValues` returns empty array for matches Stratz has not parsed yet or for very early game time; last element access fails.
**Why it happens:** Stratz parses live data incrementally; early-game or untracked matches may have no entries.
**How to avoid:** Always check `values && values.length > 0` before accessing `values[values.length - 1]`. Return `null` if empty. The 5-minute gate (D-06) handles the early-game case.
**Warning signs:** `Cannot read properties of undefined (reading 'winRate')` server-side.

### Pitfall 4: Hero Matchup Transform Using Wrong Nesting Level
**What goes wrong:** Counter hero IDs come out as `undefined` or wrong; all counters show `winRateHeroId1 === undefined`.
**Why it happens:** `HeroDryadType.heroId` is the opponent hero; the win rate is nested in `vs[]` not directly on `HeroDryadType`.
**How to avoid:** Flatten: for each `advantage[i]`, iterate `advantage[i].vs` to find the entry matching the queried heroId, then read `winRateHeroId1` from that entry. [ASSUMED based on C# model analysis — verify at first API call]
**Warning signs:** Empty counterpick list in IntelTooltip for all heroes.

### Pitfall 5: STRATZ_TOKEN Missing at Server Startup
**What goes wrong:** Server starts but every Stratz call returns 401; both win probability and counterpicks silently fail (return null — graceful degradation hides both features).
**Why it happens:** `STRATZ_TOKEN` not added to `.env` file; env.ts validation doesn't fail startup (if added as optional).
**How to avoid:** Add `STRATZ_TOKEN` as `.min(1)` required field in `EnvSchema` per D-01. Server will refuse to start with missing token.
**Warning signs:** Both WinProbBar and counterpick section hidden permanently, `[stratzApi] fetch error: 401` in server logs.

### Pitfall 6: Stratz GraphQL Field Casing (camelCase vs PascalCase)
**What goes wrong:** Zod parse fails because JSON response uses different casing than expected.
**Why it happens:** C# models use PascalCase (auto-generated from schema). GraphQL JSON responses use camelCase. `winRateValues` not `WinRateValues`, `liveWinRateValues` not `LiveWinRateValues`.
**How to avoid:** Use camelCase in GraphQL query strings and zod schemas. The C# models are a schema reference, not a JSON type description.
**Warning signs:** `[stratzApi] StratzWinProbSchema parse failure` in server logs.

---

## Code Examples

### Zod Schema for Stratz Responses

```typescript
// Source: project pattern from server/src/schemas/openDota.ts [VERIFIED]
// All fields .optional() + .passthrough() per CLAUDE.md §Key Patterns

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
// NOTE: Field names are [ASSUMED camelCase] — verify vs actual JSON response
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
```

### TTL Constant Addition

```typescript
// Source: server/src/cache.ts [VERIFIED]
export const TTL = {
  LIVE_MATCH: 30,
  DRAFT: 4,
  HERO_STATS: 21_600,  // 6 hours
  PLAYER_STATS: 900,   // 15 minutes
  WIN_PROB: 60,        // NEW: Phase 6 D-07 — 2× the 30s client poll cadence
} as const
```

### WinProbBar Component Structure

```tsx
// Source: UI-SPEC + CONTEXT.md D-05 [VERIFIED: UI-SPEC file]
// Note: prop is `gameDuration` (not gameTime) to match actual field name
export interface WinProbBarProps {
  radiantWinProb: number | null
  gameDuration: number | undefined  // match.duration from Valve payload
  gameState: number | undefined
}

export default function WinProbBar({ radiantWinProb, gameDuration, gameState }: WinProbBarProps) {
  if (gameState !== 5 || (gameDuration ?? 0) <= 300 || radiantWinProb === null) {
    return null
  }
  const radiantPct = Math.round(radiantWinProb * 100)
  const direPct = 100 - radiantPct
  // ... render gradient bar with role="progressbar" aria-valuenow={radiantPct} ...
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenDota `/heroes/{id}/matchups` (all ranks) | Stratz `heroVsHeroMatchup` (pro bracket) | Phase 6 | Counterpick data is now pro-specific, higher quality |
| No win probability | Stratz live win probability bar | Phase 6 | Users see ML-powered win prediction during live matches |

**Deprecated in Phase 6:**
- `getHeroMatchups()` in `openDotaApi.ts` — removed, replaced by `getHeroMatchupsStratz()` in `stratzApi.ts`
- `fetchHeroMatchups()` in `openDotaApi.ts` — removed (private function)
- `HeroMatchupSchema` in `server/src/schemas/openDota.ts` — may be removed if nothing else uses it
- Cache key `hero:matchups:{heroId}` — replaced by `stratz:matchups:{heroId}`

---

## Assumptions Log

> Claims tagged [ASSUMED] that need user confirmation or runtime verification before locking.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `predictedOutcomeAverage` on `match(id:)` is the correct win prob field | Schema Findings | Win prob always null; need different query shape |
| A2 | `live.match(matchId:).liveWinRateValues` returns current win prob for live matches | Schema Findings | Wrong query path; need different traversal |
| A3 | GraphQL JSON field names are camelCase versions of C# PascalCase | Schema Findings | Zod parse failure; need different field names in schemas |
| A4 | `heroVsHeroMatchup` parameter is `bracketBasicIds` with `DIVINE_IMMORTAL` for pro data | Schema Findings | Query error or all-rank data instead of pro data |
| A5 | `advantage[].vs[].winRateHeroId1` is the correct path to win rate | Schema Findings | Empty or wrong counter rankings |
| A6 | The `Long!` scalar type in Stratz GraphQL accepts JavaScript numbers (match IDs) without BigInt conversion | stratzApi.ts | Match ID truncation for high IDs |

**Verified claims (not assumed):**
- `duration` field name (not `game_time`) in `EnrichedGame` and `LiveGameSchema` [VERIFIED: codebase]
- `openDotaApi.ts` pattern: `try/catch → return null` + `cached()` [VERIFIED: codebase]
- `TTL.HERO_STATS = 21_600` already exists [VERIFIED: cache.ts]
- `RankBracketBasicEnum` has no PROFESSIONAL value [VERIFIED: StratzModels C# auto-generated]
- `HeroMatchupType` has nested `advantage: HeroDryadType[]` not flat array [VERIFIED: StratzModels C# auto-generated]

---

## Open Questions

1. **Exact win probability GraphQL query shape**
   - What we know: `MatchLiveType` has `WinRateValues` and `LiveWinRateValues` per C# models; `MatchType` has `PredictedWinRates` array
   - What's unclear: Which is correct for our use case — `live.match` (live-only) or `match` (all matches including recent live)? Does `live.match` work with Valve `match_id`?
   - Recommendation: In Wave 0, write the Stratz service with a defensive schema that accepts both possible shapes. Verify on first real API call. Add a console.log to dump raw response on first hit.

2. **Hero matchup bracket filter for "pro matches"**
   - What we know: `RankBracketBasicEnum` has DIVINE_IMMORTAL (highest), no PROFESSIONAL
   - What's unclear: Whether there's a separate query parameter for league/tournament matches specifically
   - Recommendation: Per D-10 (all pro matches for sample size), use `DIVINE_IMMORTAL` as closest approximation, or omit the filter for `ALL`. Verify sample counts match expectations in first API call.

3. **Hero matchup nested structure traversal**
   - What we know: `HeroDryadType` has `vs: HeroStatsHeroDryadType[]` where the win rates live
   - What's unclear: For `advantage` array, does each entry have `heroId` = opponent hero, and `vs[0]` = the matchup stats? Or is `vs[]` multiple entries per opponent (e.g., per bracket)?
   - Recommendation: Log the full response structure on first API call. Write the transform function defensively.

4. **game_time vs duration naming in WinProbBar props**
   - What we know: The field in `EnrichedGame` is `duration`; CONTEXT.md and UI-SPEC say `game_time`
   - What's unclear: Whether the CONTEXT/UI-SPEC intended `game_time` as a concept name vs the actual field name
   - Recommendation: Name the WinProbBar prop `gameDuration` to match the actual field. Update MatchPage to pass `match?.duration`. The 5-minute gate (`> 300`) is unchanged.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server runtime | ✓ | 24.x (per CLAUDE.md) | — |
| Vitest | Test runner | ✓ | ^2.0.0 | — |
| STRATZ_TOKEN | Stratz API auth | ? | — | Service returns null; both features hidden |
| Upstash Redis | Cache layer | ✓ | Connected (prior phases work) | Cache miss — upstream called each time |

**Missing dependencies with no fallback:**
- `STRATZ_TOKEN` — must be provided in `.env` for win probability or counterpick features to function. Server fails startup if missing (per D-01: required field in EnvSchema).

**Missing dependencies with fallback:**
- None beyond the token.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | none — vitest configured via vite.config.ts (client), package.json scripts (server) |
| Quick run command (server) | `cd server && npx vitest run src/services/stratz.test.ts` |
| Quick run command (client) | `cd client && npx vitest run src/hooks/useWinProbability.test.ts` |
| Full suite command (server) | `cd server && npx vitest run` |
| Full suite command (client) | `cd client && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MATCH-06 | Win probability polling: 30s in-game, false post-game | unit | `cd client && npx vitest run src/hooks/useWinProbability.test.ts` | ❌ Wave 0 |
| MATCH-06 | Win probability hidden when `duration <= 300` or `gameState !== 5` | unit | `cd client && npx vitest run src/hooks/useWinProbability.test.ts` | ❌ Wave 0 |
| MATCH-06 | `rankCountersStratz` returns top-3 counters sorted by winRateHeroId1 ascending | unit | `cd server && npx vitest run src/services/intel.test.ts` | ✅ (extend existing) |
| MATCH-06 | Stratz error/null does not crash intel aggregator | unit | `cd server && npx vitest run src/services/stratzApi.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Quick run for the relevant test file
- **Per wave merge:** `cd server && npx vitest run` + `cd client && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `client/src/hooks/useWinProbability.test.ts` — covers `computeWinProbInterval` cadence contract (MATCH-06 gate logic: game_state===5 + duration>300 → 30000, game_state===6 → false, etc.)
- [ ] `server/src/services/stratzApi.test.ts` — covers null-return on fetch error, null-return on empty liveWinRateValues, null-return on 4xx. Uses same `vi.mock('ioredis')` + `vi.mock('../env.js')` pattern as `openDotaApi.test.ts`.

*(Existing `intel.test.ts` should be extended to cover `rankCountersStratz` when it's implemented in the same file)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `matchId` via `Number.isFinite()` guard (existing pattern); Stratz response via zod `.passthrough()` |
| V6 Cryptography | no | — |

### Known Threat Patterns for Stratz + Hono BFF

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stratz token leakage to client | Info Disclosure | Token in `env.ts` server-side only; never returned in BFF response body |
| Per-user Stratz calls (quota drain) | DoS | Cache key by `matchId`/`heroId` only — `stratz:winprob:{matchId}`, `stratz:matchups:{heroId}` |
| Non-numeric `matchId` path param | Tampering | `Number.isFinite(parsedId)` guard → 400 — existing pattern in all routes |
| Stratz error details in BFF response | Info Disclosure | `catch { return c.json({ error: 'Upstream error' }, 502) }` — opaque error, no Stratz response forwarded |
| Stratz 429 causing cascading failures | DoS | `try/catch → return null` pattern — 429 treated as null, bar silently hidden |

---

## Sources

### Primary (HIGH confidence)
- `server/src/services/openDotaApi.ts` — pattern for `stratzApi.ts` (try/catch, cached, console.error) [VERIFIED: codebase read]
- `server/src/cache.ts` — `cached()` signature, `TTL` constants [VERIFIED: codebase read]
- `server/src/env.ts` — EnvSchema pattern for STRATZ_TOKEN addition [VERIFIED: codebase read]
- `server/src/routes/live.ts` — BFF route pattern (matchId guard, 502, 404) [VERIFIED: codebase read]
- `server/src/schemas/valve.ts` — `duration` field name (not `game_time`) [VERIFIED: codebase read]
- `client/src/hooks/useMatchIntel.ts` — `computeIntelInterval` pattern for `computeWinProbInterval` [VERIFIED: codebase read]
- `client/src/hooks/useLiveGames.ts` — `EnrichedGame.duration` field [VERIFIED: codebase read]
- `ekrug3r/StratzModels` C# auto-generated models — `MatchLiveType`, `MatchType`, `HeroMatchupType`, `HeroDryadType`, `HeroStatsHeroDryadType`, `RankBracketBasicEnum` [VERIFIED: raw GitHub content fetch]

### Secondary (MEDIUM confidence)
- CONTEXT.md §D-01 to D-16 — 16 locked decisions [read during session]
- UI-SPEC — WinProbBar component interface and render contract [read during session]

### Tertiary (LOW confidence / ASSUMED)
- CONTEXT.md claim `predictedOutcomeAverage` on `match(id:)` — not found in C# models [ASSUMED: A1]
- CONTEXT.md claim `bracketIds: [PROFESSIONAL]` — no PROFESSIONAL value in verified enum [ASSUMED: A4]
- GraphQL JSON field casing (camelCase) derived from C# PascalCase models [ASSUMED: A3]
- `advantage[].vs[].winRateHeroId1` traversal path for counter ranking [ASSUMED: A5]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages, all established project patterns verified
- Architecture: HIGH — follows existing BFF + cached() + TanStack Query patterns exactly
- Stratz field names: MEDIUM — C# models verified but GraphQL JSON casing and exact query shapes require runtime confirmation
- Pitfalls: HIGH — duration/game_time conflict and bracket enum issues are verified findings

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (Stratz schema changes rarely; duration/field findings are stable)
