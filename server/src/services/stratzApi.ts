import { cached, TTL } from '../cache.js'
import { StratzWinProbResponseSchema, StratzMatchupResponseSchema } from '../schemas/stratz.js'
import type { StratzHeroDryadEntry } from '../schemas/stratz.js'
import { env } from '../env.js'

const STRATZ_BASE = 'https://api.stratz.com/graphql'
const STRATZ_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'STRATZ_API',
}

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
    })
  } catch (err) {
    console.error('[stratzApi] Network error fetching winprob:', (err as Error).message)
    return null
  }
  if (!res.ok) {
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
  return cached(`stratz:winprob:${matchId}`, TTL.WIN_PROB, () => fetchWinProbability(matchId))
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
    })
  } catch (err) {
    console.error(`[stratzApi] Network error fetching matchups for hero ${heroId}:`, (err as Error).message)
    return null
  }
  if (!res.ok) {
    console.error(`[stratzApi] Hero matchups fetch error: ${res.status} ${res.statusText}`)
    return null
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
  return cached(`stratz:matchups:v2:${heroId}`, TTL.HERO_STATS, () => fetchHeroMatchupsStratz(heroId))
}
