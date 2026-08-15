import { z } from 'zod'
import { cached, TTL } from '../cache.js'
import { openDotaQueue } from '../queues.js'
import { parseRetryAfter } from './retryAfter.js'
import { LeagueSchema, HeroStatsSchema, PlayerHeroSchema } from '../schemas/openDota.js'
import type { HeroStatsMap } from '../schemas/openDota.js'

const OPENDOTA_BASE = 'https://api.opendota.com/api'

/**
 * Throws a retryable rate-limit error on 429 so cached()'s pRetry backs off.
 * Call this in the `!res.ok` branch BEFORE anything else.
 */
function throwIfRateLimited(res: Response, label: string): void {
  if (res.status === 429) {
    throw Object.assign(new Error(`OpenDota 429 (${label})`), { status: 429, retryAfterMs: parseRetryAfter(res) })
  }
}

/**
 * A failure that says nothing about the DATA — the upstream was simply unavailable.
 *
 * THROWN, never returned as `null`, and that distinction is the whole point: cached()
 * stores whatever the fetcher RETURNS, so a `null` produced by a 502 was filed under
 * this key for the full TTL. One blip during a tournament therefore blanked every hero
 * win rate for six hours and then "fixed itself" — the single largest source of
 * "sometimes the data is there, sometimes it isn't" in this project.
 *
 * A throw is never cached (cache.ts stores only on the success path), so the next call
 * genuinely retries. Real misses — 404, and OpenDota's documented 200-with-empty-body —
 * still return null and are still cached, which is what stops an unknown id from
 * re-fetching on every single poll.
 */
function upstreamFailure(label: string, res: Response): Error {
  return Object.assign(new Error(`OpenDota ${label} unavailable: ${res.status} ${res.statusText}`), {
    status: res.status,
  })
}

/**
 * Fetches league name from OpenDota /leagues/{leagueId}.
 * Returns null on any error (non-ok status, parse failure, null name).
 * SECURITY: T-02-01 — response validated with LeagueSchema.safeParse() before use.
 * SECURITY: T-02-02 — logs status/statusText only, never full URL.
 */
/**
 * What OpenDota knows about a league: its name, and its TIER.
 *
 * The tier was being fetched all along — LeagueSchema has carried the field since Phase 2 —
 * and thrown away one line later. It is the difference between "The International" and a
 * continuously-running FACEIT ladder, and it is what decides whether a match is worth
 * writing megabytes of snapshots for (see env.shouldArchiveTier).
 */
export interface LeagueInfo {
  name: string | null
  /** OpenDota's own scale: 'premium' | 'professional' | 'amateur' | 'excluded'. */
  tier: string | null
}

async function fetchLeagueInfo(leagueId: number): Promise<LeagueInfo | null> {
  const res = await fetch(`${OPENDOTA_BASE}/leagues/${leagueId}`)
  if (res.status === 404) return null // OpenDota does not carry this league — a real, cacheable miss
  if (!res.ok) {
    throwIfRateLimited(res, `league ${leagueId}`)
    throw upstreamFailure(`league ${leagueId}`, res)
  }
  const text = await res.text()
  if (text.trim() === '') return null // 200-with-empty-body = unknown id
  const parsed = LeagueSchema.safeParse(JSON.parse(text))
  if (!parsed.success) {
    console.error(`[openDotaApi] LeagueSchema parse failure for league ${leagueId}`)
    return null
  }
  return { name: parsed.data.name ?? null, tier: parsed.data.tier ?? null }
}

/**
 * League name + tier, cached 6h server-side by league_id.
 * Returns null when OpenDota does not know this league (caller applies fallback label).
 * Per CLAUDE.md: cached() is the ONLY path to upstream. Never call fetchLeagueInfo directly.
 *
 * Key is `league:v2:` — the v1 key holds a bare name string from before the tier was kept,
 * and a six-hour-old cache entry of the wrong shape would read back as `{name: undefined}`.
 */
export function getLeagueInfo(leagueId: number): Promise<LeagueInfo | null> {
  return cached(`league:v2:${leagueId}`, TTL.HERO_STATS, () => fetchLeagueInfo(leagueId), {
    queue: openDotaQueue,
    upstream: 'opendota',
  })
}

/** Just the display name, for callers that do not care about the tier. */
export async function getLeagueName(leagueId: number): Promise<string | null> {
  return (await getLeagueInfo(leagueId))?.name ?? null
}

/**
 * Every league OpenDota knows about, with its tier. One keyless call, no parameters.
 *
 * The catalogue of the whole scene — thousands of rows going back years — and the only
 * keyless place that lists tournaments the app has never seen a match from. That is what it
 * is for: a tournament announced but not yet played has no row in our archive and no game in
 * Valve's live feed, so without this the app cannot learn it exists until its first match
 * starts. Callers must narrow it hard (see seedAnnouncedLeagues) — this is a haystack.
 *
 * Cached 6h: the catalogue changes when a new tournament is registered, which is not often.
 */
