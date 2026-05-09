---
phase: 10-historical-graphs
plan: 02
subsystem: server/schemas + server/routes
tags: [redis, bff, schema, live-route, dota, phase-10]
dependency-graph:
  requires:
    - server/src/services/historySampler.ts (Plan 10-01 — buildSample, tryWriteSample, readHistory, deleteHistory)
    - server/src/schemas/valve.ts (LiveGameSchema base)
    - server/src/cache.ts (redis instance, transitively via sampler)
    - server/src/logger.ts (pino logger for fire-and-forget error path)
  provides:
    - server/src/schemas/bff.ts (HistorySampleSchema, HistorySample type, EnrichedLiveGameSchema.history)
    - /api/live/games response now carries `history: HistorySample[]` per enriched game
  affects:
    - client/src/hooks/useMatchDetail.ts (consumer — `match.history` available; no edit yet, type widens automatically via z.infer)
    - client/src/hooks/useLiveGames.ts (consumer — same)
    - client/src/pages/MatchPage.tsx (Plan 10-04 will mount HistoryGraphs reading match.history)
tech-stack:
  added: []
  patterns:
    - BFF schema extension via .extend (parallel to RoshanStateSchema/roshan)
    - Inline-piggyback handler extension (parallel to Roshan block at lines 108-151)
    - Fire-and-forget try/catch with pino logger.error fallback (D-09)
    - typeof match_id === 'number' guard at trust boundary (T-10-07)
key-files:
  created: []
  modified:
    - server/src/schemas/bff.ts
    - server/src/routes/live.ts
decisions:
  - "history is required (not nullable, not optional) on EnrichedLiveGameSchema — route handler always attaches an array (possibly empty)"
  - "Sampler block placed AFTER Roshan piggyback but INSIDE the same enriched.map callback, BEFORE the return literal"
  - "Re-uses the already-computed derivedGameState local — does not recompute"
  - "Fire-and-forget: try/catch wraps deleteHistory + buildSample + tryWriteSample + readHistory together; any throw degrades history to [] and emits logger.error"
  - "logger.info on successful writes only (when wrote === true) — keeps log volume bounded"
metrics:
  duration: "~5 min"
  tasks: 2
  files: 2
  completed: "2026-05-09"
---

# Phase 10 Plan 02: BFF Schema Extension + Inline Sampler Piggyback Summary

Wired the Phase 10 sampler module (Plan 01) into the live-games BFF endpoint.
`EnrichedLiveGameSchema` now requires a `history: HistorySample[]` field;
`liveRoutes.get('/games')` runs the sampler inline immediately after the
Roshan piggyback block — fire-and-forget on `game_state === 5`, explicit
cleanup on `game_state === 6`, and always reads back the time-series so
every enriched game ships with a `history` array (possibly empty). No new
endpoint, no new polling cadence — history rides for free on the existing
30s `/api/live/games` cycle (D-05).

## Schema Additions (server/src/schemas/bff.ts)

| Symbol | Kind | Shape |
|--------|------|-------|
| `HistorySampleSchema` | zod object | `{ t: int>=0, gold: int, xp: int }` |
| `HistorySample` | type | `z.infer<typeof HistorySampleSchema>` |
| `EnrichedLiveGameSchema.history` | required field | `z.array(HistorySampleSchema)` |

`history` is **not** `.optional()` and **not** `.nullable()`. The route handler
always attaches an array (empty when redis missing, no samples yet, or sampler
threw). The strict-required schema enforces this contract at the type boundary.

`server/src/schemas/valve.ts` is **untouched** — `history` is a BFF-side
construct, not a Valve passthrough field.

## Route Insertion Point (server/src/routes/live.ts)

**Imports** (added at top alongside roshanState import):
```typescript
import { readHistory, tryWriteSample, deleteHistory, buildSample } from '../services/historySampler.js'
import type { HistorySample } from '../schemas/bff.js'
```

**Inline block** (inserted between the Roshan block at lines 108-151 and the
return literal in `enriched.map(async (g) => …)`):

```typescript
let history: HistorySample[] = []
if (typeof g.match_id === 'number') {
  const matchId = g.match_id
  try {
    if (derivedGameState === 6) {
      await deleteHistory(matchId)              // D-13
    } else if (derivedGameState === 5) {
      const sample = buildSample({
        scoreboard: g.scoreboard as never,
        duration: g.duration,
        game_state: derivedGameState,
      })
      if (sample) {
        const wrote = await tryWriteSample(matchId, sample)
        if (wrote) {
          logger.info({ matchId, t: sample.t, gold: sample.gold, xp: sample.xp }, 'history sample written')
        }
      }
    }
    history = await readHistory(matchId)
  } catch (err) {
    logger.error({ matchId, err: (err as Error).message }, 'history sampler failed')
  }
}
```

