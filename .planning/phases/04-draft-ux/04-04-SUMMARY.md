---
phase: 04-draft-ux
plan: 04
subsystem: client-ui
tags: [draft, ui, components, matchpage, phase-04, wave-3]
dependency_graph:
  requires:
    - 04-03 (useDraftDetail hook — DraftResponse / Scoreboard / DraftItem types, inference fields)
    - 04-02 (BFF /api/live/draft/:matchId route + TTL.DRAFT)
    - 04-01 (draftOrder pure util — consumed transitively via hook)
  provides:
    - DraftPortrait (56×56 pick / ban / empty cell)
    - DraftColumn (team grid with 5 picks + 7 bans + prop-driven ember glow)
    - DraftTurnIndicator (10px uppercase text label with D-08 tentative variant)
    - DraftSection (top-level composition — turn indicator + two team columns)
    - MatchPage DraftSection mount between ScoreHeader and HeroPlayerGrid (D-03)
  affects:
    - client/src/pages/MatchPage.tsx (one additive JSX block + two new imports + one new hook call)
tech-stack:
  added: []
  patterns:
    - "Inline style objects for color tokens (04-UI-SPEC convention — Tailwind classes for layout, inline style for semantic color values)"
    - "Array.from padding idiom to always render 5+7 slots regardless of payload length (D-02 progress tracker)"
    - "Prop-driven active state (DraftSection computes isActive/tentative, DraftColumn renders — no child-side derivation)"
    - "SVG overlay with aria-hidden + pointer-events-none (decorative ban X per UI-SPEC §Accessibility)"
    - "Em-dash (—) separator in copy strings — 04-UI-SPEC §Copywriting convention carried forward from Phase 2/3"
key-files:
  created:
    - client/src/components/DraftPortrait.tsx         # 62 lines
    - client/src/components/DraftColumn.tsx            # 72 lines
    - client/src/components/DraftTurnIndicator.tsx     # 53 lines
    - client/src/components/DraftSection.tsx           # 61 lines
  modified:
    - client/src/pages/MatchPage.tsx                   # +14 lines (imports + hook call + JSX block)
decisions:
  - "Portrait border-radius: rounded-sm (Tailwind default 2px) — matches PlayerRow.tsx precedent for hero portraits, not specified by UI-SPEC"
  - "Ember glow transition timing: 160ms ease — copied verbatim from MatchRow.tsx:23 hover pattern (not invented)"
  - "Row gap inside a DraftColumn: gap-1 (4px) — UI-SPEC §Spacing Scale xs token, keeps the 5+7 grid scanable at 56px portrait size"
  - "HeroPlayerGrid comment 'D-01 section order step 3' left intact (not renumbered to step 4) — plan action explicitly deferred comment churn to preserve git-blame archaeology"
metrics:
  duration_sec: 519
  duration_human: "~8.6 minutes (executor wall clock)"
  completed_date: 2026-04-24
  commits: 5
  tasks_completed: 5
  tasks_total: 6                # Task 6 is the blocking human-verify checkpoint — pending
  files_created: 4
  files_modified: 1
---

# Phase 4 Plan 04: Draft UX — MatchPage Wiring Summary

**One-liner:** Four new Phase 4 components (`DraftPortrait`, `DraftColumn`, `DraftTurnIndicator`, `DraftSection`) built against the Plan 03 `useDraftDetail` hook, composed into `MatchPage` between `ScoreHeader` and `HeroPlayerGrid` per D-03. TypeScript clean, vite build clean, 46/46 client tests green.

## Status

**Tasks 1–5:** Complete. All commits green, all automated verification passed.
**Task 6:** Pending human verification — **orchestrator to drive**. See "Task 6 — Pending human verification" section below.

## Task Results

