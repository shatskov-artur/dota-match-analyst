---
phase: 04-draft-ux
reviewed: 2026-04-24T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - server/src/schemas/valve.ts
  - server/src/services/valveApi.ts
  - server/src/routes/live.ts
  - client/src/hooks/useDraftDetail.ts
  - client/src/utils/draftOrder.ts
  - client/src/components/DraftPortrait.tsx
  - client/src/components/DraftColumn.tsx
  - client/src/components/DraftTurnIndicator.tsx
  - client/src/components/DraftSection.tsx
  - client/src/components/DraftTimeline.tsx
  - client/src/utils/gameState.ts
  - client/src/utils/gameState.test.ts
  - client/src/hooks/useLiveGames.ts
  - client/src/components/StatusTag.tsx
  - client/src/components/MatchRow.tsx
  - client/src/components/LeagueAccordion.tsx
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The draft UX phase delivers a well-structured, defensively coded implementation. Zod schemas use `.passthrough()` throughout, the dual-cache-key pattern (30s home vs. 4s draft) is correctly isolated, and the CM 7.40 sequence logic is accurate and unit-testable. The `DraftTimeline` (primary path) is sound.

Four bugs require attention before shipping. The two most impactful are rendering issues in `MatchRow.tsx`: the hover ember bar is misposititioned because its parent lacks `position: relative`, and the `borderLeftColor` manipulation targets a non-existent left border. The third is a silent feature gap in the `DraftColumn` fallback path — the active-slot pulse never fires because `DraftSection` never derives and passes `activePickIndex`/`activeBanIndex`. The fourth is a missing error boundary in the `/draft/:matchId` route — unhandled Valve/Zod errors produce stack trace 500s that contradict the stated security invariant.

---

## Warnings

### WR-01: Active-slot pulse is dead in the DraftColumn fallback path

**File:** `client/src/components/DraftSection.tsx:57-71`

`DraftSection` renders two `DraftColumn` components when `firstPickTeam` is ambiguous. `DraftColumn` accepts `activePickIndex` and `activeBanIndex` to determine which individual slot receives `isActive=true` and pulses. `DraftSection` knows `action` (`'pick' | 'ban' | null`) and `activeTeam`, and already computes `currentStep`, but never derives and passes these indices. Both default to `-1`, so `i === -1` is never true and no slot ever pulses in the fallback.

**Fix:** Derive the per-team slot index from the existing data and pass it down.

```tsx
// In DraftSection, after computing currentStep and firstPickTeam:
const radiantPickCount = radiantPicks.length
const radiantBanCount  = radiantBans.length
const direPickCount    = direPicks.length
const direBanCount     = direBans.length

// Only meaningful when draft is live and team/action are known
const activeRadiantPickIndex =
  isDraft && activeTeam === 'radiant' && action === 'pick' ? radiantPickCount : -1
const activeRadiantBanIndex  =
  isDraft && activeTeam === 'radiant' && action === 'ban'  ? radiantBanCount  : -1
const activeDirePickIndex =
  isDraft && activeTeam === 'dire' && action === 'pick' ? direPickCount : -1
const activeDireBanIndex  =
  isDraft && activeTeam === 'dire' && action === 'ban'  ? direBanCount  : -1

// Then pass to each DraftColumn:
<DraftColumn
  team="radiant"
  picks={radiantPicks}
  bans={radiantBans}
  isActive={activeTeam === 'radiant' && isDraft}
  tentative={tentative && activeTeam === 'radiant'}
  activePickIndex={activeRadiantPickIndex}
  activeBanIndex={activeRadiantBanIndex}
/>
<DraftColumn
  team="dire"
  picks={direPicks}
  bans={direBans}
  isActive={activeTeam === 'dire' && isDraft}
  tentative={tentative && activeTeam === 'dire'}
  activePickIndex={activeDirePickIndex}
  activeBanIndex={activeDireBanIndex}
/>
```

---

### WR-02: Unhandled errors in `/draft/:matchId` expose stack traces (contradicts security invariant)

**File:** `server/src/routes/live.ts:60-78`

The security comment on the route explicitly states "error responses return a constant string — no stack traces, no upstream error details, no Valve URL." However, `getLiveLeagueGamesFast()` can throw (Valve API network error, non-ok HTTP status, or ZodError on schema drift). These exceptions propagate unhandled to Hono's default error handler, which in Node.js mode returns a plaintext stack trace in the 500 response. This violates the stated T-04-I2 invariant and may expose internal paths.

The same issue exists in the `/games` route (line 16-38) but is lower severity because its error path does not involve the draft-specific Valve API key exposure risk.

**Fix:** Wrap the upstream call in a try/catch and return a constant error body.

```typescript
liveRoutes.get('/draft/:matchId', async (c) => {
  const rawMatchId = c.req.param('matchId')
  const parsedId = Number(rawMatchId)
  if (!Number.isFinite(parsedId)) {
    return c.json({ error: 'Invalid matchId' }, 400)
  }

  let data
  try {
    data = await getLiveLeagueGamesFast()
  } catch {
    return c.json({ error: 'Upstream unavailable' }, 503)
  }

  const game = data.result.games?.find((g) => g.match_id === parsedId)
  if (!game) {
    return c.json({ error: 'Match not live' }, 404)
  }

  return c.json({
    match_id: game.match_id,
    game_state: game.game_state,
    scoreboard: game.scoreboard,
  })
})
```

