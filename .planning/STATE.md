---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-25T17:57:01.611Z"
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 24
  completed_plans: 22
  percent: 92
---

# Project State

## Current Status

Phase: Ready to execute
Last updated: 2026-04-25

## Project Reference

See: .planning/PROJECT.md

**Core value:** You open a live match and instantly understand who's winning and why — from draft through final push.
**Current focus:** Phase 5 — Hero & Player Intel

## Phase Progress

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundations | Complete — all 4 plans done, verified 2026-04-23 |
| 2 | Live Matches List | Complete — all 4 plans done, verified 2026-04-24 |
| 3 | Match Core | Complete — all 4 plans done, verified 2026-04-24 |
| 4 | Draft UX | Complete — all 6 plans done, verified 2026-04-25 |
| 5 | Hero & Player Intel | Executing — Plan 04/06 done (client hooks complete) |
| 6 | Win Probability | Not started |
| 7 | Harden & Deploy | Not started |

## Current Position

- **Phase:** 5 (Hero & Player Intel) — Executing Wave 2 → Plan 04 complete
- **Status:** Phase 5 executing — Plan 04/06 done (client hooks: winrateColor + useHeroStats + useMatchIntel)
- **Progress:** [█████████░] 92%

## Performance Metrics

- Phases complete: 3/7
- v1 requirements delivered: MATCH-01–05, HOME-01–03, infra
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

### Todos

- Resolve research open question on Stratz 2026 access model before starting Phase 6.
- "Known to play" threshold resolved: games >= 10 AND win/games > 0.5 (server-side, D-09).
- Phase 4 refetchInterval: use dynamic `(query) => ...` callback form for 5s draft polling (TQ v5 supports this for Phase 4+).

### Blockers

None.

## Session Continuity

- Last session: 2026-04-25 — Phase 5 Plan 04 complete (client hooks: winrateColor + useHeroStats + useMatchIntel)
- Next action: Execute Plan 05-05 (DraftPortrait badge strip + IntelTooltip component)
- Roadmap file: `.planning/ROADMAP.md`
- Requirements file: `.planning/REQUIREMENTS.md`

**Executing Phase:** 5 (Hero & Player Intel) — Plan 04/06 complete — 2026-04-25T17:58:00.000Z
