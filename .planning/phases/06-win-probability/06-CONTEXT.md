# Phase 6: Win Probability - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Two Stratz-powered features that share one Stratz service layer:

1. **MATCH-06 (Win Probability):** A Radiant-vs-Dire win-probability bar appears on the match screen
   once in-game time exceeds 5 minutes. Hidden before 5 min, hidden when Stratz is unavailable.

2. **Counterpick Data Upgrade:** Replace the existing OpenDota all-ranks matchup source
   (`/heroes/{id}/matchups`) with Stratz GraphQL `heroVsHeroMatchup(bracketIds: [PROFESSIONAL])`.
   This upgrades Phase 5's counterpick tooltip to use pro-match data. Fallback: hide counterpicks
   if Stratz is unavailable (same graceful-degradation pattern as win probability).

Both features are implemented together because they share a single Stratz service setup
(token env var, GraphQL client wrapper, `cached()` integration).

</domain>

<decisions>
## Implementation Decisions

### Stratz Service Setup
- **D-01:** Add `STRATZ_TOKEN` to `server/src/env.ts` (required, startup-validated). The token
  is a Bearer token obtained from stratz.com/api.
- **D-02:** Create `server/src/services/stratzApi.ts` as a thin GraphQL wrapper. All requests use
  `Authorization: Bearer ${env.STRATZ_TOKEN}` header. Error handling follows the existing pattern:
  `try/catch → return null` (never throw). All Stratz calls go through `cached()`.
- **D-03:** Stratz GraphQL endpoint: `https://api.stratz.com/graphql` (POST, JSON body with
  `query` and `variables` fields).

### Win Probability Bar (MATCH-06)
- **D-04:** Position: **immediately under ScoreHeader**, before DraftSection. Visually groups
  "who is winning" context (kills, gold, probability) in one area.
- **D-05:** Visual design: **green/red gradient bar**. Radiant side: `#4ade80`, Dire side: `#ef4444`.
  Percentage labels on both ends (e.g. `68%` left, `32%` right). Full-width, thin bar (~8px height).
  Team labels ("Radiant" / "Dire") below the bar in their respective colors.
- **D-06:** Show bar **only when `game_state === 5` (in-game) AND `game_time > 300` seconds AND
  Stratz data is non-null**. Hidden otherwise — no placeholder, no error message.
- **D-07:** Server cache key: `stratz:winprob:{matchId}`. TTL: **60s** (2× the 30s client poll —
  every client poll gets fresh-enough data with at most 1 Stratz call per minute per match).
- **D-08:** Stratz GraphQL query for win probability — use the `match` query with win prediction
  field. If Stratz returns null or errors, the BFF route returns `null` for winProb and the client
  hides the bar.

### Counterpick Data Upgrade
- **D-09:** **Full replacement** of OpenDota `/heroes/{id}/matchups` with Stratz
  `heroVsHeroMatchup(heroId: $heroId, bracketIds: [PROFESSIONAL])`. No OpenDota fallback — if
  Stratz is unavailable, counterpick section in tooltip is hidden (same pattern as win probability).
- **D-10:** Data scope: **all pro matches** (no patch filter). Maximises sample size and stability.
  Stratz aggregates historically — thousands of pro games per hero pair vs dozens if patch-filtered.
- **D-11:** Server cache key: `stratz:matchups:{heroId}`. TTL: **6h** (same as `TTL.HERO_STATS` —
  pro matchup data is as static as patch hero stats). This replaces the existing
  `hero:matchups:{heroId}` OpenDota cache key.
- **D-12:** Stratz `heroVsHeroMatchup` returns an `advantage` array. Each entry:
  `{ heroId2, winsCount, matchCount, winRateHeroId1 }`. A hero is a counter when
  `winRateHeroId1 < 0.50` (heroId2 wins more than heroId against each other).
  Sort counters by `winRateHeroId1` ascending → top 3 are worst matchups for heroId.

### Graceful Degradation (both features)
- **D-13:** When Stratz is down, rate-limited, or returns null — **fully hide** the affected
  component. No error state, no placeholder text. Existing match screen content unchanged.
  This applies to both win probability bar and counterpick section in the tooltip.
- **D-14:** BFF routes for both features use `Promise.allSettled` or equivalent to ensure Stratz
  failure never crashes other endpoints. Stratz is always optional.

### Polling
- **D-15:** Win probability polling: **30s** — same `refetchInterval` as in-game match data.
  Client reuses the existing `useMatchDetail` data (game_time is already available) to decide
  whether to show the bar. No separate hook for win probability polling needed if win probability
  is bundled into the existing match detail BFF endpoint — Claude's discretion.
- **D-16:** Counterpick matchup data (`stratz:matchups:{heroId}`) does **not** poll — 6h TTL,
  `refetchInterval: false` on client (same as `useHeroStats` pattern from Phase 5).

### Claude's Discretion
- Whether win probability is a separate BFF endpoint (`GET /api/live/winprob/:matchId`) or
  bundled into the existing match detail route — separate is cleaner for cache isolation.
