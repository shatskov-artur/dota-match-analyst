import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import SeriesTabs, { seriesScore } from './SeriesTabs'
import type { ArchivedMatch } from '../hooks/useArchive'

const game = (over: Partial<ArchivedMatch>): ArchivedMatch => ({
  matchId: 1,
  seriesId: 50,
  leagueId: 19719,
  leagueName: 'The International 2026',
  gameInSeries: 1,
  radiantTeamName: 'Team A',
  direTeamName: 'Team B',
  radiantLogoUrl: null,
  direLogoUrl: null,
  startTime: 1_786_000_000,
  duration: 2400,
  radiantWin: null,
  radiantScore: 0,
  direScore: 0,
  ingestStatus: 'complete',
  snapshotCount: 10,
  ...over,
})

const renderTabs = (games: ArchivedMatch[], currentMatchId = '1', bestOf: number | null = 3) =>
  render(
    <MemoryRouter>
      <SeriesTabs games={games} currentMatchId={currentMatchId} bestOf={bestOf} />
    </MemoryRouter>,
  )

describe('SeriesTabs', () => {
  it('renders nothing for a single-map series — there is nothing to switch between', () => {
    const { container } = renderTabs([game({ matchId: 1 })])
    expect(container.firstChild).toBeNull()
  })

  it('lists every map in the series', () => {
    renderTabs([
      game({ matchId: 1, gameInSeries: 1 }),
      game({ matchId: 2, gameInSeries: 2 }),
      game({ matchId: 3, gameInSeries: 3 }),
    ])
    expect(screen.getByText('Game 1')).toBeTruthy()
    expect(screen.getByText('Game 2')).toBeTruthy()
    expect(screen.getByText('Game 3')).toBeTruthy()
  })

  it('marks the map being viewed as the current page', () => {
    renderTabs(
      [game({ matchId: 1, gameInSeries: 1 }), game({ matchId: 2, gameInSeries: 2 })],
      '2',
    )
    const current = screen.getByText('Game 2').closest('a')
    expect(current?.getAttribute('aria-current')).toBe('page')
  })

  it('links each map to its own match page — the point of the feature', () => {
    renderTabs([game({ matchId: 111, gameInSeries: 1 }), game({ matchId: 222, gameInSeries: 2 })])
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toContain('/match/111')
    expect(links).toContain('/match/222')
  })

  it('flags the map that is still being played', () => {
    renderTabs([
      game({ matchId: 1, gameInSeries: 1, radiantWin: true }),
      game({ matchId: 2, gameInSeries: 2, ingestStatus: 'live' }),
    ])
    expect(screen.getByText('● live')).toBeTruthy()
  })

  it('shows the final score of a decided map', () => {
    renderTabs([
      game({ matchId: 1, gameInSeries: 1, radiantWin: true, radiantScore: 42, direScore: 31 }),
      game({ matchId: 2, gameInSeries: 2, ingestStatus: 'live' }),
    ])
    expect(screen.getByText('42:31')).toBeTruthy()
  })

  it('counts the series score by team, not by side', () => {
    // Sides swap between maps: counting radiantWin alone would credit the wrong team.
    renderTabs([
      game({ matchId: 1, gameInSeries: 1, radiantTeamName: 'A', direTeamName: 'B', radiantWin: true }),
      game({ matchId: 2, gameInSeries: 2, radiantTeamName: 'B', direTeamName: 'A', radiantWin: false }),
    ])
    // A won map 1 as Radiant and map 2 as Dire → 2:0, not 1:1.
    const scoreLine = screen.getByText(/A/).textContent ?? ''
    expect(scoreLine.replace(/\s+/g, ' ')).toContain('2')
    expect(screen.getByText('Best of 3')).toBeTruthy()
  })

  it('falls back to a neutral label when the format is unknown', () => {
    renderTabs([game({ matchId: 1, gameInSeries: 1 }), game({ matchId: 2, gameInSeries: 2 })], '1', null)
    expect(screen.getByText('Series')).toBeTruthy()
  })
})

