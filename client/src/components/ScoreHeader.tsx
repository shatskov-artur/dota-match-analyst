import { getStatusLabel, getSeriesLabel } from '../utils/gameState'
import StatusTag from './StatusTag'
import { formatGoldDiff } from '../utils/formatGoldDiff'

interface ScoreHeaderProps {
  match: {
    game_state?: number
    radiant_score?: number
    dire_score?: number
    stream_delay_s?: number
    series_type?: number
    radiant_series_wins?: number
    dire_series_wins?: number
    radiant_team?: { team_name?: string }
    dire_team?: { team_name?: string }
    players?: Array<{ team?: number; net_worth?: number }>
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

  const status = getStatusLabel(match.game_state)

  return (
    <div>
      {/* Score row */}
      <div
        className="flex items-center justify-between py-6"
        style={{ borderBottom: '1px solid #1a1a1a' }}
      >
        {/* Left: Radiant team name + kill score + series score */}
        <div className="flex flex-col gap-1">
          <span
            className="text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: '#4ade80' }}
          >
            {match.radiant_team?.team_name ?? 'TBD'}
          </span>
          <span
            className="text-[28px] font-bold tabular-nums font-mono leading-none"
            style={{ color: '#d8d8d8' }}
          >
            {match.radiant_score ?? 0}
          </span>
          <span
            className="text-[10px] tabular-nums tracking-[0.1em]"
            style={{ color: '#303030' }}
          >
            {seriesScore}
          </span>
        </div>

        {/* Center: StatusTag + gold diff + delay disclosure */}
        <div className="flex flex-col items-center gap-2">
          <StatusTag status={status} />
          <span
            className="text-sm tabular-nums font-mono font-bold"
            style={{ color: goldDiff.color }}
          >
            {goldDiff.text}
          </span>
          <span
            className="text-[10px] tracking-[0.15em] uppercase"
            style={{ color: '#303030' }}
          >
            {delayLabel}
          </span>
        </div>

        {/* Right: Dire kill score + team name + series score (mirrored) */}
        <div className="flex flex-col items-end gap-1">
          <span
            className="text-sm font-bold uppercase tracking-[0.15em]"
            style={{ color: '#ef4444' }}
          >
            {match.dire_team?.team_name ?? 'TBD'}
          </span>
          <span
            className="text-[28px] font-bold tabular-nums font-mono leading-none"
            style={{ color: '#d8d8d8' }}
          >
            {match.dire_score ?? 0}
          </span>
          <span
            className="text-[10px] tabular-nums tracking-[0.1em]"
            style={{ color: '#303030' }}
          >
            {seriesScore}
          </span>
        </div>
      </div>
    </div>
  )
}
