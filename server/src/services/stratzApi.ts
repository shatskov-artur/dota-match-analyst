import { cached, TTL } from '../cache.js'
import { stratzQueue } from '../queues.js'
import { parseRetryAfter } from './retryAfter.js'
import { StratzWinProbResponseSchema, StratzMatchupResponseSchema } from '../schemas/stratz.js'
import type { StratzHeroDryadEntry } from '../schemas/stratz.js'
import { env } from '../env.js'

const STRATZ_BASE = 'https://api.stratz.com/graphql'
const STRATZ_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'STRATZ_API',
}

/**
 * Bounds how long a stalled Stratz connection can hold its queue slot.
 *
 * stratzQueue has a concurrency of 1, so without this a single request that connects and
 * then never answers blocks every later Stratz call for the lifetime of the process —
 * win probability and counterpick intel both go quiet with no error anywhere to explain it.
 */
const STRATZ_TIMEOUT_MS = 10_000

// ─── Win Probability ──────────────────────────────────────────────────────────

/**
 * Fetches real-time Radiant win probability from Stratz live.match endpoint.
 * Returns null on any error (network, auth, empty response).
 * SECURITY: T-6-01 — STRATZ_TOKEN never logged; T-6-02 — cached by matchId only.
 * SECURITY: T-6-04 — non-ok status returns null; Stratz error details never forwarded.
 */
async function fetchWinProbability(matchId: number): Promise<number | null> {
  let res: Response
  try {
    res = await fetch(STRATZ_BASE, {
      method: 'POST',
      headers: {
        ...STRATZ_HEADERS,
        'Authorization': `Bearer ${env.STRATZ_TOKEN}`,
      },
      body: JSON.stringify({
        query: `query WinProb($id: Long!) {
          live {
            match(id: $id) {
              liveWinRateValues { time winRate }
            }
          }
        }`,
        variables: { id: matchId },
      }),
      signal: AbortSignal.timeout(STRATZ_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('[stratzApi] Network error fetching winprob:', (err as Error).message)
    return null
  }
  if (!res.ok) {
    // 429 → throw a retryable rate-limit error so cached()'s pRetry backs off (Stratz 500/hr).
    if (res.status === 429) {
      throw Object.assign(new Error('Stratz 429 (winprob)'), { status: 429, retryAfterMs: parseRetryAfter(res) })
    }
    // SECURITY: T-6-04 — log status only, never forward Stratz response body
    console.error(`[stratzApi] winprob fetch error: ${res.status} ${res.statusText}`)
    return null
  }
  const raw: unknown = await res.json()
  const parsed = StratzWinProbResponseSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[stratzApi] StratzWinProbSchema parse failure for match', matchId)
    return null
  }
  const values = parsed.data.data?.live?.match?.liveWinRateValues
  // Pitfall 3: liveWinRateValues may be empty for early-game or untracked matches
  if (!values || values.length === 0) return null
  // Last entry is the most current win rate (Radiant perspective, ∈ [0, 1])
  return values[values.length - 1].winRate ?? null
}

/**
 * Returns Radiant win probability cached 60s server-side by matchId.
 * Cache key: 'stratz:winprob:{matchId}' (D-07 — content-keyed, never per-user).
 * TTL.WIN_PROB = 60s = 2× the 30s client poll — every poll gets fresh-enough data.
 */
export function getWinProbability(matchId: number): Promise<number | null> {
  return cached(`stratz:winprob:${matchId}`, TTL.WIN_PROB, () => fetchWinProbability(matchId), { queue: stratzQueue, upstream: 'stratz' })
}

// ─── Hero Matchups ────────────────────────────────────────────────────────────

/**
 * Fetches pro-bracket hero matchup data from Stratz heroStats.heroVsHeroMatchup.
 * Returns the raw advantage array (nested HeroDryadType structure).
 * Returns null on any error.
 *
 * NOTE (Finding 4): bracketBasicIds parameter uses DIVINE_IMMORTAL (not PROFESSIONAL — that
 * value does not exist in RankBracketBasicEnum). Verify at first API call; omit filter if error.
 * NOTE (Finding 3): advantage[] has nested vs[] — caller uses rankCountersStratz to flatten.
 * SECURITY: T-6-02 — cached by heroId only; T-6-04 — errors return null, not forwarded.
 */
async function fetchHeroMatchupsStratz(heroId: number): Promise<StratzHeroDryadEntry[] | null> {
  let res: Response
  try {
    res = await fetch(STRATZ_BASE, {
      method: 'POST',
      headers: {
        ...STRATZ_HEADERS,
        'Authorization': `Bearer ${env.STRATZ_TOKEN}`,
      },
      body: JSON.stringify({
        // NOTE: bracketBasicIds [ASSUMED] — verify at runtime. If query errors, remove the filter.
        // D-10: all pro matches (DIVINE_IMMORTAL = highest rank bracket, best approximation)
        query: `query HeroMatchups($heroId: Short!) {
          heroStats {
            heroVsHeroMatchup(heroId: $heroId, bracketBasicIds: [DIVINE_IMMORTAL]) {
              advantage {
                heroId
                vs { heroId2 winRateHeroId1 matchCount winCount }
              }
            }
          }
        }`,
        variables: { heroId },
      }),
      signal: AbortSignal.timeout(STRATZ_TIMEOUT_MS),
    })
  } catch (err) {
    // Rethrown, not swallowed: a network blip is not "this hero has no counters".
    console.error(`[stratzApi] Network error fetching matchups for hero ${heroId}:`, (err as Error).message)
    throw err
  }
  if (!res.ok) {
    // 429 → throw a retryable rate-limit error so cached()'s pRetry backs off (Stratz 500/hr).
    if (res.status === 429) {
      throw Object.assign(new Error('Stratz 429 (matchups)'), { status: 429, retryAfterMs: parseRetryAfter(res) })
    }
    // Anything else is Stratz being unavailable, which says nothing about this hero's
    // matchups. Returned as null it was cached for SIX HOURS (TTL.HERO_STATS), so a
    // single 502 emptied the counterpick list for that hero until the next patch-length
    // window elapsed. A throw is never cached, so the next draft asks again.
    // (getWinProbability deliberately keeps its null-return: 60s TTL heals itself within
    // a minute, and "Stratz does not track this match" is a real answer there.)
    throw Object.assign(new Error(`Stratz matchups unavailable: ${res.status} ${res.statusText}`), {
      status: res.status,
    })
  }
  const raw: unknown = await res.json()
  const parsed = StratzMatchupResponseSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[stratzApi] StratzMatchupSchema parse failure for hero', heroId)
    return null
  }
  return parsed.data.data?.heroStats?.heroVsHeroMatchup?.advantage ?? null
}

/**
 * Returns hero matchup advantage array cached 6h per heroId.
 * Cache key: 'stratz:matchups:v2:{heroId}' (v2 — bumped 2026-05-04 after fixing the
 * vs[].heroId2 query/transform shape mismatch that left v1 cache filled with empty
 * counter arrays for 6h).
 * TTL.HERO_STATS = 21_600s = 6h — pro matchup data as static as patch hero stats.
 */
export function getHeroMatchupsStratz(heroId: number): Promise<StratzHeroDryadEntry[] | null> {
  return cached(`stratz:matchups:v2:${heroId}`, TTL.HERO_STATS, () => fetchHeroMatchupsStratz(heroId), { queue: stratzQueue, upstream: 'stratz' })
}
