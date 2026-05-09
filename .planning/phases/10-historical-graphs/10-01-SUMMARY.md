---
phase: 10-historical-graphs
plan: 01
subsystem: server/services
tags: [redis, time-series, sampler, server, dota, phase-10]
dependency-graph:
  requires:
    - server/src/cache.ts (redis instance)
    - server/src/logger.ts (pino logger)
  provides:
    - server/src/services/historySampler.ts (buildSample, tryWriteSample, readHistory, deleteHistory, HistorySample)
  affects: []
tech-stack:
  added: []
  patterns:
    - Pure aggregator + I/O wrappers (mirrors roshanState.ts shape)
    - NX-gated 5s write throttle (ioredis SET key val EX N NX)
    - LTRIM -N -1 cap + EXPIRE TTL refresh on every append
    - Fire-and-forget try/catch with pino logger.error fallback
key-files:
  created:
    - server/src/services/historySampler.ts
    - server/src/services/historySampler.test.ts
  modified: []
decisions:
  - "buildSample uses Math.floor(duration) for t and Math.round for xp diff (D-07, D-16)"
  - "Missing player.xpm/.net_worth coerce to 0 via ?? — never NaN (D-18)"
  - "All four wrappers short-circuit when redis === null (graceful degradation)"
  - "Logger swapped from console.error (roshanState) to logger.error (pino) per plan blueprint"
metrics:
  duration: "~10 min"
  tasks: 2
  files: 2
  completed: "2026-05-09"
---

# Phase 10 Plan 01: History Sampler Module Summary

History sampler service module added: pure `buildSample` aggregator plus
three Redis I/O wrappers (`tryWriteSample`, `readHistory`, `deleteHistory`)
that store `{t, gold, xp}` time-series points per `match_id` in a Redis
list, throttled by a 5s NX gate, capped at 240 points (LTRIM), with a 2h
TTL (EXPIRE refreshed on every write). Module is unconsumed at this stage;
Plan 02 will wire it into `/api/live/games`.

## Exported API

| Export | Kind | Signature |
|--------|------|-----------|
| `HistorySample` | type | `{ t: number; gold: number; xp: number }` |
| `buildSample` | pure fn | `(game) => HistorySample \| null` |
| `tryWriteSample` | async fn | `(matchId, sample) => Promise<boolean>` |
| `readHistory` | async fn | `(matchId) => Promise<HistorySample[]>` |
| `deleteHistory` | async fn | `(matchId) => Promise<void>` |

## Constants

| Constant | Value | Source decision |
|----------|-------|-----------------|
| `TTL_SECONDS` | `7200` (2h) | D-12 |
| `TIMESERIES_LIMIT` | `240` (~2h of 30s samples) | D-11 |
| `SAMPLE_GATE_SECONDS` | `5` | D-06 |
| `tsKey(id)` | `` `timeseries:${id}` `` | D-10 |
| `gateKey(id)` | `` `lastSample:${id}` `` | D-10 |

## Throttle / Cap Behaviour

`tryWriteSample` flow on the happy path (gate acquired):

1. `redis.set(gateKey, '1', 'EX', 5, 'NX')` → returns `'OK'` only when key absent.
2. `redis.rpush(tsKey, JSON.stringify(sample))` → append to list.
3. `redis.ltrim(tsKey, -240, -1)` → keep tail of last 240 entries (D-11).
4. `redis.expire(tsKey, 7200)` → refresh 2h TTL (D-12).
5. Return `true`.

When the gate is already held (concurrent viewers, same 5s window):
`set` returns `null` → return `false` immediately, no writes performed.

When `redis === null` (Upstash not configured): every wrapper short-circuits
without performing I/O. `tryWriteSample` returns `false`, `readHistory`
returns `[]`, `deleteHistory` returns `void` silently.

When any underlying call throws: caught by try/catch, logged via
`logger.error({ matchId, err })`, never propagated. This is the D-09
fire-and-forget contract: history failure must never break the live
response.

## Pure Aggregator

