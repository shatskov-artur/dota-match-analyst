---
status: partial
phase: 04-draft-ux
source: [04-VERIFICATION.md]
started: 2026-04-25T00:20:00Z
updated: 2026-04-25T00:20:00Z
---

## Current Test

Live draft visual + polling — deferred until a match enters draft phase (game_state === 2)

## Tests

### 1. Live draft visual + polling verification

expected: DraftSection renders between ScoreHeader and HeroPlayerGrid. If firstPickTeam is determinable (asymmetric ban counts ≥5): 24-slot DraftTimeline shows. Otherwise DraftColumn fallback shows. Hero portraits in filled slots, X overlay on bans, ember pulse on active slot. DraftTurnIndicator shows "RADIANT — PICKING" etc. Network tab shows /api/live/draft/:matchId every ~5s during draft.
result: [pending — no match was in draft phase during testing session]

### 2. Polling stop verification

expected: /api/live/draft/:matchId fires once then stops when navigating to a non-draft match. No zombie polling.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
