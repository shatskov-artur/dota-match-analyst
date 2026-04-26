import { Link } from 'react-router'
import StatusTag from './StatusTag'
import { getStatusLabel, getSeriesLabel } from '../utils/gameState'
import { formatDuration } from '../utils/formatDuration'
import type { EnrichedGame } from '../hooks/useLiveGames'

interface MatchRowProps {
  game: EnrichedGame
}

export default function MatchRow({ game }: MatchRowProps) {
  const radiantName = game.radiant_team?.team_name ?? 'TBD'
  const direName = game.dire_team?.team_name ?? 'TBD'
  const statusLabel = getStatusLabel(game.game_state, game.scoreboard)
  const seriesLabel = getSeriesLabel(game.series_type)
  const radiantWins = game.radiant_series_wins ?? 0
  const direWins = game.dire_series_wins ?? 0

  return (
    <Link
      to={`/match/${game.match_id}`}
      className="relative group flex items-center gap-6 px-8 min-h-[52px] border-b border-[#1a1a1a] cursor-pointer block"
      style={{ transition: 'background 160ms ease' }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = '#111111'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {/* Left ember accent bar on hover — group-hover drives color, relative parent constrains position */}
      <span
        className="absolute left-0 top-0 w-[2px] h-full group-hover:bg-[#b03030]"
        style={{ transition: 'background 160ms ease' }}
      />

      {/* Team names */}
      <span className="flex-1 min-w-0 flex items-baseline gap-2.5 text-sm">
        <span className="text-[#d8d8d8] font-medium truncate">{radiantName}</span>
        <span className="text-[#303030] font-light shrink-0">vs</span>
        <span className="text-[#d8d8d8] font-medium truncate">{direName}</span>
      </span>

      {/* Right meta cluster */}
      <span className="shrink-0 flex items-center gap-5">
        {seriesLabel && (
          <span className="text-[#424242] text-[11px] tracking-[0.1em] tabular-nums">
            {radiantWins}–{direWins}
            <span className="ml-1.5 text-[#303030]">{seriesLabel}</span>
          </span>
        )}
        <StatusTag status={statusLabel} />
        {game.duration !== undefined && (
          <span className="text-[#383838] text-[11px] tabular-nums font-mono tracking-wide">
            {formatDuration(game.duration)}
          </span>
        )}
      </span>
    </Link>
  )
}
