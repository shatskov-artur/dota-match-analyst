# Requirements

**Project:** Dota 2 Match Analyst
**Version:** v1
**Date:** 2026-04-22
**Last reconciled against the codebase:** 2026-08-11

---

## v1 Requirements

### HOME — Discovery & Navigation

- [x] **HOME-01**: User can see a list of all currently-live pro tournament matches with team names, series score (e.g. 1-0 Bo3), and match status tag (Live / Draft / Post-game)
- [x] **HOME-02**: User can see a list of active tournaments and browse their matches
- [x] **HOME-03**: Home page auto-refreshes every 30 seconds without user action

### MATCH — In-Game Stats

- [x] **MATCH-01**: User can see team score (kills) per side and net-worth gold difference in real time
- [x] **MATCH-02**: User can see each hero's portrait with alive/dead status and respawn countdown timer
- [x] **MATCH-03**: User can see tower and barracks state per lane for both sides (Radiant and Dire)
- [x] **MATCH-04**: User can see the current series score and a disclosure that data is delayed ~2 minutes
- [x] **MATCH-05**: User can see per-player K/D/A and net worth for all 10 players
- [x] **MATCH-06**: User can see a win-probability panel for any in-game match past 5 minutes, hidden before that. _(Revised 2026-04-26: Stratz tracks only major tournaments and returns null for everything else, so the shipped panel shows three bars — Stratz when available, plus a gold-based and a heuristic estimate computed server-side — instead of hiding when Stratz is silent.)_

### DRAFT — Pick Phase

- [x] **DRAFT-01**: User can see all picks and bans per team with hero portraits, updating live every 5 seconds during draft phase
- [x] **DRAFT-02**: User can see which team is currently picking or banning
- [x] **DRAFT-03**: User can see the current patch winrate and pro pick count next to each drafted hero. _(Shipped as a raw pro-pick count with a "P" suffix, not a rate — normalising to a percentage needs a total-pro-games denominator the BFF does not fetch.)_
- [x] **DRAFT-04**: User can hover a drafted hero to see its top counterpicks AND whether any opposing team players are "known to play" those counters. _(Revised in Phase 6: matchups come from Stratz pro-bracket data, not OpenDota — the OpenDota matchup path was removed. The "known to play" cross-reference still uses OpenDota player hero history. Consequence: without a valid Stratz token the counters go quiet.)_

### PLAYER — Contextual Stats

- [x] **PLAYER-01**: User can see each player's stats on their currently-drafted hero: total games played on this hero and win rate
- [x] **PLAYER-02**: Hidden-profile players (Steam account_id = 4294967295) show the player name from Valve but no OpenDota stats, without crashing the UI

### ITEM / MAP / ROSHAN / GRAPHS — shipped in Phases 7–10, back-filled 2026-08-11

These features were built and verified without REQ-IDs (the roadmap carried "TBD" or invented
`SC-*` ids). Written down now so coverage reflects the product that exists.

- [x] **ITEM-01**: User can see all 10 heroes ranked by net worth with their 6 item slots, updating on the 30s cycle
- [x] **ITEM-02**: Missing or unknown item ids render as an empty slot, never an error
- [x] **CD-01**: User can see which ultimates are not ready, sorted by cooldown remaining; the block hides when every ultimate is up
- [x] **MAP-01**: User can see all 10 hero positions on a minimap, Radiant/Dire coloured, hidden while there is no scoreboard
- [x] **ROSH-01**: User can see the Roshan kill count and the exact loot the next kill drops, persisted server-side across page refreshes
- [x] **ROSH-02**: User can see a respawn countdown while Roshan is dead, and the counter resets on a new match
- [x] **GRAPH-01**: User can see gold-lead and XP-lead charts covering the whole game, accumulated server-side every 30s
- [x] **GRAPH-02**: History is sampled by a background job independent of viewer traffic, so a viewer joining at minute 40 still sees minute 0, and is cleared when the match ends

### TEAM — Identity (added 2026-08-11)

- [x] **TEAM-01**: User can see each team's logo next to its name on the match list and the match header, resolved server-side and cached 7 days
- [x] **TEAM-02**: A team with no usable logo (unknown upstream, dead asset, or an unslotted TBD) renders an initials monogram in a fixed-size box — never a broken image and never a layout shift

### DEMO — Public artifact (added 2026-08-11, shipped 2026-08-06)

- [x] **DEMO-01**: Anyone can open a public URL and drive the real UI over real recorded tournament data, with no API key and no quota spent
- [x] **DEMO-02**: The page always discloses that it is a replay, including the third-party art-CDN exception
- [x] **DEMO-03**: The "no API calls, no console errors" claim is verified by a headless harness, not by inspection

### UI — Visual Redesign & Responsiveness (added 2026-06-06)