---

### WR-03: MatchRow hover ember bar is misposititioned — parent has no `position: relative`

**File:** `client/src/components/MatchRow.tsx:34-37`

The inner `<span className="absolute left-0 w-[2px] h-full" ...>` is absolutely positioned, but its parent `<Link>` has no `relative` class and no `position: relative` inline style. Without a positioned ancestor, the span positions relative to the nearest positioned ancestor in the DOM tree (likely the `<body>` or a parent layout element), not relative to the row. On hover the bar will render at the wrong location and at the wrong height.

Additionally, lines 26 and 30 mutate `borderLeftColor` on the `Link` element, but the Link has no left border (`border-b border-[#1a1a1a]` only). Changing `borderLeftColor` on an element with `border-width: 0` on the left side has no visible effect.

**Fix:**

```tsx
// Add `relative` to the Link className so the accent span positions correctly:
<Link
  to={`/match/${game.match_id}`}
  className="relative group flex items-center gap-6 px-8 min-h-[52px] border-b border-[#1a1a1a] cursor-pointer block"
  ...
>

// Remove the borderLeftColor manipulation (it has no effect) and instead
// drive the accent bar color via the onMouseEnter/Leave callbacks targeting
// the span directly, or use a Tailwind group-hover variant on the span:
<span
  className="absolute left-0 top-0 w-[2px] h-full transition-[background] duration-[160ms] ease group-hover:bg-[#b03030]"
  style={{ background: 'transparent' }}
/>
```

---

### WR-04: `useLiveGames` response is cast without runtime validation — shape drift silently produces undefined

**File:** `client/src/hooks/useLiveGames.ts:54-55`

```typescript
async function fetchLiveGames(): Promise<LiveGamesResponse> {
  const res = await fetch('/api/live/games')
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<LiveGamesResponse>
}
```

`res.json() as Promise<LiveGamesResponse>` is a TypeScript-only cast with no runtime check. If the BFF changes the response shape (e.g., renames `games` to `matches`), callers receive `undefined` for `query.data?.games` and the grouped array silently becomes empty, with no error surfaced. The same pattern appears in `useDraftDetail.ts:33-35` (`fetchDraft`).

This is particularly sharp here because downstream code does `query.data?.games ?? []` — valid TypeScript, but silently hides the breakage.

**Fix:** Add a minimal runtime guard. A full zod parse is ideal; a cheap duck-type check is acceptable at this phase:

```typescript
async function fetchLiveGames(): Promise<LiveGamesResponse> {
  const res = await fetch('/api/live/games')
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  const data = await res.json() as unknown
  if (typeof data !== 'object' || data === null || !Array.isArray((data as Record<string, unknown>).games)) {
    throw new Error('Unexpected /api/live/games response shape')
  }
  return data as LiveGamesResponse
}
```

---

## Info

### IN-01: `getPhaseName` "Draft Complete" branch is unreachable

**File:** `client/src/components/DraftTurnIndicator.tsx:22-30`

`getPhaseName` returns `'Draft Complete'` when `step >= 24`. However, `DraftTurnIndicator` already returns `null` on line 48 when `gameState !== 2` — once the draft finishes, `gameState` transitions to 5 (in-game) and the component unmounts. The `>= 24` branch will never be reached in practice. This is dead code that creates a misleading label if conditions change.

**Fix:** Either remove the final branch and let it fall through to `'Pick Phase 3'`, or add a comment explaining why it is kept as a defensive default. If kept, it signals the caller is violating the precondition.

```typescript
function getPhaseName(step: number): string {
  if (step < 7)  return 'Ban Phase 1'
  if (step < 11) return 'Pick Phase 1'
  if (step < 16) return 'Ban Phase 2'
  if (step < 20) return 'Pick Phase 2'
  if (step < 22) return 'Ban Phase 3'
  return 'Pick Phase 3' // covers steps 22–23; step >= 24 unreachable (game_state !== 2)
}
```

---

### IN-02: Stale TODO comment in `useLiveGames`

**File:** `client/src/hooks/useLiveGames.ts:88`

```typescript
refetchInterval: 30_000, // v5: plain number only — Phase 4 upgrades to dynamic callback
```

Phase 4 is now complete. The comment still refers to a pending Phase 4 upgrade that has already shipped (in `useDraftDetail.ts` using the dynamic callback correctly). This comment is misleading and should be updated to reflect the final design choice for the home-page hook (plain number by design, not a TODO).

**Fix:**
```typescript
refetchInterval: 30_000, // plain number — home-page polling does not need dynamic cadence
```

---

### IN-03: `borderLeftColor` hover manipulation targets a non-existent border dimension (also noted in WR-03)

**File:** `client/src/components/MatchRow.tsx:26,30`

This is the second aspect of the WR-03 bug. `style.borderLeftColor` is set on an element that only has `border-b` (bottom border). Even after fixing the `relative` positioning (WR-03 fix), the `borderLeftColor` manipulation will remain silently inert. The accent bar approach via the child `<span>` is the correct mechanism — the `borderLeftColor` lines should be removed from both `onMouseEnter` and `onMouseLeave` to avoid confusion.

**Fix:** Remove lines 26 and 30 from the event handlers.

---

_Reviewed: 2026-04-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
