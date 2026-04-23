# Roadmap

**Project:** Dota 2 Match Analyst
**Version:** v1
**Granularity:** standard
**Last updated:** 2026-04-23

## Overview

| # | Phase | Goal | REQ-IDs | Success Criteria |
|---|-------|------|---------|------------------|
| 1 | Foundations | Build the typed client-BFF-cache pipeline so any match data can flow end-to-end | — (infra) | 4 criteria |
| 2 | Live Matches List | User opens the home page and sees what's playable right now | HOME-01, HOME-02, HOME-03 | 4 criteria |
| 3 | Match Core | User opens a live match and sees the full in-game state at a glance | MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05 | 5 criteria |
| 4 | Draft UX | User watches the draft unfold in real time with clear turn indication | DRAFT-01, DRAFT-02 | 3 criteria |
| 5 | Hero & Player Intel | User sees contextual stats layered onto drafted heroes and players | DRAFT-03, DRAFT-04, PLAYER-01, PLAYER-02 | 5 criteria |
| 6 | Win Probability | User sees a Stratz-powered win-probability bar that degrades gracefully | MATCH-06 | 4 criteria |
| 7 | Harden & Deploy | Small group can hit a public URL and the app stays up under rate limits | — (hardening) | 4 criteria |

## Phases

- [x] **Phase 1: Foundations** - Repo, TS scaffolds, Redis cache, schemas, shared primitives (no UI) ✓ 2026-04-23
- [ ] **Phase 2: Live Matches List** - Home page with active tournaments and live matches auto-refreshing every 30s
- [ ] **Phase 3: Match Core** - In-game match screen with score, gold diff, hero grid, towers/rax, K/D/A, series score, delay disclosure
- [ ] **Phase 4: Draft UX** - Live picks/bans grid with 5s polling and whose-turn indicator
- [ ] **Phase 5: Hero & Player Intel** - Hero patch winrate, counterpick tooltip with "known to play" cross-reference, per-player hero stats, hidden-profile safety
- [ ] **Phase 6: Win Probability** - Stratz win-probability bar gated to >5min game time, degrades silently on failure
- [ ] **Phase 7: Harden & Deploy** - Rate-limit queues, error boundaries, 429 backoff, deploy to Vercel + Railway

## Phase Details

### Phase 1: Foundations
**Goal:** Stand up the typed client-BFF-cache pipeline so any match data request can flow end-to-end, even before a single screen exists.
**Depends on:** Nothing (first phase)
**Requirements:** None (infrastructure phase — unlocks every REQ-ID by enabling the pipeline)
**Success criteria** (what must be TRUE):
  1. Developer can run the React+Vite client and the Hono BFF locally with one command each, and the client can hit a BFF health endpoint
  2. BFF can call Valve's `GetLiveLeagueGames`, parse the response through a zod schema with `.passthrough()`, and return a typed payload
  3. Any BFF fetch is wrapped by a `cached()` decorator backed by Redis with a per-data-type TTL, so repeated calls within TTL produce exactly one upstream request
  4. Shared primitives exist and are unit-tested: `heroMapper` (hero_id -> name/portrait), `buildingDecoder` (32-bit bitmask -> tower/rax state), `hiddenProfile` guard (account_id === 4294967295)
**Plans:** 4 plans
Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold: client, server, shared directories with TypeScript and path aliases
- [x] 01-02-PLAN.md — cached() decorator and env module with startup validation
- [x] 01-03-PLAN.md — Shared primitives (heroMapper, buildingDecoder, hiddenProfile) + bug fixes (WR-01, WR-02, WR-03)
- [x] 01-04-PLAN.md — Valve API route GET /api/live/games with zod schema and service layer
**UI hint:** no

### Phase 2: Live Matches List
**Goal:** A user lands on the home page and immediately sees every pro match that is playable right now, grouped by tournament, refreshing itself without interaction.
**Depends on:** Phase 1
**Requirements:** HOME-01, HOME-02, HOME-03
**Success criteria** (what must be TRUE):
  1. User sees a list of every currently-live pro match with both team names, the series score (e.g. "1-0 Bo3"), and a status tag of Live / Draft / Post-game (HOME-01)
  2. User sees active tournaments as groupings or filters so they can browse matches by league (HOME-02)
  3. Home page re-fetches and visually updates the match list every 30 seconds with no user action required (HOME-03)
  4. User can click a live match row and arrive at a match route (placeholder UI acceptable — wired for Phase 3)
**Plans:** 4 plans
Plans:
- [ ] 02-01-PLAN.md — Wave 0: test stubs (gameState.test.ts, formatDuration.test.ts, useLiveGames.test.ts)
- [ ] 02-02-PLAN.md — Wave 1 BFF: OpenDota service, LeagueSchema, BFF schemas, live.ts enrichment with league_name
- [ ] 02-03-PLAN.md — Wave 2 client logic: gameState utils, formatDuration util, useLiveGames hook (turns tests GREEN)
- [ ] 02-04-PLAN.md — Wave 2 client UI: components, pages, main.tsx + App.tsx routing wiring
**UI hint:** yes

