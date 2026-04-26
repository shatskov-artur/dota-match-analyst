// HeroMatchup inline type — schema removed from openDota.ts in Phase 6 (plan 03)
type HeroMatchup = {
  hero_id?: number
  hero_id2?: number
  games_played?: number
  wins?: number
}
import type { StratzHeroDryadEntry } from '../schemas/stratz.js'
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

// ─── Stratz counterpick transform (Phase 6 — replaces rankCounters for pro-bracket data) ──

/**
 * Transforms Stratz heroVsHeroMatchup advantage array into ranked CounterHeroResult[].
 * Input: advantage array from StratzMatchupResponseSchema (nested HeroDryadType structure).
 * Each entry: { heroId: opponentHeroId, vs: [{ winRateHeroId1, ... }] }
 * winRateHeroId1 < 0.5 means our hero (heroId1) loses more — these are the hard counters.
 * Sort ascending (lowest winRateHeroId1 first) → top 3 are worst matchups.
 *
 * NOTE (Finding 3): vs[] may have multiple entries (one per bracket). We use winRateHeroId1
 * from the first vs entry that has it, or fall back to 0.5 (neutral) if absent.
 */
export function rankCountersStratz(advantage: StratzHeroDryadEntry[]): CounterHeroResult[] {
  return advantage
    .flatMap(entry => {
      const heroId = entry.heroId ?? 0
      const vsEntry = (entry.vs ?? [])[0]  // first vs entry (per-bracket grouping)
      return [{
        heroId,
        winRateHeroId1: vsEntry?.winRateHeroId1 ?? 0.5,
      }]
    })
    .filter(e => e.heroId !== 0)
    .sort((a, b) => a.winRateHeroId1 - b.winRateHeroId1)
    .slice(0, 3)
    .map(e => ({ heroId: e.heroId, disadvantageScore: 1 - e.winRateHeroId1 }))
}
