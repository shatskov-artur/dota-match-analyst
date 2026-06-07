---
plan: 10-04
phase: 10
title: Final wiring — useMatchDetail surfacing + MatchPage HistoryGraphs mount
status: complete
completed: 2026-05-09
---

# Plan 10-04 — Final wiring (hook + MatchPage mount)

## Objective

Connect Phase 10 server-side time-series (Plans 01–02) to the client component (Plan 03) by:
1. Surfacing `history` through `useMatchDetail`.
2. Mounting `<HistoryGraphs>` on `MatchPage` at a user-approved slot — non-disruptive, layout-preserving.

## Tasks

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Surface `history` through `useMatchDetail` (and widen `EnrichedGame` client type) | ✅ | `ce36144` |
| 2 | **Checkpoint** — confirm mount placement with user (layout memory) | ✅ approved | — |
| 3 | Mount `<HistoryGraphs>` on `MatchPage` at approved slot | ✅ | `bf2a147` |

## Hook return shape

```ts
return {
  match,
  radiantPlayers,
  direPlayers,
  buildings,
  history: match?.history ?? [],   // NEW — always an array (D-20, D-25)
  isLoading: query.isLoading,
  gameState: match?.game_state,
}
```

The `?? []` fallback covers (a) loading state, (b) post-cleanup D-25 server response, (c) legacy cached payloads.

The duplicate client-side `EnrichedGame` interface in `client/src/hooks/useLiveGames.ts` was widened with an optional `history?: Array<{ t: number; gold: number; xp: number }>` to keep the type system aligned with the new server schema (the BFF schema lives in `server/src/schemas/bff.ts` and is not auto-imported by the client).

## Mount slot — **option B (user-overridden from default)**

The plan's default proposal was: between `<WinProbBar>` and `<DraftSection>`. The user **overrode** this to **option B — below `<BuildingsSection>` at the bottom of the page**. Final placement in `client/src/pages/MatchPage.tsx`:

```tsx
{/* BuildingsSection — full-width row below the two-column block (UI-SPEC) */}
{!buildings.unavailable && (
  <div className="mt-12">
    <BuildingsSection buildings={buildings} />
  </div>
)}

{/* Phase 10: historical graphs — self-gates internally (skeleton when history.length < 2) */}
<section style={{ marginTop: 16 }}>
  <HistoryGraphs
    history={history}
    gameDuration={match?.duration}
    gameState={match?.game_state}
  />
</section>
```

Diff is purely additive — no existing layout sibling restyled, reordered, or re-nested.

## Verification

- `cd client && npx tsc --noEmit`: clean (exit 0)
- `cd client && npx vitest run`: 15 files / **103 tests passed**, no regressions
- IDE diagnostics: clean after final commit
- Acceptance greps: all match (`import HistoryGraphs from`, `history={history}`, `gameDuration={match?.duration}`, `gameState={match?.game_state}`, `history` in `useMatchDetail` destructure)

## Layout-preservation memory compliance

`feedback_layout_preservation` honored:
- Explicit user checkpoint before any MatchPage edit.
- User chose alternative slot (option B), implemented exactly.
- Diff = 1 import + 1 destructure entry + 1 additive `<section>`. No siblings touched.

## D-25 graceful degradation

When `game_state === 6` and Redis cleanup ran (D-19 in Plan 02), the server returns `history: []`; HistoryGraphs self-gates to skeleton. Mid-match, `history` flows through untouched.
