---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: "Awaiting Phase 09 (next: Hero Stats and Item Patch refresh / Harden & Deploy depending on roadmap order)"
last_updated: "2026-05-03T22:52:35.496Z"
progress:
  total_phases: 11
  completed_phases: 8
  total_plans: 46
  completed_plans: 40
  percent: 87
---

# Project State

## Current Status

Phase: Phase 8 complete — all 5 plans done, human checkpoint approved 2026-04-29
Last updated: 2026-04-29

## Project Reference

See: .planning/PROJECT.md

**Core value:** You open a live match and instantly understand who's winning and why — from draft through final push.
**Current focus:** Phase 08 — ability-cooldowns-map

## Phase Progress

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundations | Complete — all 4 plans done, verified 2026-04-23 |
| 2 | Live Matches List | Complete — all 4 plans done, verified 2026-04-24 |
| 3 | Match Core | Complete — all 4 plans done, verified 2026-04-24 |
| 4 | Draft UX | Complete — all 6 plans done, verified 2026-04-25 |
| 5 | Hero & Player Intel | Complete — all 6 plans done, verified 2026-04-25 |
| 6 | Win Probability | Complete — all 5 plans done, verified 2026-04-26 |
| 7 | In-Game Item Intel | Complete — all 4 plans done, verified 2026-04-28 |
| 8 | Ability Cooldowns & Map | Complete — all 5 plans done, human checkpoint approved 2026-04-29 |

## Current Position

Phase: 08 (ability-cooldowns-map) — COMPLETE
Plans: 5 of 5

- **Phase:** 08 complete — all 5 plans landed; checkpoint approved (`да, все верно`)
- **Status:** Awaiting Phase 09 (next: Hero Stats and Item Patch refresh / Harden & Deploy depending on roadmap order)
- **Progress:** [██████████] 100%

## Performance Metrics

- Phases complete: 6/7
- v1 requirements delivered: MATCH-01–06, HOME-01–03, DRAFT-01–04, PLAYER-01–02, infra
- Requirement coverage in roadmap: 15/15 (100%)

## Accumulated Context

### Decisions

- Roadmap derived from data-pipeline dependencies: Foundations -> Live List -> Match Core -> Draft -> Intel -> Win Probability -> Harden.
- MATCH-06 (Stratz win probability) isolated to its own phase so it can ship late or be deferred if Stratz pricing changes in 2026 without blocking the match core.
- DRAFT-03/04 and PLAYER-01/02 grouped into a single "Hero & Player Intel" phase because they share the same OpenDota upstream and caching strategy.
- Phase 1 ships no UI on purpose; it proves the cache + schema + decoder pipeline before feature work begins.
- D-01: Flat dirs client/, server/, shared/ at repo root — no npm workspaces
- D-02: @shared/* path alias in both server/tsconfig.json and client/tsconfig.json pointing to ../shared/*
- D-03: Root package.json dev script uses concurrently to start both Vite and Hono
- T-01-02: CORS origin locked to http://localhost:5173 in Hono server middleware
- Named import { Redis } from 'ioredis' required for NodeNext module resolution — default import triggers TS2709
- Upstash Redis-protocol endpoint: token embedded in URL as rediss://:TOKEN@HOST:PORT for ioredis TLS connection
- Phase 3: browser-safe heroMapper uses Vite native JSON import (NOT @shared/heroMapper which uses createRequire)
- Phase 3: useMatchDetail reads ['live-games'] cache key shared with useLiveGames — no duplicate fetch
- Phase 3: buildingDecoder called with tower_state (NOT building_state) — field name matters
- Phase 3: color palette upgraded — white headings (#ffffff), 52px kill scores, secondary text ≥ #555555
- Rule 3 fix: server/tsconfig.json rootDir changed from ./src to .. to allow shared/hiddenProfile.ts import
- heroRoutes mounted at /api (not /api/live) for correct GET /api/heroes/stats URL — D-10
- intel route outer cache key intel:{matchId} (not per-user) — T-5-04 DoS mitigation
- useHeroStats uses staleTime: Infinity + refetchInterval: false — patch data never polls (T-5-04 DoS mitigation)
- computeIntelInterval mirrors computeDraftInterval pattern exactly — game_state 2 = 5000ms, else false
- pick_rate display in badge strip: raw pro_pick count shown as '{N}P' suffix (not percentage) — BFF returns raw count, normalization requires total pro games
- React 19 useRef returns RefObject<T | null> — IntelTooltip anchorRef prop must be typed RefObject<HTMLDivElement | null>
- DraftPortrait outer wrapper has no overflow-hidden — only inner portrait div clips; allows IntelTooltip (absolute) to escape clip boundary
- Phase 6: Valve omits game_state for draft AND in-game phases — distinguish by scoreboard.radiant.players[] presence
- Phase 6: getStatusLabel scoreboard fallback `scoreboard != null → 'Live'` was too broad; replaced with players-array check
- Phase 6: ScoreHeader now shows formatDuration(match.duration) as game clock between StatusTag and gold diff
- Phase 6: WinProbBar self-gates: gameState===5 AND duration>300 AND radiantWinProb!==null — no wrapper needed in MatchPage
- Phase 6: Stratz live.match returns null for matches it doesn't track — expected, bar silently hides
- radiance item id is 137 in OpenDota data (plan had 119 which was stale); itemMapper test corrected

### Todos

- "Known to play" threshold resolved: games >= 10 AND win/games > 0.5 (server-side, D-09).
- Phase 4 refetchInterval: use dynamic `(query) => ...` callback form for 5s draft polling (TQ v5 supports this for Phase 4+).

### Blockers

None.

## Session Continuity

- Last session: 2026-04-28 — Phase 7 plan 01 complete (items.json + RED test stubs)
- Next action: Execute 07-02 (itemMapper GREEN implementation)
- Roadmap file: `.planning/ROADMAP.md`
- Requirements file: `.planning/REQUIREMENTS.md`

**Completed Phase:** 6 (Win Probability) — all 5 plans done — 2026-04-26
**In Progress:** Phase 7 (In-Game Item Intel) — 1/4 plans done — 2026-04-28

**Planned Phase:** 9 (Roshan Tracker) — 6 plans — 2026-05-03T22:52:35.488Z
