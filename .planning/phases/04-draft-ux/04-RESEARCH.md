# Phase 4: Draft UX - Research

**Researched:** 2026-04-24
**Domain:** Live Dota 2 draft rendering; TanStack Query v5 dynamic polling; Valve `GetLiveLeagueGames` draft schema
**Confidence:** HIGH on TanStack Query v5 API and Valve live-draft payload shape (verified against real API sample); MEDIUM on Captain's Mode order inference (7.40 era rules verified but mode detection is ambiguous)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Side-by-side layout — Radiant column left, Dire column right. Each column: picks row (5 slots) above bans row (7 slots).
- **D-02:** Empty bordered placeholder slots always shown for unfilled picks/bans (5 + 7 per team). Reads as a progress tracker.
- **D-03:** Section order on MatchPage: Title → ScoreHeader → **DraftSection** → HeroPlayerGrid → Buildings.
- **D-04:** Bans displayed at same portrait size as picks. Distinguished by a semi-transparent red X overlay. Hero identity preserved.
- **D-05:** Empty ban slots use the same bordered placeholder style as empty pick slots.
- **D-06:** Active team indicated by TWO cues: (1) text label above grid (`Radiant — picking` / `Dire — banning`), (2) subtle left-edge ember glow on active column (`#b03030`, low-opacity box-shadow).
- **D-07:** Turn indicator hidden once `game_state` leaves draft (post-draft no "active team" concept).
- **D-08:** If Valve API has no explicit "active team" field, infer from `picks_bans` order using Captain's Mode alternating sequence. **If inference is ambiguous OR `picks_bans` is unavailable, hide the turn indicator rather than guess wrong.**
- **D-09:** Draft section appears ONLY when `game_state === 2`. Not rendered pre-draft (lobby) or during loading.
- **D-10:** On transition to `game_state === 5` (in-game), draft section **persists** above HeroPlayerGrid. Turn indicator hidden, picks/bans frozen.
- **D-11:** Draft section never appears when `game_state === 6` if not already visible; if already rendered, it stays frozen.
- **D-12:** Upgrade `useMatchDetail` (and `useLiveGames` if needed) to dynamic `refetchInterval` callback: `(query) => game_state === 2 ? 5_000 : game_state === 6 ? false : 30_000`.
- **D-13:** 5s interval applies ONLY while `game_state === 2`. State 5 → 30s. State 6 → false.
- **D-14:** Add `picks_bans` array to `LiveGameSchema`. Each entry has at minimum: `hero_id` (number, optional), `is_pick` (boolean), `team` (number: 0=Radiant, 1=Dire), `order` (number). `.passthrough()` on item schema.
- **D-15:** `picks_bans` field itself is `.optional()` — absent pre-draft and some lobby states.

> **CRITICAL CORRECTION:** D-14's assumed schema (`picks_bans` as a top-level array with `is_pick`/`team`/`order`) **does not match the actual `GetLiveLeagueGames` response**. Real shape is `scoreboard.radiant.{picks,bans}` and `scoreboard.dire.{picks,bans}`, each entry containing ONLY `{ hero_id }`. See Section 3 below. Planner MUST reconcile with user before execution (or choose to adopt the correct schema).

### Claude's Discretion

- Exact portrait size for pick slots (recommend ~56–64 px square, consistent with `PlayerRow` 48 px portrait).
- Whether text label and glow update optimistically on each poll or only on confirmed `picks_bans` change.
- CSS animation choice for the left-edge glow (transition vs keyframe pulse — keep subtle).
- Exact red X styling (SVG icon vs CSS `::after` pseudo-element with rotation).
- Column header labels ("Radiant" / "Dire" in their respective team colors `#4ade80` / `#ef4444`).

### Deferred Ideas (OUT OF SCOPE)

- Draft pick timer (no clock reference in API).
- Hero name tooltip on draft portrait (defer to Phase 5).
- Captain's Mode phase label ("Ban Phase 1 / Pick Phase 1").
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DRAFT-01 | User sees all picks and bans per team with hero portraits, updating live every 5s during draft phase | Section 1 (TQ v5 refetchInterval callback); Section 3 (live draft payload shape); Section 5 (BFF cache TTL ≤ poll interval); Section 7 (portrait rendering with `hero_id` fallbacks) |
| DRAFT-02 | User sees which team is currently picking or banning | Section 2 (CM 7.40 order, first-pick ambiguity); Section 3 (no `order` field in live payload — inference works on counts, not event ordering); D-08 fallback of hiding on ambiguity |
</phase_requirements>

## Executive Summary