describe('seriesScore', () => {
  const played = (over: Partial<ArchivedMatch> & { matchId: number }) =>
    game({ radiantTeamName: 'Team Falcons', direTeamName: 'LGD Gaming', ...over })

  /**
   * The bug this exists for: game 3 of Falcons–LGD had visibly ended 2-1, and the page
   * still said 1-1. Our own count needs `radiantWin`, which OpenDota only supplies once
   * it has parsed the replay — the row sat at ingestStatus 'live' for half an hour while
   * Valve's bracket had already published 2-1.
   */
  it('uses Valve’s score while the last map is still awaiting its replay', () => {
    const games = [
      played({ matchId: 1, gameInSeries: 1, radiantWin: false }),
      played({ matchId: 2, gameInSeries: 2, radiantWin: true }),
      played({ matchId: 3, gameInSeries: 3, radiantWin: null, ingestStatus: 'live' }),
    ]
    const score = seriesScore(games, {
      team1Name: 'Team Falcons',
      team2Name: 'LGD Gaming',
      team1Wins: 2,
      team2Wins: 1,
    })
    expect(score).toEqual({ nameA: 'Team Falcons', nameB: 'LGD Gaming', a: 2, b: 1 })
  })

  it('keeps our own count when Valve is the one lagging', () => {
    // Neither source may drag the score backwards, so this is a max, not a preference.
    const games = [
      played({ matchId: 1, gameInSeries: 1, radiantWin: true }),
      played({ matchId: 2, gameInSeries: 2, radiantWin: true }),
    ]
    const score = seriesScore(games, {
      team1Name: 'Team Falcons',
      team2Name: 'LGD Gaming',
      team1Wins: 0,
      team2Wins: 0,
    })
    expect(score).toMatchObject({ a: 2, b: 0 })
  })

  it('counts by team name, because sides swap between maps', () => {
    const games = [
      played({ matchId: 1, gameInSeries: 1, radiantWin: true }),
      // Same series, teams swapped sides — Falcons is Dire here and wins again.
      played({ matchId: 2, gameInSeries: 2, radiantTeamName: 'LGD Gaming', direTeamName: 'Team Falcons', radiantWin: false }),
    ]
    expect(seriesScore(games)).toMatchObject({ nameA: 'Team Falcons', a: 2, b: 0 })
  })

  it('ignores a Valve score attached to different teams', () => {
    // Guards against crediting team_1_wins to whoever happens to be first in our list.
    const games = [played({ matchId: 1, gameInSeries: 1, radiantWin: true })]
    const score = seriesScore(games, {
      team1Name: 'Team Spirit',
      team2Name: 'Xtreme Gaming',
      team1Wins: 2,
      team2Wins: 0,
    })
    expect(score).toEqual({ nameA: 'Team Falcons', nameB: 'LGD Gaming', a: 1, b: 0 })
  })

  it('credits Valve correctly when it lists the two teams the other way round', () => {
    // Valve's team_1 is not necessarily our radiant side of map one.
    const games = [played({ matchId: 1, gameInSeries: 1, radiantWin: null, ingestStatus: 'live' })]
    const score = seriesScore(games, {
      team1Name: 'LGD Gaming',
      team2Name: 'Team Falcons',
      team1Wins: 0,
      team2Wins: 2,
    })
    expect(score).toEqual({ nameA: 'Team Falcons', nameB: 'LGD Gaming', a: 2, b: 0 })
  })

  it('tolerates the trailing whitespace OpenDota puts on some team names', () => {
    const games = [played({ matchId: 1, gameInSeries: 1, radiantTeamName: 'Nigma Galaxy ', direTeamName: 'Iron Wing', radiantWin: true })]
    const score = seriesScore(games, { team1Name: 'Nigma Galaxy', team2Name: 'Iron Wing', team1Wins: 0, team2Wins: 0 })
    expect(score).toMatchObject({ nameA: 'Nigma Galaxy', a: 1, b: 0 })
  })

  it('returns null when neither source names the teams', () => {
    expect(seriesScore([game({ matchId: 1, radiantTeamName: null, direTeamName: null })])).toBeNull()
  })
})
