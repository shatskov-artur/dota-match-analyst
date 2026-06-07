import { getStatusLabel, getSeriesLabel } from '../utils/gameState'
import StatusTag from './StatusTag'
import { formatGoldDiff } from '../utils/formatGoldDiff'
import { formatDuration } from '../utils/formatDuration'

interface ScoreHeaderProps {
  match: {
    game_state?: number
    radiant_score?: number
    dire_score?: number
    stream_delay_s?: number
    duration?: number
    roshan_respawn_timer?: number
    series_type?: number
    radiant_series_wins?: number
    dire_series_wins?: number
    radiant_team?: { team_name?: string }
    dire_team?: { team_name?: string }
    players?: Array<{ team?: number; net_worth?: number }>
    scoreboard?: object | null
  }
}

export default function ScoreHeader({ match }: ScoreHeaderProps) {
  const radiantNW = match.players
    ?.filter((p) => p.team === 0)
    .reduce((sum, p) => sum + (p.net_worth ?? 0), 0) ?? 0
  const direNW = match.players
    ?.filter((p) => p.team === 1)
    .reduce((sum, p) => sum + (p.net_worth ?? 0), 0) ?? 0
  const goldDiff = formatGoldDiff(radiantNW, direNW)

  const delayLabel = match.stream_delay_s !== undefined
    ? `~${match.stream_delay_s}s delay`
    : '~120s delay'

  const seriesLabel = getSeriesLabel(match.series_type)
  const radiantWins = match.radiant_series_wins ?? 0
  const direWins = match.dire_series_wins ?? 0
  const seriesScore = `${radiantWins}–${direWins}${seriesLabel ? ` · ${seriesLabel}` : ''}`

  const status = getStatusLabel(match.game_state, match.scoreboard)
  const gameTime = (match.duration ?? 0) > 0 ? formatDuration(match.duration!) : null
  const roshanTimer = (match.roshan_respawn_timer ?? 0) > 0 ? formatDuration(match.roshan_respawn_timer!) : null

  return (
    <div>
      {/* Score row */}
      <div className="flex flex-col gap-4 py-6 border-b border-border md:flex-row md:items-center md:justify-between">
        {/* Left: Radiant team name + kill score + series score */}
        <div className="flex flex-col gap-2 min-w-0">
          <span
            className="text-xs font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--color-radiant)' }}
          >
            {match.radiant_team?.team_name ?? 'TBD'}
          </span>
          <span className="text-[40px] md:text-[44px] lg:text-[56px] font-mono font-extrabold tabular-nums leading-none text-text">
            {match.radiant_score ?? 0}
          </span>
          <span className="text-[11px] tabular-nums tracking-[0.08em] text-text-dim">
            {seriesScore}
          </span>
        </div>

        {/* Center: StatusTag + game time + gold diff + delay disclosure */}
        <div className="flex flex-col items-center gap-3">
          <StatusTag status={status} />
          {gameTime && (
            <span className="text-sm tabular-nums font-mono text-text-muted">
              {gameTime}
            </span>
          )}
          {roshanTimer && (
            <span
              className="text-xs tabular-nums font-mono px-2 py-0.5 rounded border"
              style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', borderColor: 'var(--color-accent)' }}
            >
              Roshan {roshanTimer}
            </span>
          )}
          <span
            className="text-base tabular-nums font-mono font-bold"
            style={{ color: 'var(--color-gold)' }}
          >
            {goldDiff.text}
          </span>
          <span className="text-[11px] uppercase tracking-label text-text-dim">
            {delayLabel}
          </span>
        </div>

        {/* Right: Dire kill score + team name + series score (mirrored) */}
        <div className="flex flex-col items-start gap-2 min-w-0 md:items-end">
          <span
            className="text-xs font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--color-dire)' }}
          >
            {match.dire_team?.team_name ?? 'TBD'}
          </span>
          <span className="text-[40px] md:text-[44px] lg:text-[56px] font-mono font-extrabold tabular-nums leading-none text-text">
            {match.dire_score ?? 0}
          </span>
          <span className="text-[11px] tabular-nums tracking-[0.08em] text-text-dim">
            {seriesScore}
          </span>
        </div>
      </div>
    </div>
  )
}
