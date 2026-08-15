import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScoreHeader from './ScoreHeader'

/**
 * The state a finished match is actually rendered from: its last live snapshot, taken at
 * 36:33 of a game that ran to 37:11. Valve's live scoreboard said 8–33 there; the parsed
 * replay says the match ended 7–37. Both numbers are true about different moments, and the
 * header has to show the one the reader is asking about.
 */
const SNAPSHOT = {
  game_state: 5,
  duration: 2193,
  series_type: 1,
  radiant_series_wins: 0,
  dire_series_wins: 0,
  radiant_team: { team_name: 'Team Spirit' },
  dire_team: { team_name: 'TEAM VISION' },
  scoreboard: { radiant: { score: 8 }, dire: { score: 33 } },
}

describe('ScoreHeader', () => {
  it('shows the snapshot score while no final result is available', () => {
    render(<ScoreHeader match={SNAPSHOT} />)
    expect(screen.getByText('8')).toBeTruthy()
    expect(screen.getByText('33')).toBeTruthy()
    expect(screen.getByText('36:33')).toBeTruthy()
  })

  it('prefers the parsed final result over the last sample', () => {
    render(
      <ScoreHeader
        match={SNAPSHOT}
        isLive={false}
        finalResult={{ radiantScore: 7, direScore: 37, duration: 2231 }}
      />,
    )
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('37')).toBeTruthy()
    // The clock stopped when sampling did, so it moves to the real ending too.
    expect(screen.getByText('37:11')).toBeTruthy()
    expect(screen.queryByText('36:33')).toBeNull()
  })

  it('keeps a real 0 from the final result instead of falling back', () => {
    // A shutout must not read as "no data" and revert to the snapshot's score.
    render(<ScoreHeader match={SNAPSHOT} finalResult={{ radiantScore: 0, direScore: 12, duration: 900 }} />)
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.queryByText('8')).toBeNull()
  })

  it('reports the series score passed in rather than the snapshot’s own', () => {
    // The snapshot was taken before its own map counted, so it carries 0-0.
    render(<ScoreHeader match={SNAPSHOT} isLive={false} seriesWins={{ radiant: 0, dire: 1 }} />)
    expect(screen.getAllByText('0–1 · Bo3').length).toBe(2)
    expect(screen.queryByText('0–0 · Bo3')).toBeNull()
  })

  it('badges a finished match post-game even though the snapshot says in-game', () => {
    render(<ScoreHeader match={SNAPSHOT} isLive={false} />)
    expect(screen.queryByText(/live/i)).toBeNull()
  })

  it('shows the Roshan countdown while the game is being played', () => {
    const { container } = render(<ScoreHeader match={{ ...SNAPSHOT, roshan_respawn_timer: 15 }} />)
    expect(container.textContent).toContain('Roshan 0:15')
  })

  it('keeps the Roshan countdown when a past minute is being replayed', () => {
    const withRoshan = { ...SNAPSHOT, roshan_respawn_timer: 15 }
    // Scrubbing a finished match: isLive is false, but the minute on screen was live.
    const { container } = render(<ScoreHeader match={withRoshan} isLive={false} atLiveMoment />)
    expect(container.textContent).toContain('Roshan 0:15')
  })

  it('hides the frozen Roshan countdown on the end state of a finished match', () => {
    const withRoshan = { ...SNAPSHOT, roshan_respawn_timer: 15 }
    const { container } = render(
      <ScoreHeader match={withRoshan} isLive={false} atLiveMoment={false} />,
    )
    expect(container.textContent).not.toContain('Roshan')
  })

  it('drops the stream-delay disclosure once there is no stream to trail', () => {
    const live = render(<ScoreHeader match={{ ...SNAPSHOT, stream_delay_s: 10 }} />)
    expect(live.container.textContent).toContain('~10s delay')
    live.unmount()

    const ended = render(<ScoreHeader match={{ ...SNAPSHOT, stream_delay_s: 10 }} atLiveMoment={false} />)
    expect(ended.container.textContent).not.toContain('delay')
  })
})
