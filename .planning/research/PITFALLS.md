# Pitfalls & Gotchas

**Domain:** Dota 2 live tournament match analytics
**Researched:** 2026-04-21
**Confidence:** HIGH (derived from project's own technical guide + established API patterns)

---

## API: Valve Web API

### P1 — GetLiveLeagueGames only returns licensed league matches
**Warning sign:** Home page empty even when matches are live on Twitch.
**Prevention:** Only use matches with a valid `league_id`. Publicly lobbied matches, scrimmages, and most stack games don't appear. Document this clearly in the UI ("Pro tournament matches only").
**Phase:** P1 (Live List)

### P2 — stream_delay_s = 120 (2-minute built-in delay)
**Warning sign:** Data appears stale compared to a live stream.
**Prevention:** This is by design. Display `stream_delay_s` to the user as "~2 min behind live" — never hide it. Don't try to compensate; just be transparent.
**Phase:** P1

### P3 — building_state can be 0 or absent
**Warning sign:** All towers show as alive even when they're clearly destroyed on stream.
**Prevention:** Check for field presence before decoding. Show a "data unavailable" placeholder rather than rendering incorrect state. Some matches without active spectators don't populate this field.
**Phase:** P2 (Match Core)

### P4 — account_id = 4294967295 means hidden profile
**Warning sign:** OpenDota calls return 404 or empty for certain players.
**Prevention:** Check `account_id === 4294967295` at the aggregator before making any OpenDota calls. Return `{ hidden: true, stats: null }`. Display the player's `name` from the Valve response — it's always present.
**Phase:** P2 / P5 (Player Intel)

### P5 — draft object is a flat dict, not an array
**Warning sign:** `match.draft` is `undefined` or doesn't iterate as expected.
**Prevention:** Parse `draft.pick_0`...`draft.pick_9` and `draft.ban_0`...`draft.ban_9` explicitly. The field may be missing entirely during pre-draft `game_state`.
**Phase:** P3 (Draft UX)

### P6 — No pick timer exposed by Valve API
**Warning sign:** Users ask "how much time is left to pick?" — no field exists.
**Prevention:** Do not try to show a precise timer — it will mislead. Show only state: "Radiant picking" / "Dire banning". If approximate timer is desired in v2, track state-change timestamps client-side.
**Phase:** P3

### P7 — game_state transitions are not atomic
**Warning sign:** UI flickers between draft and in-game state on rapid polls.
**Prevention:** Debounce `game_state` transitions in the hook. Only switch polling interval after state is stable for 2+ consecutive polls.
**Phase:** P3

---

## API: OpenDota

### P8 — Rate limit is per-month, not per-day
**Warning sign:** 429 errors appear mid-month after a heavy tournament weekend.
**Prevention:** Cache aggressively. Hero stats: 6h. Matchups: 6h. Player heroes: 15min. Add a 200ms delay between distinct-key requests. With Redis deduplication, the actual upstream call count is much lower than browser request count.
**Phase:** P1 (establish caching before first real traffic)

### P9 — hero_id from Valve doesn't always match OpenDota immediately after new hero release
**Warning sign:** Counterpick tooltip shows "Hero #unknown" for a freshly released hero.
**Prevention:** Use OpenDota `/api/constants/heroes` as the single source of truth for hero ID → name/image mapping. Seed this at backend boot, cache in memory, invalidate on patch days (check `version` field). Never hardcode hero IDs.
**Phase:** P0 (Foundations)

### P10 — /players/:accountId/heroes returns all-time data, not tournament-scoped
**Warning sign:** A player's stats on a hero seem inflated (includes pub matches from years ago).
**Prevention:** Use the `significant: 1` query param to filter to ranked/tournament-relevant matches. For tournament-scoped stats, use `/leagues/:leagueId/matches` and aggregate manually (or accept global stats as approximation for v1).
**Phase:** P5 (Player Intel)

### P11 — pro_pick / pro_win in heroStats can be 0 for new heroes
**Warning sign:** Division-by-zero when calculating `pro_win / pro_pick`.
**Prevention:** Always guard: `pro_pick > 0 ? (pro_win / pro_pick * 100).toFixed(1) : 'N/A'`
**Phase:** P4 (Hero Intel)

### P12 — Matchups disadvantage is from the hero's perspective, not the counter's
**Warning sign:** Counterpicks are sorted backwards — showing heroes that the target hero beats, not heroes that beat the target.
**Prevention:** `disadvantage < 0` means this hero is disadvantaged against the queried hero (i.e., it's a good counter TO the queried hero). Sort ascending to get best counters first.
**Phase:** P4

---

## API: Stratz

### P13 — Stratz 500 req/hr exhausts fast with multiple viewers
**Warning sign:** Win probability stops updating for some users.
**Prevention:** Win probability MUST be cached server-side keyed by `match_id` only — never per-user or per-session. One cache entry serves all viewers of the same match. With 30s TTL: 2 matches × 120 polls/hr = 240 req/hr. With 3 matches: 360 req/hr — close to the limit. Degrade gracefully; never hard-fail the match page.
**Phase:** P6 (Win Probability)

### P14 — Stratz REST endpoint may require paid tier in 2026
**Warning sign:** 401 or 403 on `GET /api/v1/match/:id/breakdown`.
**Prevention:** Treat Stratz win probability as optional from day one. If the endpoint returns auth errors, disable the feature cleanly. Verify endpoint availability before building Phase 6.
**Phase:** P6

### P15 — Stratz win probability is unreliable in the first 5 minutes
**Warning sign:** Probability shows 60%/40% in minute 2 on no meaningful data.
**Prevention:** Only show the win probability bar after `duration > 300` (5 minutes). Before that, show "Too early to predict" or hide the bar entirely.
**Phase:** P6

---

## Caching

### P16 — Redis connection failure silently breaks everything
**Warning sign:** All API endpoints return 500 with no useful error.
**Prevention:** Implement fallthrough: if `cache.get()` throws, log and call upstream directly. If `cache.set()` throws, log and return the fetched value anyway. Redis failure should degrade to uncached, not crash.
**Phase:** P0

### P17 — Cache key collisions across different shapes
**Warning sign:** Hero matchup data returns a league listing (or vice versa).
**Prevention:** Namespace every key by data type: `live_match_${id}`, `hero_matchups_${id}`, `player_heroes_${accountId}`. Never use generic keys like `match_${id}` for data from different endpoints.
**Phase:** P0

### P18 — Hero constants cache becomes stale after a patch
**Warning sign:** New hero shows as "Hero #unknown", or hero portrait is wrong after a patch.
**Prevention:** Hero constants are "truly static" between patches. Cache in-memory with a 24h Redis fallback. On patch days (Thursdays), restart the backend or add a manual `/api/admin/refresh-constants` endpoint. In v1, a restart is acceptable.
**Phase:** P0

---

## Frontend

### P19 — Polling continues on finished or abandoned matches
**Warning sign:** 30+ Valve API calls per minute for a match that ended an hour ago.
**Prevention:** `refetchInterval` must return `false` when `game_state === 6` (post-game). React Query stops automatically. Also stop when match is no longer in the games list.
**Phase:** P3

### P20 — Hero images from Steam CDN have inconsistent path formats
**Warning sign:** Some hero images 404; others load fine.
**Prevention:** Use the `img` field from OpenDota `/api/constants/heroes` directly. It provides the correct relative path. Prepend `https://cdn.cloudflare.steamstatic.com`. Test with at least 5 heroes on first integration.
**Phase:** P2

### P21 — Counterpick tooltip causes layout shift on hover
**Warning sign:** Content jumps as the tooltip appears over the draft board.
**Prevention:** Pre-fetch matchup data for all heroes in the draft (not just on hover) using `prefetchQuery` in React Query when draft data first loads. By the time the user hovers, data is already cached.
**Phase:** P4

---

## TypeScript / zod

### P22 — Valve adds new fields in patches and zod schemas reject them
**Warning sign:** Valid live match data fails zod parse with "Unrecognized key".
**Prevention:** Use `.passthrough()` on all Valve response schemas. Only validate fields you actually use. Be liberal in what you accept.
**Phase:** P0 (establish pattern before any integration)

### P23 — Optional fields absent in pre-game states cause runtime errors
**Warning sign:** `match.radiant_team.team_name` crashes when `radiant_team` is undefined during lobby.
**Prevention:** Mark all nested objects optional in zod schemas. Handle at display layer: `match.radiant_team?.team_name ?? 'Radiant'`.
**Phase:** P2

---

## Deployment

### P24 — Railway free tier no longer exists
**Warning sign:** Railway prompts for payment before first deploy.
**Prevention:** Railway removed its free tier in 2023. Use the $5/mo Hobby plan, or Render.com free (spins down after 15 min idle — acceptable for a personal tool), or Fly.io free allowance.
**Phase:** P7 (Harden & Deploy)

### P25 — API keys committed to git
**Warning sign:** Steam API key appears in git log.
**Prevention:** `.gitignore` must include `backend/.env` and `frontend/.env` before the first commit. Add to `.gitignore` in P0, verify before P7. Never commit `.env` files.
**Phase:** P0
