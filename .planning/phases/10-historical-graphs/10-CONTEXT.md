# Phase 10: Historical Graphs - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side accumulation of `{timestamp, goldDiff, xpDiff}` time-series per `match_id` in Redis, exposed via the existing match endpoint and rendered as two stacked SVG line charts (gold lead and approximate xp lead) on the match page. Charts grow as the game proceeds, stop when `game_state === 6`, and disappear from Redis after the match.

</domain>

<decisions>
## Implementation Decisions

### Charting & Rendering
- **D-01:** Charts are rendered with **hand-rolled SVG** — no chart library added. Matches existing project pattern (`DotaMapView`, `WinProbBar`). Bundle stays clean; full styling control.
- **D-02:** **Two stacked charts** — Gold diff on top, XP diff below. Independent Y-scales, shared X-axis (game-clock minutes). No combined dual-axis chart, no tabs.
- **D-03:** **Symmetric Y-axis around 0**: Radiant lead renders upward (green), Dire lead renders downward (red). Filled area between line and zero-axis with low opacity. Clearly conveys who's ahead at a glance.
- **D-04:** Y-axis numeric formatting: thousands as `12.3k`. X-axis ticks every 5 minutes, label format `MM:SS` (e.g. `35:00`).

### Server Sampler (Lazy Piggyback)
- **D-05:** **No background timer.** Sampling happens inline at the end of the existing `/api/live/games` (or `/api/match/:id`) request handler, after the Valve payload is parsed. Zero new processes, plays nicely with Railway free dyno.
- **D-06:** **Append throttle: ≥5s since last sample for that `match_id`.** A `lastSample:{match_id}` key (NX SET with EX) gates the append so multiple concurrent viewers don't write duplicate points within the same 30s polling window. Inside the 5s gate, just read history; outside it, append the new point.
- **D-07:** Sample fields: `{ t: <duration_seconds>, gold: <goldDiff>, xp: <xpDiff> }`. `t` is **game clock seconds** (from `match.duration` / `scoreboard.duration`), not wall-clock — survives stream delay and makes the X-axis trivial.
- **D-08:** Sampler skips writing when:
  - `game_state !== 5` (not in-game; draft/lobby/post-game produce no points)
  - `match.duration` is null/0
  - `players[]` is missing or hidden-profile-heavy enough that team aggregates would be wrong (let aggregator decide; sampler trusts the parsed payload)
- **D-09:** Sampler is **fire-and-forget**: failure to write history MUST NOT break the live-games response. Wrap in try/catch, log via pino, return the live payload unchanged.

### Redis Storage
- **D-10:** Key shape: `timeseries:{match_id}` — Redis **list** of JSON strings. RPUSH on append, LRANGE 0 -1 on read.
- **D-11:** **LTRIM 0 -240** on every append — caps series at ~240 points (≈ 2h of 30s samples) so a hung match can't grow unboundedly.
- **D-12:** **TTL 7200s (2h), refreshed via EXPIRE on every write.** Belt-and-suspenders cleanup paired with explicit DEL.
- **D-13:** Explicit **DEL timeseries:{match_id}** when the sampler observes `game_state === 6` for that match. TTL is the safety net if the post-game state is missed (match disappears from `GetLiveLeagueGames` without transitioning).
- **D-14:** Cache key for the BFF *response* shape (history field included) follows the existing `cached()` pattern keyed by `match_id` only — no per-user variation. Already enforced by Phase 7 patterns; no change.

### XP Source
- **D-15:** Team XP at sample time = **Σ(player.xpm × match.duration / 60)** summed per team (Radiant team_id 0, Dire team_id 1).
- **D-16:** `xpDiff = radiantTeamXP - direTeamXP`. Sign convention identical to gold diff (positive = Radiant ahead).
- **D-17:** **Label the XP chart explicitly** as "XP lead (approx.)" or similar in the section header — the value is xpm-derived, not Valve's authoritative team XP. Tooltip and axis don't need the disclaimer; the section header carries it.
- **D-18:** If any required player.xpm is missing for a team, fall back to that team's XP = 0 for that sample (better to undercount than crash). Rare in pro live games.
- **D-19:** Sampler does **not** verify Valve schema for hidden `player.level` / `scoreboard.radiant.xp` fields. If a future researcher discovers them in a real payload, they're a follow-up improvement, not a Phase 10 blocker (deferred).

### Client Wiring
- **D-20:** **History rides on `useMatchDetail`** — the BFF includes `history: Array<{t, gold, xp}>` in the `/api/match/:id` response. No new query hook, no new endpoint, no new polling cadence. Polling stops automatically with `useMatchDetail` when `game_state === 6` (existing behaviour).
- **D-21:** Client component: new `client/src/components/HistoryGraphs.tsx` (or similar), placed on the match page. Two `<svg>` instances inside one `<section>`, sharing X-axis tick labels.

### UX
- **D-22:** **Hover crosshair tooltip with exact values.** Mouse-move over the chart projects a vertical line; tooltip shows `MM:SS — Radiant +8.4k gold, +3.1k xp` (or Dire-leading wording). Reuse the absolute-positioning approach from `IntelTooltip` (anchorRef + portal-style positioning). Touch devices: tap-and-drag falls back gracefully (acceptable).
- **D-23:** **Empty/early state: skeleton block + text** "Накапливаем историю… ({elapsed}/30с)" until ≥2 samples exist. Block keeps its final dimensions to avoid CLS. Once ≥2 points exist, charts render normally.
- **D-24:** Single-point edge case: stay in the empty state (skeleton + text) — drawing a flat line from one data point is misleading. Switch to charts only on the second sample.
- **D-25:** Charts continue to display final history after `game_state === 6` while the user remains on the page (history is still in Redis until DEL/TTL fires; client-side cache hangs onto the last response). On reload after cleanup, the section gracefully shows empty/post-game state.

### Claude's Discretion
- Exact pixel dimensions, padding, gridline density, axis label typography — pick something consistent with the existing match page (white headings, secondary text ≥ #555555 from Phase 3 palette).
- Tooltip positioning algorithm details (clamp to viewport, offset on hover edge cases).
- Whether to show min/max annotations on the line (e.g. peak gold lead) — defer, ship without first.
- Whether early-game under-30s sample also depends on `duration > 60` (recommended floor) — planner's call during implementation.

### Folded Todos
None — no pending todos matched Phase 10 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project core
- `.planning/ROADMAP.md` §"Phase 10: Historical Graphs" — goal, success criteria, API reality notes (Valve XP gap)
- `.planning/REQUIREMENTS.md` — overall product constraints
- `CLAUDE.md` — Critical Pitfalls (`game_state === 6` polling stop, `.passthrough()` on Valve schemas)

### Existing implementation patterns to follow
- `server/src/schemas/valve.ts` — `LiveGameSchema`, `PlayerSchema.xpm`, `PlayerSchema.net_worth`, `ScoreboardSchema.duration`
- `server/src/routes/live.ts` — existing live-games handler the sampler hooks into
- Phase 5 CONTEXT/decisions — `cached()` per-`match_id` key pattern (T-5-04 DoS mitigation)
- Phase 6 CONTEXT/decisions — `game_state` distinction via scoreboard.players[] presence; gating on `game_state === 5`
- `client/src/components/DotaMapView.tsx` — canonical custom-SVG component pattern in this repo
- `client/src/components/WinProbBar.tsx` — self-gating component pattern (renders only when data is meaningful)
- `client/src/components/IntelTooltip.tsx` — anchorRef-based absolute tooltip pattern (D-22)
- `client/src/hooks/useMatchDetail.ts` (or wherever match-detail polling lives) — extend response payload with `history`

### No external specs/ADRs for this phase
Requirements fully captured in decisions above and in the ROADMAP entry.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cached()` decorator in `server/src/lib/cache.ts` — wraps upstream calls; sampler reuses parsed Valve payload returned from this layer.
- `heroMapper`, `hiddenProfile` guard — sampler doesn't need them directly, but aggregators downstream do.
- `IntelTooltip` pattern — directly templates the chart hover tooltip.
- `DotaMapView` — full reference for hand-rolled SVG with viewBox, polylines, axis ticks, legend, and Tailwind styling.
- React Query `useMatchDetail` — already game-state-aware (5s draft / 30s in-game / false post-game) — history piggybacks for free.

### Established Patterns
- All Valve responses parsed through zod with `.passthrough()`. New `history` field on the BFF response is a BFF-side construct, not a Valve passthrough — no schema change to `valve.ts`.
- Cache keyed by `match_id` only — never per-user. Sampler key (`timeseries:{match_id}`, `lastSample:{match_id}`) follows this.
- Polling stops at `game_state === 6` enforced at the hook level via `refetchInterval`. Sampler must **also** stop on `game_state === 6` (D-13 DEL) to prevent zombie writes if some other endpoint still hits Valve.
- Components self-gate (Phase 6 WinProbBar): `HistoryGraphs` renders empty state when `history.length < 2`.

### Integration Points
- **BFF route extension** — wherever `/api/match/:id` is assembled, append `history: await readHistory(matchId)` to the response.
- **BFF route mutation** — same place, after `lastSample` gate passes, run the append (`writeSample`).
- **Client match page** — mount `<HistoryGraphs history={data.history} />` into an existing match-page section (likely below score header / above player rows; planner picks placement consistent with current layout, per the layout-preservation memory: ASK before re-flowing the page).
- **Tests** — RED test stubs for sampler (throttle, schema, cleanup) + history reducer + chart math (scaling, symmetric Y, formatting).

</code_context>

<specifics>
## Specific Ideas

- "Накапливаем историю…" wording in Russian inside skeleton state (matches user's preferred copy language for end-user-facing text — confirm during execution if other UI copy is English).
- Tooltip wording: `35:00 — Radiant +8.4k gold, +3.1k xp` style. When Dire is ahead, swap to `Dire +X.Xk …`.
- Chart colors derive from existing team palette (Radiant green, Dire red) — match what Phase 6 / score header use; do not invent a new palette.

</specifics>

<deferred>
## Deferred Ideas

- **Authoritative team XP from `player.level` / `scoreboard.radiant.xp`** — only if a researcher sees those fields in a real Valve payload. Not Phase 10 scope.
- **Min/max annotations** ("peak Radiant lead", "comeback inflection") on the chart.
- **Persisting history beyond match end** for post-mortem replays — out of scope; current value is in-match context only.
- **Background sampler / persistent cron** for matches nobody is watching — not needed for the small private user group.
- **Mobile gesture handling for tooltip** (long-press / pinch-zoom) — accept basic touch behaviour; revisit only if usage shows it's needed.

None spilled over into other phases — discussion stayed within scope.

</deferred>

---

*Phase: 10-historical-graphs*
*Context gathered: 2026-05-09*
