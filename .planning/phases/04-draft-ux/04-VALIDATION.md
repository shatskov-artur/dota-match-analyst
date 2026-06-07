---
phase: 4
slug: draft-ux
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-24
updated: 2026-04-24
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 04-RESEARCH.md §Validation Architecture (lines 702+).
> Per-Task Verification Map populated by `/gsd-plan-phase 4`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (client and server both have `"test": "vitest"` in package.json; no explicit `vitest.config.ts` — uses Vitest defaults) |
| **Quick run command (server)** | `cd server && npx vitest run <test-path>` |
| **Quick run command (client)** | `cd client && npx vitest run <test-path>` |
| **Full suite command** | `cd client && npx vitest run && cd ../server && npx vitest run` |
| **TypeScript gate** | `cd client && npx tsc --noEmit` / `cd server && npx tsc --noEmit` |
| **Production build gate** | `cd client && npx vite build` (validates the full composed MatchPage at Plan 04 Task 5) |
| **Estimated runtime** | ~15 seconds (unit tests only); build adds ~10s |

**NOTE:** `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` are NOT installed in `client/package.json` (verified). Per 04-PATTERNS.md advisory, Phase 4 tests are PURE-FUNCTION tests only. Component visual behavior is verified via the human checkpoint in Plan 04 Task 6.

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the touched file (≤ 10s feedback).
- **After every plan wave:** Run the full suite command (≤ 20s feedback).
- **Before `/gsd-verify-work`:** Full suite must be green + human checkpoint (Plan 04 Task 6) approved.
- **Max feedback latency:** 20 seconds.

---

## Per-Task Verification Map

Task IDs use the format `4-{plan}-{task}`. "File Exists" indicates whether the target test file existed at the start of the task (W0 = created this wave).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 04-01 | 0 | DRAFT-01 | T-04-T-01 | Zod schema parses nested scoreboard + passes through unknown fields; rejects no structurally-valid payload | unit | `cd server && npx vitest run src/schemas/valve.test.ts` | ✅ W0 | ⬜ red (expected) |
| 4-01-02 | 04-01 | 0 | DRAFT-02 | T-04-T-03 | `inferActiveTeam` returns correct team/action at each of 24 CM 7.40 steps (both first-pick orientations) and `null` for ambiguity or completion | unit | `cd client && npx vitest run src/utils/draftOrder.test.ts` | ✅ W0 | ⬜ red (expected) |
| 4-01-03 | 04-01 | 0 | DRAFT-01 | T-04-D-03 | `computeDraftInterval` returns 5000 when game_state === 2, false otherwise (especially game_state === 6 per CLAUDE.md) | unit | `cd client && npx vitest run src/hooks/useDraftDetail.test.ts` | ✅ W0 | ⬜ red (expected) |
| 4-02-01 | 04-02 | 1 | DRAFT-01 | T-04-T-01 | Schema extension turns 4-01-01 GREEN; `.passthrough()` preserved on 3 new schemas; no regression on existing tests | unit | `cd server && npx vitest run src/schemas/valve.test.ts && npx vitest run src/cache.test.ts` | ✅ | ⬜ pending |
| 4-02-02 | 04-02 | 1 | DRAFT-01 | T-04-D-02, T-04-I-01 | `getLiveLeagueGamesFast()` uses distinct cache key `'live_games:draft'` (no collision with 30s `live_games`); cache tests remain green | unit + typecheck | `cd server && npx tsc --noEmit && npx vitest run src/cache.test.ts` | ✅ | ⬜ pending |
| 4-02-03 | 04-02 | 1 | DRAFT-01 | T-04-S-01, T-04-I-02, T-04-D-01 | `GET /api/live/draft/:matchId` validates matchId (400 for non-numeric); returns 404 for non-live; returns `{match_id,game_state,scoreboard}` for live; cached 4s | typecheck | `cd server && npx tsc --noEmit` | ✅ | ⬜ pending |
| 4-03-01 | 04-03 | 2 | DRAFT-02 | T-04-T-03 | `draftOrder.ts` implements CM 7.40 sequence; turns 4-01-02 GREEN | unit | `cd client && npx vitest run src/utils/draftOrder.test.ts` | ✅ | ⬜ pending |
| 4-03-02 | 04-03 | 2 | DRAFT-01 | T-04-D-03, T-04-D-04 | `useDraftDetail.ts` + `computeDraftInterval` export; staleTime 4000 < refetchInterval; turns 4-01-03 GREEN | unit | `cd client && npx vitest run src/hooks/useDraftDetail.test.ts && npx vitest run src/utils/draftOrder.test.ts` | ✅ | ⬜ pending |
| 4-03-03 | 04-03 | 2 | — | — | `useMatchDetail.ts` stale D-13 comment removed; zero logic change; Plan 01+03 tests all green | unit + typecheck | `cd client && npx tsc --noEmit && npx vitest run src/utils src/hooks` | ✅ | ⬜ pending |
| 4-04-01 | 04-04 | 3 | DRAFT-01 | T-04-T-04 | `DraftPortrait.tsx` — 56×56 cell; three visual states; heroMapper resolves id→null→empty slot | typecheck | `cd client && npx tsc --noEmit` | ✅ | ⬜ pending |
| 4-04-02 | 04-04 | 3 | DRAFT-01, DRAFT-02 | — | `DraftColumn.tsx` — 5 picks + 7 bans; ember glow prop-driven (solid/dashed variants) | typecheck | `cd client && npx tsc --noEmit` | ✅ | ⬜ pending |
| 4-04-03 | 04-04 | 3 | DRAFT-02 | — | `DraftTurnIndicator.tsx` — returns null on gameState !== 2; em-dash label; tentative opacity | typecheck | `cd client && npx tsc --noEmit` | ✅ | ⬜ pending |
| 4-04-04 | 04-04 | 3 | DRAFT-01, DRAFT-02 | — | `DraftSection.tsx` — composes Turn Indicator + two Columns (Radiant left, Dire right) | typecheck | `cd client && npx tsc --noEmit` | ✅ | ⬜ pending |
| 4-04-05 | 04-04 | 3 | DRAFT-01, DRAFT-02 | T-04-D-06 | MatchPage mounts DraftSection gated by `draft.scoreboard`; `vite build` passes | typecheck + build | `cd client && npx tsc --noEmit && npx vite build` | ✅ | ⬜ pending |
| 4-04-06 | 04-04 | 3 | DRAFT-01, DRAFT-02 | — | Human verification — picks/bans render within 5s on live draft; turn indicator correct; polling stops on game_state !== 2 | human checkpoint | manual (see Plan 04 Task 6 checklist) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Sampling continuity check