- [x] **UI-01**: Entire app is restyled via a shared design-token system to the **"Neon Bento"** dark theme — OLED near-black surfaces, violet + gold accents, Plus Jakarta Sans / JetBrains Mono, bento-card panels; canonical tokens in `.planning/sketches/redesign-2026/neon-bento/_theme.css`. _(Restated 2026-08-11: this requirement named "Tactical Slate" — the palette Phase 10.4 shipped on 2026-06-14 and Phase 10.5 replaced the same day. Nothing in the codebase has referred to Tactical Slate since.)_
- [x] **UI-02**: All screens (Home + Match) adapt responsively across four target widths: phone (~375px), tablet (~768px), laptop (~1280px), desktop (~1536px+) — no horizontal scroll, no overlapping/clipped content at any breakpoint
- [x] **UI-03**: Dense Match-page panel grid reflows on narrow viewports (multi-column → stacked) while preserving all data and readability; hero portraits, item slots, and cooldown icons remain legible on phone

---

## v2 Requirements (Deferred)

- Series history panel: show previous game results (score, heroes) while current game is live
- Tournament-scoped hero winrate: hero % on this specific tournament, not just global patch stats
- Win probability sparkline: 5-sample trend, not just a single number
- Draft pick-timer estimation
- Roster change tracking (player transfers in the past month)
- ~~Roshan respawn timer~~ → **delivered in Phase 9** (ROSH-01/02), 2026-05-04

---

## Out of Scope

- Public matchmaking (pub) matches — Valve API only covers league matches with valid `league_id`
- User accounts / authentication — personal + small group tool; no auth needed for v1
- ~~Mobile-responsive layout — desktop-first for v1~~ → **moved into scope 2026-06-06** (see UI-02/UI-03)
- Post-match replay / deep analysis — link out to OpenDota instead
- Embedded Twitch stream — users already have the stream open
- Betting odds integration — ToS minefield; permanently excluded
- Social features (comments, favorites, notifications) — out of scope

---

## Traceability

Maps each REQ-ID to the phase that delivers it. Rebuilt 2026-08-11 against the codebase — the
previous table left every MATCH and DRAFT-01/02 row "Pending" months after they shipped, and had
no rows at all for Phases 7–10 or 12.

| REQ-ID | Phase | Status |
|--------|-------|--------|
| HOME-01 | Phase 2: Live Matches List | Complete |
| HOME-02 | Phase 2: Live Matches List | Complete (as filter + search, not an accordion — see note) |
| HOME-03 | Phase 2: Live Matches List | Complete |
| MATCH-01 | Phase 3: Match Core | Complete |
| MATCH-02 | Phase 3: Match Core | Complete |
| MATCH-03 | Phase 3: Match Core | Complete |
| MATCH-04 | Phase 3: Match Core | Complete |
| MATCH-05 | Phase 3: Match Core | Complete |
| MATCH-06 | Phase 6: Win Probability | Complete (revised scope) |
| DRAFT-01 | Phase 4: Draft UX | Complete |
| DRAFT-02 | Phase 4: Draft UX | Complete |
| DRAFT-03 | Phase 5: Hero & Player Intel | Complete (pick count, not rate) |
| DRAFT-04 | Phase 5: Hero & Player Intel | Complete (Stratz matchups) |
| PLAYER-01 | Phase 5: Hero & Player Intel | Complete |
| PLAYER-02 | Phase 5: Hero & Player Intel | Complete |
| ITEM-01 | Phase 7: In-Game Item Intel | Complete |
| ITEM-02 | Phase 7: In-Game Item Intel | Complete |
| CD-01 | Phase 8: Ability Cooldowns & Map | Complete |
| MAP-01 | Phase 8: Ability Cooldowns & Map | Complete |
| ROSH-01 | Phase 9: Roshan Tracker | Complete |
| ROSH-02 | Phase 9: Roshan Tracker | Complete |
| GRAPH-01 | Phase 10: Historical Graphs | Complete |
| GRAPH-02 | Phase 10.1: background-history-sampler | Complete |
| UI-01 | Phase 10.4 → restyled by Phase 10.5 | Complete |
| UI-02 | Phase 10.4: responsive breakpoints | Complete |
| UI-03 | Phase 10.4: responsive breakpoints | Complete |
| DEMO-01 | Phase 12: Snapshot Demo | Complete |
| DEMO-02 | Phase 12: Snapshot Demo | Complete |
| DEMO-03 | Phase 12: Snapshot Demo | Complete |
| TEAM-01 | Phase 13: Team Avatars | Complete |
| TEAM-02 | Phase 13: Team Avatars | Complete |

**HOME-02 note:** the requirement said "browse active tournaments". It shipped as a league filter
plus team search over a flat bento grid (Phase 10.5), which serves the same goal; the original
league-accordion UI no longer exists. Recorded here rather than silently marked done.