async function fetchAllLeagues(): Promise<Array<{ leagueid: number; name: string | null; tier: string | null }> | null> {
  const res = await fetch(`${OPENDOTA_BASE}/leagues`)
  if (!res.ok) {
    throwIfRateLimited(res, 'leagues catalogue')
    throw upstreamFailure('leagues catalogue', res)
  }
  const text = await res.text()
  if (text.trim() === '') return null
  const parsed = z.array(LeagueSchema).safeParse(JSON.parse(text))
  if (!parsed.success) {
    console.error('[openDotaApi] LeagueSchema parse failure for the leagues catalogue')
    return null
  }
  return parsed.data
    .filter((l): l is typeof l & { leagueid: number } => typeof l.leagueid === 'number')
    .map((l) => ({ leagueid: l.leagueid, name: l.name ?? null, tier: l.tier ?? null }))
}

export function getAllLeagues(): Promise<Array<{ leagueid: number; name: string | null; tier: string | null }> | null> {
  return cached('leagues:catalogue', TTL.HERO_STATS, fetchAllLeagues, {
    queue: openDotaQueue,
    upstream: 'opendota',
  })
}

// ─── Hero Stats ─────────────────────────────────────────────────────────────

/**
 * Pure transform helper — exported for unit testing (Wave 0 openDotaApi.test.ts).
 * Converts raw heroStats array → HeroStatsMap keyed by hero id.
 * Uses `h.id ?? h.hero_id` defensively (assumption A1: field may be `id` or `hero_id`).
 * GUARD: skips entries where pro_pick === 0 (Pitfall 7 — division-by-zero protection).
 */
export function buildHeroStatsMap(raw: z.infer<typeof HeroStatsSchema>[]): HeroStatsMap {
  const map: HeroStatsMap = {}
  for (const h of raw) {
    const heroId = h.id ?? h.hero_id
    if (heroId === undefined) continue
    if (!h.pro_pick || h.pro_pick === 0) continue  // Pitfall 7: skip zero-pick heroes
    map[heroId] = {
      win_rate: (h.pro_win ?? 0) / h.pro_pick,
      pick_rate: h.pro_pick,
    }
  }
  return map
}

async function fetchHeroStats(): Promise<HeroStatsMap | null> {
  const res = await fetch(`${OPENDOTA_BASE}/heroStats`)
  if (!res.ok) {
    throwIfRateLimited(res, 'heroStats')
    // Never a "miss": this endpoint always has data, so a bad status is always the
    // upstream being down. Caching null here hid every win-rate badge for 6 hours.
    throw upstreamFailure('heroStats', res)
  }
  const raw: unknown = await res.json()
  const parsed = z.array(HeroStatsSchema).safeParse(raw)
  if (!parsed.success) {
    console.error('[openDotaApi] HeroStatsSchema parse failure')
    return null
  }
  return buildHeroStatsMap(parsed.data)
}

/**
 * Returns hero patch stats map cached 6h server-side.
 * Cache key: 'hero:stats' (D-13 — single global key, not per-hero).
 * Returns null when OpenDota is unreachable — badge strips will be hidden (D-03).
 */
export function getHeroStats(): Promise<HeroStatsMap | null> {
  return cached('hero:stats', TTL.HERO_STATS, fetchHeroStats, { queue: openDotaQueue, upstream: 'opendota' })
}

// ─── Player Heroes ───────────────────────────────────────────────────────────

async function fetchPlayerHeroes(accountId: number): Promise<z.infer<typeof PlayerHeroSchema>[] | null> {
  const res = await fetch(`${OPENDOTA_BASE}/players/${accountId}/heroes`)
  if (res.status === 404) return null // unknown account — a real, cacheable miss
  if (!res.ok) {
    throwIfRateLimited(res, `player ${accountId}`)
    throw upstreamFailure(`player ${accountId}`, res)
  }
  const text = await res.text()
  if (text.trim() === '') return null // 200-with-empty-body = unknown id
  const parsed = z.array(PlayerHeroSchema).safeParse(JSON.parse(text))
  if (!parsed.success) {
    console.error(`[openDotaApi] PlayerHeroSchema parse failure for account ${accountId}`)
    return null
  }
  return parsed.data
}

/**
 * Returns player hero stats array cached 15min per accountId.
 * Cache key: 'player:heroes:{accountId}' (D-13).
 * SECURITY: never called for hidden profiles (account_id=4294967295) — caller guards via hiddenProfile().
 */
