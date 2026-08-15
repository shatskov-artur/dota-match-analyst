import { describe, it, expect } from 'vitest'
import {
  applyEntryFilters,
  applyFilters,
  enabledStatuses,
  leagueOptions,
  leagueOptionsFromEntries,
  tierBucket,
  DEFAULT_FILTERS,
} from './matchFilters'
import type { EnrichedGame } from '../hooks/useLiveGames'
import type { ScheduleRangeEntry } from '../hooks/useArchive'

// Minimal game factory — only the fields the filters read.
function game(p: Partial<EnrichedGame> & { match_id: number }): EnrichedGame {
  return {
    league_id: 1,
    league_name: 'TI 2026',
    league_tier: 'premium',
    radiant_team: { team_name: 'Team Spirit' },
    dire_team: { team_name: 'Gaimin Gladiators' },
    ...p,
  } as EnrichedGame
}

// game_state 5 = Live, 2 = Draft, 6 = Post-game (per gameState.ts)
const live = game({ match_id: 1, game_state: 5, duration: 1900 })
const draft = game({ match_id: 2, game_state: 2, league_id: 2, league_name: 'DreamLeague',
  league_tier: 'professional',
  radiant_team: { team_name: 'Falcons' }, dire_team: { team_name: 'Team Liquid' } })
const finished = game({ match_id: 3, game_state: 6, duration: 2400,
  radiant_team: { team_name: 'OG' }, dire_team: { team_name: 'Tundra' } })

const all = [draft, finished, live]

describe('applyFilters', () => {
  it('status=all returns everything', () => {
    expect(applyFilters(all, DEFAULT_FILTERS)).toHaveLength(3)
  })

  it('status=live keeps only live matches', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, status: 'live' })
    expect(r.map(g => g.match_id)).toEqual([1])
  })

  it('status=draft keeps only draft matches', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, status: 'draft' })
    expect(r.map(g => g.match_id)).toEqual([2])
  })

  it('status=finished keeps only post-game matches', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, status: 'finished' })
    expect(r.map(g => g.match_id)).toEqual([3])
  })

  it('league filter keeps only the chosen leagues', () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, leagueIds: [2] }).map(g => g.match_id)).toEqual([2])
    // League 1 runs two of the three games; picking it keeps both.
    expect(applyFilters(all, { ...DEFAULT_FILTERS, leagueIds: [1] }).map(g => g.match_id).sort()).toEqual([1, 3])
    // Several at once — the point of the multi-select that replaced the dropdown.
    expect(applyFilters(all, { ...DEFAULT_FILTERS, leagueIds: [1, 2] })).toHaveLength(3)
  })

  it('an empty league list means every league, not none', () => {
    // The default state. Reading it as "nothing selected → show nothing" would open the
    // page on an empty grid.
    expect(applyFilters(all, DEFAULT_FILTERS)).toHaveLength(all.length)
  })

  it('a star sorts its league to the front without hiding the others', () => {
    // A star outranks the operator's tracked list: league 2 leads even though 1 is tracked.
    expect(applyFilters(all, DEFAULT_FILTERS, [1], [2])[0].match_id).toBe(2)
    // It orders, it does not filter — the "starred only" chip that used to do both is gone.
    expect(applyFilters(all, DEFAULT_FILTERS, [], [2])).toHaveLength(3)
  })

  it('team search matches radiant or dire name, case-insensitive', () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, search: 'spirit' }).map(g => g.match_id)).toEqual([1])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, search: 'tundra' }).map(g => g.match_id)).toEqual([3])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, search: 'zzz' })).toHaveLength(0)
  })

  it('orders by live-ness, with no sort control to choose otherwise', () => {
    // The pair of sort buttons is gone: league rank always won, so "by duration" only ever
    // reordered within a block and "live first" was the default.
    expect(applyFilters(all, DEFAULT_FILTERS).map(g => g.match_id)).toEqual([1, 2, 3])
  })

  it('combines filters: live + search', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, status: 'live', search: 'spirit' })
    expect(r.map(g => g.match_id)).toEqual([1])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, status: 'live', search: 'og' })).toHaveLength(0)
  })
})

