---
gsd_state_version: 1.0
milestone: v1.0
status: shipped
stopped_at: Phase 10.5 UI-SPEC approved
last_updated: "2026-08-23T13:15:47.019Z"
state_head: b187ecf63e1ea7036c02c2db14baf2402842d75a
progress:
  total_phases: 18
  completed_phases: 2
  total_plans: 70
  completed_plans: 70
milestone_name: milestone
---

# Project State

## Current Status

All planned phases are complete. The public artifact is a **static snapshot demo** on GitHub Pages
(Phase 12) — a replay of real tournament data captured 2026-08-06. The live split-origin service
(Vercel + Railway + Upstash) is configured and committed but intentionally not running; see
README §Live demo.

Last work: Phase 13 — team avatars, resolved server-side with a monogram fallback (2026-08-11).

Last updated: 2026-08-11 — this file had been stale since 2026-05-15, still reporting Phase 10.3
as current and Phase 11 as blocked on a deploy checkpoint, through three shipped phases.

## Project Reference

See: .planning/PROJECT.md

**Core value:** You open a live match and instantly understand who's winning and why — from draft
through final push.
**Open question (see PROJECT.md):** whether v1.1 restarts the live service or the project stays a
portfolio artifact. Every doc below describes what exists; nothing here assumes an answer.

## Phase Progress

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundations | Complete — 4/4, verified 2026-04-23 |
| 2 | Live Matches List | Complete — 4/4, verified 2026-04-24 |
| 3 | Match Core | Complete — 4/4, verified 2026-04-24 |
| 4 | Draft UX | Complete — 4/4, verified 2026-04-25 |
| 5 | Hero & Player Intel | Complete — 6/6, verified 2026-04-25 |
| 6 | Win Probability | Complete — 7/7 (incl. gap-closure heuristic bars), 2026-04-26 |
| 7 | In-Game Item Intel | Complete — 4/4, 2026-04-28 |
| 8 | Ability Cooldowns & Map | Complete — 5/5, human checkpoint approved 2026-04-29 |
| 9 | Roshan Tracker | Complete — 6/6, 2026-05-04; manual UAT deferred |
| 10 | Historical Graphs | Complete — 4/4, 2026-05-09 |
| 10.1 | background-history-sampler | Complete — 3/3, 2026-05-14 |
| 10.2 | HistoryGraphs polish + XP fix | Complete — 3/3, 2026-05-15 |
| 10.3 | Match page layout restructure | Complete — 2/2, 2026-05-15 |
| 10.4 | Visual redesign + responsive | Complete — 8/8, 2026-06-14 (skin superseded by 10.5) |
| 10.5 | Neon Bento redesign | Complete — shipped directly, 2026-06-14 |
| 11 | Harden & Deploy | Complete — 4/4, 2026-07-10 |
| 12 | Snapshot Demo | Complete — shipped directly, 2026-08-06 |
| 13 | Team Avatars | Complete — shipped directly, 2026-08-11 |

## Current Position

No phase in flight. Tests: 131 server + 131 client, all green; `tsc` and both builds clean; the
demo verifier reports 0 external API requests and 0 console errors.

## Performance Metrics

- Phases complete: 18/18
- Requirements delivered: 32/32 mapped (HOME, MATCH, DRAFT, PLAYER, ITEM, CD, MAP, ROSH, GRAPH,
  UI, DEMO, TEAM)

- Requirement coverage in roadmap: 32/32 (100%)

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
- Rule 3 fix: server/tsconfig.json rootDir changed from ./src to .. to allow shared/hiddenProfile.ts import
- heroRoutes mounted at /api (not /api/live) for correct GET /api/heroes/stats URL — D-10
- intel route outer cache key intel:{matchId} (not per-user) — T-5-04 DoS mitigation
- useHeroStats uses staleTime: Infinity + refetchInterval: false — patch data never polls (T-5-04 DoS mitigation)
- Phase 6: Valve omits game_state for draft AND in-game phases — distinguish by scoreboard.radiant.players[] presence
- Phase 6: Stratz live.match returns null for matches it doesn't track — hence the gold + heuristic bars alongside it
- Phase 11 D-09: split-origin base URL via client/src/lib/apiBase.ts — API_BASE = import.meta.env.VITE_API_URL ?? ''
- Phase 11 D-09: CORS_ORIGIN is z.string().optional() in env.ts; index.ts CORS scoped to /api/* with exact origin + credentials false (no '*') — T-11-08
- Phase 11 A4: Railway Root Directory = server/, Vercel Root Directory = client/; secrets live only in dashboards (repo carries *.example only) — T-11-10
- Phase 12: the capture records BFF responses, not raw upstream, so the demo re-derives nothing; apiFetch is the single seam between network and snapshot
- Phase 13: team logos resolve OpenDota-first (keyless) with Valve UGC as fallback; the live route reads the 7-day cache and warms misses in the background so avatars never delay the match list
- Phase 13: a `team_logo` ugcid past Number.MAX_SAFE_INTEGER is already corrupted by JSON.parse and is dropped instead of looked up (verified against GetUGCFileDetails)
- Phase 13: OpenDota answers 200 with an EMPTY body for unknown teams — a 2xx with an unusable body is treated as a cacheable miss, not a transient failure

### Todos

- "Known to play" threshold resolved: games >= 10 AND win/games > 0.5 (server-side, D-09).
- Snapshot in demo-data/ predates team avatars, so the published demo shows monograms only.
  Re-capturing (`npm run capture:snapshot`) is the fix — it rewrites 546 committed files, so it is
  a deliberate call, not a chore.

- No CI runs the test suites; the only workflow builds and publishes the demo.
- BFF has no per-IP rate limit or auth — irrelevant while the service is off, decisive if it returns.

### Blockers

- None.

### Roadmap Evolution

- Phase 10.1 inserted after Phase 10: background-history-sampler — server-side setInterval(30s) polls GetLiveLeagueGames so any viewer joining mid-game sees gold/XP history from minute 0.
- Phase 10.2 inserted after Phase 10.1: HistoryGraphs polish + right-column equalize + XP fix (live UAT feedback 2026-05-14). Sketch 001 winner = variant C.
- Phase 10.3 inserted after Phase 10.2: Match page layout restructure (live UAT feedback 2026-05-15). Sketch 002 winner = variant C.
- Phase 10.5 recorded retroactively 2026-08-11: the Neon Bento redesign shipped 2026-06-14 and superseded Phase 10.4's Tactical Slate skin the same day, but existed only in a commit message.
- Phase 12 recorded retroactively 2026-08-11: the snapshot demo shipped 2026-08-06 with no roadmap entry, and changed what the project's public artifact is.
- Phase 13 added 2026-08-11: team avatars.

## Session Continuity

**Last session:** 2026-08-23T13:15:36.467Z
**Stopped at:** Phase 10.5 UI-SPEC approved
**Resume file:** D:/MateProjects/projects/dota/dota_stats/.planning/phases/10.5-neon-bento-redesign/10.5-UI-SPEC.md

- Last session: 2026-08-11 — Phase 13 (team avatars) shipped; planning docs reconciled against the
  codebase after an audit found statuses, requirement ids, the theme name and the stack description
  all diverged from what is built.

- Next action: decide the v1.1 question in PROJECT.md (restart the live service vs. stay a portfolio
  artifact), then add a CI workflow that runs both test suites.

- Roadmap file: `.planning/ROADMAP.md`
- Requirements file: `.planning/REQUIREMENTS.md`
