---
status: complete
phase: 06-win-probability
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md]
started: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Win Probability Bar visible during active in-game match
expected: Open a match page for a match that is live and past the 5-minute mark (duration > 300s). Between the ScoreHeader and the DraftSection you should see a full-width horizontal bar split into two colors: green on the left (Radiant side) and red on the right (Dire side).
result: issue
reported: "Bar never appeared. Stratz only tracks TI/DPC Majors — regular league matches return null, bar is hidden. Heuristic fallback (Est. label using goldDiff/killDiff/towerAdv) was not implemented in plans 01-05."
severity: major

### 2. Win Probability Bar hidden during draft or early game
expected: Open a match page for a match in draft or duration ≤ 300s. The WinProbBar should NOT appear.
result: pass

### 3. Win Probability Bar hidden for finished matches
expected: Open a match page for a finished match (game_state 6). The WinProbBar should NOT appear.
result: pass

### 4. Status label shows "Draft" for drafting matches on home page
expected: Drafting matches show "Draft" badge, in-game matches show "Live".
result: pass

### 5. Game time displayed in ScoreHeader
expected: Active match page shows a clock "MM:SS" in the score header area.
result: pass

### 6. Graceful degradation when Stratz data is unavailable
expected: When Stratz returns null, WinProbBar does not appear and the rest of the page is unaffected.
result: pass

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "User sees a win-probability bar for every in-game match past 5 minutes, regardless of whether Stratz tracks it (ROADMAP success criterion 1)"
  status: failed
  reason: "Heuristic fallback not implemented. Stratz returns null for all matches except TI/DPC Majors. Bar never shows for regular league matches. ROADMAP.md already specifies the chosen approach: sigmoid(goldDiff, killDiff, towerAdv, barracksAdv) with 'Est.' label when Stratz is null."
  severity: major
  test: 1
  artifacts:
    - server/src/services/stratzApi.ts (getWinProbability — returns null passthrough, no heuristic)
    - server/src/routes/live.ts (winprob route — returns null, no fallback computation)
    - client/src/components/WinProbBar.tsx (self-gates on null, no Est. label)
  missing:
    - Heuristic win probability computation (goldDiff, killDiff, towerAdv, barracksAdv → sigmoid)
    - BFF endpoint returning {radiantWinProb, source: 'stratz'|'estimate'} with fallback
    - WinProbBar rendering "Est." vs "Stratz" source label
    - Server tests for heuristic computation
