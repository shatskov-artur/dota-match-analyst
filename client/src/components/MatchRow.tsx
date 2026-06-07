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
      className="relative group flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6 px-4 md:px-8 min-h-[52px] py-2 sm:py-0 border-b border-border cursor-pointer block transition-colors duration-150 hover:bg-surface-2"
    >
      {/* Left accent rail — CSS-driven (no glow per Tactical Slate override): 3px gold on hover. */}
      <span className="absolute left-0 top-0 w-[3px] h-full bg-transparent transition-colors duration-150 group-hover:bg-primary" />

      {/* Team names (Row A on phone) */}
      <span className="flex-1 min-w-0 flex items-baseline gap-2.5 text-sm">
        <span className="text-text font-medium truncate min-w-0">{radiantName}</span>
        <span className="text-text-dim font-light shrink-0">vs</span>
        <span className="text-text font-medium truncate min-w-0">{direName}</span>
      </span>

      {/* Right meta cluster (Row B on phone — wraps) */}
      <span className="shrink-0 flex flex-wrap items-center gap-5">
        {seriesLabel && (
          <span className="text-text-dim text-[11px] tracking-[0.1em] tabular-nums">
            {radiantWins}–{direWins}
            <span className="ml-1.5 text-text-dim">{seriesLabel}</span>
          </span>
        )}
        <StatusTag status={statusLabel} />
        {game.duration !== undefined && (
          <span className="text-text-dim text-[11px] tabular-nums font-mono tracking-wide">
            {formatDuration(game.duration)}
          </span>
        )}
      </span>
    </Link>
  )
}