export function getPlayerHeroes(accountId: number): Promise<z.infer<typeof PlayerHeroSchema>[] | null> {
  return cached(`player:heroes:${accountId}`, TTL.PLAYER_STATS, () => fetchPlayerHeroes(accountId), { queue: openDotaQueue, upstream: 'opendota' })
}

// ─── Match detail (v2.0 post-match backfill) ─────────────────────────────────

/**
 * Raw OpenDota /matches/{id} body. Intentionally untyped beyond `unknown` — the
 * post-match document is huge, and postMatchBackfill mines the handful of fields it
 * needs defensively rather than pinning a schema that would break on the next patch.
 */
export type OpenDotaMatch = Record<string, unknown>

async function fetchMatchDetail(matchId: number): Promise<OpenDotaMatch | null> {
  const res = await fetch(`${OPENDOTA_BASE}/matches/${matchId}`)
  if (res.status === 404) return null // unknown match — a real, cacheable miss
  if (!res.ok) {
    throwIfRateLimited(res, `match ${matchId}`)
    throw upstreamFailure(`match ${matchId}`, res)
  }
  // CLAUDE.md pitfall: OpenDota answers 200 with an EMPTY BODY for unknown ids.
  // res.json() would throw on that, so read text and treat blank as a clean miss.
  const text = await res.text()
  if (text.trim() === '') return null
  const raw: unknown = JSON.parse(text)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as OpenDotaMatch
  if (typeof obj.match_id !== 'number') return null
  return obj
}

/**
 * Post-match document. `version === null` means the replay has not been parsed yet —
 * the per-minute arrays are absent and the caller must retry later.
 */
export function getMatchDetail(matchId: number): Promise<OpenDotaMatch | null> {
  return cached(`match:detail:${matchId}`, TTL.MATCH_DETAIL, () => fetchMatchDetail(matchId), {
    queue: openDotaQueue,
    upstream: 'opendota',
  })
}

// ─── Team match history (v2.0 head-to-head) ──────────────────────────────────

export const TeamMatchSchema = z
  .object({
    match_id: z.number(),
    /** Whether THIS team played Radiant — the pivot for reading radiant_win as a result. */
    radiant: z.boolean().optional(),
    radiant_win: z.boolean().optional(),
    radiant_score: z.number().optional(),
    dire_score: z.number().optional(),
    duration: z.number().optional(),
    start_time: z.number().optional(),
    leagueid: z.number().optional(),
    league_name: z.string().nullable().optional(),
    opposing_team_id: z.number().nullable().optional(),
    opposing_team_name: z.string().nullable().optional(),
    opposing_team_logo: z.string().nullable().optional(),
  })
  .passthrough()

export type TeamMatch = z.infer<typeof TeamMatchSchema>

/**
 * How much history to keep. The endpoint returns a team's ENTIRE career — Team Liquid
 * is 3100+ rows, roughly a megabyte — and caching that per team would dominate the
 * Redis budget for no benefit. Head-to-head and recent form need a recent window.
 */
const TEAM_MATCH_WINDOW = 80

async function fetchTeamMatches(teamId: number): Promise<TeamMatch[] | null> {
  const res = await fetch(`${OPENDOTA_BASE}/teams/${teamId}/matches`)
  if (res.status === 404) return null // unknown team — a real, cacheable miss
  if (!res.ok) {
    throwIfRateLimited(res, `team ${teamId}`)
    throw upstreamFailure(`team matches ${teamId}`, res)
  }
  const text = await res.text()
  if (text.trim() === '') return null // 200-with-empty-body = unknown id
  const parsed = z.array(TeamMatchSchema).safeParse(JSON.parse(text))
  if (!parsed.success) {
    console.error(`[openDotaApi] TeamMatchSchema parse failure for team ${teamId}`)
    return null
  }
  // Newest first is the documented order; sort anyway rather than trust it.
  return [...parsed.data]
    .sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0))
    .slice(0, TEAM_MATCH_WINDOW)
}

/**
 * A team's recent competitive matches.
 *
 * Cached 20 minutes, not 6 hours: a team plays two or three series on a tournament day, and
 * at 6h the recent-form strip beside a match still showed the state from before that team's
 * earlier game of the same evening.
 */
export function getTeamMatches(teamId: number): Promise<TeamMatch[] | null> {
  return cached(`team:matches:${teamId}`, TTL.TEAM_HISTORY, () => fetchTeamMatches(teamId), {
    queue: openDotaQueue,
    upstream: 'opendota',
  })
}

// ─── Team roster and hero pool (v2.0 prematch page) ──────────────────────────

export const TeamPlayerSchema = z
  .object({
    account_id: z.number().optional(),
    name: z.string().nullable().optional(),
    games_played: z.number().optional(),
    wins: z.number().optional(),
    /** Distinguishes the active five from every ex-member the team ever fielded. */
    is_current_team_member: z.boolean().nullable().optional(),
  })
  .passthrough()

