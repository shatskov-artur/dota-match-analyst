# Roadmap

**Project:** Dota 2 Match Analyst
**Version:** v1
**Granularity:** standard
**Last updated:** 2026-04-28

## Overview

| # | Phase | Goal | REQ-IDs | Success Criteria |
|---|-------|------|---------|------------------|
| 1 | Foundations | Build the typed client-BFF-cache pipeline so any match data can flow end-to-end | — (infra) | 4 criteria |
| 2 | Live Matches List | User lands on home and sees every live pro match, auto-refreshing | HOME-01–03 | 4 criteria |
| 3 | Match Core | User opens a live match and sees the full in-game state at a glance | MATCH-01–05 | 5 criteria |
| 4 | Draft UX | User watches the draft unfold in real time with clear turn indication | DRAFT-01–02 | 3 criteria |
| 5 | Hero & Player Intel | User sees contextual stats layered onto drafted heroes and players | DRAFT-03–04, PLAYER-01–02 | 5 criteria |
| 6 | Win Probability | User sees a Stratz-powered win-probability bar that degrades gracefully | MATCH-06 | 4 criteria |
| 7 | In-Game Item Intel | User sees all heroes ranked by net worth with their 6 item slots | TBD | 4 criteria |
| 8 | Ability Cooldowns | User sees which ultimates are on cooldown, sorted by time remaining | TBD | 4 criteria |
| 9 | Roshan Tracker | User sees Roshan kill count and exact loot for next kill | TBD | 4 criteria |
| 10 | Historical Graphs | User sees gold and XP lead charts over the full game duration | TBD | 5 criteria |
| 11 | Harden & Deploy | Small group can hit a public URL and the app stays up under rate limits | — (hardening) | 4 criteria |

## Phases

- [x] **Phase 1: Foundations** - Repo, TS scaffolds, Redis cache, schemas, shared primitives (no UI) ✓ 2026-04-23
- [x] **Phase 2: Live Matches List** - Home page with active tournaments and live matches auto-refreshing every 30s ✓ 2026-04-24
- [x] **Phase 3: Match Core** - In-game match screen with score, gold diff, hero grid, towers/rax, K/D/A, series score, delay disclosure ✓ 2026-04-24
- [x] **Phase 4: Draft UX** - Live picks/bans grid with 5s polling and whose-turn indicator ✓ 2026-04-25
- [ ] **Phase 5: Hero & Player Intel** - Hero patch winrate, counterpick tooltip with "known to play" cross-reference, per-player hero stats, hidden-profile safety
- [x] **Phase 6: Win Probability** - Stratz win-probability bar gated to >5min game time, degrades silently on failure ✓ 2026-04-26
- [x] **Phase 7: In-Game Item Intel** - Heroes sorted by net worth with 6 item slots each, item icons from Valve CDN ✓ 2026-04-28
- [x] **Phase 8: Ability Cooldowns & Map** - Ultimates on cooldown block + hero positions on minimap, updating every 30s ✓ 2026-04-29
- [x] **Phase 9: Roshan Tracker** - Kill counter (Redis), loot prediction by kill number, respawn countdown ✓ 2026-05-04 (manual UAT deferred)
- [x] **Phase 10: Historical Graphs** - Gold diff and XP diff line charts accumulated server-side in Redis every 30s ✓ 2026-05-09
- [ ] **Phase 11: Harden & Deploy** - Rate-limit queues, error boundaries, 429 backoff, deploy to Vercel + Railway

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
**Plans:** 4/4 plans complete
Plans:
- [x] 02-01-PLAN.md — Wave 0: test stubs (gameState.test.ts, formatDuration.test.ts, useLiveGames.test.ts)
- [x] 02-02-PLAN.md — Wave 1 BFF: OpenDota service, LeagueSchema, BFF schemas, live.ts enrichment with league_name
- [x] 02-03-PLAN.md — Wave 2 client logic: gameState utils, formatDuration util, useLiveGames hook (turns tests GREEN)
- [x] 02-04-PLAN.md — Wave 2 client UI: components, pages, main.tsx + App.tsx routing wiring
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
**Plans:** 4 plans
Plans:
- [x] 03-01-PLAN.md — Wave 1: browser heroMapper (Vite JSON import), formatGoldDiff utility + tests, valve.ts PlayerSchema D-08 extension
- [x] 03-02-PLAN.md — Wave 2: useMatchDetail hook (cache-read, refetch on miss, polling stop, building decode)
- [x] 03-03-PLAN.md — Wave 3: SkeletonPlayerRow, PlayerRow, ScoreHeader components
- [x] 03-04-PLAN.md — Wave 4: HeroPlayerGrid, BuildingsSection, MatchPage assembly + App.tsx router swap (includes human checkpoint)
**UI hint:** yes