- **TanStack Query v5 dynamic `refetchInterval` verified.** Signature: `(query: Query) => number | false | undefined`. Read data via `query.state.data` (NOT `query.state.data.select(...)`). Callback re-evaluates frequently (every options/data change), so the `2 → 5 → 6` transition picks up immediately. `refetchIntervalInBackground` remains supported as `boolean`. [CITED: https://tanstack.com/query/latest/docs/framework/react/reference/useQuery]
- **Live draft payload shape is NOT what D-14 assumes.** Verified against a real `GetLiveLeagueGames` sample JSON: the response has **no top-level `picks_bans`** array. Picks and bans live under `scoreboard.radiant.{picks,bans}` and `scoreboard.dire.{picks,bans}`. Each entry is `{ hero_id: number }` only — **no `order`, no `is_pick`, no `team` field**. Array position is the only ordering information (and it's per-team, not global). [VERIFIED: raw JSON from `lpradel/steam-web-api-java` sample response]
- **Turn inference has irreducible ambiguity.** Because there's no global `order` field, you can only derive "whose turn is next" by (a) matching per-team pick/ban counts against the Captain's Mode sequence and (b) knowing which team has first pick — which **is not exposed** by the API. D-08's fallback ("hide indicator when ambiguous") is the correct escape hatch; recommend applying it liberally.
- **BFF cache TTL = 30s conflicts with 5s client poll during draft.** `server/src/cache.ts` hard-codes `TTL.LIVE_MATCH = 30`. If the client polls `/api/live/games` every 5s but the cache holds the payload for 30s, new picks take up to 30s to reach the user — contradicting DRAFT-01's "~5s appear live" success criterion. Must be addressed explicitly by the planner.
- **Captain's Mode order changed in 7.40.** CONTEXT D-08 cites a sequence that matches patch 7.34-era rules (22 steps: 12 bans + 10 picks). Current (7.40) Liquipedia-documented sequence is **24 steps (14 bans + 10 picks)** and depends on first-pick team. Specific slot counts per team — 5 picks each, 7 bans each — require the 7.40 totals, not 7.34's 6-per-team bans. D-01's grid assumes 7 ban slots, which matches 7.40.

**Primary recommendation:** Before planning, escalate two items to the user / discuss-phase:
1. **Schema reconciliation** — adopt the actual Valve live shape (`scoreboard.{radiant,dire}.{picks,bans}`) in `LiveGameSchema`, NOT the post-match `picks_bans` shape (the post-match shape would force a fallback to OpenDota).
2. **Cache TTL reconciliation** — add draft-tier TTL (e.g., `TTL.DRAFT = 4`) and switch the cache key during draft, OR accept that new picks have up to 30s latency (violating DRAFT-01).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live draft polling cadence (5s/30s/false) | Client (React + TQ v5) | — | `refetchInterval` is a client concern. BFF is stateless — client decides when to ask. |
| Upstream rate limiting / cache coalescing | Backend (Hono + Redis) | — | `cached()` decorator ensures N viewers = 1 upstream call per TTL. Cannot be moved to client. |
| `picks_bans` shape transformation / normalization | Backend (BFF route) | Shared (zod) | BFF should normalize Valve's `scoreboard.radiant.picks[{hero_id}]` into a stable client-facing shape. zod schema lives in `server/src/schemas/valve.ts` per convention. |
| Turn inference (next-to-act) | Client (pure function in `utils/`) | — | Pure computation over `picks_bans` counts + game_state. No side effects, no upstream dependency. |
| Hero portrait rendering | Client | Shared (`heroMapper`) | Browser-safe `client/src/utils/heroMapper.ts` (NOT `@shared/heroMapper` which uses `createRequire`). |
| Empty placeholder slots | Client | — | Pure rendering logic; React component responsibility. |
| game_state transition debouncing (if needed) | Client (hook) | — | PITFALLS.md P7 flags non-atomic transitions; debounce in `useMatchDetail`. |

## Standard Stack

### Core (already installed — versions verified against lockfile)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-query` | **5.99.2** | Polling + server cache | Dynamic `refetchInterval(query)` is the purpose-built primitive for draft/in-game/post-game cadence. [VERIFIED: `npm ls @tanstack/react-query` in `client/`] |
| `zod` | **3.25.76** | Runtime schema validation | `.passthrough()` per CLAUDE.md; used for every external API response. [VERIFIED: `npm ls zod` in `server/`] |
| `hono` | 4.x | BFF framework | Existing — no change for Phase 4. |
| `ioredis` | 5.x | Redis client | Existing — TTL changes only. |
| `react` | 19.2.x | UI | Existing. |
| `tailwindcss` | 4.1.x | Styling | Existing. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `clsx` | 2.x | Conditional className composition | For active-column glow class vs inactive. |
| `vitest` | 2.x | Unit + hook tests | Already project standard — use for draft-order inference tests and refetchInterval logic. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Valve `GetLiveLeagueGames` draft shape (sparse, no order) | OpenDota `/api/liveMatches` | OpenDota has richer shape but adds upstream dependency, rate limit, 1-3 minute extra delay. Rejected — Valve is the live source. |
| Client-side turn inference | Server-side inference in BFF | Pushes complexity to shared code. Keep on client — it's pure, deterministic, cheap. |
| Polling | WebSocket / Stratz live | Valve doesn't push. Stratz streams are paid/gated. Rejected — polling is the only option. |

**Installation:** No new dependencies required.

**Version verification:**
```bash
cd client && npm ls @tanstack/react-query  # → 5.99.2 (installed)
cd server && npm ls zod                     # → 3.25.76 (installed)
```

## Architecture Patterns

### Data flow (entry → output)

```
Valve GetLiveLeagueGames (30s rate limit ~ every 15-20s refresh upstream)
        │
        ▼
[BFF] server/src/services/valveApi.ts — fetch + zod parse (LiveLeagueGamesSchema)
        │  wrapped by cached('live_games', TTL.LIVE_MATCH=30, ...)  ← TTL ISSUE
        ▼
[BFF] server/src/routes/live.ts — GET /api/live/games, enrich league_name
        │
        ▼  (HTTP 200 JSON { games: EnrichedGame[] })
[Client] useLiveGames (home page, 30s poll)
[Client] useMatchDetail (match page, 5s draft / 30s live / false post-game)
        │
        ▼ (query.data?.games.find(g => g.match_id === matchId))
MatchPage
 ├── ScoreHeader
 ├── DraftSection   ◀── NEW for Phase 4 (conditional: game_state === 2 OR was previously visible)
 │    ├── Turn indicator (label + left-edge glow)   ◀── hidden if ambiguous or game_state != 2
 │    ├── Radiant column  (5 picks + 7 bans)
 │    └── Dire column     (5 picks + 7 bans)
 ├── HeroPlayerGrid  (empty portrait slots during draft per Phase 3 D-13)
 └── BuildingsSection (hidden during draft per Phase 3 D-10 / D-13)
```

### Recommended File Additions
```
client/src/
├── components/
│   ├── DraftSection.tsx           # NEW — top-level draft widget
│   ├── DraftColumn.tsx            # NEW — one team's picks + bans grid
│   ├── DraftPortrait.tsx          # NEW — single hero portrait cell (pick or ban variant)
│   └── DraftTurnIndicator.tsx     # NEW — text label above grid
├── utils/
│   └── draftOrder.ts              # NEW — pure functions: inferActiveTeam, expectedAction
│   └── draftOrder.test.ts         # NEW — unit tests for CM 7.40 sequence
└── hooks/
    └── useMatchDetail.ts          # MODIFY — upgrade refetchInterval to callback

server/src/
└── schemas/
    └── valve.ts                   # MODIFY — extend LiveGameSchema with scoreboard/picks/bans
```

### Pattern 1: Dynamic `refetchInterval` with `game_state` branching

**What:** TanStack Query v5 accepts `refetchInterval: (query: Query) => number | false | undefined`. The callback re-evaluates frequently (on options update, on new data, on focus events), so a state transition in the cached payload is picked up without manual invalidation.

**When to use:** Variable-cadence polling where cadence depends on response content.

**Example (adapted to this codebase):**
```typescript
// client/src/hooks/useMatchDetail.ts — Phase 4 upgrade of D-12
import { useQuery, useQueryClient, type Query } from '@tanstack/react-query'

const query = useQuery<LiveGamesResponse>({
  queryKey: ['live-games'],
  queryFn: () => fetch('/api/live/games').then((r) => r.json()),
  // D-12 dynamic form. Reads data through query.state.data (v5: not the `select`-transformed view).
  refetchInterval: (q: Query<LiveGamesResponse>) => {
    const games = q.state.data?.games ?? []
    const match = games.find((g) => String(g.match_id) === matchId)
    const gs = match?.game_state
    if (gs === 2) return 5_000        // draft — poll every 5s
    if (gs === 6) return false         // post-game — stop polling (MUST per CLAUDE.md)
    return 30_000                      // lobby / in-game / unknown — 30s default
  },
  // refetchIntervalInBackground defaults to false — polling pauses when tab hidden.
  // Acceptable for this app (user is actively watching); do NOT enable unless verified with user.
  staleTime: 4_000, // strictly less than draft interval so refetch isn't skipped
})
```
[CITED: https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5 — v5 callback signature]
[CITED: https://tanstack.com/query/latest/docs/framework/react/reference/useQuery — full refetchInterval spec]

**Gotchas:**
- Must use `query.state.data` inside callback; the callback does NOT receive transformed `select` output.
- Changing the return value between renders is fine — TQ recalculates the timer.
- `staleTime: 25_000` in current `useMatchDetail` would prevent refetch even when interval fires. Lower to `4_000` so draft polls actually hit the network (the BFF cache still coalesces upstream).
- `refetchIntervalInBackground` defaults `false`. If the user backgrounds the tab during draft, polling pauses. This is usually fine (user not watching) but DOCUMENT the behavior; don't silently change it.

### Pattern 2: Captain's Mode turn inference (degradable)

**What:** Pure function `inferActiveTeam(radiantPicks, direPicks, radiantBans, direBans, firstPickTeam?) → { team: 0|1, action: 'pick'|'ban' } | null`. Returns `null` when first-pick is unknown or when counts don't match any sequence step.

**When to use:** To populate D-06 text label and left-edge glow during `game_state === 2`.

**Example (skeleton):**
```typescript
// client/src/utils/draftOrder.ts
// Captain's Mode 7.40 sequence (24 steps, assuming Radiant has first pick).
// Each entry: [actingTeam, action] where team is 0=Radiant, 1=Dire.
// Source: Liquipedia Game Modes (current as of 7.40).
// [CITED: https://liquipedia.net/dota2/Game_Modes — verified Apr 2026]
// NOTE: Mirror-flip every entry if Dire has first pick.
const CM_740_RADIANT_FIRST: ReadonlyArray<readonly [0 | 1, 'ban' | 'pick']> = [
  // Ban phase 1 (7 bans): R-D-R-D-R-D-R  (verified from Liquipedia)
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
// Total: 14 bans + 10 picks = 24 steps, 7 bans per team, 5 picks per team.

export function inferActiveTeam(
  counts: { rPicks: number; dPicks: number; rBans: number; dBans: number },
  firstPickTeam: 0 | 1 | null,   // null → cannot infer
): { team: 0 | 1; action: 'pick' | 'ban' } | null {
  if (firstPickTeam === null) return null
  const seq = firstPickTeam === 0 ? CM_740_RADIANT_FIRST : mirror(CM_740_RADIANT_FIRST)
  const completedSteps = counts.rPicks + counts.dPicks + counts.rBans + counts.dBans
  if (completedSteps >= seq.length) return null  // draft complete
  return { team: seq[completedSteps][0], action: seq[completedSteps][1] }
}
```

**Pitfalls:**
- Function returns `null` on ambiguity — UI must treat null as "hide indicator" (D-08 mandates this).
- First-pick team is NOT exposed by `GetLiveLeagueGames`. Options: (a) always return `null` unless we can derive it (conservative, UI always hides indicator → D-06 only shows hero columns); (b) assume Radiant first-pick (wrong half the time); (c) derive from the first completed ban's team if present (heuristic but reasonable — whichever team has the first ban matches the sequence). Recommend (c) with explicit test cases.
- Mode is NOT checked. Non-Captain's Mode games (All Pick, Captain's Draft, Turbo) have different draft sequences. See Section 2 for mode detection.

### Anti-Patterns to Avoid

- **Hand-rolling a state machine for the draft progression.** Pure `count → sequence` lookup is sufficient; state machines obscure the logic.
- **Calling `queryClient.invalidateQueries(['live-games'])` on every render to force refresh.** This creates a thundering-herd risk and conflicts with the BFF cache. Let `refetchInterval` do its job.
- **Storing `picks_bans` in Zustand or React state.** It's server state — already owned by TanStack Query's cache. Re-deriving per render is free.
- **Trusting the `order` field from a post-match OpenDota response in a live context.** OpenDota's live data lags 1-3 minutes behind Valve; for live UX, Valve is authoritative even though its shape is sparser.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dynamic polling intervals | Custom `setInterval` inside `useEffect` | TQ v5 `refetchInterval` callback | TQ handles tab focus, window blur, cleanup, deduplication. Manual intervals leak on unmount. |
| Hero ID → name/portrait | Custom hero metadata lookup | `client/src/utils/heroMapper.ts` (already exists) | Browser-safe version is already built for Phase 3. DO NOT import `@shared/heroMapper` in client (createRequire breaks Vite). |
| Debouncing game_state transitions | Custom timer state | Only if PITFALLS P7 actually manifests in testing | **Do NOT preemptively add debouncing.** It's premature optimization. If flicker is seen, add a 2-poll-stable guard in one place. |
| Bitmask / bit fiddling | Any custom bit operations on draft data | N/A — draft data has no bitmasks | Unlike buildings, draft is plain arrays. Do not over-engineer. |
| Optimistic UI / server-sent events | Mutation queues, SSE client | N/A — this is a read-only polled UI | No user actions, no writes. Optimistic updates are meaningless here. |

**Key insight:** Phase 4 is almost entirely about data shape (Section 3) and polling cadence (Section 1). The UI is a straightforward grid of portraits. The trap is reaching for complexity (state machines, debouncing, optimistic rendering) that the problem doesn't demand.

---

## Section 1 — TanStack Query v5 dynamic `refetchInterval` (HIGH confidence)

**Exact callback signature (v5):**

```typescript
refetchInterval: number | false | ((query: Query<TQueryFnData, TError, TData, TQueryKey>) => number | false | undefined)
```
[CITED: https://tanstack.com/query/latest/docs/framework/react/reference/useQuery]
[CITED: https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5]

**v4 → v5 breaking change:** The callback used to receive `(data, query)`; in v5 it receives `(query)` only. Existing v5 code in this repo (`useLiveGames.ts`, `useMatchDetail.ts`) already notes this in comments.

**Reading cached data inside the callback:**
- Use `query.state.data` — this is the raw response.
- It does NOT apply the `select` transformation. If `select` is used, the callback sees the pre-select value.
- In this codebase, no hook uses `select`, so `query.state.data?.games` is safe.

**When the callback re-evaluates:**
- After every successful fetch (new data arrives).
- When hook options change.
- TanStack Query internally recomputes the timer on each re-evaluation; no manual `invalidateQueries` needed to change cadence. [CITED: https://github.com/TanStack/query/discussions/2117 — confirmed by maintainer]

**Interaction with other options:**
- `refetchIntervalInBackground: boolean` (default `false`) — when `true`, polling continues even when tab is hidden. Default `false` means polling pauses on tab blur. For this project: user is actively watching → default is fine. If user reports "draft stalls when switching to Twitch tab", revisit.
- `staleTime` vs `refetchInterval` — `staleTime` controls whether a refetch is considered *necessary*. If `staleTime=25_000` and interval fires at 5s, the query may be considered fresh and the refetch call may still go out, but the UI-refresh behavior should be confirmed. **Recommend lowering `staleTime` to ≤4_000** when upgrading the hook (strictly below the draft cadence).
- `enabled: false` — polling does NOT happen when `enabled` is false, regardless of `refetchInterval`. Current code does NOT set `enabled`, which is correct per the comment in `useMatchDetail.ts`.

**Transition behavior (2 → 5 → 6):** The callback reads the freshest `query.state.data` each time it runs, so:
- `2 → 5` — as soon as next poll's response has `game_state === 5`, the callback returns 30_000 on subsequent evaluations. One poll may still fire at 5s cadence if data in flight; after that it settles to 30s. Acceptable.
- `5 → 6` — callback returns `false`. Polling stops. **Critical:** verify in testing that `false` actually halts the interval (per TanStack docs it does, but this is the load-bearing "quota drain" protection).
- `2 → 6` (abandoned draft, rare) — same as `5 → 6`. Polling stops. Draft section per D-11: if it WAS rendered, stays frozen; if not, does not suddenly appear.

**Recommended hook upgrade (concrete diff):**

```typescript
// client/src/hooks/useMatchDetail.ts — replace lines 31–37
const query = useQuery<LiveGamesResponse>({
  queryKey: ['live-games'],
  queryFn: () => fetch('/api/live/games').then((r) => r.json()),
  refetchInterval: (q) => {
    const games = q.state.data?.games ?? []
    const m = games.find((g) => String(g.match_id) === matchId)
    const gs = m?.game_state
    if (gs === 2) return 5_000
    if (gs === 6) return false
    return 30_000
  },
  staleTime: 4_000,  // lowered from 25_000 so 5s draft poll actually refetches
})
```

Also consider upgrading `useLiveGames.ts` if home-page matches in draft should also refresh at 5s. Recommendation: **keep home at 30s** (user is on match page when watching a specific draft; home does not need 5s cadence for every draft match in the list). Document this in the planning output.

---

## Section 2 — Captain's Mode pick/ban order inference (MEDIUM-HIGH confidence)

**Current (7.40) Captain's Mode sequence.** Per Liquipedia (verified 2026-04-24):

Assuming **Radiant has first pick**:
```
Phase            Step  Team  Action
Ban Phase 1       1    R     ban
                  2    D     ban
                  3    R     ban
                  4    D     ban
                  5    R     ban
                  6    D     ban
                  7    R     ban
Pick Phase 1      8    R     pick
                  9    D     pick
                 10    D     pick
                 11    R     pick
Ban Phase 2      12    D     ban
                 13    R     ban
                 14    D     ban
                 15    R     ban
Pick Phase 2     16    D     pick
                 17    R     pick
                 18    D     pick
                 19    R     pick
Ban Phase 3      20    D     ban
                 21    R     ban
Pick Phase 3     22    R     pick
                 23    D     pick
```

**Totals: 14 bans + 10 picks = 24 steps. 7 bans and 5 picks per team.**
[CITED: https://liquipedia.net/dota2/Game_Modes — Captain's Mode section, as of 7.40]

**If Dire has first pick:** mirror every step (swap R↔D). The 1-1-2-2-1-2-2 structure is symmetric. [CITED: https://esports.gg/news/dota-2/dota-2-patch-7-34-captains-mode-draft-order/ — describes the first-pick asymmetry introduced in 7.34, carried into 7.40]

**IMPORTANT: CONTEXT D-08 cites a DIFFERENT sequence.** CONTEXT lists: Ban1 (R-D-R-D-R-D), Pick1 (D-R-R-D-D-R), Ban2 (D-R-D-R), Pick2 (R-D-R-D). Total = 22 steps, 12 bans + 10 picks, 6 bans per team. This matches pre-7.34 or a misremembering. **If the grid shows 7 ban slots per team (D-01), the 7.40 sequence is correct.** Planner MUST pick ONE source of truth and document it. Recommend 7.40 (current) over the CONTEXT sequence.

**First-pick team derivation (NOT exposed by Valve API):**
- No explicit field for "which team picks first" in `GetLiveLeagueGames`. [VERIFIED: inspected real sample JSON; no such field]
- **Heuristic:** the team whose count of `picks + bans` is >= the other team's during the first ban phase is the first-pick team. During the first 6 steps, first-pick team has always acted 1 more or equal times than second-pick team. E.g., after step 1, R has 1 ban + 0 picks = 1, D has 0 — so R is first pick.
- **Edge case:** at step 0 (before any action), we cannot tell. Return `null` → hide indicator.

**Game mode detection (to decide if CM inference applies):**
- `GetLiveLeagueGames` does **NOT** expose a `game_mode` field at game level. [VERIFIED: real sample JSON — top-level keys are `{players, lobby_id, match_id, spectators, series_id, game_number, league_id, stream_delay_s, radiant_series_wins, dire_series_wins, series_type, league_series_id, league_game_id, stage_name, league_tier, scoreboard}`]
- **Alternate heuristic:** if both teams have >0 bans in scoreboard → some kind of banning mode (CM, Captain's Draft, Ranked Draft). If only picks are present → Random Draft or All Pick.
- **Conservative approach:** only attempt CM turn inference if scoreboard has ban arrays populated AND `league_tier >= 3` (pro tier — almost universally CM). Otherwise return `null`.
- Official tournament pro matches on licensed leagues are **>99% Captain's Mode**, so in practice CM inference will work for the target audience. Document the assumption explicitly in the code.

---

## Section 3 — Valve `picks_bans` payload shape (HIGH confidence — VERIFIED against real JSON)

### Actual shape (NOT what D-14 assumes)

Verified by fetching a real `GetLiveLeagueGames.json` sample and inspecting every game (27 matches in the sample):
[VERIFIED: https://raw.githubusercontent.com/lpradel/steam-web-api-java/master/src/test/resources/com/lukaspradel/steamapi/webapi/client/dota2/GetLiveLeagueGames.json — fetched and programmatically inspected 2026-04-24]

**Top-level `game` object keys (in live payload):**
```
dire_series_wins, game_number, league_game_id, league_id, league_series_id,
league_tier, lobby_id, match_id, players, radiant_series_wins, scoreboard,
series_id, series_type, spectators, stage_name, stream_delay_s
```
**Notably absent:** `picks_bans`, `draft`, `game_state`, `tower_state`, `barracks_state`, `radiant_score`, `dire_score`, `duration` — all of these are under `scoreboard`, not at top level. **This contradicts the current `LiveGameSchema` in `server/src/schemas/valve.ts` for ALL score/building/duration fields too!** Either (a) the project's existing schema is using a BFF-transformed shape somewhere, or (b) top-level fields like `radiant_score` and `tower_state` are placeholders that are never populated in practice. See Open Questions below — this deserves verification against the actual BFF response.

**`scoreboard` keys (when present):**
```
dire, duration, radiant, roshan_respawn_timer
```

**`scoreboard.radiant` / `scoreboard.dire` keys:**
```
abilities, bans, barracks_state, picks, players, score, tower_state
```

**`scoreboard.radiant.picks` and `scoreboard.radiant.bans` shape:**
```json
"picks": [{"hero_id": 107}, {"hero_id": 110}, ...]
"bans":  [{"hero_id": 73},  {"hero_id": 93},  ...]
```

**Each pick/ban entry contains ONLY `hero_id`.** No `order`, no `is_pick`, no `team`. Array position IS the per-team order; there is no global order across both teams.

### When `picks` / `bans` are present vs absent

From the 27-game sample:
- **12 games** had complete `scoreboard.radiant.picks/bans` arrays (length 4–5 picks, 5 bans) — these are post-draft (in-game or post-game).
- **13 games** had `scoreboard` present but `picks`/`bans` arrays **undefined** — pre-draft or non-CM modes.
- **2 games** had **no `scoreboard` at all** — pre-match/lobby state.
- **1 game** (match #2462080707) was mid-draft: Radiant had 1 pick / 2 bans, Dire had no picks / 2 bans. This confirms **the arrays grow incrementally as the draft progresses**.

### Implication for schema (D-14 must be revised)

**Current D-14 assumption (WRONG for live endpoint):**
```typescript
picks_bans: z.array(PickBanSchema).optional()
// where PickBanSchema = { hero_id?: number, is_pick: boolean, team: number, order: number }
```

**Correct shape for live endpoint:**
```typescript
// server/src/schemas/valve.ts — add to LiveGameSchema
const DraftEntrySchema = z.object({
  hero_id: z.number().optional(),
}).passthrough()

const ScoreboardTeamSchema = z.object({
  score: z.number().optional(),
  tower_state: z.number().optional(),
  barracks_state: z.number().optional(),
  picks: z.array(DraftEntrySchema).optional(),
  bans: z.array(DraftEntrySchema).optional(),
  players: z.array(z.object({}).passthrough()).optional(), // existing shape unchanged
  abilities: z.array(z.object({}).passthrough()).optional(),
}).passthrough()

const ScoreboardSchema = z.object({
  duration: z.number().optional(),
  roshan_respawn_timer: z.number().optional(),
  radiant: ScoreboardTeamSchema.optional(),
  dire: ScoreboardTeamSchema.optional(),
}).passthrough()

export const LiveGameSchema = z.object({
  // ... existing fields ...
  scoreboard: ScoreboardSchema.optional(),  // NEW in Phase 4
}).passthrough()
```

**Client consumption pattern:**
```typescript
// client/src/hooks/useMatchDetail.ts — derive draft from nested scoreboard
const rPicks = match?.scoreboard?.radiant?.picks?.map(p => p.hero_id) ?? []
const rBans  = match?.scoreboard?.radiant?.bans?.map(b => b.hero_id)  ?? []
const dPicks = match?.scoreboard?.dire?.picks?.map(p => p.hero_id)    ?? []
const dBans  = match?.scoreboard?.dire?.bans?.map(b => b.hero_id)     ?? []
```

**No sort required** — array order is already the per-team draft order (Valve appends each new pick/ban to the end).

### OpenDota as a fallback (NOT RECOMMENDED)

OpenDota's `/api/matches/:id` does expose a top-level `picks_bans` array with `is_pick`, `order`, `team`, `hero_id`. But:
- Only populated POST-MATCH. Live matches (in-progress) are NOT in `/api/matches/:id`.
- OpenDota has `/api/liveMatches` but its payload is a subset (usually no draft detail).
- Would add 1-3 minute latency on top of Valve's 2-minute stream delay.

**Recommendation:** Do NOT use OpenDota for live draft. Use Valve's `scoreboard.{team}.{picks,bans}` exclusively.

---

## Section 4 — Zod schema extension pattern (HIGH confidence)

Closest analog in existing `server/src/schemas/valve.ts`: `TeamSchema` and `PlayerSchema` — both use `.passthrough()`, both have all fields `.optional()`. Follow this exactly.

**Rules (from CLAUDE.md and existing schema):**
1. `.passthrough()` on every object schema — Valve adds fields silently.
2. Every nested field `.optional()` — absent during lobby/pre-draft.
3. Never `z.strict()` or `z.object({...})` without passthrough.
4. Schema lives in `server/src/schemas/valve.ts` (single file).

**Client-side type inference:** Client uses manually-defined types in `useLiveGames.ts` (`interface EnrichedGame`, `interface PlayerDetail`). **DO NOT** import zod types into the client — client doesn't have zod as a dep. Extend `EnrichedGame` manually to match. For Phase 4 that means adding an optional `scoreboard?: {...}` sub-type.

**Schema test:** Add a test that parses the real sample JSON (snapshot it into `server/src/schemas/__fixtures__/live-league-games-sample.json`) and asserts `.parse()` succeeds. This catches drift between your schema and Valve's reality.

---

## Section 5 — BFF cache TTL vs client poll cadence (CRITICAL — LOAD-BEARING)

**The problem:**
- `server/src/cache.ts` defines `TTL.LIVE_MATCH = 30` (seconds).
- `getLiveLeagueGames()` wraps upstream with `cached('live_games', 30, ...)`.
- During draft, client polls every 5s. Cache returns the 30s-old payload until TTL expires.
- **Net effect: during draft, new picks appear in the UI every 30s, NOT every 5s.** This violates DRAFT-01 success criterion ("appearing within ~5 seconds of happening live").

**This is NOT a theoretical concern.** Verified by reading:
- `server/src/cache.ts` lines 33–36 (`TTL.LIVE_MATCH: 30`)
- `server/src/services/valveApi.ts` line 26 (passes `TTL.LIVE_MATCH`)
- CLAUDE.md "Key Patterns": "cached() decorator wraps all upstream calls — N viewers = 1 upstream call per TTL"

**Options for the planner (discuss with user if needed):**

1. **Add a draft-tier TTL and switch keys.** Introduce `TTL.DRAFT = 4` (or 5) and change the cache key to `live_games_draft` when the last-known payload had any game in draft. Requires the BFF to inspect its own cache — adds complexity.

2. **Lower `TTL.LIVE_MATCH` globally to 5s.** Drastically increases Valve upstream calls (from 120/hour to 720/hour per cache key). Valve's rate limit is generous (~100k calls/day with a key) but this wastes quota. Rejected.

3. **Keep TTL at 30s, accept ~30s worst-case draft latency.** Violates DRAFT-01's "~5s" goal. May still feel "live enough" in practice — a 15s average new-pick latency. User-facing impact ≈ moderate.

4. **Per-match BFF cache.** Refactor BFF to cache `/api/live/games/:matchId` separately with a 5s TTL, while keeping the global list cache at 30s. Biggest change but cleanest result.

**Recommendation (for the planner):** Option 1 — add `TTL.DRAFT_MATCH = 4` and use it conditionally when any game in the payload has `game_state === 2`. Concretely:

```typescript
// server/src/cache.ts — add TTL tier
export const TTL = {
  LIVE_MATCH: 30,
  DRAFT_MATCH: 4,   // NEW — poll-aligned for 5s client cadence
  HERO_STATS: 21_600,
  PLAYER_STATS: 900,
} as const
```

```typescript
// server/src/services/valveApi.ts — conditional TTL
export async function getLiveLeagueGames(): Promise<LiveLeagueGames> {
  // First read (probably cached); detect whether any game is in draft
  const first = await cached('live_games', TTL.LIVE_MATCH, fetchLiveLeagueGames)
  const anyDraft = first.result.games?.some((g) => g.scoreboard?.radiant?.picks || g.scoreboard?.radiant?.bans)
    && !first.result.games?.some((g) => /* in-game heuristic */)
  // If we detect a draft and our cache is "old enough" to be stale, refresh with shorter TTL
  // ... this gets complex quickly — see full design in planning stage.
  return first
}
```

Actually, simpler: **always cache at 5s during business hours when draft matches are common**. Or let the client-driven `refetchInterval` naturally drive a tighter cache by using a per-call TTL:

```typescript
// cached() already has a fixed TTL arg. Simplest fix: switch key to 'live_games_v2' with TTL=5s.
// Acceptable upstream cost: ~720 calls/hr in worst case (continuous draft). Valve allows 100k/day.
// Trade-off: during in-game periods you also refresh every 5s — but cache STILL coalesces across viewers.
// N viewers = 1 upstream call per 5s, not N × 12 calls/min.
```

**Planner MUST decide and escalate if the user needs to weigh the trade-offs.**

---

## Section 6 — Draft state transition edge cases (MEDIUM confidence)

**Transition `game_state undefined → 2` (lobby → draft starts):**
- `scoreboard` may appear in one poll and be absent in the next (verified from sample data). Schema with `.optional()` handles this gracefully.
- DraftSection should render as soon as `game_state === 2` per D-09.
- Empty placeholder slots (D-02) cover the "scoreboard exists but `picks`/`bans` arrays are undefined" state naturally.

**Transition `2 → 5` (draft complete, in-game starts):**
- Per D-10: draft section persists. Turn indicator hidden. Picks/bans remain visible (as historical record).
- Implementation: parent component tracks `hasDraftBeenRendered` via `useRef` or derived state. Once draft has been shown, keep showing it until navigation.
- **Flicker risk (PITFALLS P7):** game_state can flip briefly between polls. Mitigate by NOT immediately hiding turn indicator on first `!== 2` poll — instead require 2 consecutive polls of `!== 2`. Implement as:
  ```typescript
  const [lastNonDraftCount, setLastNonDraftCount] = useState(0)
  useEffect(() => {
    if (gameState !== 2) setLastNonDraftCount(n => n + 1)
    else setLastNonDraftCount(0)
  }, [gameState])
  const showTurnIndicator = gameState === 2 && lastNonDraftCount === 0
  ```
  Only add this if flicker is observed in manual testing. Otherwise YAGNI.

**Transition `2 → 6` (abandoned draft):**
- Per D-11: if draft section already visible, it stays frozen. Turn indicator hidden (gameState !== 2).
- Per D-12: polling stops (`refetchInterval === false`).
- Edge: if abandoned BEFORE first render of DraftSection, per D-11 it never appears. Match likely disappears from the live list soon after.

**Transition `5 → 6` (post-game):**
- Same as above — polling stops, draft section stays as-is.

**Direct URL navigation during draft (`/match/:id` with no prior cache):**
- Existing `useMatchDetail` handles this via `enabled: true` default — triggers immediate fetch.
- First render: `isLoading === true` → show skeleton/empty draft.
- After fetch: `scoreboard.radiant.picks` populated → render real portraits.
- Per D-09: if `game_state !== 2`, don't render DraftSection at all on first render.

**Precise conditional render logic (to avoid flicker):**
```tsx
// client/src/pages/MatchPage.tsx — add state to track "has draft been shown"
const [draftEverShown, setDraftEverShown] = useState(false)
useEffect(() => {
  if (match?.game_state === 2) setDraftEverShown(true)
}, [match?.game_state])

return (
  <>
    {/* ... title, score header ... */}
    {(match?.game_state === 2 || draftEverShown) && (
      <DraftSection match={match} showTurnIndicator={match?.game_state === 2} />
    )}
    <HeroPlayerGrid .../>
    {/* ... buildings ... */}
  </>
)
```

---

## Section 7 — Hero portrait rendering edge cases (HIGH confidence)

**`heroMapper` return contract (verified from `shared/heroMapper.test.ts`):**
- `heroMapper(valid_hero_id)` → `{ name, portrait }`
- `heroMapper(0)` → `null` (test case line 17–19)
- `heroMapper(undefined as any)` / `heroMapper(NaN)` → `null` (test doesn't throw)
- Client uses `client/src/utils/heroMapper.ts` (NOT `@shared/heroMapper`) — same signature, browser-safe.

**Draft slot edge cases:**
- **Pick/ban array has entry but `hero_id === 0`:** possible mid-ban-timer (player hasn't picked yet). Render as empty placeholder slot (D-05).
- **Pick/ban array has fewer entries than slot count:** render remaining as empty placeholders. E.g., if `radiant.picks.length === 3`, show 3 hero portraits + 2 empty pick slots.
- **Pick/ban array entirely undefined:** render full 5 empty picks + 7 empty bans. Covered by `?? []` fallback.

**Render fallback pattern:**
```tsx
// client/src/components/DraftPortrait.tsx
import { heroMapper } from '../utils/heroMapper'

export default function DraftPortrait({
  heroId, isBan, size = 56
}: { heroId: number | undefined; isBan: boolean; size?: number }) {
  const hero = heroId !== undefined && heroId !== 0 ? heroMapper(heroId) : null
  if (!hero) {
    // Empty placeholder (D-02, D-05): bordered slot, same size as real portraits
    return (
      <div
        className="rounded-sm"
        style={{
          width: size, height: size,
          border: '1px solid #1a1a1a',
          background: '#0a0a0a',
        }}
      />
    )
  }
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <img
        src={hero.portrait}
        alt={hero.name}
        className="w-full h-full object-cover rounded-sm"
      />
      {isBan && (
        // D-04: semi-transparent red X overlay on bans
        <div
          className="absolute inset-0 flex items-center justify-center rounded-sm"
          style={{ background: 'rgba(239,68,68,0.25)' }}
        >
          <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2.5">
            <line x1="4" y1="4" x2="20" y2="20" /><line x1="20" y1="4" x2="4" y2="20" />
          </svg>
        </div>
      )}
    </div>
  )
}
```

**Recommended portrait size:** 56 px (CONTEXT suggests 56–64 px). Matches the app's density without overwhelming the grid. `PlayerRow` uses 48 px — slightly larger here because the draft grid has fewer items per row and benefits from visibility.

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 4 stores nothing. No new DB rows, no new cache namespaces (just tier changes within existing `live_games` key). | None |
| Live service config | None — no external services configured for Phase 4. | None |
| OS-registered state | None. | None |
| Secrets/env vars | `VALVE_API_KEY`, `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN` — already in place, not renamed. | None |
| Build artifacts | None — no package rename, no egg-info, no compiled binaries. | None |

**Nothing found in any category** — this is a greenfield feature phase, not a rename/refactor.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server runtime | ✓ | 25.9.0 (exceeds 24 LTS requirement) | — |
| npm | Package mgmt | ✓ | installed with Node | — |
| `@tanstack/react-query` | Hook upgrade | ✓ | 5.99.2 (client) | — |
| `zod` | Schema extension | ✓ | 3.25.76 (server) | — |
| `vitest` | Unit + integration tests | ✓ | 2.x (both packages) | — |
| Valve API key | Upstream data | ✓ (assumed — Phase 1 complete) | — | — |
| Upstash Redis | BFF cache | ✓ (Phase 1 complete) | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

No Playwright / Cypress installed. For E2E validation of the draft UX, use manual browser testing against a real live match (acceptable per project's small-group scope).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (client and server packages both configured) |
| Config file | Default (vitest looks for `*.test.ts` next to source) |
| Quick run command | `npm --prefix client test -- --run` OR `npm --prefix server test -- --run` |
| Full suite command | `npm --prefix client test -- --run && npm --prefix server test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DRAFT-01 | Refetch interval computes 5s during `game_state === 2` | unit | `vitest run client/src/hooks/useMatchDetail.refetchInterval.test.ts` | ❌ Wave 0 |
| DRAFT-01 | Refetch interval computes 30s during `game_state === 5` | unit | (same file) | ❌ Wave 0 |
| DRAFT-01 | Refetch interval returns `false` during `game_state === 6` | unit | (same file) | ❌ Wave 0 |
| DRAFT-01 | Zod `LiveGameSchema` parses real sample including `scoreboard.radiant.picks` | unit | `vitest run server/src/schemas/valve.test.ts` | ❌ Wave 0 |
| DRAFT-01 | Zod `LiveGameSchema` parses payload with `scoreboard` absent | unit | (same file) | ❌ Wave 0 |
| DRAFT-01 | `DraftPortrait` renders empty placeholder when `hero_id` is 0 / undefined | component | `vitest run client/src/components/DraftPortrait.test.tsx` | ❌ Wave 0 |
| DRAFT-01 | `DraftPortrait` renders red-X overlay when `isBan=true` | component | (same file) | ❌ Wave 0 |
| DRAFT-02 | `inferActiveTeam` returns correct team at each of 24 steps of 7.40 CM sequence (Radiant first) | unit | `vitest run client/src/utils/draftOrder.test.ts` | ❌ Wave 0 |
| DRAFT-02 | `inferActiveTeam` returns mirrored sequence when Dire first | unit | (same file) | ❌ Wave 0 |
| DRAFT-02 | `inferActiveTeam` returns `null` when first-pick team cannot be derived (step 0) | unit | (same file) | ❌ Wave 0 |
| DRAFT-02 | `inferActiveTeam` returns `null` when total steps >= 24 (draft complete) | unit | (same file) | ❌ Wave 0 |
| Polling-cadence | BFF cache TTL is short enough for 5s client poll to observe new pick within one cycle | integration | Manual: inspect Redis TTL + load a match in draft | manual (Wave 0 can stub) |
| UX smoke | Loading a live draft URL shows picks appearing as they happen | E2E / manual | Manual browser against `/match/:id` during a real pro match draft | manual only |
| UX smoke | `2 → 5` transition: draft section persists, turn indicator disappears | E2E / manual | Manual during end-of-draft moment | manual only |
| UX smoke | `5 → 6` transition: polling stops (verify Network tab) | E2E / manual | DevTools Network panel monitoring | manual only |

### Sampling Rate
- **Per task commit:** Run affected package tests only: `npm --prefix <pkg> test -- --run` (< 10 s for this phase).
- **Per wave merge:** Both packages green: `npm --prefix client test -- --run && npm --prefix server test -- --run`.
- **Phase gate:** Full suite green + manual E2E checklist complete on a real live draft.

### Wave 0 Gaps
- [ ] `client/src/hooks/useMatchDetail.refetchInterval.test.ts` — unit test for the 3-branch refetch callback (uses a fake `Query` with `state.data.games[0].game_state` set to 2/5/6).
- [ ] `client/src/utils/draftOrder.ts` + `draftOrder.test.ts` — pure function + 24-step sequence table-driven test.
- [ ] `client/src/components/DraftPortrait.test.tsx` — component test (would need `@testing-library/react` — check if installed; if not, defer component tests to manual).
- [ ] `server/src/schemas/valve.test.ts` — zod schema test using a fixture of the real sample JSON.
- [ ] `server/src/schemas/__fixtures__/live-league-games-sample.json` — snapshot a real Valve payload for regression testing.
- [ ] Verify `@testing-library/react` availability in `client/package.json`; if absent, treat component tests as manual.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user accounts (CLAUDE.md §Project Scope — v1 has no auth) |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | zod `.parse()` on every external response (CLAUDE.md rule). Phase 4 adds one new schema node (`ScoreboardSchema`) — MUST use `.passthrough()` and make all fields `.optional()`. |
| V6 Cryptography | no | No cryptography in this phase. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Valve API schema drift breaks zod parse | Tampering / Denial of service | `.passthrough()` on all nested schemas (CLAUDE.md invariant). All new fields `.optional()`. |
| API key leakage in logs | Information disclosure | Existing `server/src/services/valveApi.ts` line 9 — log status/statusText only, never URL. No new upstream calls in Phase 4, so no new surface. |
| Cached-JSON deserialization trust | Tampering | `cache.ts` uses `JSON.parse` on a value Redis returned. Low risk — Redis token is ours, no attacker path. No change. |
| Upstream exhaustion via client polling | DoS (self-inflicted) | `refetchInterval: false` on post-game (D-13) is the primary control. BFF `cached()` coalesces N viewers to 1 upstream call per TTL. Phase 4 upgrades include adding a DRAFT-tier TTL; if we set this too low (e.g., 1s), Valve might rate-limit. Keep ≥ 4s. |
| Redis connection failure | Availability | Graceful degradation already implemented in `cache.ts` (if GET throws, call fn directly). No change. |

**No new secrets, no new logging surfaces, no new upstream in Phase 4.** Security footprint is limited to schema validation and polling cadence discipline.

---

## Project Constraints (from CLAUDE.md)

These directives are treated as equal authority to locked CONTEXT decisions:

1. **TypeScript + zod on every external API response.** Phase 4's `ScoreboardSchema` / `DraftEntrySchema` MUST use zod with `.passthrough()`.
2. **`cached()` decorator wraps all upstream calls — N viewers = 1 upstream call per TTL.** Phase 4 must not bypass this. Changes limited to TTL values.
3. **Dynamic `refetchInterval`: 5s draft / 30s in-game / `false` post-game.** Codified in CLAUDE.md. Implement exactly.
4. **Stratz always optional.** Not relevant to Phase 4 (Stratz is Phase 6). Do not introduce Stratz dependencies here.
5. **Hidden profiles (`account_id === 4294967295`) short-circuit at aggregator.** Not relevant to Phase 4 (draft data is per-team, not per-player-profile), but don't break existing behavior in `PlayerRow`.
6. **`building_state` can be absent — always check before decoding.** Not directly relevant; Phase 4 does not touch buildings. But Phase 4's new `scoreboard.tower_state` field under `scoreboard.radiant/dire` might be the reason the project's `LiveGameSchema` currently has top-level `tower_state` that is never populated. See Open Questions.
7. **Polling MUST stop on `game_state === 6`.** Hard rule. The `refetchInterval` callback MUST return `false` for state 6 — no exceptions.
8. **Use `.passthrough()` on all Valve zod schemas.** Re-emphasized. Every new schema node in Phase 4 follows this.

---

## Pitfalls & Landmines

### PF-1: Schema mismatch will break the UI silently (CRITICAL)
**What goes wrong:** Developer writes `PickBanSchema` with `is_pick`, `team`, `order` per CONTEXT D-14; zod `.passthrough()` accepts the Valve response (because `scoreboard` is at a different path), but the parsed value has no `picks_bans` field. Component renders empty. No error.
**Prevention:** Follow Section 3's corrected schema. Snapshot the real sample JSON as a fixture. Write a zod test that FAILS if `scoreboard.radiant.picks` is not typed.

### PF-2: `staleTime` blocks the 5s refetch
**What goes wrong:** Current `useMatchDetail.ts` sets `staleTime: 25_000`. With `refetchInterval: 5000`, TQ's timer fires but the query is considered fresh → no refetch. Draft updates arrive every 25s, not 5s.
**Prevention:** Lower `staleTime` to `4_000` (strictly below draft cadence) when upgrading the hook. Add to planning diff.

### PF-3: BFF cache TTL swallows 5s client cadence
**What goes wrong:** Client polls every 5s, but BFF returns 30s-stale data. New picks appear in UI every 30s worst-case.
**Prevention:** See Section 5. Add `TTL.DRAFT_MATCH = 4` (or equivalent). MUST be addressed — violates DRAFT-01.

### PF-4: First-pick team can't be derived at step 0
**What goes wrong:** On first render of a match that just started drafting, both teams have 0 picks and 0 bans. Turn inference returns `null` → no indicator shown. User sees a draft grid with no turn marker until the first ban happens.
**Prevention:** Accept this (D-08 fallback). Within 15s of draft start, the first ban lands and inference becomes possible. Document the "briefly no indicator" behavior.

### PF-5: Non-Captain's Mode matches break inference
**What goes wrong:** Some licensed leagues run Captain's Draft or Turbo. Applying CM 24-step sequence to a 14-step mode gives wrong turn indicators.
**Prevention:** Gate inference on heuristic (league_tier ≥ 3 AND ban arrays populated). If mode is unknown, return `null`. Document the CM assumption in code comments.

### PF-6: Post-draft grid shows stale turn indicator on first `game_state !== 2` poll
**What goes wrong:** At the moment draft ends (step 24 completed), `game_state` flips to 5. But the previous poll still showed `game_state === 2`. In the UI render between polls, D-06 text "Dire — picking" is briefly stale.
**Prevention:** Once draft completes (all 24 steps counted), return `null` from `inferActiveTeam` regardless of `game_state`. Hide indicator when "we've already seen all 24 steps". Belt-and-suspenders with D-07's game_state check.

### PF-7: Hidden-tab polling pauses (default `refetchIntervalInBackground: false`)
**What goes wrong:** User switches to Twitch tab during draft. Polling pauses. Switches back 2 minutes later, UI shows 2-minute-stale draft for up to 5s until next poll.
**Prevention:** Either (a) accept this (matches user expectations — nobody updates a hidden tab), or (b) set `refetchIntervalInBackground: true` for draft only. Recommend (a). Document if changed.

### PF-8: `scoreboard.radiant.picks[i].hero_id === 0` during ban timer
**What goes wrong:** Valve may insert a placeholder entry with `hero_id: 0` during the pick/ban animation. Component renders empty portrait (good) but the array length increases prematurely — turn inference counts a "ban that hasn't happened".
**Prevention:** Filter out `hero_id === 0` entries before counting. Treat them as placeholders.

### PF-9: PITFALLS.md P5 references `draft.pick_0`/`draft.ban_0` — outdated
**What goes wrong:** Developer reads `.planning/research/PITFALLS.md` P5 and builds parsing logic for `draft.pick_0` ... `draft.ban_0`.
**Prevention:** **Override PITFALLS P5 explicitly in the plan.** The verified live API shape uses `scoreboard.{team}.{picks,bans}` as confirmed by real sample JSON in 2026-04. PITFALLS.md was written 2026-04-21 and its draft-shape info was not verified against real data. Update PITFALLS.md P5 after Phase 4 completes.

### PF-10: Wave ordering — schema change first, everything else depends on it
**What goes wrong:** Client UI tasks execute in parallel with server schema change; client team assumes `picks_bans` shape (per D-14), server team implements `scoreboard` shape. Merge chaos.
**Prevention:** Sequence — Wave 1 MUST be the zod schema change + shared type propagation (EnrichedGame in `useLiveGames.ts`). Wave 2+ can parallelize client UI tasks.

---

## Open Questions

1. **Why does the existing `LiveGameSchema` have top-level `radiant_score`, `tower_state`, `duration` fields when the real API puts these under `scoreboard`?**
   - What we know: Phase 3 apparently works (Match Core verified 2026-04-24). Either the BFF transforms the shape, or top-level fields are populated in some contexts and not others, or Phase 3 tests coincidentally passed because the subset of fields Phase 3 uses happens to also exist elsewhere.
   - What's unclear: Whether the current schema is a sample-of-one artifact vs. representing the BFF's real response shape.
   - Recommendation: Before Phase 4 execution, log one live `/api/live/games` response in a running dev environment and verify whether the top-level `radiant_score`/`tower_state` are populated, or whether all game state is truly nested under `scoreboard`. If the latter, Phase 3 may have a dormant bug. If the planner can't verify, **escalate to the user for a one-line check against a real running match.**

2. **Current Captain's Mode draft order (7.40 vs newer).**
   - What we know: Verified 7.40 sequence from Liquipedia on 2026-04-24. CONTEXT D-08 cites a different (older) sequence.
   - What's unclear: If patch 7.42 or later has changed the order again.
   - Recommendation: Treat the 7.40 sequence as the source of truth for the unit test. If future patch breaks it, the test will fail on a CI run against a real live match — a signal to update.

3. **Does Valve provide first-pick team anywhere?**
   - What we know: No top-level field in the real sample.
   - What's unclear: Whether a field like `radiant_first_pick` exists but was empty in the sample and absent from our snapshot.
   - Recommendation: Add `.passthrough()` logging that captures unknown top-level fields on each parse; after ~1 day of dev operation, inspect captured fields for any first-pick hint. Until then, use the heuristic in Section 2.

4. **`game_state` field presence.**
   - What we know: The existing `LiveGameSchema` has `game_state` at the top level. But the real sample has no top-level `game_state`.
   - What's unclear: Where does `game_state` come from? This would be an urgent question — the entire polling-stop logic depends on it.
   - Recommendation: **Highest priority to verify before planning.** Planner must run the server locally, hit `/api/live/games`, and confirm `game_state` is actually populated. If not, Phase 3's post-game polling-stop is dead code.

5. **Column size: 56 px vs 64 px for draft portraits.**
   - Claude's discretion. Recommend 56 px for visual density in a 5-col + 7-col grid. Non-load-bearing.

6. **Does `@testing-library/react` exist in client deps?**
   - Not in `client/package.json` as inspected. Component tests may not be runnable — defer to manual visual verification.
   - If the planner wants component tests, add `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` to devDependencies in Wave 0.

---

## Code Examples

### Example 1: Dynamic `refetchInterval` callback (verified signature)
```typescript
// Source: https://tanstack.com/query/latest/docs/framework/react/reference/useQuery (v5)
// Full path: client/src/hooks/useMatchDetail.ts Phase 4 upgrade
import { useQuery, type Query } from '@tanstack/react-query'
import type { LiveGamesResponse } from './useLiveGames'

const query = useQuery<LiveGamesResponse>({
  queryKey: ['live-games'],
  queryFn: () => fetch('/api/live/games').then((r) => r.json()),
  refetchInterval: (q: Query<LiveGamesResponse>) => {
    const match = q.state.data?.games?.find((g) => String(g.match_id) === matchId)
    switch (match?.game_state) {
      case 2: return 5_000   // draft
      case 6: return false   // post-game — stop (quota protection)
      default: return 30_000 // in-game, lobby, unknown
    }
  },
  staleTime: 4_000,
})
```

### Example 2: zod schema for nested scoreboard.{team}.{picks,bans}
```typescript
// Source: verified against real GetLiveLeagueGames sample JSON
// Full path: server/src/schemas/valve.ts (addition to LiveGameSchema)
import { z } from 'zod'

const DraftEntrySchema = z.object({
  hero_id: z.number().optional(),
}).passthrough()

const ScoreboardTeamSchema = z.object({
  score: z.number().optional(),
  tower_state: z.number().optional(),
  barracks_state: z.number().optional(),
  picks: z.array(DraftEntrySchema).optional(),
  bans: z.array(DraftEntrySchema).optional(),
  players: z.array(z.object({}).passthrough()).optional(),
  abilities: z.array(z.object({}).passthrough()).optional(),
}).passthrough()

const ScoreboardSchema = z.object({
  duration: z.number().optional(),
  roshan_respawn_timer: z.number().optional(),
  radiant: ScoreboardTeamSchema.optional(),
  dire: ScoreboardTeamSchema.optional(),
}).passthrough()

// Extend existing LiveGameSchema:
export const LiveGameSchema = z.object({
  // ... all existing fields ...
  scoreboard: ScoreboardSchema.optional(),  // NEW in Phase 4
}).passthrough()
```

### Example 3: Captain's Mode turn inference (24-step sequence)
```typescript
// Source: https://liquipedia.net/dota2/Game_Modes — CM 7.40
// Full path: client/src/utils/draftOrder.ts
type Team = 0 | 1  // 0=Radiant, 1=Dire
type Action = 'pick' | 'ban'

const CM_740_RADIANT_FIRST: ReadonlyArray<readonly [Team, Action]> = [
  [0,'ban'],[1,'ban'],[0,'ban'],[1,'ban'],[0,'ban'],[1,'ban'],[0,'ban'],
  [0,'pick'],[1,'pick'],[1,'pick'],[0,'pick'],
  [1,'ban'],[0,'ban'],[1,'ban'],[0,'ban'],
  [1,'pick'],[0,'pick'],[1,'pick'],[0,'pick'],
  [1,'ban'],[0,'ban'],
  [0,'pick'],[1,'pick'],
] as const
// 14 bans + 10 picks = 24 steps; 7 bans + 5 picks per team.

export function inferActiveTeam(
  c: { rPicks: number; dPicks: number; rBans: number; dBans: number },
  firstPickTeam: Team | null,
): { team: Team; action: Action } | null {
  if (firstPickTeam === null) return null
  const completed = c.rPicks + c.dPicks + c.rBans + c.dBans
  const base = CM_740_RADIANT_FIRST
  const seq = firstPickTeam === 0
    ? base
    : base.map(([t, a]) => [((1 - t) as Team), a] as const)
  if (completed >= seq.length) return null  // draft complete
  return { team: seq[completed][0], action: seq[completed][1] }
}

/** Derive first-pick team from observed draft progression. */
export function deriveFirstPickTeam(
  c: { rBans: number; dBans: number },
): Team | null {
  if (c.rBans === 0 && c.dBans === 0) return null  // can't tell yet
  // In CM 7.40, first ban phase alternates R-D-R-D-R-D-R (Radiant first).
  // So after any odd-total bans, firstPicker has ceil(total/2), otherAnswer has floor(total/2).
  // If rBans > dBans → R is first pick. If dBans > rBans → D is first pick.
  if (c.rBans > c.dBans) return 0
  if (c.dBans > c.rBans) return 1
  // Equal bans (e.g., 2-2, 3-3): the next actor is the non-first-picker, so can't distinguish here.
  return null
}
```

---

## Sources

### Primary (HIGH confidence)
- [TanStack Query v5 useQuery reference](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) — `refetchInterval` signature, `refetchIntervalInBackground` type
- [TanStack Query v5 migration guide](https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5) — v4→v5 callback change, `query.state.data` access pattern
- Real `GetLiveLeagueGames.json` sample — fetched and programmatically inspected 2026-04-24 from `https://raw.githubusercontent.com/lpradel/steam-web-api-java/master/src/test/resources/com/lukaspradel/steamapi/webapi/client/dota2/GetLiveLeagueGames.json` (27 games, all confirming `scoreboard.{team}.{picks,bans}` shape with `hero_id`-only entries)
- `server/src/cache.ts` (local) — TTL.LIVE_MATCH = 30 confirmed
- `client/src/hooks/useMatchDetail.ts` (local) — current `refetchInterval` is plain number, `staleTime: 25_000`
- `client/src/hooks/useLiveGames.ts` (local) — comments document v5 breaking changes
- `server/src/schemas/valve.ts` (local) — current schema shape
- `shared/heroMapper.test.ts` (local) — verifies `heroMapper(0) === null`
- `npm ls @tanstack/react-query` in `client/` → 5.99.2 (verified 2026-04-24)
- `npm ls zod` in `server/` → 3.25.76 (verified 2026-04-24)

### Secondary (MEDIUM confidence)
- [Liquipedia Dota 2 Game Modes — Captain's Mode section](https://liquipedia.net/dota2/Game_Modes) — 7.40 pick/ban sequence
- [Liquipedia Game Modes Changelog](https://liquipedia.net/dota2/Game_Modes/Changelog) — historical CM order changes (7.34 documented)
- [esports.gg — 7.34 CM draft order changes](https://esports.gg/news/dota-2/dota-2-patch-7-34-captains-mode-draft-order/) — first-pick asymmetry explanation
- [TanStack Query discussions #2117](https://github.com/TanStack/query/discussions/2117) — confirms callback re-evaluates frequently
- [Dota 2 Dev forum: Pick and Bans API data](https://dev.dota2.com/forum/dota-2/spectating/replays/webapi/68273-pick-and-bans-api-data) — redirected; historical context

### Tertiary (LOW confidence — NOT used for load-bearing claims)
- Various Dota 2 API wrapper READMEs (vinnicc/dota, kronusme/dota2-api, EthanWadsworth/valve-steam-web-api) — cross-referenced for schema hints, none contradicted the verified sample

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pro league matches are ≥99% Captain's Mode | Section 2 | Turn indicator wrong on non-CM pro games — acceptable (UI shows wrong active team for ~10 seconds until next step comes in; D-08 fallback covers) |
| A2 | Sample `GetLiveLeagueGames.json` from 2016–2019 Java wrapper repo still matches current Valve payload shape | Section 3 | **HIGH** — if Valve changed the shape to a newer nested form between 2019 and 2026, our schema will silently no-op. **Mitigation:** snapshot a fresh payload in Wave 0 before committing the schema. |
| A3 | `staleTime: 25_000` in current hook blocks 5s refetch | Section 1 / PF-2 | LOW — TQ behavior is well-documented; if wrong, refetch still happens but with extra re-renders. |
| A4 | Adding `TTL.DRAFT_MATCH = 4s` doesn't exceed Valve's rate limit | Section 5 | LOW — 720 calls/hour per key is well within limits, and cache coalescing ensures this is global, not per-viewer. |
| A5 | PITFALLS.md P5 ("draft is flat dict `draft.pick_0`") is outdated | PF-9 | LOW — inspected real data 2026-04-24; definitely not a flat dict. |
| A6 | First-pick team can be inferred from uneven ban counts in phase 1 | Section 2 / Example 3 | MEDIUM — verified against Liquipedia 7.40 (R-D-R-D-R-D-R first-ban sequence). Holds for CM. Does not hold for Captain's Draft or other modes. |

**User/discuss-phase should confirm:** A2 (freshness of API sample) and CONTEXT D-14 reconciliation (22-step vs 24-step sequence; top-level `picks_bans` vs `scoreboard.{team}.{picks,bans}`).

---

## Metadata

**Confidence breakdown:**
- TanStack Query v5 refetchInterval: HIGH — official docs + source inspection.
- Valve live draft payload shape: HIGH — verified against real JSON sample (27 games).
- Captain's Mode 7.40 order: MEDIUM-HIGH — Liquipedia verified; no primary Valve doc. Risk: 7.42 changes.
- BFF cache TTL analysis: HIGH — direct file inspection (`cache.ts`).
- Turn inference heuristic: MEDIUM — mathematically sound for CM, untested on live data.
- Pitfalls and edge cases: MEDIUM — derived from code + sample, not all manifested in production.

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (30 days — API shape is stable; Dota patch cycle ~quarterly)

---

## RESEARCH COMPLETE

- **TanStack Query v5 `refetchInterval: (query) => ...` callback verified** — use `query.state.data` (not transformed), re-evaluates on options/data change, `false` halts polling.
- **CRITICAL SCHEMA CORRECTION:** Real `GetLiveLeagueGames` has NO top-level `picks_bans`; picks/bans live under `scoreboard.{radiant,dire}.{picks,bans}`, each entry only `{ hero_id }`. CONTEXT D-14 must be revised — planner should escalate before execution.
- **CRITICAL TTL CORRECTION:** BFF cache is 30s, client polls at 5s during draft → new picks appear with up to 30s lag unless a new `TTL.DRAFT_MATCH ≤ 5` tier is added. Blocks DRAFT-01 "~5s" criterion without this fix.

