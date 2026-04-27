---
status: complete
phase: 06-win-probability
source: [06-VERIFICATION.md]
started: 2026-04-27T17:24:00Z
updated: 2026-04-27T17:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Gold and Est. bars render for in-game match past 5 minutes
expected: Gold bar and Est. bar both visible with labels, percentage numbers on both sides, gradient coloring. Stratz bar absent (most non-TI/DPC matches return null from Stratz).
result: pass

### 2. Panel absent before 5 minutes or not in-game
expected: Win probability panel is entirely absent — no vertical space consumed
result: pass

### 3. Stratz bar renders alongside Gold and Est. for a major tournament match
expected: Three bars render. Stratz bar shows the ML-model value. Gold and Est. bars show heuristic values.
result: skipped
reason: No live TI/DPC Major match available to test — Stratz only covers those tournaments. Stratz conditional render logic verified by code review (stratz !== null guard in WinProbBar.tsx).

## Summary

total: 3
passed: 2
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps
