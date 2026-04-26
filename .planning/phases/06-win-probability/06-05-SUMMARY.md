---
phase: 06-win-probability
plan: "05"
subsystem: client
tags: [win-probability, match-page, integration, bug-fix, status-label, game-time]
dependency_graph:
  requires:
    - plan 06-04 (useWinProbability hook + WinProbBar component)
  provides:
    - client/src/pages/MatchPage.tsx (WinProbBar wired end-to-end)
  affects:
    - Phase 6 user-facing feature complete
tech_stack:
  added: []
  patterns:
    - Self-gating component pattern — WinProbBar returns null when conditions not met
    - scoreboard.radiant.players[] presence to distinguish draft from in-game
key-files:
  modified:
    - client/src/pages/MatchPage.tsx
    - client/src/utils/gameState.ts
    - client/src/utils/gameState.test.ts
    - client/src/components/ScoreHeader.tsx
---

## What Was Built

### Plan 06-05 — Wire WinProbBar into MatchPage

**Primary task:** WinProbBar integrated as the single user-facing entry point for Phase 6.

`MatchPage.tsx` now:
- Imports `WinProbBar` and `useWinProbability`
- Calls `useWinProbability(matchId)` alongside existing hooks
- Renders `<WinProbBar radiantWinProb={winProb.data?.radiantWinProb ?? null} gameDuration={match?.duration} gameState={match?.game_state} />` between `ScoreHeader` and `DraftSection`
- WinProbBar is rendered unconditionally — it self-gates (returns null) when conditions not met

**Commits:** `c970330 feat(06-05): wire WinProbBar into MatchPage`

---

### Bug Fixes Found During Human Verification

**Bug 1 — Status label: draft matches shown as "Live" on home page**

Root cause: `getStatusLabel` had a fallback `if (scoreboard != null) return 'Live'`. Valve omits `game_state` during draft AND in-game — but scoreboard is populated in both phases (picks/bans during draft, player stats in-game). The fallback was too broad.

Fix: distinguish by `scoreboard.radiant.players[]` presence:
- players present → in-game → `'Live'`
- scoreboard present but no players (only picks/bans) → `'Draft'`

Also: `ScoreHeader` was not passing `scoreboard` to `getStatusLabel`, so the match page was always showing `'Unknown'` for matches with absent `game_state`. Fixed by adding `scoreboard` to the `ScoreHeaderProps` interface and passing it to `getStatusLabel`.

**Commits:** `84630a5 fix(status): distinguish draft from live when Valve omits game_state`

**Bug 2 — No game time visible**

Users had no way to know if a match had passed the 5-minute threshold required for the WinProbBar. Added `duration` field to `ScoreHeaderProps` and rendered `formatDuration(match.duration)` as a `"12:34"` style clock between the StatusTag and gold diff.

**Commits:** `b54c073 feat(score-header): show game time and fix status label for missing game_state`

---

## Verification

- `npx tsc --noEmit` — clean (0 errors)
- `npx vitest run` — 67/67 client tests pass, 38/38 server tests pass
- Acceptance criteria met:
  - `grep "WinProbBar" MatchPage.tsx` → import + JSX (2 lines)
  - `grep "useWinProbability" MatchPage.tsx` → import + hook call (2 lines)
  - `grep "gameDuration={match?.duration}"` → present (not game_time)
  - `grep "gameTime"` → 0 lines (forbidden field absent)
  - Status label correctly returns `'Draft'` for scoreboard-only matches

## Self-Check: PASSED
