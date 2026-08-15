import { cached, redis, TTL } from '../cache.js'
import { openDotaQueue, valveQueue } from '../queues.js'
import { logger } from '../logger.js'
import { parseRetryAfter } from './retryAfter.js'
import { TeamProfileSchema } from '../schemas/openDota.js'
import { UgcFileDetailsSchema } from '../schemas/valve.js'
import { env } from '../env.js'

const OPENDOTA_BASE = 'https://api.opendota.com/api'
const STEAM_API_BASE = 'https://api.steampowered.com'

/**
 * A team worth resolving a logo for, reduced to its stable identifiers.
 * `key` doubles as the Redis cache key and the per-request dedupe key.
 */
export interface TeamRef {
  key: string
  teamId?: number
  ugcId?: string
}

/**
 * Reduces a Valve `radiant_team`/`dire_team` object to a TeamRef, or null when there is
 * nothing to resolve (TBD teams during qualifiers carry neither field).
 *
 * PITFALL (measured against live data + Valve's own endpoint, 2026-08-11): `team_logo` is a
 * 19-digit Workshop ugcid that Valve sends as a JSON *number*. Anything past
 * Number.MAX_SAFE_INTEGER is rounded by JSON.parse before this code ever sees it, and the rounded
 * value is a different file — GetUGCFileDetails answered `status.code 15` for the rounded id and
 * returned the real logo for the true one (which OpenDota happens to carry in its logo_url).
 * Such ids are therefore dropped rather than looked up: spending a Valve call on a value known to
 * be corrupt buys nothing. team_id → OpenDota stays the primary path.
 */
export function teamRef(team?: { team_id?: number; team_logo?: string | number }): TeamRef | null {
  const teamId = typeof team?.team_id === 'number' && team.team_id > 0 ? team.team_id : undefined

  const rawUgc = team?.team_logo
  const corrupted = typeof rawUgc === 'number' && !Number.isSafeInteger(rawUgc)
  const ugcCandidate = rawUgc === undefined || rawUgc === null || corrupted ? '' : String(rawUgc)
  const ugcId = ugcCandidate !== '' && ugcCandidate !== '0' ? ugcCandidate : undefined

  if (teamId === undefined && ugcId === undefined) return null
  return {
    key: teamId !== undefined ? `team-logo:${teamId}` : `team-logo:ugc:${ugcId}`,
    teamId,
    ugcId,
  }
}

/** Throws a retryable rate-limit error on 429 so cached()'s pRetry backs off. */
function throwIfRateLimited(res: Response, label: string): void {
  if (res.status === 429) {
    throw Object.assign(new Error(`${label} 429`), { status: 429, retryAfterMs: parseRetryAfter(res) })
  }
}

/**
 * Reads a 2xx body as JSON, or returns undefined when there is nothing usable to parse.
 *
 * VERIFIED 2026-08-11 against live tournament data: OpenDota answers **200 with an empty body**
 * for team ids it does not carry — not 404. Calling res.json() on that throws a SyntaxError, and
 * treating it as a transient failure would mean re-fetching every unknown team on every poll
 * forever. A 2xx with an unusable body is a permanent answer ("I have nothing"), so the caller
 * turns it into a cacheable miss. Genuine transient failures still arrive as 5xx and throw.
 */
async function readJsonBody(res: Response): Promise<unknown | undefined> {
  const body = await res.text()
  if (body.trim() === '') return undefined
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}

/**
 * Primary source: OpenDota /teams/{teamId} → logo_url. No API key, no quota of consequence.
 *
 * Returns null ONLY when the upstream answered and the team genuinely has no logo (or is
 * unknown). Any transient failure THROWS, so cached() stores nothing — a 503 during a tournament
 * must not blank a team's avatar for the next 7 days.
 * SECURITY: logs status/statusText only.
 */
async function fetchOpenDotaTeamLogo(teamId: number): Promise<string | null> {
  const res = await fetch(`${OPENDOTA_BASE}/teams/${teamId}`, { signal: AbortSignal.timeout(10_000) })
  if (res.status === 404) return null // unknown team — a real, cacheable miss
  if (!res.ok) {
    throwIfRateLimited(res, `OpenDota team ${teamId}`)
    throw new Error(`OpenDota team fetch failed: ${res.status} ${res.statusText}`)
  }
  const raw = await readJsonBody(res)
  if (raw === undefined) return null // 200 + empty body — OpenDota does not carry this team
  const parsed = TeamProfileSchema.safeParse(raw)
  if (!parsed.success) {
    console.error(`[teamLogo] TeamProfileSchema parse failure for team ${teamId}`)
    return null
  }
  const url = parsed.data.logo_url
  return typeof url === 'string' && url.length > 0 ? url : null
}