export const TeamHeroSchema = z
  .object({
    hero_id: z.number().optional(),
    localized_name: z.string().nullable().optional(),
    games_played: z.number().optional(),
    wins: z.number().optional(),
  })
  .passthrough()

export type TeamPlayer = z.infer<typeof TeamPlayerSchema>
export type TeamHero = z.infer<typeof TeamHeroSchema>

/** Generic keyless OpenDota array fetch with the empty-body guard. */
async function fetchTeamList<T>(teamId: number, path: string, schema: z.ZodType<T>, label: string): Promise<T[] | null> {
  const res = await fetch(`${OPENDOTA_BASE}/teams/${teamId}/${path}`)
  if (res.status === 404) return null // unknown team — a real, cacheable miss
  if (!res.ok) {
    throwIfRateLimited(res, `${label} ${teamId}`)
    throw upstreamFailure(`${label} ${teamId}`, res)
  }
  const text = await res.text()
  if (text.trim() === '') return null // 200-with-empty-body = unknown id
  const parsed = z.array(schema).safeParse(JSON.parse(text))
  if (!parsed.success) {
    console.error(`[openDotaApi] ${label} parse failure for team ${teamId}`)
    return null
  }
  return parsed.data
}

/**
 * Full player history for a team, current members flagged.
 * The endpoint returns every player who ever played for the org (63 rows for Team Liquid),
 * so callers filter on `is_current_team_member` for the active roster.
 */
export function getTeamPlayers(teamId: number): Promise<TeamPlayer[] | null> {
  return cached(
    `team:players:${teamId}`,
    TTL.HERO_STATS,
    () => fetchTeamList(teamId, 'players', TeamPlayerSchema, 'team players'),
    { queue: openDotaQueue, upstream: 'opendota' },
  )
}

/** Hero pool with win counts, already carrying display names. */
export function getTeamHeroes(teamId: number): Promise<TeamHero[] | null> {
  return cached(
    `team:heroes:${teamId}`,
    TTL.HERO_STATS,
    () => fetchTeamList(teamId, 'heroes', TeamHeroSchema, 'team heroes'),
    { queue: openDotaQueue, upstream: 'opendota' },
  )
}


// ─── League matches ──────────────────────────────────────────────────────────

const LeagueMatchSchema = z
  .object({
    match_id: z.number(),
    start_time: z.number().optional(),
    duration: z.number().optional(),
    radiant_win: z.boolean().nullable().optional(),
    radiant_score: z.number().nullable().optional(),
    dire_score: z.number().nullable().optional(),
    radiant_team_id: z.number().nullable().optional(),
    dire_team_id: z.number().nullable().optional(),
    // Present but always null on this endpoint — names come from the bracket or the
    // match body, never from here.
    radiant_team_name: z.string().nullable().optional(),
    dire_team_name: z.string().nullable().optional(),
    series_id: z.number().nullable().optional(),
    series_type: z.number().nullable().optional(),
  })
  .passthrough()

export type LeagueMatch = z.infer<typeof LeagueMatchSchema>

async function fetchLeagueMatches(leagueId: number): Promise<LeagueMatch[] | null> {
  const res = await fetch(`${OPENDOTA_BASE}/leagues/${leagueId}/matches`)
  if (res.status === 404) return null // unknown league — a real, cacheable miss
  if (!res.ok) {
    throwIfRateLimited(res, `league ${leagueId} matches`)
    throw upstreamFailure(`league matches ${leagueId}`, res)
  }
  const text = await res.text()
  if (text.trim() === '') return null // 200-with-empty-body = unknown id
  const parsed = z.array(LeagueMatchSchema).safeParse(JSON.parse(text))
  if (!parsed.success) {
    console.error(`[openDotaApi] LeagueMatchSchema parse failure for league ${leagueId}`)
    return null
  }
  // Oldest first: game order within a series is chronological, and that is what
  // game_in_series means.
  return [...parsed.data].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0))
}

/**
 * Every match played in a league, with its series grouping.
 *
 * The second, independent way to discover that a game happened. Valve's own bracket
 * carries match ids in `nodes[].matches[]`, but only once it decides to publish them —
 * and a machine that was switched off overnight has no other record that the game
 * existed. This endpoint does not depend on the bracket at all.
 *
 * An empty array is a real answer (nothing played yet), not a miss.
 */
export function getLeagueMatches(leagueId: number): Promise<LeagueMatch[] | null> {
  return cached(`league:matches:${leagueId}`, TTL.LEAGUE_DATA, () => fetchLeagueMatches(leagueId), {
    queue: openDotaQueue,
    upstream: 'opendota',
  })
}
