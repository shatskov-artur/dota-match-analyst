---
phase: 10-historical-graphs
verified: 2026-05-09T15:40:00Z
status: human_needed
score: 5/5 must-haves verified (automated)
overrides_applied: 0
human_verification:
  - test: "Open a live in-game match and wait 60+ seconds. Confirm the HistoryGraphs section below the match scoreboard shows a dual-chart panel (gold lead and XP lead) with at least 2 data points, symmetric Y-axis, and a working hover tooltip."
    expected: "Two stacked SVG line charts appear with green/red filled areas, MM:SS X-axis ticks, and a tooltip on mouse-hover showing time plus Radiant/Dire lead values."
    why_human: "Charts only render once Redis has accumulated >= 2 samples from real live-game polling. JSDOM cannot verify real SVG rendering quality or correct data flow from Valve -> Redis -> BFF -> client."
  - test: "Watch the HistoryGraphs section for 30s immediately after opening a fresh match. Confirm it shows the skeleton state with the Russian countdown text 'Накапливаем историю… (N/30с)' and that N ticks upward once per second."
    expected: "Skeleton block fills the section height with centered Russian text counting from 0 to 30 over 30 seconds, then the game's current-window offset resets."
    why_human: "1Hz tick behavior requires real timer observation; fake timers in tests verify the mechanism but not visual rendering."
  - test: "After a match ends (game_state === 6), reload the match page. Confirm the HistoryGraphs section shows the skeleton state, not stale chart data."
    expected: "Skeleton shown on fresh page load after Redis cleanup. The last-session chart may still show if not reloaded (D-25 — accepted behavior)."
    why_human: "Requires a real match to end and Redis DEL to fire; cannot simulate with unit tests."
---

# Phase 10: Historical Graphs Verification Report

**Phase Goal:** A user sees how the gold lead and XP lead have evolved over the course of the game as line charts, giving context to whether the current lead is growing, shrinking, or stable.
**Verified:** 2026-05-09T15:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Gold diff line chart shows the full history from game start to current time | VERIFIED | `buildSample` computes `gold = sumNwR - sumNwD`; Redis list grows via `tryWriteSample` (RPUSH) with LTRIM cap at 240; `readHistory` returns the full list; client renders polyline over the full `tMin..tMax` window. Chart component verified at L1-L4. |
| 2 | XP diff line chart shown alongside or below gold chart | VERIFIED | HistoryGraphs.tsx renders two `<svg>` elements stacked vertically (gold on top, XP below). "XP lead (approx.)" label present per D-17. Two polylines confirmed in RTL test `container.querySelectorAll('polyline').length === 2`. |
| 3 | Charts update every 30s with new data points appended | VERIFIED | History piggybacks on the existing `/api/live/games` 30s polling cycle (D-05, D-20). No new endpoint. `useMatchDetail` `refetchInterval: 30_000` confirmed in hook source. `history` field flows from `match?.history ?? []`. `tryWriteSample` NX-gated at 5s throttle, so a new point is appended at most once per 5s window but typically once per 30s poll. |
| 4 | No data persists in Redis after match ends (TTL or explicit cleanup) | VERIFIED | Two cleanup paths confirmed in source: (a) `deleteHistory(matchId)` called when `derivedGameState === 6` (live.ts line 161-163); (b) 7200s TTL refreshed on every write (EXPIRE in tryWriteSample) — belt-and-suspenders. Unit test covers DEL of both `timeseries:{id}` and `lastSample:{id}`. |
| 5 | Charts render a loading/empty state gracefully for the first 30s before history accumulates | VERIFIED | `HistoryGraphs` early-returns `<SkeletonHistoryBlock>` when `history.length < 2` (single-point edge case also stays in skeleton per D-24). Skeleton has fixed height (380px) to prevent CLS. 1Hz elapsed counter ticks via `setInterval`. RTL test with fake timers confirms counter text persists after 2s without crash. |

