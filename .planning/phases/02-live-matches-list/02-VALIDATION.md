---
phase: 2
slug: live-matches-list
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2.0.0 (installed in client and shared) |
| **Config file** | none — uses package.json `"test": "vitest"` script |
| **Quick run command** | `cd client && npm test -- --run` |
| **Full suite command** | `cd shared && npm test -- --run && cd ../client && npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd client && npm test -- --run`
- **After every plan wave:** Run `cd shared && npm test -- --run && cd ../client && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-W0-01 | W0 | 0 | HOME-01 | — | N/A | unit | `cd client && npm test -- --run src/utils/gameState.test.ts` | ❌ W0 | ⬜ pending |
| 2-W0-02 | W0 | 0 | HOME-01 | — | N/A | unit | `cd client && npm test -- --run src/utils/formatDuration.test.ts` | ❌ W0 | ⬜ pending |
| 2-W0-03 | W0 | 0 | HOME-02 | — | N/A | unit | `cd client && npm test -- --run src/hooks/useLiveGames.test.ts` | ❌ W0 | ⬜ pending |
| 2-BE-01 | BE | 1 | HOME-01/02 | T-02-01 | `safeParse` rejects malformed OpenDota JSON → fallback label | unit | `cd client && npm test -- --run` | ✅ exists | ⬜ pending |
| 2-FE-01 | FE | 2 | HOME-01 | — | N/A | unit | `cd client && npm test -- --run` | ✅ exists | ⬜ pending |
| 2-FE-02 | FE | 2 | HOME-03 | — | N/A | smoke | Launch app, observe network tab — 30s refetch fires | ❌ manual | ⬜ pending |
| 2-FE-03 | FE | 2 | HOME-02 | — | N/A | unit | `cd client && npm test -- --run` | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `client/src/utils/gameState.test.ts` — stubs for HOME-01 (status labels, series labels)
- [ ] `client/src/utils/formatDuration.test.ts` — stubs for HOME-01 (MM:SS duration format)
- [ ] `client/src/hooks/useLiveGames.test.ts` — stubs for HOME-02 (grouping by league_id)

*Wave 0 creates the test stubs before implementing the source files. Execution agent writes source files that make stubs green.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BFF `/api/live/games` returns `league_name` field | HOME-02 | Requires live Valve API key + Redis | `curl http://localhost:3001/api/live/games \| jq '.games[0].league_name'` — expect string, not null |
| Home page auto-refetches every 30s silently | HOME-03 | Requires live polling observable in browser | Open DevTools Network tab, observe second `/api/live/games` request ~30s after load |
| Last-updated timestamp updates after refetch | HOME-03 | Requires running app + timing | Watch `Updated HH:MM AM/PM` label in page header update after 30s without page interaction |
| Error banner shown on Valve API failure | HOME-01 | Requires simulated API failure | Block `localhost:3001/api/live/games` in DevTools → expect error banner, no crash |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING (❌) references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