describe('leagueOptions', () => {
  it('counts the games each league is running, busiest first', () => {
    // all = [draft(league 2), finished(league 1), live(league 1)] → TI has two, DL one.
    // The count is what the picker is read for; first-seen order said nothing useful.
    expect(leagueOptions(all)).toEqual([
      { id: 1, name: 'TI 2026', count: 2, tier: 'tier1' },
      { id: 2, name: 'DreamLeague', count: 1, tier: 'tier23' },
    ])
  })

  it('dedupes repeated leagues', () => {
    const dup = [live, game({ match_id: 9, league_id: 1, league_name: 'TI 2026' })]
    expect(leagueOptions(dup)).toHaveLength(1)
  })
})

describe('applyFilters — tracked leagues first', () => {
  const g = (over: Partial<EnrichedGame> & { match_id: number }): EnrichedGame => ({
    league_id: 999,
    league_name: 'Some ladder',
    game_state: 5,
    duration: 600,
    ...over,
  } as EnrichedGame)

  /**
   * The reported problem: on a weekday evening the live feed carried twenty amateur games
   * and four from The International, and sorting by status alone interleaved them.
   */
  it('puts the recorded tournament above everything else', () => {
    const games = [
      g({ match_id: 1, league_id: 999 }),
      g({ match_id: 2, league_id: 19719 }),
      g({ match_id: 3, league_id: 888 }),
      g({ match_id: 4, league_id: 19719 }),
    ]
    const out = applyFilters(games, DEFAULT_FILTERS, [19719])
    expect(out.slice(0, 2).map((m) => m.match_id).sort()).toEqual([2, 4])
  })

  it('sorts by live-ness inside each block', () => {
    const games = [
      g({ match_id: 1, league_id: 19719, game_state: 2 }), // tracked, still drafting
      g({ match_id: 2, league_id: 19719, game_state: 5 }), // tracked, live
      g({ match_id: 3, league_id: 999, game_state: 5 }), // amateur, live
    ]
    // Both tracked games come first, live ahead of draft inside that block — the live
    // amateur game does not jump the queue.
    expect(applyFilters(games, DEFAULT_FILTERS, [19719]).map((m) => m.match_id)).toEqual([2, 1, 3])
  })

  it('behaves exactly as before when nothing is tracked', () => {
    const games = [g({ match_id: 1, league_id: 999 }), g({ match_id: 2, league_id: 19719 })]
    expect(applyFilters(games, DEFAULT_FILTERS, []).map((m) => m.match_id)).toEqual(
      applyFilters(games, DEFAULT_FILTERS).map((m) => m.match_id),
    )
  })
})

// ─── Scheduled and archived series ───────────────────────────────────────────

function entry(p: Partial<ScheduleRangeEntry> & { seriesId: number }): ScheduleRangeEntry {
  return {
    leagueId: 1,
    leagueName: 'TI 2026',
    leagueTier: 'premium',
    nodeId: null,
    nodeGroupName: null,
    name: null,
    status: 'upcoming',
    bestOf: 3,
    scheduledTime: null,
    actualTime: null,
    time: 1_786_600_000,
    matchIds: [],
    team1: { id: 1, name: 'Team Spirit', tag: null, logoUrl: null, wins: null },
    team2: { id: 2, name: 'Falcons', tag: null, logoUrl: null, wins: null },
    ...p,
  } as ScheduleRangeEntry
}

const played = entry({ seriesId: 1, status: 'finished', time: 200 })
const running = entry({ seriesId: 2, status: 'live', time: 100, leagueId: 2, leagueName: 'DreamLeague', leagueTier: 'professional' })
const announced = entry({ seriesId: 3, status: 'upcoming', time: 300 })
const dayRows = [played, running, announced]

describe('applyEntryFilters', () => {
  it('orders a day chronologically whatever order it arrived in', () => {
    expect(applyEntryFilters(dayRows, DEFAULT_FILTERS).map((e) => e.seriesId)).toEqual([2, 1, 3])
  })

  it('matches the status chip against the series own state', () => {
    expect(applyEntryFilters(dayRows, { ...DEFAULT_FILTERS, status: 'finished' }).map((e) => e.seriesId)).toEqual([1])
    expect(applyEntryFilters(dayRows, { ...DEFAULT_FILTERS, status: 'upcoming' }).map((e) => e.seriesId)).toEqual([3])
  })

  it('selects nothing for draft, which only a live game can be in', () => {
    // This is why the chip is dimmed on a past or future day rather than quietly empty.
    expect(applyEntryFilters(dayRows, { ...DEFAULT_FILTERS, status: 'draft' })).toHaveLength(0)
  })

  it('filters by league and by team name', () => {
    expect(applyEntryFilters(dayRows, { ...DEFAULT_FILTERS, leagueIds: [2] }).map((e) => e.seriesId)).toEqual([2])
    expect(applyEntryFilters(dayRows, { ...DEFAULT_FILTERS, search: 'falcons' })).toHaveLength(3)
    expect(applyEntryFilters(dayRows, { ...DEFAULT_FILTERS, search: 'zzz' })).toHaveLength(0)
  })
})