### Phase 4: Draft UX
**Goal:** A user watching an ongoing draft sees every pick and ban appear within ~5 seconds and always knows which team is on the clock.
**Depends on:** Phase 1, Phase 3
**Requirements:** DRAFT-01, DRAFT-02
**Success criteria** (what must be TRUE):
  1. During the draft phase, user sees all picks and bans per team rendered as hero portraits, with new selections appearing within ~5 seconds of happening live (DRAFT-01)
  2. User sees a clear indicator of which team is currently picking or banning at any moment (DRAFT-02)
  3. Polling cadence switches automatically to 5s while `game_state` indicates draft and back to 30s once the match is in-game
**Plans:** 4 plans
Plans:
- [x] 04-01-PLAN.md — Wave 0: red-state test scaffolds (valve.test.ts scoreboard, draftOrder.test.ts CM 7.40 sequence, useDraftDetail.test.ts refetchInterval cadence)
- [x] 04-02-PLAN.md — Wave 1 backend: extend LiveGameSchema with ScoreboardSchema (D-17), add TTL.DRAFT=4 (D-15), getLiveLeagueGamesFast() + GET /api/live/draft/:matchId route (D-16)
- [x] 04-03-PLAN.md — Wave 2 client logic: draftOrder.ts pure turn inference (D-08), useDraftDetail.ts hook with dynamic refetchInterval (D-12), stale-comment cleanup in useMatchDetail.ts (D-13) — turns Wave 0 tests GREEN
- [ ] 04-04-PLAN.md — Wave 3 client UI: DraftPortrait, DraftColumn, DraftTurnIndicator, DraftSection, MatchPage composition (D-03), includes human checkpoint for live-draft verification
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
**Plans:** 6 plans
Plans:
- [x] 05-01-PLAN.md — Wave 0: test stubs RED state (winrateColor.test.ts, openDotaApi.test.ts extension, intel.test.ts, useMatchIntel.test.ts)
- [ ] 05-02-PLAN.md — Wave 1 BFF schemas + services (HeroStatsSchema, PlayerHeroSchema, HeroMatchupSchema, getHeroStats, getPlayerHeroes, getHeroMatchups, intel.ts pure helpers)
- [ ] 05-03-PLAN.md — Wave 1 BFF routes (GET /api/heroes/stats + GET /api/live/intel/:matchId — Promise.allSettled aggregator, cached by match_id)
- [ ] 05-04-PLAN.md — Wave 2 client utils + hooks (winrateColor.ts, useHeroStats.ts, useMatchIntel.ts — turns client tests GREEN)
- [x] 05-05-PLAN.md — Wave 2 client components (IntelTooltip.tsx new, DraftPortrait.tsx extended with badge strip + tooltip trigger)
- [ ] 05-06-PLAN.md — Wave 2 client wiring (DraftTimeline, DraftColumn, DraftSection, MatchPage prop threading + human checkpoint)
**UI hint:** yes

### Phase 6: Win Probability
**Goal:** A user watching a mid-to-late-game match sees a win-probability bar for any live match — powered by Stratz where available, falling back to a heuristic estimate otherwise.
**Depends on:** Phase 3
**Requirements:** MATCH-06

**API reality (verified 2026-04-26):**
- Stratz `live.match.liveWinRateValues` returns `null` for all matches except select major tournaments (TI, DPC Majors). Regional leagues and qualifiers are never tracked.
- Current implementation silently hides the bar when Stratz returns null — this means the bar never shows for most matches.