The return literal gains exactly one new field — `history,` — appended after
`league_name`. All existing fields (game_state, duration, roshan_respawn_timer,
roshan, players, league_name) are preserved verbatim.

## Error-Handling Envelope (D-09)

The entire sampler block is a single try/catch. Failure paths covered:

| Failure | Behaviour |
|---------|-----------|
| `redis === null` | sampler functions short-circuit internally; `history = []` |
| `redis.set` / `rpush` / `lrange` / `del` throws | caught inside sampler module → logger.error → safe default returned; outer catch never fires |
| Outer catch fires (defensive) | `logger.error({matchId, err}, 'history sampler failed')` → `history` falls through to `[]` |
| `match_id` not a number | block skipped entirely; `history = []` (T-10-07 mitigation) |
| `buildSample` returns null (game_state≠5, duration=0, empty teams) | no write attempted; `readHistory` still runs |

Net contract: `/api/live/games` always succeeds when its existing pre-Phase-10
logic would have succeeded. The new field is additive and self-degrading.

## Verification

- `cd server && npx tsc --noEmit` exits 0 (clean).
- `cd server && npx vitest run src/services/historySampler.test.ts` → **18/18 green** (Plan 10-01 untouched).
- `cd server && npx vitest run src/routes/live.roshan.test.ts` → **6/6 green** (regression).
  - Sampler emits expected `history write failed` / `history read failed`
    log lines because the existing roshan test mock only defines
    `redis.get` and `redis.set` — not `rpush`/`lrange`/`del`. The errors
    are caught by the sampler's internal try/catch, prove the D-09
    fire-and-forget contract holds, and never break the response.
- Client `npx tsc --noEmit` → clean (consumers compile against the wider
  `EnrichedLiveGame` type without any edit).
- All acceptance-criteria grep patterns matched (HistorySampleSchema, type
  HistorySample, history: z.array, derivedGameState === 5/6, success +
  failure log strings, return literal `history,`).

## Threat Mitigations Applied (from plan threat_model)

- **T-10-07 (Tampering — match_id key construction):** mitigated via
  `typeof g.match_id === 'number'` gate before any sampler call.
- **T-10-08 (DoS — sampler exception bubbling to live response):** mitigated
  via outer try/catch in the route block; `history` defaults to `[]` and the
  endpoint returns 200 even when redis is fully down. ASVS L1 error-handling
  contract met.
- **T-10-09 (Info disclosure):** accepted — schema validates only signed
  integers; no string fields could carry leaked log/error data.
- **T-10-10 (Repudiation — silent writes):** mitigated — `logger.info` fires
  on every actual append (`wrote === true`), `logger.error` fires on every
  catch path. Log volume bounded by the 5s NX gate (Plan 10-01 D-06).
- **T-10-11 (EoP — arbitrary key write):** mitigated — `tsKey()`/`gateKey()`
  are the only key constructors; both take `matchId: number` enforced by
  TypeScript strict mode at the call boundary.

## Deviations from Plan

None — plan executed exactly as written.

The plan was marked `tdd="true"` per task, but the relevant tests already
exist from Plan 10-01 (`historySampler.test.ts`, 18 cases) and Phase 9
(`live.roshan.test.ts`, 6 cases that double as a regression harness for the
inline-piggyback shape). Both suites green after the wiring; no new test
files were warranted at the schema-extension / route-graft layer beyond the
existing coverage. The plan's `<verify>` block named exactly these two
existing suites — that contract is honoured.

## Self-Check: PASSED

- `server/src/schemas/bff.ts` modifications — FOUND (HistorySampleSchema, type, history field, all greps match)
- `server/src/routes/live.ts` modifications — FOUND (4 sampler imports, HistorySample type import, derivedGameState===5/6 in new block, `history sample written` info, `history sampler failed` error, `history,` in return literal)
- `server/src/schemas/valve.ts` — NOT modified (correct; `git diff HEAD~2 HEAD -- server/src/schemas/valve.ts` empty)
- Commit `05c580a` (feat 10-02 schema) — FOUND
- Commit `5a705a7` (feat 10-02 route) — FOUND
- `npx tsc --noEmit` (server + client) — clean
- `historySampler.test.ts` — 18/18 green
- `live.roshan.test.ts` — 6/6 green

## Files

- `server/src/schemas/bff.ts` (+15 LOC, MODIFIED — HistorySampleSchema, history field, HistorySample type)
- `server/src/routes/live.ts` (+38 LOC, MODIFIED — imports + inline sampler block + return-literal field)

## Commits

- `05c580a` feat(10-02): extend EnrichedLiveGameSchema with history field
- `5a705a7` feat(10-02): graft history sampler piggyback into /api/live/games