**Score:** 5/5 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/services/historySampler.ts` | Pure `buildSample` + `tryWriteSample` + `readHistory` + `deleteHistory` + `HistorySample` type | VERIFIED | All 5 exports present; constants TTL_SECONDS=7200, TIMESERIES_LIMIT=240, SAMPLE_GATE_SECONDS=5; uses pino logger; no console.log; no throw to caller. |
| `server/src/services/historySampler.test.ts` | 18 unit tests covering aggregator math, NX-gate throttle, LTRIM/EXPIRE chain, graceful redis-null | VERIFIED | 18 tests — all pass green. |
| `server/src/schemas/bff.ts` | `HistorySampleSchema` + `HistorySample` type + `EnrichedLiveGameSchema.history` field | VERIFIED | `HistorySampleSchema` with `{t: int >= 0, gold: int, xp: int}`; `history: z.array(HistorySampleSchema)` required (not nullable) on `EnrichedLiveGameSchema`. |
| `server/src/routes/live.ts` | Inline sampler piggyback (tryWriteSample on state 5, deleteHistory on state 6, readHistory always, fire-and-forget) | VERIFIED | History block at lines 155-188; wrapped in try/catch; `history` defaults to `[]`; attached to return object at line 198. |
| `client/src/components/HistoryGraphs.tsx` | Self-gating dual-SVG chart with skeleton, tooltip, symmetric Y, palette compliance | VERIFIED | 387 lines; skeleton with 1Hz Russian counter; 2 SVG charts when `history.length >= 2`; `fillOpacity={0.15}`; `pointerEvents: 'none'` on tooltip; `position: 'relative'` on wrapper; no `overflow: hidden`; no chart libs; no `@shared` imports. |
| `client/src/components/HistoryGraphs.test.tsx` | 11 RTL tests covering skeleton, tick, dual polylines, XP label, symmetric Y, Y-axis format, X-axis ticks, tooltip prefix, mouseLeave | VERIFIED | All 11 tests pass green. |
| `client/src/hooks/useMatchDetail.ts` | `history: match?.history ?? []` in return object | VERIFIED | Line 66 confirmed; no new `useQuery` added; existing fields unchanged. |
| `client/src/pages/MatchPage.tsx` | `<HistoryGraphs>` mounted below BuildingsSection, receives `history`, `gameDuration`, `gameState` | VERIFIED | Import at line 17; `history` destructured from hook at line 21; `<section style={{ marginTop: 16 }}><HistoryGraphs ...>` at lines 172-179; no existing siblings reordered. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `historySampler.ts` | `cache.ts` | `import { redis }` | WIRED | Import confirmed line 1 |
| `historySampler.ts` | `logger.ts` | `import { logger }` | WIRED | Import confirmed line 2; pino logger used in all 3 catch blocks |
| `live.ts` | `historySampler.ts` | named imports `{ readHistory, tryWriteSample, deleteHistory, buildSample }` | WIRED | Line 11 in live.ts |
| `live.ts` | `bff.ts` | `import type { HistorySample }` | WIRED | Line 12; `let history: HistorySample[] = []` in handler |
| `EnrichedLiveGameSchema` | every enriched game object | `history` field always present | WIRED | `history,` on line 198 of live.ts return literal |
| `MatchPage.tsx` | `HistoryGraphs.tsx` | `import HistoryGraphs from '../components/HistoryGraphs'` | WIRED | Line 17 of MatchPage.tsx |
| `MatchPage.tsx` | `useMatchDetail.ts` | `history` destructured from hook | WIRED | Line 21: `const { match, ..., history, ... } = useMatchDetail(matchId)` |
| `HistoryGraphs.tsx` | palette constants | color values from existing palette | WIRED | `#4ade80`, `#ef4444`, `#0f0f0f`, `#d8d8d8`, `#888888` all used |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `HistoryGraphs.tsx` | `history` prop | `useMatchDetail` → `match?.history` → BFF `/api/live/games` → `readHistory(matchId)` → Redis `LRANGE timeseries:{matchId}` | Yes — Redis list populated by `tryWriteSample` on each `game_state === 5` polling pass from real Valve API data | FLOWING |
| `buildSample` in `live.ts` | `gold`, `xp`, `t` | `g.scoreboard.{radiant,dire}.players[].net_worth` and `xpm` from Valve API (`.passthrough()` schema) | Yes — summed from actual Valve player scoreboard fields | FLOWING |

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| `buildSample` computes Radiant-positive gold with 5v5 net_worth | Unit test: Radiant 5000, Dire 3000 → `gold: 2000` | Pass (vitest 18/18) | PASS |
| `tryWriteSample` NX-gating prevents duplicate writes | Unit test: gate held → rpush not called | Pass | PASS |
| `deleteHistory` on game_state===6 removes both Redis keys | Unit test: `del` called with both key names | Pass | PASS |
| `HistoryGraphs` skeleton with `history: []` | RTL: `/Накапливаем историю/` text in DOM | Pass (vitest 11/11) | PASS |
| Two SVG polylines with `history.length >= 2` | RTL: `querySelectorAll('polyline').length === 2` | Pass | PASS |
| Tooltip shows Radiant prefix on positive gold | RTL: mouseMove → `/Radiant \+\d+\.\dk gold/` | Pass | PASS |
| Tooltip shows Dire prefix on negative gold | RTL: mouseMove → `/Dire \+\d+\.\dk gold/` | Pass | PASS |
| Server TypeScript compilation | `npx tsc --noEmit` in server/ | Exit 0 | PASS |
| Client TypeScript compilation | `npx tsc --noEmit` in client/ | Exit 0 | PASS |
| Full server test suite (92 tests) | `npx vitest run` in server/ | 10/10 files, 92/92 tests green | PASS |
| Full client test suite (103 tests) | `npx vitest run` in client/ | 15/15 files, 103/103 tests green | PASS |