**Chosen approach: Stratz primary + heuristic fallback**
- When Stratz returns a value → use it, label source as "Stratz"
- When Stratz returns null → compute estimate from current game state, label as "Est."
- Heuristic formula: `P(Radiant) = sigmoid(w1·goldDiff + w2·killDiff + w3·towerAdv + w4·barracksAdv)` — coefficients calibrated from OpenDota historical data or published Dota 2 ML research
- Net worth difference is the strongest single predictor (~0.7 correlation with win outcome)
- Tower/barracks advantage adds signal in mid-to-late game
- Duration used as normalization factor (gold lead matters more early, less in 60+ min games)

**Alternatives considered (2026-04-26):**
- OpenDota `/api/scenarios/` — historical win rates by game state, but not real-time; too slow for 30s polling
- Pre-trained XGBoost server-side — most accurate independent option, but requires training pipeline and model hosting; deferred
- Stratz-only — already shipped; too narrow (covers <5% of visible matches)

**VERIFY during implementation:** calibrate heuristic coefficients against real match outcomes; confirm goldDiff range typical for pro matches; check if barracks state is reliably present in-game (not just post-game)

**Success criteria** (what must be TRUE):
  1. User sees a win-probability bar for every in-game match past 5 minutes, regardless of whether Stratz tracks it (MATCH-06)
  2. Bar shows "Stratz" label when powered by Stratz live data, "Est." label when using heuristic
  3. Before the 5-minute threshold, the bar is hidden with no error state
  4. Stratz and heuristic responses are cached server-side by `match_id` only
**Plans:** 7 plans
Plans:
- [x] 06-01-PLAN.md — Wave 0: RED-state test stubs (useWinProbability.test.ts cadence contract, stratzApi.test.ts null-return, intel.test.ts rankCountersStratz)
- [x] 06-02-PLAN.md — Wave 1: Server infra (STRATZ_TOKEN in env.ts, TTL.WIN_PROB in cache.ts, schemas/stratz.ts, stratzApi.ts service, rankCountersStratz in intel.ts)
- [x] 06-03-PLAN.md — Wave 2: BFF routes (GET /api/live/winprob/:matchId, update intel aggregator to use getHeroMatchupsStratz + rankCountersStratz, remove OpenDota matchup functions)
- [x] 06-04-PLAN.md — Wave 3: Client hook + component (useWinProbability.ts, WinProbBar.tsx — turns Wave 0 client tests GREEN)
- [x] 06-05-PLAN.md — Wave 4: MatchPage wiring (insert WinProbBar after ScoreHeader, wire useWinProbability) + human checkpoint
- [ ] 06-06-PLAN.md — Gap closure Wave 1 (TDD): heuristic winProbHeuristic.ts (computeGoldWinProb, computeEstWinProb, extractScoreboardInputs) + extend /winprob/:matchId BFF to return { stratz, gold, estimate }
- [ ] 06-07-PLAN.md — Gap closure Wave 2: update WinProbResponse interface, redesign WinProbBar as three-bar panel (Stratz/Gold/Est.), update MatchPage prop passing
**UI hint:** yes

