---
phase: 06-win-probability
verified: 2026-04-27T17:24:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open a match page in-game (gameState===5) with duration > 300 seconds"
    expected: "Gold bar and Est. bar both visible with labels, percentage numbers on both sides, gradient coloring. Stratz bar absent (most non-TI/DPC matches return null from Stratz)."
    why_human: "Visual rendering and gradient correctness cannot be confirmed programmatically; requires browser with a live match"
  - test: "Open a match page where duration <= 300 or not in-game"
    expected: "Win probability panel is entirely absent — no vertical space consumed"
    why_human: "Render gate behaviour is conditional on gameState and duration values from live Valve API"
  - test: "If a TI/DPC Major match is live, verify Stratz bar appears alongside Gold and Est."
    expected: "Three bars render. Stratz bar shows the ML-model value. Gold and Est. bars show heuristic values."
    why_human: "Stratz returns non-null only for major tournament matches — requires a live qualifying match"
---

# Phase 6 Gap Closure: Win Probability Verification Report

**Phase Goal:** A user watching a mid-to-late-game match sees a win-probability bar for any live match — powered by Stratz where available, falling back to a heuristic estimate otherwise. Gap closure: Gold and Est. bars always render past 5 minutes regardless of Stratz availability; three-bar panel implemented.
**Verified:** 2026-04-27T17:24:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/live/winprob/:matchId returns { stratz, gold, estimate } where gold and estimate are always numbers | VERIFIED | `server/src/routes/live.ts` lines 353-359: response shape confirmed with comments. `stratz: winProb`, `gold,`, `estimate,` all present. |
| 2 | computeGoldWinProb and computeEstWinProb are pure functions with deterministic outputs | VERIFIED | `winProbHeuristic.ts` lines 95-113: both functions are pure math — no side effects, no I/O, no state |
| 3 | sigmoid boundary: equal inputs produce ~0.508 (non-zero intercept 0.0335), not 0.5 | VERIFIED | Test "equal gold (diff=0) → returns sigmoid(0.0335) ≈ 0.508" passes. Intercept 0.0335 confirmed in implementation at line 96. |
| 4 | gold and estimate probabilities are clamped to [0.05, 0.95] — extreme values never shown | VERIFIED | `clamp()` function at lines 9-11 of winProbHeuristic.ts. Test "result is always between 0.05 and 0.95 inclusive" passes. computeGoldWinProb(100000) === 0.95, computeGoldWinProb(-100000) === 0.05 confirmed GREEN. |
| 5 | server tests pass for all heuristic edge cases | VERIFIED | `npx vitest run server/src/services/winProbHeuristic.test.ts` → 12/12 passing |
| 6 | Three stacked bars visible on any in-game match past 5 minutes, even when Stratz returns null | VERIFIED (code) | `WinProbBar.tsx`: panel gate `gameState !== 5 or duration <= 300` returns null; Gold and Est. SingleBars rendered unconditionally inside the panel. Stratz bar guarded by `{stratz !== null && ...}`. |
| 7 | Stratz bar is hidden when stratz field is null; Gold and Est. bars always render | VERIFIED | `WinProbBar.tsx` line 89: `{stratz !== null && <SingleBar label="Stratz" .../>}`. Gold/Est. SingleBars at lines 93-95 have no null guard. |
| 8 | Each bar shows label (Stratz/Gold/Est.) on left, percentage numbers on both sides, green/red gradient | VERIFIED | `SingleBar` component (lines 20-64): label span (color #888888), radiantPct% (color #4ade80), gradient bar div, direPct% (color #ef4444). All present. |
| 9 | Panel hidden entirely before 5 minutes (duration <= 300) or not in-game (gameState !== 5) | VERIFIED | Line 75: `if (gameState !== 5 || (gameDuration ?? 0) <= 300) { return null }` |

**Score:** 9/9 truths verified (automated code checks)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/services/winProbHeuristic.ts` | Pure heuristic computation functions | VERIFIED | 114 lines. Exports `extractScoreboardInputs`, `computeGoldWinProb`, `computeEstWinProb`. Substantive — full sigmoid + clamp + popcount implementation. |
| `server/src/services/winProbHeuristic.test.ts` | TDD test suite — 12 tests GREEN | VERIFIED | 141 lines. 3 describe blocks, 12 it blocks. All GREEN as of this verification. |
| `server/src/routes/live.ts` | Extended /winprob/:matchId response shape | VERIFIED | Lines 337-363: imports all three heuristic functions (line 9), computes inputs/gold/estimate, returns `{ stratz, gold, estimate, gameState, duration }`. |
| `client/src/hooks/useWinProbability.ts` | Updated WinProbResponse with stratz/gold/estimate fields | VERIFIED | Lines 4-10: `stratz: number | null`, `gold: number`, `estimate: number`. `radiantWinProb` absent (grep confirms 0 matches in client/src/). |
| `client/src/components/WinProbBar.tsx` | Three-bar WinProbPanel | VERIFIED | 99 lines. `WinProbBarProps` with stratz/gold/estimate. `SingleBar` internal component. `{stratz !== null && ...}` guard. Labels "Gold" and "Est." confirmed present. |
| `client/src/pages/MatchPage.tsx` | Updated prop passing to new WinProbBar interface | VERIFIED | Lines 73-79: `stratz={winProb.data?.stratz ?? null}`, `gold={winProb.data?.gold ?? 0.5}`, `estimate={winProb.data?.estimate ?? 0.5}`. `radiantWinProb` removed (0 matches). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/src/routes/live.ts` | `server/src/services/winProbHeuristic.ts` | `extractScoreboardInputs + computeGoldWinProb + computeEstWinProb` | WIRED | Import at line 9 of live.ts. All three functions called at lines 349-351. |
| `client/src/pages/MatchPage.tsx` | `client/src/components/WinProbBar.tsx` | `winProb.data?.stratz / .gold / .estimate props` | WIRED | Lines 73-79 pass all three props. Component imported at line 11. |
| `client/src/hooks/useWinProbability.ts` | `/api/live/winprob/:matchId` | `fetchWinProb fetch` | WIRED | Line 31: `fetch(\`/api/live/winprob/${matchId}\`)`. Consumed by `useWinProbability` hook used in MatchPage. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `WinProbBar.tsx` | `stratz`, `gold`, `estimate` props | `useWinProbability` hook → `/api/live/winprob/:matchId` BFF | Yes — server computes sigmoid from live Valve scoreboard data; Stratz from external ML model | FLOWING |
| `/winprob/:matchId` route | `gold`, `estimate` | `extractScoreboardInputs(game)` → `computeGoldWinProb` / `computeEstWinProb` | Yes — Valve `getLiveLeagueGamesFast()` provides scoreboard; defaults to zeros when absent (returns 0.508) | FLOWING |
| `/winprob/:matchId` route | `stratz` | `getWinProbability(parsedId)` → Stratz API | Yes — real Stratz ML model; returns null when match not tracked | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 12 heuristic unit tests pass | `npx vitest run server/src/services/winProbHeuristic.test.ts` | 12/12 passed, 1 file passed | PASS |
| computeGoldWinProb(0) returns ~0.508 | Covered by test suite above | 0.505 < result < 0.515 verified GREEN | PASS |
| computeEstWinProb clamped at 0.95 | Covered by test suite above | computeEstWinProb({5000,3,2,1}) === 0.95 verified GREEN | PASS |
| extractScoreboardInputs returns zeros for undefined | Covered by test suite above | `toEqual({ goldDiff:0, killDiff:0, towerAdv:0, raxAdv:0 })` GREEN | PASS |
| `radiantWinProb` removed from all client files | `grep "radiantWinProb" client/src/` | No matches found | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MATCH-06 | 06-06-PLAN, 06-07-PLAN | User can see win probability bar (Radiant vs Dire) powered by Stratz ML — hidden if Stratz unavailable or before 5 minutes | SATISFIED (code) | Three-bar panel implemented: Stratz bar conditional on non-null, Gold and Est. bars always shown when in-game past 5 min. Render gate verified at WinProbBar.tsx line 75. Human verification required for live visual confirmation. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODOs, FIXMEs, placeholder text, empty handlers, or hardcoded empty returns detected in any of the six key files.

### Human Verification Required

#### 1. Three-bar panel renders on a live in-game match past 5 minutes

**Test:** Navigate to a live match page where the match has been in progress for more than 5 minutes (duration > 300 seconds, game_state === 5).

**Expected:** Win probability panel is visible. Gold bar and Est. bar both render with their source labels on the left, Radiant percentage (green) on the left side, gradient bar in the middle, and Dire percentage (red) on the right side. Stratz bar is absent for most non-TI/DPC matches (Stratz returns null).

**Why human:** Visual rendering, gradient display correctness, and actual layout proportions cannot be confirmed programmatically. Requires a browser with a qualifying live Valve match active.

#### 2. Panel is absent before 5 minutes or outside game state 5

**Test:** Navigate to a match page that is in draft phase (game_state !== 5) or within the first 5 minutes of play (duration <= 300).

**Expected:** The win probability section is completely absent from the page with no empty vertical space or placeholder.

**Why human:** Requires live Valve match data in a controlled game state. The render gate logic is confirmed in code but live behavior depends on the actual Valve payload values received.

#### 3. Stratz bar appears when Stratz tracks the match

**Test:** If a TI, DPC Major, or other Stratz-tracked tournament match is live, navigate to its match page.

**Expected:** Three bars render simultaneously — Stratz (ML model), Gold (gold-only sigmoid), and Est. (multi-feature sigmoid) — each with their label and percentage values.

**Why human:** Stratz non-null responses only occur for specific tier-1 tournament matches. Cannot simulate the Stratz ML response programmatically without a qualifying live match.

### Gaps Summary

No gaps found. All server-side artifacts exist, are substantive, and are correctly wired. All client-side artifacts exist, are substantive, and receive real data through the prop chain. The test suite is GREEN (12/12). Three human verification items exist for visual/live-match confirmation of rendering behaviour — these are expected for a UI phase and do not indicate implementation defects.

**Note on test deviation:** The SUMMARY documents one intentional deviation from the plan spec — the test assertion for "+10,000 gold" was corrected from `toBe(0.95)` to `toBeGreaterThan(0.93) + toBeLessThan(0.945)` after discovering sigmoid(2.7035) ≈ 0.9372, which is below the 0.95 clamp ceiling. This is a plan spec math error, not an implementation bug. The implementation correctly does not clamp 0.9372 to 0.95.

---

_Verified: 2026-04-27T17:24:00Z_
_Verifier: Claude (gsd-verifier)_
