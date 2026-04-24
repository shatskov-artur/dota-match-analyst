---
status: approved
phase: 02-live-matches-list
source: [02-VERIFICATION.md]
started: 2026-04-24T01:42:00Z
updated: 2026-04-24T01:42:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Home page visual rendering
expected: Page title "Dota 2 Match Analyst" in green, match rows grouped by tournament in accordion sections (all expanded by default), each row shows team names, series score, status tag, and duration when available. Header shows "Updated H:MM AM/PM" timestamp. Clicking a row navigates to /match/:matchId with raw JSON dump and "DEV PLACEHOLDER — Phase 3 will replace this view." label.
result: [pending]

### 2. Auto-refresh timestamp update
expected: "Updated H:MM AM/PM" timestamp in the page header updates to a new time every ~30 seconds without any user interaction, confirming the TanStack Query refetchInterval: 30_000 polling is active.
result: [pending]

### 3. Error state — BFF unreachable
expected: When the backend server is stopped and a refetch cycle triggers, ErrorBanner appears with exact copy: "Could not load live matches — Valve API unreachable. Retrying in 30 seconds."
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