### Phase 7: In-Game Item Intel
**Goal:** A user watching a live match sees all ten heroes ranked by net worth with their current items displayed as icons, so they can instantly read who is strongest and what power spikes are coming.
**Depends on:** Phase 3
**Requirements:** SC-01, SC-02, SC-03, SC-04
**API reality (verified 2026-04-28):**
- `item0`–`item5` (integer item IDs) are present on every player in `scoreboard.{radiant,dire}.players[]`
- Item IDs must be mapped to names/icons via a static JSON (source: OpenDota `/constants/items` endpoint or bundled file)
- Icon URL pattern: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{item_name}.png`
- `net_worth` field is present and reliable for sort order
- **VERIFY during implementation:** confirm item ID → name mapping is stable across patches; check neutral item slot (item_neutral vs item5 vs no field); check backpack slots (item6–item8) availability in live API
**Success criteria** (what must be TRUE):
  1. User sees all 10 heroes sorted descending by net worth in a dedicated block (SC-01)
  2. Each hero row shows 6 item icon slots (empty slot rendered as placeholder) (SC-02)
  3. Items update on the same 30s polling cycle as the match screen (SC-03)
  4. Missing or unknown item IDs render as empty slot, not an error (SC-04)
**Plans:** 4 plans
Plans:
- [ ] 07-01-PLAN.md — Wave 0: Download shared/items.json + RED-state test stubs (itemMapper.test.ts, formatNW.test.ts)
- [ ] 07-02-PLAN.md — Wave 1A: Extend PlayerSchema (item0–item5, item_neutral, item6–item8) + shared/itemMapper.ts (server-side)
- [ ] 07-03-PLAN.md — Wave 1B: client/src/utils/itemMapper.ts + formatNW.ts (turns tests GREEN) + ItemsBlock.tsx component
- [ ] 07-04-PLAN.md — Wave 2: MatchPage wiring (ItemsBlock insertion, merge+sort scoreboard players) + human checkpoint
**UI hint:** yes

### Phase 8: Ability Cooldowns & Map
**Goal:** A user sees which ultimates are on cooldown (sorted by time remaining) and where all 10 heroes are on the minimap, both updating every 30s.
**Depends on:** Phase 7
**Requirements:** TBD
**API reality (verified 2026-04-26):**
- Valve live API exposes per-player: `ultimate_state` (0=unavailable, 1=ready, 2=on cooldown, 3=charging) and `ultimate_cooldown` (seconds remaining)
- Regular ability cooldowns are NOT in the live API — `abilities[]` only carries `{ability_id, ability_level}`, no cooldown state
- Valve live API exposes per-player: `x_pos` and `y_pos` (map coordinates in Valve's internal coordinate space, ~0–16000)
- **VERIFY during implementation:** re-confirm `ultimate_state`/`ultimate_cooldown` field names; re-confirm `x_pos`/`y_pos` field names and coordinate range against a real in-game payload
**Success criteria** (what must be TRUE):
  1. A dedicated "Cooldowns" block lists only heroes with `ultimate_state !== 1` (not ready), sorted ascending by `ultimate_cooldown`
  2. Each cooldown entry shows hero portrait + ultimate icon + countdown in seconds
  3. Block is empty (hidden) when all ultimates are ready
  4. Minimap shows all 10 hero portraits positioned by `x_pos`/`y_pos`, Radiant green / Dire red, updating every 30s
  5. Hero positions are only shown when `draft.scoreboard` is present (hidden during draft phase)
**Plans:** 5 plans
Plans:
- [x] 08-01-PLAN.md — Wave 0: shared/heroUltimates.json + RED-state test stubs (heroUltimateMapper, mapCoords, PlayerSchema phase-8 fields)
- [x] 08-02-PLAN.md — Wave 1 BFF: extend PlayerSchema (position_x/y, ultimate_state, ultimate_cooldown) + scoreboard merge in /api/live/games
- [x] 08-03-PLAN.md — Wave 1 client utils: heroUltimateMapper.ts + mapCoords.ts (turns Wave 0 client tests GREEN; centered ±8192 + Y-flip)
- [x] 08-04-PLAN.md — Wave 2 client UI: CooldownsBlock.tsx + DotaMapView heroPositions extension
- [x] 08-05-PLAN.md — Wave 3 page wiring: MatchPage layout integration + human checkpoint (Phase 7 HPG | IB side-by-side preserved per user feedback)
**UI hint:** yes

### Phase 9: Roshan Tracker
**Goal:** A user always knows which Roshan kill is next and exactly what loot the killing team will receive, without having to count manually.
**Depends on:** Phase 3
**Requirements:** TBD
**API reality (verified 2026-04-26):**
- `scoreboard.roshan_respawn_timer` = seconds until Roshan respawns (0 = alive, >0 = dead)
- Valve does NOT expose a Roshan kill counter — it must be inferred server-side by detecting transitions `timer: 0 → >0`
- Kill counter must be stored in Redis per `match_id` and reset when a new match begins
- Loot by kill number (patch 7.41 — **VERIFY at implementation time, changes each major patch**):
  - Kill 1: Aegis of the Immortal
  - Kill 2: Aegis + Cheese
  - Kill 3: Aegis + Cheese + Aghanim's Shard
  - Kill 4+: Aegis + Cheese + Aghanim's Blessing
- **VERIFY during implementation:** loot table for current patch; whether `roshan_respawn_timer` is always 0 when alive or can be absent; timer reset timing (Valve sends 0 before or after actual spawn?)
**Success criteria** (what must be TRUE):
  1. Roshan kill counter persists across page refreshes (stored in Redis per match)
  2. User sees "Roshan #N" with the exact loot icons for that kill number
  3. When Roshan is dead, a respawn countdown is shown (reuses `roshan_respawn_timer`)
  4. Counter resets correctly when a new match begins (match_id change)
**Plans:** 6 plans
Plans:
- [x] 09-01-PLAN.md — Wave 0: RED test stubs (roshanState, roshanLoot, live.roshan integration, RoshanBlock component) — 35 failing tests authored
- [x] 09-02-PLAN.md — Wave 1: shared/roshanLoot.ts (patch 7.41 table) + server/src/logger.ts (pino scaffold, D-21) + export redis from cache.ts
- [x] 09-03-PLAN.md — Wave 1: schema work — add roshan_respawn_timer + duration to ScoreboardSchema; add RoshanStateSchema + roshan field to EnrichedLiveGameSchema (D-19)
- [x] 09-04-PLAN.md — Wave 2: server/src/services/roshanState.ts (pure detector + Redis I/O + bootstrap) + inline into /api/live/games per-game enrichment (Promise.all refactor)
- [x] 09-05-PLAN.md — Wave 3: client/src/components/RoshanBlock.tsx (alive/dead/last-drop states + 1Hz tick) + insert in MatchPage between DotaMapView and CooldownsBlock
- [x] 09-06-PLAN.md — Wave 4: full-suite green sweep + manual UAT on a live tournament match + 09-UAT.md sign-off (human checkpoint)
**UI hint:** yes

### Phase 10: Historical Graphs
**Goal:** A user sees how the gold lead and XP lead have evolved over the course of the game as line charts, giving context to whether the current lead is growing, shrinking, or stable.
**Depends on:** Phase 3
**Requirements:** TBD
**API reality (verified 2026-04-26):**
- Valve live API returns only a **current snapshot** — no historical data per request
- History must be accumulated server-side: a background job or poll stores `{timestamp, goldDiff, xpDiff}` in Redis as a time-series list per `match_id` every 30s
- XP diff: Valve does NOT expose per-team total XP directly — must sum `xp_per_min * duration / 60` per player, or use net_worth as proxy; **VERIFY whether per-player XP total is available in the payload**
- Gold diff: already computed from `net_worth` sums (Radiant − Dire)
- Data retention: clear match series from Redis after `game_state === 6` + grace period
- **VERIFY during implementation:** per-player XP field availability; whether `scoreboard.radiant.xp` (team total) exists as a top-level scoreboard field
**Success criteria** (what must be TRUE):
  1. Gold diff line chart shows the full history from game start to current time
  2. XP diff line chart shown alongside or below gold chart
  3. Charts update every 30s with new data points appended
  4. No data persists in Redis after match ends (TTL or explicit cleanup)
  5. Charts render a loading/empty state gracefully for the first 30s before history accumulates
**Plans:** 4 plans

Plans:
- [ ] 10-01-PLAN.md — Server history sampler module (pure buildSample + Redis I/O wrappers + unit tests)
- [ ] 10-02-PLAN.md — BFF schema extension and live-route inline sampler piggyback
- [ ] 10-03-PLAN.md — HistoryGraphs SVG component (skeleton, dual chart, hover tooltip + tests)
- [ ] 10-04-PLAN.md — Hook surfacing and MatchPage mount (autonomous: false, layout-preservation checkpoint)
**UI hint:** yes

### Phase 10.1: background-history-sampler — server-side setInterval(30s) that polls GetLiveLeagueGames and runs tryWriteSample for every active tournament match independent of user requests, so anyone joining mid-game sees gold/XP history from minute 0 instead of from their join time. NX gate already prevents duplicate writes from this job and from the existing /api/live/games piggyback. (INSERTED)

**Goal:** A server-side setInterval(30s) polls getLiveLeagueGames and runs tryWriteSample/deleteHistory for every active tournament match independent of user requests, so anyone joining mid-game sees gold/XP history accumulated from minute 0; SIGTERM/SIGINT drain in-flight ticks before exit.
**Requirements:** None (operational/infrastructure phase)
**Depends on:** Phase 10
**Plans:** 3 plans

Plans:
- [x] 10.1-01-PLAN.md — Wave 1: RED tests + module skeleton (historySamplerJob.ts + historySamplerJob.test.ts) ✓ 2026-05-14
- [x] 10.1-02-PLAN.md — Wave 2: GREEN implementation of runOnce + startSampler + stopSampler ✓ 2026-05-14
- [x] 10.1-03-PLAN.md — Wave 3: index.ts wire-up + SIGTERM/SIGINT graceful shutdown + lifecycle smoke test ✓ 2026-05-14

### Phase 10.2: HistoryGraphs polish + right-column equalize + XP fix (INSERTED)

**Goal:** Close UAT feedback (2026-05-14): XP history graph shows real non-zero values (fix server xpm/xp_per_min field mismatch), HistoryGraphs chart redesigned per sketch 001-C (line + soft fill + static peak labels, no hover) for at-a-glance readability, and right-column blocks (DotaMapView + RoshanBlock + CooldownsBlock) equalize to HeroPlayerGrid height via flex h-full + items-stretch.
**Requirements:** UAT-XP-01, UAT-XP-02, UAT-CHART-01, UAT-CHART-02, UAT-CHART-03, UAT-CHART-04, UAT-CHART-05, UAT-CHART-06, UAT-LAYOUT-01, UAT-LAYOUT-02, UAT-LAYOUT-03
**Depends on:** Phase 10, Phase 10.1
**Plans:** 3 plans

Plans:
- [x] 10.2-01-PLAN.md — Wave 1: XP source fix — alias xp_per_min ?? xpm in historySampler.ts + finite-number hardening + new RED test ✓ 2026-05-15
- [ ] 10.2-02-PLAN.md — Wave 2: HistoryGraphs.tsx rewrite per sketch 001-C (line + soft fill + static peak labels, no hover) + test rewrite
- [ ] 10.2-03-PLAN.md — Wave 3: Right-column equalize (h-full + shrink-0 on MatchPage column wrapper) + defensive min-h-0 overflow-y-auto on CooldownsBlock

### Phase 11: Harden & Deploy
**Goal:** The owner and a small group of friends can hit a public URL and use the tool for a full day of tournament viewing without crashes, quota exhaustion, or manual restarts.
**Depends on:** Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8, Phase 9, Phase 10
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
| 2. Live Matches List | 4/4 | Complete | 2026-04-24 |
| 3. Match Core | 4/4 | Complete | 2026-04-24 |
| 4. Draft UX | 6/6 | Complete | 2026-04-25 |
| 5. Hero & Player Intel | 6/6 | Complete | 2026-04-25 |
| 6. Win Probability | 5/5 | Complete | 2026-04-26 |
| 7. In-Game Item Intel | 4/4 | Complete | 2026-04-28 |
| 8. Ability Cooldowns | 0/5 | Planned | - |
| 9. Roshan Tracker | 0/6 | Planned | - |
| 10. Historical Graphs | 4/4 | Complete | 2026-05-09 |
| 10.1. background-history-sampler | 3/3 | Complete | 2026-05-14 |
| 10.2. HistoryGraphs polish + XP fix | 1/3 | In progress | - |
| 11. Harden & Deploy | 0/? | Not started | - |

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