| # | Task                                                    | Commit      | Files                                             | Verify                             |
|---|---------------------------------------------------------|-------------|---------------------------------------------------|------------------------------------|
| 1 | Create `DraftPortrait.tsx` (56×56 pick/ban/empty cell)  | `8f741b2`   | `client/src/components/DraftPortrait.tsx`         | `tsc --noEmit` → exit 0            |
| 2 | Create `DraftColumn.tsx` (team grid + ember glow)       | `fbbe60b`   | `client/src/components/DraftColumn.tsx`           | `tsc --noEmit` → exit 0            |
| 3 | Create `DraftTurnIndicator.tsx` (10px label + tentative)| `d802fb4`   | `client/src/components/DraftTurnIndicator.tsx`    | `tsc --noEmit` → exit 0            |
| 4 | Create `DraftSection.tsx` (compose indicator + columns) | `8f45ef6`   | `client/src/components/DraftSection.tsx`          | `tsc --noEmit` → exit 0            |
| 5 | Wire into `MatchPage.tsx` (D-03 section order)          | `b47f5be`   | `client/src/pages/MatchPage.tsx`                  | `tsc` + `vitest run` + `vite build`|

**Final verification output (Task 5):**

```
tsc --noEmit        → exit 0 (clean)
vitest run          → Test Files 6 passed (6) · Tests 46 passed (46) · Duration 2.16s
vite build          → 416 modules transformed · built in 1.88s
```

No test regressions; no new warnings introduced by this plan (the CSS `@import` ordering warning in `vite build` is pre-existing from Phase 2 and unrelated to Plan 04 work).

## Deviations from Plan

**None.** Plan executed exactly as written. No auto-fixes triggered (Rules 1–3 did not apply), no architectural decisions needed (Rule 4 did not apply), no authentication gates hit.

Every `<action>` block applied byte-faithfully — the four new files match the planner's code specs verbatim (including the inline comments documenting D-IDs, the 2px/160ms/ember values, and the "Do NOT" guardrails). MatchPage edit is purely additive (two new imports, one new hook call, one new JSX block). No existing lines altered.

## Decisions Made (Claude's Discretion within Plan Allowance)

The plan explicitly flagged several visual choices as Claude's-discretion in 04-CONTEXT.md §Claude's Discretion. Decisions made:

1. **Portrait border radius:** `rounded-sm` (Tailwind default 2px). Rationale: matches PlayerRow.tsx's existing portrait treatment for visual continuity; UI-SPEC does not specify an exact radius.
2. **Row gap within a column (picks row and bans row):** `gap-1` (4px, xs token). Rationale: UI-SPEC §Spacing Scale lists xs as "gap between portrait cells", and the 5+7 grid at 56px needs tight internal gaps to keep rows scannable.
3. **Section-to-section rhythm:** `mt-12` (48px, 2xl token) on the DraftSection wrapper — already specified by UI-SPEC §Spacing Scale and by the plan action, so no net discretion here.
4. **Ember glow timing:** `160ms ease` — this is NOT discretionary; copied verbatim from MatchRow.tsx:23 per 04-PATTERNS.md §Ember glow on active element. Documented here for traceability.
5. **Ban X overlay stroke details:** `stroke-width: 2`, `stroke-linecap: round`, `viewBox="0 0 24 24"`, `M4 4 L20 20` + `M20 4 L4 20` — all specified by UI-SPEC §Ban X Overlay Spec and by the plan action. Non-discretionary.
6. **HeroPlayerGrid comment preservation:** the existing comment `{/* HeroPlayerGrid — D-01 section order step 3 ... */}` was NOT renumbered to "step 4" even though Plan 04 inserts the new DraftSection as the new "step 3". Rationale: explicit plan action guidance ("leaving it avoids an unrelated comment churn that would break git-blame archaeology").

## Threat Model Compliance

Plan 04 threat register was light (T-04-T-04 tampering, T-04-D-06 broken imports). Both mitigations applied:

- **T-04-T-04 — hero_id tampering:** `heroMapper()` returns `null` for unknown/undefined/zero IDs (Phase 3 guarantee). `DraftPortrait` treats the null return as the empty-slot fallback — no exception can propagate.
- **T-04-D-06 — broken imports:** `cd client && npx tsc --noEmit` ran green after every task. `cd client && npx vite build` ran green after Task 5 (catches any JSX/import/type issue the end-to-end bundler path doesn't let slip past `tsc`).

No new threat surface introduced beyond what the register predicted. No HIGH severity threats. `grep -rn "@shared/heroMapper" client/src/` returns only guard-comments, never imports — Vite-safety preserved.

## Task 6 — Pending human verification (orchestrator to drive)

Task 6 in `04-04-PLAN.md` is `<task type="checkpoint:human-verify" gate="blocking">`. Orchestrator must ask the user to load a live drafting Dota 2 match in Chrome and confirm the following three ROADMAP success criteria by visual inspection + DevTools Network tab. The executor did NOT attempt to launch a browser or simulate this checkpoint.

### The three ROADMAP Phase 4 success criteria

Quoted verbatim from `04-04-PLAN.md` §Task 6 `<how-to-verify>`:

**Criterion 1 — DRAFT-01 (picks and bans render live):**

> With the page open on a live drafting match, you see two columns (Radiant green label left, Dire red label right). Each column has picks row (top, 5 slots) and bans row (below picks, 7 slots). Filled picks show a hero portrait (56×56). Filled bans show a hero portrait with a semi-transparent red X overlay. Empty slots show a bordered placeholder (#141414 fill, #1e1e1e border), same style for unused picks and unused bans. Open DevTools → Network tab, filter by "draft". You see `GET /api/live/draft/{matchId}` firing every ~5 seconds (4-6s window acceptable — BFF cache TTL is 4s). Watch for ~1 minute. When a new pick or ban happens in the live match, the UI updates within ~5-10 seconds.

**Criterion 2 — DRAFT-02 (turn indicator):**

> Above the draft grid, you see a centered 10px uppercase label. When the inference succeeds, the label reads one of: `RADIANT — PICKING`, `RADIANT — BANNING`, `DIRE — PICKING`, `DIRE — BANNING` (em-dash, not hyphen). Text color matches the active team (green or red). When first-pick is ambiguous, the label appends a trailing ` ?` and the color is muted (opacity 0.6). The active column has a DASHED left-edge ember border instead of solid. When inference cannot produce any guess at all, the label reads `DRAFT IN PROGRESS` in a muted grey (#303030). The active team's column shows an ember (#b03030) left-edge border with a subtle box-shadow glow. The inactive column has no border / no glow.

**Criterion 3 — Polling cadence:**

> Still in Network tab, observe the `/api/live/draft/:matchId` request rate. While `game_state === 2` (draft): requests fire every ~5 seconds. Navigate to a match in `game_state === 5` (in-game): draft grid persists (shows final 10 picks + 14 bans frozen), but the turn indicator disappears, and `/api/live/draft/:matchId` fires ONCE then stops (no recurring polling). Navigate to a `game_state === 6` (post-game) match: draft grid either persists or disappears. NO polling occurs. Confirm no zombie requests in Network tab.

### What the orchestrator should ask the user

1. Start the dev stack from repo root: `npm run dev` (starts Vite + Hono concurrently).
2. Open `http://localhost:5173/` — click any match with a "Draft" status tag (or navigate to `http://localhost:5173/match/{matchId}` directly).
3. With DevTools Network tab open (filter: "draft"), visually confirm the three criteria above.
4. Also confirm the regression/error-handling checks listed in `04-04-PLAN.md` §Task 6 checks #4 and #5 (Phase 2/3 unaffected; error-handling graceful when `/api/live/draft/*` blocked).
5. Reply "approved" if all checks pass, or describe the failure (which check, observed vs expected).
6. If no live tournament draft is happening at verification time, the `04-04-PLAN.md` `<resume-signal>` explicitly allows "approved — draft verification deferred" with the non-draft checks (polling-stops-in-game, regression guards, error handling) still required to pass.

## Self-Check: PASSED

Files exist:
- FOUND: `client/src/components/DraftPortrait.tsx`
- FOUND: `client/src/components/DraftColumn.tsx`
- FOUND: `client/src/components/DraftTurnIndicator.tsx`
- FOUND: `client/src/components/DraftSection.tsx`
- FOUND: `client/src/pages/MatchPage.tsx` (modified)

Commits reachable in `git log`:
- FOUND: `8f741b2` (Task 1: DraftPortrait)
- FOUND: `fbbe60b` (Task 2: DraftColumn)
- FOUND: `d802fb4` (Task 3: DraftTurnIndicator)
- FOUND: `8f45ef6` (Task 4: DraftSection)
- FOUND: `b47f5be` (Task 5: MatchPage wiring)

Verification commands re-run at summary time (documented values above):
- `tsc --noEmit` → exit 0
- `vitest run` → 46/46 tests passed
- `vite build` → 416 modules transformed, built in 1.88s

STATE.md, ROADMAP.md, REQUIREMENTS.md NOT modified by this executor — orchestrator handles tracking updates after Task 6 approval.
