import { Link } from 'react-router'
import clsx from 'clsx'
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
  const statusLabel = getStatusLabel(game.game_state)
  const seriesLabel = getSeriesLabel(game.series_type)
  const radiantWins = game.radiant_series_wins ?? 0
  const direWins = game.dire_series_wins ?? 0

  return (
    <Link
      to={`/match/${game.match_id}`}
      className={clsx(
        'flex items-center gap-4 px-4 min-h-[44px]',
        'border-b border-gray-800 hover:bg-gray-900 cursor-pointer block',
      )}
    >
      {/* Team names — flex-1 takes remaining width */}
      <span className="flex-1 text-white text-sm font-normal">
        {radiantName}
        <span className="text-gray-500"> vs </span>
        {direName}
      </span>

      {/* Right-side: series score, status tag, duration — pushed right with ml-auto */}
      <span className="ml-auto flex items-center gap-3">
        {seriesLabel && (
          <span className="text-gray-400 text-xs font-normal">
            {radiantWins}-{direWins} {seriesLabel}
          </span>
        )}
        <StatusTag status={statusLabel} />
        {/* D-04: duration absent during draft — guard !== undefined (not falsy, 0 is valid) */}
        {game.duration !== undefined && (
          <span className="text-gray-400 text-xs font-normal">
            {formatDuration(game.duration)}
          </span>
        )}
      </span>
    </Link>
  )
}