No more than 2 consecutive tasks without an `<automated>` gate. Audit by wave:

| Wave | Task sequence | Automated gates |
|------|---------------|-----------------|
| 0 | 4-01-01 → 4-01-02 → 4-01-03 | ✅ vitest × 3 (intentional red state) |
| 1 | 4-02-01 → 4-02-02 → 4-02-03 | ✅ vitest + tsc × 3 |
| 2 | 4-03-01 → 4-03-02 → 4-03-03 | ✅ vitest + tsc × 3 |
| 3 | 4-04-01 → 4-04-02 → 4-04-03 → 4-04-04 → 4-04-05 → 4-04-06 | ✅ tsc × 4 + build + human checkpoint (5 automated + 1 manual) |

Phase passes the "no 3 consecutive tasks without automated verify" rule — human checkpoint is the last task in the sequence, preceded by five typecheck gates.

---

## Wave 0 Requirements

- [x] `server/src/schemas/valve.test.ts` — scoreboard schema stubs (Plan 01 Task 1)
- [x] `client/src/utils/draftOrder.test.ts` — CM 7.40 sequence stubs (Plan 01 Task 2)
- [x] `client/src/hooks/useDraftDetail.test.ts` — refetchInterval cadence stubs for `computeDraftInterval` (Plan 01 Task 3)
- [ ] ~~`client/src/components/DraftPortrait.test.tsx`~~ — **dropped** per 04-PATTERNS.md advisory (@testing-library/react not installed; project convention is pure-function tests only; component behavior verified via Plan 04 Task 6 human checkpoint).
- [x] Vitest config — defaults work for both packages (no explicit `vitest.config.ts` needed per verification).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BFF cache TTL.DRAFT honors 5s client poll against live Valve payload | DRAFT-01 | Requires an actual live draft game; cannot be reliably automated without recording + replaying Valve responses | Plan 04 Task 6 checklist item #1: open a live CM draft match; Network tab shows `/api/live/draft/:matchId` firing every ~5s |
| Tentative turn indicator reads as best-guess (not confident) | DRAFT-02 | Subjective visual judgment on opacity/`?` glyph | Plan 04 Task 6 checklist item #2: load a mid-draft match with first-pick ambiguity; confirm dashed border + `?` glyph + opacity 0.6 |
| Polling stops on game_state !== 2 | DRAFT-01, CLAUDE.md | Requires observation over real state transitions | Plan 04 Task 6 checklist item #3: observe network tab during a draft→in-game transition, confirm no recurring polls |
| Empty scoreboard case: DraftSection does not mount | D-10 | Requires real or simulated pre-draft payload | Plan 04 Task 6 checklist item #4 + #5: load a pre-draft / post-draft match and confirm section absence |
| Component visual fidelity (portrait sizing, colors, spacing) | UI-SPEC §Component Inventory | Screenshot review against design tokens | Plan 04 Task 6 full checklist walkthrough |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or clearly-declared human checkpoint (Plan 04 Task 6)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (schema, draftOrder, computeDraftInterval)
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (2026-04-24, planner-populated)
