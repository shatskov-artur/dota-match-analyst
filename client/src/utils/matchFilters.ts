import type { EnrichedGame } from '../hooks/useLiveGames'
import type { ScheduleRangeEntry } from '../hooks/useArchive'
import { getStatusLabel } from './gameState'
import type { DayMode } from './day'

/**
 * One filter state for the whole home page, whichever day it is showing.
 *
 * 'draft' only ever describes a game in the live feed, and 'upcoming' only ever describes
 * a scheduled series — which chips are answerable therefore depends on the day being
 * looked at. `enabledStatuses` below states that, and the bar dims the rest rather than
 * hiding them: controls that come and go as you page through days are harder to use than
 * controls that are visibly unavailable.
 */
export type StatusFilter = 'all' | 'live' | 'draft' | 'finished' | 'upcoming'

/**
 * How big a tournament is, in the words a reader uses.
 *
 * OpenDota's own scale is `premium | professional | amateur | excluded`, which is precise
 * and means nothing to anyone outside the API. On a weekday evening the live feed is twenty
 * ladder games and four that matter, and until now the only way to tell them apart was to
 * recognise the tournament by name. These are the same three buckets the recorder decides
 * by, so what the filter says and what the archive keeps agree.
 */
export type TierFilter = 'all' | 'tier1' | 'tier23' | 'other'

/**
 * OpenDota tier name → bucket, with Valve's own number as the fallback.
 *
 * The fallback exists because the two sources fail at different times and the app should
 * not lose the answer when only one of them is down. It matters: on 2026-08-15 Valve's
 * bracket endpoint went quiet, the OpenDota tier had not been stored yet, and The
 * International — the most obviously Tier 1 event there is — sat in "Other".
 *
 * Only the two values the archive actually proves are mapped. Measured across 60 real
 * league rows: The International carries Valve tier 5, and all 59 community leagues carry
 * tier 1. The middle of Valve's scale never appeared in the data, so it is NOT guessed —
 * an unrecognised number falls through to 'other' exactly like a missing one, and the
 * OpenDota name (which does distinguish `professional`) remains the primary source.
 */
export function tierBucket(
  tier: string | null | undefined,
  valveTier?: number | null,
): Exclude<TierFilter, 'all'> {
  const t = (tier ?? '').trim().toLowerCase()
  if (t === 'premium') return 'tier1'
  if (t === 'professional') return 'tier23'
  if (t === 'amateur' || t === 'excluded') return 'other'
  // Nothing usable from OpenDota — fall back to what Valve published.
  if (valveTier != null && valveTier >= 5) return 'tier1'
  return 'other'
}

export const TIER_LABELS: Record<Exclude<TierFilter, 'all'>, string> = {
  tier1: 'Tier 1',
  tier23: 'Tier 2–3',
  other: 'Other',
}

export interface MatchFilterState {
  status: StatusFilter
  /**
   * Leagues to keep. Empty means every league — the same meaning the old single-select
   * 'all' carried, so an untouched filter bar shows everything.
   */
  leagueIds: number[]
  /** Tournament size. 'all' is the untouched state, same convention as `status`. */
  tier: TierFilter
  search: string
}

export const DEFAULT_FILTERS: MatchFilterState = {
  status: 'all',
  leagueIds: [],
  tier: 'all',
  search: '',
}

/** Which chips can be answered on this kind of day. */
export function enabledStatuses(mode: DayMode): Set<StatusFilter> {
  if (mode === 'now') return new Set<StatusFilter>(['all', 'live', 'draft', 'finished', 'upcoming'])
  if (mode === 'future') return new Set<StatusFilter>(['all', 'upcoming'])
  return new Set<StatusFilter>(['all', 'finished'])
}

// Live-ness ordering (lower = higher in list).
const STATUS_ORDER: Record<string, number> = {
  'Live': 0, 'Starting': 1, 'Strategy': 2, 'Draft': 3,
  'Waiting': 4, 'Break': 5, 'Post-game': 6, 'Unknown': 7,
}

/** Maps a raw game-state status label to the coarse status-filter bucket. */
function statusBucket(game: EnrichedGame): StatusFilter {
  const label = getStatusLabel(game.game_state, game.scoreboard)
  if (label === 'Live' || label === 'Starting' || label === 'Strategy') return 'live'
  if (label === 'Draft') return 'draft'
  if (label === 'Post-game') return 'finished'
  return 'all' // Waiting/Break/Unknown — only shown under "all"
}