describe('enabledStatuses', () => {
  it('offers every chip only on the live day', () => {
    expect([...enabledStatuses('now')].sort()).toEqual(['all', 'draft', 'finished', 'live', 'upcoming'])
  })

  it('a future day can only be scheduled, a past day can only be played', () => {
    expect([...enabledStatuses('future')].sort()).toEqual(['all', 'upcoming'])
    expect([...enabledStatuses('past')].sort()).toEqual(['all', 'finished'])
  })
})

describe('leagueOptionsFromEntries', () => {
  it('counts a day series per league, busiest first', () => {
    expect(leagueOptionsFromEntries(dayRows)).toEqual([
      { id: 1, name: 'TI 2026', count: 2, tier: 'tier1' },
      { id: 2, name: 'DreamLeague', count: 1, tier: 'tier23' },
    ])
  })
})

// ─── Tier filter ─────────────────────────────────────────────────────────────────────
//
// The question the list could not answer: a weekday evening carries twenty amateur ladder
// games and four that matter, and telling them apart meant recognising the tournament by
// name. These buckets are the same ones the recorder decides by, so what the filter shows
// and what the archive keeps cannot disagree.

describe('tierBucket', () => {
  it('maps OpenDota tiers onto the words a reader of Dota uses', () => {
    expect(tierBucket('premium')).toBe('tier1')
    expect(tierBucket('professional')).toBe('tier23')
    expect(tierBucket('amateur')).toBe('other')
    expect(tierBucket('excluded')).toBe('other')
  })

  it('puts "we do not know" in Other rather than inventing a verdict', () => {
    expect(tierBucket(null)).toBe('other')
    expect(tierBucket(undefined)).toBe('other')
    expect(tierBucket('')).toBe('other')
  })

  it('tolerates the casing and padding OpenDota actually sends', () => {
    expect(tierBucket(' Premium ')).toBe('tier1')
    expect(tierBucket('PROFESSIONAL')).toBe('tier23')
  })
})

describe('applyFilters — by tier', () => {
  it('keeps only the top tier when Tier 1 is picked', () => {
    // live + finished are league 1 (premium); draft is league 2 (professional).
    const r = applyFilters(all, { ...DEFAULT_FILTERS, tier: 'tier1' })
    expect(r.map((g) => g.match_id).sort()).toEqual([1, 3])
  })

  it('keeps only the pro circuit when Tier 2-3 is picked', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, tier: 'tier23' })
    expect(r.map((g) => g.match_id)).toEqual([2])
  })

  it('sweeps ladders and unknown tournaments into Other', () => {
    const ladder = game({ match_id: 7, league_id: 9, league_name: 'Open Ladder', league_tier: 'amateur' })
    const unknown = game({ match_id: 8, league_id: 10, league_name: 'Mystery Cup', league_tier: null })
    const r = applyFilters([...all, ladder, unknown], { ...DEFAULT_FILTERS, tier: 'other' })
    expect(r.map((g) => g.match_id).sort()).toEqual([7, 8])
  })

  it('shows everything by default, so an untouched bar hides nothing', () => {
    expect(applyFilters(all, DEFAULT_FILTERS)).toHaveLength(3)
  })

  it('combines with the other filters rather than replacing them', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, tier: 'tier1', status: 'live' })
    expect(r.map((g) => g.match_id)).toEqual([1])
  })
})

describe('applyEntryFilters — by tier', () => {
  it('filters an archived day the same way as the live grid', () => {
    // played + announced are league 1 (premium); running is league 2 (professional).
    expect(
      applyEntryFilters(dayRows, { ...DEFAULT_FILTERS, tier: 'tier1' }).map((e) => e.seriesId),
    ).toEqual([1, 3])
    expect(
      applyEntryFilters(dayRows, { ...DEFAULT_FILTERS, tier: 'tier23' }).map((e) => e.seriesId),
    ).toEqual([2])
  })

  it('leaves a day untouched when no tier is chosen', () => {
    expect(applyEntryFilters(dayRows, DEFAULT_FILTERS)).toHaveLength(3)
  })
})
