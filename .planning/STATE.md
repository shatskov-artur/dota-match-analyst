# Project State

## Current Status
Phase: Not started
Last updated: 2026-04-22

## Project Reference
See: .planning/PROJECT.md

**Core value:** You open a live match and instantly understand who's winning and why — from draft through final push.
**Current focus:** Phase 1 — Foundations

## Phase Progress

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundations | Not started |
| 2 | Live Matches List | Not started |
| 3 | Match Core | Not started |
| 4 | Draft UX | Not started |
| 5 | Hero & Player Intel | Not started |
| 6 | Win Probability | Not started |
| 7 | Harden & Deploy | Not started |

## Current Position
- **Phase:** 1 (Foundations) — not started
- **Plan:** none yet
- **Status:** awaiting `/gsd-plan-phase 1`
- **Progress:** 0/7 phases complete (0%)

## Performance Metrics
- Phases complete: 0/7
- v1 requirements delivered: 0/15
- Requirement coverage in roadmap: 15/15 (100%)

## Accumulated Context

### Decisions
- Roadmap derived from data-pipeline dependencies: Foundations -> Live List -> Match Core -> Draft -> Intel -> Win Probability -> Harden.
- MATCH-06 (Stratz win probability) isolated to its own phase so it can ship late or be deferred if Stratz pricing changes in 2026 without blocking the match core.
- DRAFT-03/04 and PLAYER-01/02 grouped into a single "Hero & Player Intel" phase because they share the same OpenDota upstream and caching strategy.
- Phase 1 ships no UI on purpose; it proves the cache + schema + decoder pipeline before feature work begins.

### Todos
- Resolve research open question on Stratz 2026 access model before starting Phase 6.
- Calibrate "known to play" threshold for counterpick tooltip before starting Phase 5 (suggested default: >=5 games AND >50% pickrate in last 3 months).
- Confirm TanStack Query v5 dynamic `refetchInterval` signature before implementing live polling in Phase 2.

### Blockers
None.

## Session Continuity
- Last session: Phase 1 context gathered (2026-04-22)
- Resume file: `.planning/phases/01-foundations/01-CONTEXT.md`
- Next action: run `/gsd-plan-phase 1` to decompose Foundations into executable plans.
- Roadmap file: `.planning/ROADMAP.md`
- Requirements file: `.planning/REQUIREMENTS.md`
- Research summary: `.planning/research/SUMMARY.md`
