# Phase 2: Live Matches List - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 02-live-matches-list
**Areas discussed:** Match row layout, Tournament grouping, Refresh UX, Navigation & routing

---

## Match row layout

| Option | Description | Selected |
|--------|-------------|----------|
| Table row | Dense horizontal row: Team A vs Team B \| series score \| status tag \| duration | ✓ |
| Card | One card per match with more breathing room | |

**User's choice:** Table row

---

**Which data points beyond HOME-01 required fields?**

| Option | Description | Selected |
|--------|-------------|----------|
| Game duration | Time elapsed, e.g. '28:14' | ✓ |
| Spectator count | spectators field — shows popularity | |
| Neither — keep it minimal | Only show HOME-01 required fields | |

**User's choice:** Game duration (spectators excluded)

---

## Tournament grouping

**League name source (Valve API only provides league_id):**

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch from OpenDota | BFF calls OpenDota /leagues/{id}, caches 6h | ✓ |
| Use league_id as label | Display 'League #12345', no extra API call | |

**User's choice:** Fetch from OpenDota

---

**Grouping style:**

| Option | Description | Selected |
|--------|-------------|----------|
| Accordion sections | Collapsible sections, all expanded by default | ✓ |
| Flat list with header rows | Non-collapsible tournament name dividers | |
| Filter tabs at top | Tabs: All \| ESL One \| DreamLeague \| ... | |

**User's choice:** Accordion sections

---

## Refresh UX

| Option | Description | Selected |
|--------|-------------|----------|
| Completely silent | No indicator at all | |
| Last-updated timestamp | Small gray timestamp, updates after each fetch | ✓ |
| Subtle pulse on refresh | Row briefly dims/flashes on new data | |

**User's choice:** Last-updated timestamp

---

## Navigation & routing

**Route pattern:**

| Option | Description | Selected |
|--------|-------------|----------|
| /match/:matchId | Clean, short. e.g. /match/7654321 | ✓ |
| /match/:leagueId/:matchId | Includes league context in URL | |

**User's choice:** /match/:matchId

---

**Placeholder page content:**

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal placeholder | Just show match_id + 'Phase 3 coming' | |
| Raw JSON dump | Display raw API data — useful for debugging Phase 3 | ✓ |

**User's choice:** Raw JSON dump (intentional dev tool)

---

## Claude's Discretion

- Exact status tag visual styling (color, badge shape)
- Loading skeleton while initial data loads
- Whether league name enrichment is inline in `/api/live/games` or a separate route
- Error state when Valve API is unreachable
- Accordion open/close state management

## Deferred Ideas

None.