export interface LeagueOption {
  id: number
  name: string
  count: number
  /** Bucket for the badge beside the name. Absent when nothing said what tier it is. */
  tier?: Exclude<TierFilter, 'all'>
}

/**
 * Distinct leagues present, with how many rows each has.
 *
 * The count is the point: a list of twenty league names says nothing about where the games
 * actually are, and the reader is choosing between "six games" and "one". Busiest first,
 * ties alphabetical so the order is stable between polls.
 */
function tally(rows: Array<{ id: number; name: string; tier: string | null | undefined }>): LeagueOption[] {
  const seen = new Map<number, LeagueOption>()
  for (const r of rows) {
    const row = seen.get(r.id) ?? { id: r.id, name: r.name, count: 0, tier: tierBucket(r.tier) }
    row.count++
    seen.set(r.id, row)
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function leagueOptions(games: EnrichedGame[]): LeagueOption[] {
  return tally(
    games.map((g) => ({
      id: g.league_id,
      name: g.league_name || `League ${g.league_id}`,
      tier: g.league_tier,
    })),
  )
}

export function leagueOptionsFromEntries(entries: readonly ScheduleRangeEntry[]): LeagueOption[] {
  return tally(
    entries.map((e) => ({
      id: e.leagueId,
      name: e.leagueName || `League ${e.leagueId}`,
      tier: e.leagueTier,
    })),
  )
}

function matchesTeam(names: Array<string | null | undefined>, query: string): boolean {
  return names.some((n) => (n ?? '').toLowerCase().includes(query))
}

/**
 * Applies status + league + team-search filters to the live feed, then sorts.
 *
 * The order is fixed rather than offered as a control. It used to be a pair of buttons,
 * but the league rank below always won: "live first" and "by duration" only ever reordered
 * within a block, and "live first" was the default anyway — two buttons for a difference
 * most readers never saw.
 *
 * Starred first, then the recorded tournament, then everything else. A star is the reader
 * saying "this one" outright, so it outranks the operator's own tracked list. On a weekday
 * evening the live feed carries twenty amateur games — FACEIT ladders, Sri Lankan
 * qualifiers, "SCAM CUP" — and four from the tournament actually being followed.
 */
export function applyFilters(
  games: EnrichedGame[],
  f: MatchFilterState,
  trackedLeagueIds: readonly number[] = [],
  /** Leagues the reader has starred, which sorts them to the front. */
  starred: readonly number[] = [],
): EnrichedGame[] {
  const tracked = new Set(trackedLeagueIds)
  const stars = new Set(starred)
  const picked = new Set(f.leagueIds)
  const rank = (g: EnrichedGame) =>
    stars.has(g.league_id) ? 0 : g.league_id !== undefined && tracked.has(g.league_id) ? 1 : 2
  const q = f.search.trim().toLowerCase()

  const filtered = games.filter(g => {
    if (f.status !== 'all' && statusBucket(g) !== f.status) return false
    if (f.tier !== 'all' && tierBucket(g.league_tier) !== f.tier) return false
    if (picked.size > 0 && !picked.has(g.league_id)) return false
    if (q && !matchesTeam([g.radiant_team?.team_name, g.dire_team?.team_name], q)) return false
    return true
  })

  return [...filtered].sort((a, b) => {
    const byLeague = rank(a) - rank(b)
    if (byLeague !== 0) return byLeague
    const ao = STATUS_ORDER[getStatusLabel(a.game_state, a.scoreboard)] ?? 3
    const bo = STATUS_ORDER[getStatusLabel(b.game_state, b.scoreboard)] ?? 3
    return ao - bo
  })
}

/**
 * The same filters over archived/scheduled series, which carry their own state.
 *
 * 'live' and 'draft' have no meaning for a row that has not been played, so they select
 * nothing here — that is what makes those chips unanswerable on a past or future day.
 * Chronological, because a day is read in the order it happened.
 */
export function applyEntryFilters(
  entries: readonly ScheduleRangeEntry[],
  f: MatchFilterState,
): ScheduleRangeEntry[] {
  const picked = new Set(f.leagueIds)
  const q = f.search.trim().toLowerCase()

  return entries
    .filter((e) => {
      if (f.status === 'draft') return false
      if (f.status !== 'all' && e.status !== f.status) return false
      if (f.tier !== 'all' && tierBucket(e.leagueTier) !== f.tier) return false
      if (picked.size > 0 && !picked.has(e.leagueId)) return false
      if (q && !matchesTeam([e.team1.name, e.team2.name], q)) return false
      return true
    })
    .sort((a, b) => a.time - b.time)
}