/**
 * Fallback source: Valve GetUGCFileDetails → data.url, for teams OpenDota does not carry.
 * Costs Valve quota, hence second in line and behind the same 7-day cache.
 * SECURITY: T-04-04 — the request URL embeds VALVE_API_KEY and is never logged.
 */
async function fetchValveUgcLogo(ugcId: string): Promise<string | null> {
  const url = `${STEAM_API_BASE}/ISteamRemoteStorage/GetUGCFileDetails/v1/?key=${env.VALVE_API_KEY}&appid=570&ugcid=${ugcId}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (res.status === 404) return null // unknown ugcid — a real, cacheable miss
  if (!res.ok) {
    throwIfRateLimited(res, 'Valve GetUGCFileDetails')
    throw new Error(`Valve UGC fetch failed: ${res.status} ${res.statusText}`)
  }
  const raw = await readJsonBody(res)
  if (raw === undefined) return null
  const parsed = UgcFileDetailsSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[teamLogo] UgcFileDetailsSchema parse failure')
    return null
  }
  const resolved = parsed.data.data?.url
  return typeof resolved === 'string' && resolved.length > 0 ? resolved : null
}

/**
 * Pure-ish resolver — exported for unit testing without the cache layer.
 * OpenDota first, Valve UGC second, null when both answered and neither has a logo.
 * If every attempted source failed transiently the error is rethrown so nothing is cached.
 */
export async function resolveTeamLogo(ref: TeamRef): Promise<string | null> {
  let transient: unknown = null

  if (ref.teamId !== undefined) {
    try {
      const url = await fetchOpenDotaTeamLogo(ref.teamId)
      if (url) return url
    } catch (err) {
      transient = err
    }
  }

  if (ref.ugcId !== undefined) {
    try {
      const url = await fetchValveUgcLogo(ref.ugcId)
      if (url) return url
    } catch (err) {
      transient ??= err
    }
  }

  if (transient) throw transient
  return null
}

/**
 * Returns a team's logo URL, cached 7 days by team (TTL.TEAM_LOGO), or null when there is none.
 * Per CLAUDE.md: cached() is the ONLY path upstream — never call the fetchers directly.
 *
 * Queue choice follows the primary source for this ref: a team with a team_id goes through the
 * OpenDota envelope, an id-less team through Valve's. cached() takes one queue, and the fallback
 * leg is rare enough that tagging it by its primary is the honest approximation.
 */
export function getTeamLogo(ref: TeamRef): Promise<string | null> {
  const viaOpenDota = ref.teamId !== undefined
  return cached(ref.key, TTL.TEAM_LOGO, () => resolveTeamLogo(ref), {
    queue: viaOpenDota ? openDotaQueue : valveQueue,
    upstream: viaOpenDota ? 'opendota' : 'valve',
  })
}

/**
 * Cache-only read: the resolved URL, an explicit null (resolved, has no logo), or `undefined`
 * when this team has never been looked up. Never touches an upstream.
 *
 * Why the live route reads instead of awaiting getTeamLogo: a tournament day surfaces 30+ teams
 * at once, and the OpenDota queue runs 2 req/s — awaiting a cold cache would add ~15s to the
 * first /api/live/games response. Avatars are decorative; the match list is not allowed to wait
 * for them.
 */
export async function peekTeamLogo(ref: TeamRef): Promise<string | null | undefined> {
  if (!redis) return undefined
  try {
    const hit = await redis.get(ref.key)
    return hit === null ? undefined : (JSON.parse(hit) as string | null)
  } catch (err) {
    console.error(`[teamLogo] cache read failed for "${ref.key}":`, (err as Error).message)
    return undefined
  }
}

/** Keys currently being warmed — N concurrent viewers must not trigger N identical lookups. */
const warming = new Set<string>()

/**
 * Fire-and-forget cache warm-up. Returns immediately; the logo appears on the next poll.
 * Errors are logged and swallowed — this must never affect the response that triggered it.
 */
export function warmTeamLogo(ref: TeamRef): void {
  if (warming.has(ref.key)) return
  warming.add(ref.key)
  void getTeamLogo(ref)
    .catch((err: unknown) => {
      logger.warn({ key: ref.key, err: (err as Error).message }, 'team logo warm-up failed')
    })
    .finally(() => warming.delete(ref.key))
}
