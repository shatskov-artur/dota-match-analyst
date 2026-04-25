import type { HeroMatchup } from '../schemas/openDota.js'
import { hiddenProfile } from '../../../shared/hiddenProfile.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CounterHeroResult {
  heroId: number
  disadvantageScore: number
}

export interface PlayerStatsResult {
  games: number
  win: number
  heroId: number
}

export interface PlayerIntelEntry {
  accountId: number
  heroId: number
  stats: PlayerStatsResult | null  // null = hidden profile or OpenDota unavailable
}

// ─── Pure helpers (exported for unit testing — Wave 0 intel.test.ts) ─────────

/**
 * Ranks hero matchup entries by disadvantage score (wins/games_played DESC).
 * Filters out entries with games_played === 0 (division-by-zero guard).
 * Accepts both `hero_id` and `hero_id2` field names (assumption A3).
 * Returns top-3 only (D-05).
 */
export function rankCounters(matchups: HeroMatchup[]): CounterHeroResult[] {
  return matchups
    .filter(m => (m.games_played ?? 0) > 0)
    .map(m => ({
      heroId: m.hero_id ?? m.hero_id2 ?? 0,
      disadvantageScore: (m.wins ?? 0) / (m.games_played ?? 1),
    }))
    .sort((a, b) => b.disadvantageScore - a.disadvantageScore)
    .slice(0, 3)
}

/**
 * D-09 threshold: player is "known to play" a hero when games >= 10 AND win/games > 0.5.
 * Applied server-side — client receives pre-computed knownPlayers: string[].
 */
export function applyKnownToPlay(heroStat: { games?: number; win?: number }): boolean {
  const games = heroStat.games ?? 0
  const win = heroStat.win ?? 0
  if (games < 10) return false
  if (games === 0) return false
  return win / games > 0.5
}

/**
 * Builds per-player intel entry for a single player + hero combination.
 * PLAYER-02: hidden profiles (account_id=4294967295) short-circuit — no OpenDota call made.
 *
 * @param accountId      Valve account_id for this player
 * @param heroId         hero_id this player is playing
 * @param _opponentPlayers  reserved for future "known to play" cross-check (not used in this pure helper)
 * @param fetchFn        injected fetch function (getPlayerHeroes) — injectable for testing
 */
export async function buildPlayerIntelEntry(
  accountId: number,
  heroId: number,
  _opponentPlayers: unknown[],
  fetchFn: (id: number) => Promise<Array<{ hero_id?: string | number; games?: number; win?: number }> | null>,
): Promise<PlayerIntelEntry> {
  // PLAYER-02: hidden profile short-circuit — never call OpenDota for account 4294967295
  if (hiddenProfile(accountId)) {
    return { accountId, heroId, stats: null }
  }

  const heroes = await fetchFn(accountId)
  if (!heroes) {
    return { accountId, heroId, stats: null }
  }

  // Coerce hero_id to number for comparison (assumption A2: may be string or number)
  const entry = heroes.find(h => Number(h.hero_id) === heroId)
  if (!entry) {
    return { accountId, heroId, stats: null }
  }

  return {
    accountId,
    heroId,
    stats: {
      heroId,
      games: entry.games ?? 0,
      win: entry.win ?? 0,
    },
  }
}