- Exact Stratz GraphQL query shape for win probability (verify against Stratz docs at runtime).
- Whether to add a `TTL.WIN_PROB = 60` constant or inline the value in the route.
- Bar animation: CSS `transition: width 500ms ease` as probability shifts — subtle, not distracting.
- Whether `stratzApi.ts` uses a raw `fetch` or a minimal helper function — raw fetch is fine given
  existing patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/REQUIREMENTS.md` §MATCH — MATCH-06: exact acceptance criteria for win probability.
- `.planning/ROADMAP.md` §Phase 6 — 4 success criteria including graceful degradation and caching.

### Critical Patterns
- `CLAUDE.md` §Key Patterns — `cached()` is the ONLY path to upstream. Stratz is always optional
  (wrapped in `Promise.allSettled`, typed as `value | null`). Rate limit: 500 req/hr.
- `CLAUDE.md` §Critical Pitfalls — Stratz 500 req/hr — cache server-side by `match_id` only,
  never per-user. Polling must stop on `game_state === 6`.

### Existing Server Infrastructure
- `server/src/cache.ts` — `cached()` decorator + `TTL` constants. Add `TTL.WIN_PROB = 60`.
  `TTL.HERO_STATS = 21_600` reused for counterpick matchups.
- `server/src/env.ts` — Add `STRATZ_TOKEN` here following existing pattern.
- `server/src/services/openDotaApi.ts` — Pattern to follow for `stratzApi.ts`: `try/catch → null`,
  `cached()` wrapper, console.error logging. Function `getHeroMatchups()` here will be replaced
  by the Stratz version.

### Phase 5 Code Being Modified
- `server/src/services/openDotaApi.ts` — `getHeroMatchups(heroId)` and `fetchHeroMatchups()` will
  be removed (replaced by Stratz equivalent in `stratzApi.ts`).
- `server/src/routes/live.ts` — `GET /api/live/intel/:matchId` aggregator currently calls
  `getHeroMatchups()` — update to call Stratz version.
- `server/src/schemas/openDota.ts` — `HeroMatchupSchema` may be replaced with Stratz schema.

### Prior Phase Context
- `.planning/phases/05-hero-player-intel/05-CONTEXT.md` — D-05 (top-3 counterpicks by disadvantage
  score), D-06 (⚠ flag for "known to play"), D-12 (cache key `hero:matchups:{heroId}` → replaced).
- `.planning/phases/03-match-core/03-CONTEXT.md` — ScoreHeader position on MatchPage, dark theme.
- `.planning/phases/04-draft-ux/04-CONTEXT.md` — dark theme tokens.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/cache.ts`: `cached(key, TTL, fn)` — use exactly as-is for all Stratz calls.
- `server/src/env.ts`: Add `STRATZ_TOKEN` to `EnvSchema` following existing field pattern.
- `client/src/components/ScoreHeader.tsx`: Reference for section styling; win prob bar goes below.
- `client/src/hooks/useMatchDetail.ts`: `game_time` and `game_state` already available — reuse
  to gate bar display (`game_state === 5 && game_time > 300`).

### Established Patterns
- Dark theme: `#0a0a0a` bg, `#d8d8d8` text, `#4ade80` Radiant, `#ef4444` Dire, `#1a1a1a` borders.
- Service error handling: `try/catch → return null` — Stratz must follow this exactly.
- BFF route error handling: `try { ... } catch { return c.json({ error: '...' }, 502) }`.
- All zod schemas: `.passthrough()` and `.optional()` fields.
- TanStack Query v5: `refetchInterval: false` for static data, `30_000` for in-game.

### Integration Points
- `client/src/pages/MatchPage.tsx` — Insert `<WinProbBar>` between `<ScoreHeader>` and
  `<DraftSection>` (or `<HeroPlayerGrid>` when not in draft). Conditional: only when in-game
  and `game_time > 300` and `winProb !== null`.
- `server/src/routes/live.ts` — Add `GET /api/live/winprob/:matchId` (new route, Stratz-backed).
- `server/src/services/stratzApi.ts` — New file. Export `getWinProbability(matchId)` and
  `getHeroMatchupsStratz(heroId)`. Both use `cached()` with appropriate TTLs.

</code_context>

<specifics>
## Specific Ideas

- Stratz GraphQL base URL: `https://api.stratz.com/graphql`
- Stratz Bearer auth header: `Authorization: Bearer ${env.STRATZ_TOKEN}`
- Win probability GraphQL query shape (verify at runtime — Stratz schema may differ):
  ```graphql
  query WinProbability($matchId: Long!) {
    match(id: $matchId) {
      predictedOutcomeAverage
    }
  }
  ```
  `predictedOutcomeAverage` ∈ [0, 1] = Radiant win probability. Dire = `1 - radiant`.
- Counterpick GraphQL query shape:
  ```graphql
  query HeroMatchups($heroId: Short!) {
    heroStats {
      heroVsHeroMatchup(heroId: $heroId, bracketIds: [PROFESSIONAL]) {
        advantage {
          heroId2
          winsCount
          matchCount
          winRateHeroId1
        }
      }
    }
  }
  ```
  Sort `advantage` by `winRateHeroId1` ascending → top 3 are hardest counters for `heroId`.
- Stratz rate limit: 500 req/hr. With 6h TTL for matchups (120 heroes max = 20 req/hr) and 60s
  TTL for win prob (2 active matches × 60 req/hr = 120 req/hr), total budget: ~140 req/hr —
  well within limit.
- Win prob bar CSS: `height: 8px`, `border-radius: 4px`, `background: linear-gradient(to right,
  #4ade80 {radiantPct}%, #ef4444 {radiantPct}%)`. Smooth transition on value change.

</specifics>

<deferred>
## Deferred Ideas

- **Win probability sparkline (trend)** — v2 requirement. Phase 6 shows only current snapshot.
- **Patch-filtered counterpick data** — user chose all-time pro matches for stability; patch filter
  could be revisited in v2 if Stratz exposes it cleanly.
- **Stratz player profiles** — Stratz has richer player data than OpenDota. Could enhance Phase 5
  player stats in v2.
- **Tournament-scoped hero winrate** — v2 requirement. Not in Phase 6 scope.

</deferred>

---

*Phase: 06-win-probability*
*Context gathered: 2026-04-26*