`buildSample` returns `null` when:
- `game_state !== 5` (only in-game produces samples; D-08)
- effective `duration` is `0` (no game clock yet; D-08)
- either `scoreboard.radiant.players` or `.dire.players` is empty/missing

Otherwise returns:
- `t = Math.floor(scoreboard.duration ?? duration)` (D-07)
- `gold = Σ net_worth_radiant − Σ net_worth_dire` (Radiant-positive)
- `xp = round(Σ(xpm × duration / 60)_radiant − Σ(xpm × duration / 60)_dire)` (D-15, D-16)

Missing `net_worth` or `xpm` fields contribute 0 (D-18) — undercount over
crash. `Math.round` keeps the xp value an integer for chart axis ticks.

## Test Coverage Matrix

| Area | Cases | File |
|------|-------|------|
| `buildSample` purity | 9 (game_state skip, duration 0/missing, scoreboard.duration fallback, empty teams, scoreboard absent, Radiant-positive gold, Dire-leading gold, xp formula, missing xpm coercion, floor(duration)) | historySampler.test.ts |
| `tryWriteSample` throttle/cap | 4 (gate held → no writes, gate acquired → RPUSH/LTRIM/EXPIRE order via `invocationCallOrder`, NX flag args, throw → returns false) | historySampler.test.ts |
| `readHistory` | 2 (LRANGE 0 -1 + JSON.parse, [] on throw) | historySampler.test.ts |
| `deleteHistory` | 2 (DEL both keys, swallow throw) | historySampler.test.ts |
| **Total** | **18 tests, all green** | |

```
Test Files  1 passed (1)
     Tests  18 passed (18)
```

## Verification

- `cd server && npx tsc --noEmit` exits 0 (no type errors).
- `cd server && npx vitest run src/services/historySampler.test.ts` exits 0; 18/18 green.
- `grep -rn "from.*historySampler" server/src/` returns only the test file —
  no consumer wired yet (route wiring is Plan 02, as planned).
- All acceptance-criteria grep patterns matched.

## Threat Mitigations Applied (from plan threat_model)

- **T-10-02 (DoS — unbounded list growth):** mitigated via `LTRIM -240 -1` (D-11) + `EXPIRE 7200` (D-12) + `NX 5s` write gate (D-06). Worst case ≈ 240 × 50 bytes ≈ 12KB per match.
- **T-10-04 (Info disclosure on JSON.parse):** mitigated — all parses inside try/catch; on throw returns `[]` and logs via pino server-side. No error string propagates outward.
- **T-10-05 (Repudiation — silent write failure):** mitigated — every catch block emits `logger.error({ matchId, err })` via pino structured logs.
- **T-10-06 (NaN/Infinity in math):** mitigated via `?? 0` coercion of `net_worth` and `xpm` plus `Math.round` on the xp diff.
- **T-10-01 (Tampering on key shape):** typed at boundary — `matchId: number` in TS strict mode prevents string-injection at this module's signatures; caller (Plan 02) gates on `typeof g.match_id === 'number'`.

## Deviations from Plan

None — plan executed exactly as written. The blueprint in 10-PATTERNS.md
specified `console.error` (mirroring roshanState.ts), but the plan's
Task 1 `<action>` and acceptance criteria explicitly require `logger.error`
(pino) with zero `console.*` hits. Implementation follows the explicit
Task 1 spec.

## Self-Check: PASSED

- `server/src/services/historySampler.ts` — FOUND
- `server/src/services/historySampler.test.ts` — FOUND
- Commit `ddf16b1` (feat: historySampler) — FOUND
- Commit `1669f31` (test: historySampler) — FOUND
- 18/18 tests green; `tsc --noEmit` clean.

## Files

- `server/src/services/historySampler.ts` (142 LOC, NEW)
- `server/src/services/historySampler.test.ts` (266 LOC, NEW)

## Commits

- `ddf16b1` feat(10-01): add historySampler service with pure aggregator + Redis I/O wrappers
- `1669f31` test(10-01): co-locate unit tests for historySampler
