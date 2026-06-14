# Requirements

**Project:** Dota 2 Match Analyst
**Version:** v1
**Date:** 2026-04-22

---

## v1 Requirements

### HOME — Discovery & Navigation

- [x] **HOME-01**: User can see a list of all currently-live pro tournament matches with team names, series score (e.g. 1-0 Bo3), and match status tag (Live / Draft / Post-game)
- [x] **HOME-02**: User can see a list of active tournaments and browse their matches
- [x] **HOME-03**: Home page auto-refreshes every 30 seconds without user action

### MATCH — In-Game Stats

- [ ] **MATCH-01**: User can see team score (kills) per side and net-worth gold difference in real time
- [ ] **MATCH-02**: User can see each hero's portrait with alive/dead status and respawn countdown timer
- [ ] **MATCH-03**: User can see tower and barracks state per lane for both sides (Radiant and Dire)
- [ ] **MATCH-04**: User can see the current series score and a disclosure that data is delayed ~2 minutes
- [ ] **MATCH-05**: User can see per-player K/D/A and net worth for all 10 players
- [ ] **MATCH-06**: User can see win probability bar (Radiant vs. Dire) powered by Stratz ML — hidden if Stratz is unavailable or before 5 minutes of game time

### DRAFT — Pick Phase

- [ ] **DRAFT-01**: User can see all picks and bans per team with hero portraits, updating live every 5 seconds during draft phase
- [ ] **DRAFT-02**: User can see which team is currently picking or banning
- [x] **DRAFT-03
**: User can see the current patch winrate and pro pickrate next to each drafted hero
- [x] **DRAFT-04
**: User can hover a drafted hero to see its top counterpicks AND whether any opposing team players are "known to play" those counters (based on their OpenDota hero history)

### PLAYER — Contextual Stats

- [x] **PLAYER-01
**: User can see each player's stats on their currently-drafted hero: total games played on this hero and win rate
- [x] **PLAYER-02
**: Hidden-profile players (Steam account_id = 4294967295) show the player name from Valve but no OpenDota stats, without crashing the UI

### UI — Visual Redesign & Responsiveness (added 2026-06-06)

- [x] **UI-01**: Entire app is restyled to the "Tactical Slate" dark theme (warm charcoal base, muted gold + steel-blue accents, soft-shadow rounded cards) via a shared design-token system — palette captured in sketches 003/004
- [x] **UI-02**: All screens (Home + Match) adapt responsively across four target widths: phone (~375px), tablet (~768px), laptop (~1280px), desktop (~1536px+) — no horizontal scroll, no overlapping/clipped content at any breakpoint
- [x] **UI-03**: Dense Match-page panel grid reflows on narrow viewports (multi-column → stacked) while preserving all data and readability; hero portraits, item slots, and cooldown icons remain legible on phone

---

## v2 Requirements (Deferred)

- Series history panel: show previous game results (score, heroes) while current game is live
- Tournament-scoped hero winrate: hero % on this specific tournament, not just global patch stats
- Win probability sparkline: 5-sample trend, not just a single number
- Roshan respawn timer
- Draft pick-timer estimation
- Roster change tracking (player transfers in the past month)

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

Maps each REQ-ID to the phase that delivers it. Coverage: 15/15 v1 requirements mapped.

| REQ-ID | Phase | Status |
|--------|-------|--------|
| HOME-01 | Phase 2: Live Matches List | Complete |
| HOME-02 | Phase 2: Live Matches List | Complete |
| HOME-03 | Phase 2: Live Matches List | Complete |
| MATCH-01 | Phase 3: Match Core | Pending |
| MATCH-02 | Phase 3: Match Core | Pending |
| MATCH-03 | Phase 3: Match Core | Pending |
| MATCH-04 | Phase 3: Match Core | Pending |
| MATCH-05 | Phase 3: Match Core | Pending |
| MATCH-06 | Phase 6: Win Probability | Pending |
| DRAFT-01 | Phase 4: Draft UX | Pending |
| DRAFT-02 | Phase 4: Draft UX | Pending |
| DRAFT-03 | Phase 5: Hero & Player Intel | Pending |
| DRAFT-04 | Phase 5: Hero & Player Intel | Pending |
| PLAYER-01 | Phase 5: Hero & Player Intel | Pending |
| PLAYER-02 | Phase 5: Hero & Player Intel | Pending |