### Requirements Coverage

Phase 10 has no assigned REQ-IDs in REQUIREMENTS.md (listed as TBD in ROADMAP). All 5 success criteria from the roadmap are verified above.

### Anti-Patterns Found

| File | Issue | Severity | Assessment |
|------|-------|----------|-----------|
| `server/src/routes/live.roshan.test.ts` (test output) | History sampler's Redis calls log errors during Roshan route tests because the test's mock doesn't stub historySampler's redis methods | Info | Not a code defect — the sampler's try/catch swallows the errors, all 6 Roshan tests still pass. The test isolation is intentional: historySampler.test.ts tests the sampler, live.roshan.test.ts tests the Roshan route. The noise can be eliminated by adding history sampler mock stubs to live.roshan.test.ts, but it is not a blocker. |

No stub patterns, no placeholder returns, no hardcoded empty arrays flowing to rendering, no chart library imports, no console.log in production code.

### Human Verification Required

1. **Live dual-chart render**

   **Test:** Open a live in-game match that has been running for at least 60 seconds. Scroll to the bottom of the MatchPage.
   **Expected:** A dark panel ("Историческая динамика") appears with two stacked SVG line charts — gold lead on top, XP lead below. The gold chart shows a green-filled area above the zero axis when Radiant leads and a red-filled area below when Dire leads. Hovering the mouse over either chart shows a crosshair and a tooltip like `12:30 — Radiant +4.2k gold, +1.8k xp`.
   **Why human:** Charts only appear when Redis has at least 2 samples accumulated from real Valve API polling. Unit tests use synthetic data; visual correctness of SVG rendering requires browser observation.

2. **Skeleton countdown behavior**

   **Test:** Open a match within the first 30 seconds of it becoming live (or immediately after a server restart). Observe the HistoryGraphs section before any samples accumulate.
   **Expected:** A dark placeholder block with the text "Накапливаем историю… (N/30с)" where N increments by 1 each second.
   **Why human:** The 1Hz tick is driven by `setInterval` inside `SkeletonHistoryBlock`. Unit tests with fake timers verify the mechanism but visual verification of the real-browser behavior is needed.

3. **Post-game cleanup**

   **Test:** After a match ends (team nexus destroyed), wait 60 seconds then reload the match page.
   **Expected:** The HistoryGraphs section shows the skeleton state (no chart data), confirming `deleteHistory` ran on `game_state === 6` and the Redis list was cleared.
   **Why human:** Requires a real match completion event; cannot simulate Redis DEL + TTL expiry in automated tests without a running Redis instance.

### Gaps Summary

No automated gaps found. All 5 success criteria are verified at L1 (exists), L2 (substantive), L3 (wired), and L4 (data flowing) levels. The 3 human verification items are routine UI/behavior checks that require a live Valve API match — they do not indicate code defects.

**Notable observation (info, not a gap):** The `live.roshan.test.ts` integration test produces stderr logs from the history sampler's error catch blocks because the Roshan route mock stubs Redis with a simplified object that lacks `rpush`/`lrange`. The sampler catches these gracefully (fire-and-forget, D-09) and the 6 Roshan tests all pass. This is a test-noise issue, not a production code issue. The fix (adding history sampler stubs to the Roshan route test) is a low-priority cleanup item for Phase 11.

---

_Verified: 2026-05-09T15:40:00Z_
_Verifier: Claude (gsd-verifier)_