### Phase 3: Match Core
**Goal:** A user opens a live match and instantly understands the in-game state — score, gold, heroes, buildings, series context — without needing any other tab.
**Depends on:** Phase 1, Phase 2
**Requirements:** MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05
**Success criteria** (what must be TRUE):
  1. User sees real-time Radiant vs Dire kill score and net-worth gold difference updating every 30s during an in-game match (MATCH-01)
  2. User sees a 5v5 hero grid with each hero's portrait, alive/dead state, and a respawn countdown when dead (MATCH-02)
  3. User sees tower and barracks status per lane for both sides, decoded from `building_state`, with a graceful placeholder when the field is absent (MATCH-03)
  4. User sees the current series score and a visible disclosure that live data is delayed by approximately two minutes (MATCH-04)
  5. User sees K/D/A and net worth for all ten players in the match screen (MATCH-05)
**Plans:** TBD
**UI hint:** yes

### Phase 4: Draft UX
**Goal:** A user watching an ongoing draft sees every pick and ban appear within ~5 seconds and always knows which team is on the clock.
**Depends on:** Phase 1, Phase 3
**Requirements:** DRAFT-01, DRAFT-02
**Success criteria** (what must be TRUE):
  1. During the draft phase, user sees all picks and bans per team rendered as hero portraits, with new selections appearing within ~5 seconds of happening live (DRAFT-01)
  2. User sees a clear indicator of which team is currently picking or banning at any moment (DRAFT-02)
  3. Polling cadence switches automatically to 5s while `game_state` indicates draft and back to 30s once the match is in-game
**Plans:** TBD
**UI hint:** yes

### Phase 5: Hero & Player Intel
**Goal:** A user looking at a draft or in-game screen sees the context that turns raw picks into insight — patch winrates, counterpicks flagged against the actual enemy roster, and each player's track record on the hero they're piloting.
**Depends on:** Phase 3, Phase 4
**Requirements:** DRAFT-03, DRAFT-04, PLAYER-01, PLAYER-02
**Success criteria** (what must be TRUE):
  1. User sees the current patch winrate and pro pickrate next to every drafted hero (DRAFT-03)
  2. User hovering a drafted hero sees its top counterpicks, with any counter flagged if an opposing player is "known to play" it based on their OpenDota hero history (DRAFT-04)
  3. User sees per-player stats inline on each drafted hero: total games on that hero and win rate for that player (PLAYER-01)
  4. When a player has a hidden Steam profile (account_id = 4294967295), their row shows the Valve-provided name with no OpenDota stats and the UI does not crash or error (PLAYER-02)
  5. Counterpick and player stat lookups are batched and server-cached per match so a page of ten players produces at most one OpenDota call per player per TTL across all viewers
**Plans:** TBD
**UI hint:** yes

### Phase 6: Win Probability
**Goal:** A user watching a mid-to-late-game match sees a Stratz-powered win-probability bar that quietly disappears rather than breaks when Stratz is unreachable or the game is too young.
**Depends on:** Phase 3
**Requirements:** MATCH-06
**Success criteria** (what must be TRUE):
  1. User sees a Radiant-vs-Dire win-probability bar on the match screen once in-game time exceeds 5 minutes (MATCH-06)
  2. Before the 5-minute threshold, the win-probability bar is hidden with no error state
  3. When Stratz is down, rate-limited, or returns null, the bar is hidden silently and the rest of the match screen continues to function (MATCH-06)
  4. Stratz responses are cached server-side by `match_id` only, so N simultaneous viewers of the same match produce at most one Stratz call per TTL
**Plans:** TBD
**UI hint:** yes

### Phase 7: Harden & Deploy
**Goal:** The owner and a small group of friends can hit a public URL and use the tool for a full day of tournament viewing without crashes, quota exhaustion, or manual restarts.
**Depends on:** Phase 2, Phase 3, Phase 4, Phase 5, Phase 6
**Requirements:** None (hardening phase — protects every REQ-ID under real conditions)
**Success criteria** (what must be TRUE):
  1. Every route-level component is wrapped in an error boundary so one failing widget (e.g. counterpick tooltip) does not blank the match screen
  2. BFF applies a global rate-limit queue per upstream (Valve, OpenDota, Stratz) with exponential backoff on 429 responses and structured pino logs for every throttle event
  3. Polling stops automatically (`refetchInterval === false`) once `game_state === 6` so finished matches stop draining upstream quotas
  4. Frontend is deployed to Vercel and BFF is deployed to Railway with Upstash Redis configured, and a shareable URL loads the live matches list without local setup
**Plans:** TBD
**UI hint:** no

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations | 4/4 | Complete | 2026-04-23 |
| 2. Live Matches List | 0/4 | Not started | - |
| 3. Match Core | 0/? | Not started | - |
| 4. Draft UX | 0/? | Not started | - |
| 5. Hero & Player Intel | 0/? | Not started | - |
| 6. Win Probability | 0/? | Not started | - |
| 7. Harden & Deploy | 0/? | Not started | - |

## Coverage Validation

| REQ-ID | Phase |
|--------|-------|
| HOME-01 | 2 |
| HOME-02 | 2 |
| HOME-03 | 2 |
| MATCH-01 | 3 |
| MATCH-02 | 3 |
| MATCH-03 | 3 |
| MATCH-04 | 3 |
| MATCH-05 | 3 |
| MATCH-06 | 6 |
| DRAFT-01 | 4 |
| DRAFT-02 | 4 |
| DRAFT-03 | 5 |
| DRAFT-04 | 5 |
| PLAYER-01 | 5 |
| PLAYER-02 | 5 |

**Coverage:** 15/15 v1 requirements mapped. No orphans. No duplicates.
