# Phase 3: Match Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 3 - Match Core
**Areas discussed:** Match screen layout, Hero grid + player stats, Building state display, Data source & polling, Edge cases

---

## Match Screen Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Top-to-bottom sections | Score header → hero grid → buildings → player table. Clear reading order. | ✓ |
| Two-column split | Radiant left, Dire right, score in the middle. Mirrors in-game scoreboard. | |
| Score + buildings top, players below | Compact header with all meta, full-width player table below. | |

**User's choice:** Top-to-bottom sections

---

| Option | Description | Selected |
|--------|-------------|----------|
| Number only | e.g. "+4,200" colored by leading team. Minimal. | ✓ |
| Gold bar visualization | Horizontal bar showing relative advantage (e.g. 60/40 fill). | |
| You decide | Claude picks. | |

**User's choice:** Number only for gold difference

---

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle label | Small text near score, e.g. "~2min delay". | ✓ |
| Persistent banner | Top strip or highlighted row. Hard to miss. | |

**User's choice:** Subtle label for delay disclosure

---

| Option | Description | Selected |
|--------|-------------|----------|
| Back nav + match title | Team names as H1, consistent with MatchPlaceholder. | ✓ |
| Back nav only | Score header is prominent enough. | |
| You decide | Claude picks. | |

**User's choice:** Back nav + match title (Team A vs Team B as H1)

---

## Hero Grid + Player Stats

| Option | Description | Selected |
|--------|-------------|----------|
| Merged: one row per player | portrait \| alive/dead+respawn \| K/D/A \| net worth | ✓ |
| Separate: grid above, table below | Big portrait grid with alive state, then 10-row stats table below. | |

**User's choice:** Merged into one row per player

---

| Option | Description | Selected |
|--------|-------------|----------|
| Greyed-out portrait + countdown | Dark overlay/desaturation + respawn number. | ✓ |
| Red overlay + countdown | Portrait tinted red when dead. | |
| You decide | Claude picks monochromatic approach. | |

**User's choice:** Greyed-out portrait + respawn countdown

---

| Option | Description | Selected |
|--------|-------------|----------|
| Valve name + hero data, no player stats | Show hero + KDA from match; skip OpenDota player history. | ✓ |
| Anonymous placeholder | Show "?" icon + KDA. Emphasizes hidden state. | |

**User's choice:** Valve name + hero data, no player stats for hidden profiles

---

## Extended Player Stats

| Option | Description | Selected |
|--------|-------------|----------|
| Hero level | Current level 1–30. | ✓ |
| GPM / XPM | Gold per minute and XP per minute. | ✓ |
| Last hits / Denies | Farm count. | ✓ |
| None — keep it minimal | Stick to MATCH-05 requirements only. | |

**User's choice:** Hero level + GPM/XPM + last hits/denies (in addition to K/D/A + net worth)

---

## Building State Display

| Option | Description | Selected |
|--------|-------------|----------|
| Schematic lane layout | Two columns (Radiant\|Dire), three rows (Top/Mid/Bot), icons/dots for T1/T2/T3 + rax. | ✓ |
| Minimal text list | Short text per side e.g. "Top: T1 ✓ T2 ✗". | |
| You decide | Claude picks compact visualization. | |

**User's choice:** Schematic lane layout

---

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden entirely | Section doesn't render when unavailable:true. | ✓ |
| Placeholder text | "Building data unavailable" message. | |
| All-alive state | Show all towers standing (buildingDecoder default). | |

**User's choice:** Hide building section entirely when data is unavailable

---

## Data Source & Polling

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse /api/live/games filtered client-side | No new BFF route. MatchPage reads TanStack Query cache. | ✓ |
| Dedicated /api/live/match/:matchId endpoint | New BFF route, cleaner API surface. | |

**User's choice:** Reuse existing /api/live/games, filtered client-side

---

| Option | Description | Selected |
|--------|-------------|----------|
| 30s flat now, Phase 4 upgrades | Simple plain number in Phase 3. | ✓ |
| Set up dynamic callback now | (query) => interval in Phase 3 with 30s for all states. Less rework later. | |

**User's choice:** 30s flat in Phase 3, dynamic callback deferred to Phase 4

---

## Edge Cases

| Option | Description | Selected |
|--------|-------------|----------|
| Score + series, hero grid empty | Show available data, empty hero slots per side. No crash. | ✓ |
| "Draft in progress" placeholder | Message explaining draft state. | |
| You decide | Claude decides non-crashing approach. | |

**User's choice (draft state):** Score + series visible, hero grid shows 5 empty slots per side

---

| Option | Description | Selected |
|--------|-------------|----------|
| Frozen final stats | Last known stats stay visible. "Game over" label. Polling stops. | ✓ |
| "Match has ended" overlay | Message over the stats. | |
| You decide | Claude decides. | |

**User's choice (post-game):** Frozen final stats + "Game over" status label

---

| Option | Description | Selected |
|--------|-------------|----------|
| Refetch /api/live/games, then show or redirect | Trigger fresh fetch. If found → render. If not → redirect home. | ✓ |
| Show error + back button | "Match not found or no longer live" message. | |
| You decide | Claude picks simpler approach. | |

**User's choice (not found):** Refetch, then redirect home if still missing

---

## Claude's Discretion

- Loading skeleton approach (skeleton rows vs minimal spinner)
- Exact color scheme for Radiant/Dire gold diff
- Column ordering within the player row
- Whether GPM/XPM/LH/DN are inline or secondary row per player

## Deferred Ideas

- Spectator count (excluded in Phase 2, remains excluded)
- GPM/XPM sparkline / trend (v2)
- Roshan respawn timer (v2 per REQUIREMENTS.md)
- Draft pick timer (Phase 4)
