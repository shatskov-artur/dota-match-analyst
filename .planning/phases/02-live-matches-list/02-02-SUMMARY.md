---
phase: 02-live-matches-list
plan: 02
subsystem: server-bff-enrichment
tags: [bff, opendota, league-enrichment, zod, caching, wave-1]
dependency_graph:
  requires:
    - 02-01 (Wave 0 client test stubs in RED state)
  provides:
    - server/src/schemas/openDota.ts
    - server/src/services/openDotaApi.ts
    - server/src/schemas/bff.ts
    - server/src/routes/live.ts (modified — enrichment)
  affects:
    - Wave 2 (02-03) — client uses enriched { games: EnrichedLiveGame[] } response shape
tech_stack:
  added: []
  patterns:
    - LeagueSchema.safeParse() for OpenDota response validation (T-02-01)
    - cached() with TTL.HERO_STATS (21600s) for 6h league name caching
    - Promise.all with new Set de-duplication for concurrent enrichment
    - Fallback label "League #id" when OpenDota returns null (D-08)
key_files:
  created:
    - server/src/schemas/openDota.ts
    - server/src/services/openDotaApi.ts
    - server/src/schemas/bff.ts
  modified:
    - server/src/routes/live.ts
decisions:
  - Inline enrichment in existing /api/live/games route (not a separate /api/leagues/:id endpoint) — per Claude's discretion (02-CONTEXT.md)
  - league_name typed as z.string() (never null) at client boundary — fallback applied server-side before response
  - De-duplication via new Set limits concurrent OpenDota calls to unique league count (T-02-04 accept)
metrics:
  duration: ~2 minutes
  completed: "2026-04-23T19:09:38Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 02 Plan 02: BFF League Enrichment Summary

**One-liner:** GET /api/live/games enriched server-side with league_name from OpenDota /leagues/{id}, cached 6h via LeagueSchema.safeParse validation and "League #id" fallback.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create OpenDota schema and service | d335d70 | server/src/schemas/openDota.ts, server/src/services/openDotaApi.ts |
| 2 | Create BFF response schemas and enrich live.ts route | 41650e2 | server/src/schemas/bff.ts, server/src/routes/live.ts |

## What Was Built

### server/src/schemas/openDota.ts
- `LeagueSchema` with `.passthrough()` — all fields `.optional()` to handle partial OpenDota responses
- `name` field typed as `z.string().nullable().optional()` — handles null from OpenDota
- `League` type exported

### server/src/services/openDotaApi.ts
- `fetchLeagueName(leagueId)` — private fetch function with error guard
- Network errors caught and logged with `err.message` only (no URL)
- HTTP non-ok responses logged with `res.status res.statusText` only (T-02-02)
- `LeagueSchema.safeParse(raw)` validates all responses before use (T-02-01)
- `getLeagueName(leagueId)` exported — wraps fetchLeagueName in `cached('league:${leagueId}', TTL.HERO_STATS, ...)`
- TTL.HERO_STATS = 21600s = 6h per D-06

### server/src/schemas/bff.ts
- `EnrichedLiveGameSchema` extends `LiveGameSchema` with `league_name: z.string()`
- `LiveGamesResponseSchema` wraps `z.array(EnrichedLiveGameSchema)` in `{ games: [...] }`
- `EnrichedLiveGame` and `LiveGamesResponse` types exported

### server/src/routes/live.ts (modified)
- Gets `data.result.games ?? []` from Valve API (safe empty fallback)
- De-duplicates league IDs via `new Set(games.map(g => g.league_id))`
- Fetches all league names concurrently via `Promise.all`
- Applies fallback `"League #${id}"` when `getLeagueName` returns null (D-08)
- Returns `c.json({ games: enriched })` — enriched shape, not raw Valve envelope

## Verification

1. TypeScript compiles clean: `npx tsc --noEmit` exits 0 in server directory
2. Client tests remain RED (3 failed) — Wave 0 stubs unchanged, source files not yet created

## Deviations from Plan

None — plan executed exactly as written. Both files matched plan-provided code exactly.

## Known Stubs

None — all enrichment logic is wired. `getLeagueName` calls real OpenDota API (cached 6h). Fallback label is intentional behavior per D-08, not a stub.

## Threat Flags

No new threat surface beyond what the plan's threat model covers. Threats T-02-01 and T-02-02 are fully mitigated:

| Flag | File | Description |
|------|------|-------------|
| mitigated: T-02-01 | server/src/services/openDotaApi.ts | LeagueSchema.safeParse() validates all OpenDota responses |
| mitigated: T-02-02 | server/src/services/openDotaApi.ts | Error logs use status/statusText only — URL never logged |

## Self-Check

Files created:
- server/src/schemas/openDota.ts: FOUND
- server/src/services/openDotaApi.ts: FOUND
- server/src/schemas/bff.ts: FOUND
- server/src/routes/live.ts: FOUND (modified)

Commits:
- d335d70: FOUND
- 41650e2: FOUND

## Self-Check: PASSED
