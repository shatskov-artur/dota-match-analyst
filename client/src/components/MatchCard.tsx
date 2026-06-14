import { Link } from 'react-router'
import StatusTag from './StatusTag'
import { getStatusLabel, getSeriesLabel } from '../utils/gameState'
import { formatDuration } from '../utils/formatDuration'
import type { EnrichedGame } from '../hooks/useLiveGames'

interface MatchCardProps {
  game: EnrichedGame
  /** Featured tile spans 2x2 on laptop+ and shows extra in-game stats. */
  featured?: boolean
}

/**
 * Neon Bento match tile (replaces the old MatchRow). Mobile-first:
 * one column on phone, the grid (MatchBentoGrid) handles span widths.
 * Each tile is a flex column so the status pill pins to the bottom and the
 * content fills the tile height (ui-ux-pro-max Bento: "content fits cards").
 */
export default function MatchCard({ game, featured = false }: MatchCardProps) {
  const radiantName = game.radiant_team?.team_name ?? 'TBD'
  const direName = game.dire_team?.team_name ?? 'TBD'
  const statusLabel = getStatusLabel(game.game_state, game.scoreboard)
  const seriesLabel = getSeriesLabel(game.series_type)
  const radiantWins = game.radiant_series_wins ?? 0
  const direWins = game.dire_series_wins ?? 0

  // In-game kill scores (featured stat strip only)
  const radKills = game.scoreboard?.radiant?.score ?? game.radiant_score
  const direKills = game.scoreboard?.dire?.score ?? game.dire_score
  const hasKills = radKills !== undefined && direKills !== undefined

  return (
    <Link
      to={`/match/${game.match_id}`}
      className={[
        'group flex flex-col w-full h-full rounded-lg border border-border bg-surface p-5 cursor-pointer',
        'transition-colors duration-150 hover:border-primary',
        featured
          ? 'bg-[radial-gradient(ellipse_at_top_left,var(--color-primary-soft),transparent_60%)]'
          : '',
      ].join(' ')}
    >
      {/* League label */}
      <div className="text-[11px] font-bold uppercase tracking-label text-text-muted mb-2.5 truncate">
        {featured && <span className="text-primary">★ </span>}
        {game.league_name}
      </div>

      {/* Teams + series score — centered body fills tile height */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="flex items-center justify-between gap-3 mt-2">
          <span className={`font-bold truncate min-w-0 ${featured ? 'text-lg' : 'text-sm'}`}>
            {radiantName}
          </span>
          <span
            className={`font-mono font-bold tabular-nums text-radiant ${featured ? 'text-4xl' : 'text-xl'}`}
          >
            {radiantWins}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 mt-2">
          <span className={`font-bold truncate min-w-0 ${featured ? 'text-lg' : 'text-sm'}`}>
            {direName}
          </span>
          <span
            className={`font-mono font-bold tabular-nums text-dire ${featured ? 'text-4xl' : 'text-xl'}`}
          >
            {direWins}
          </span>
        </div>

        {/* Featured stat strip — fills the larger tile with live detail */}
        {featured && hasKills && (
          <div className="grid grid-cols-3 gap-2.5 mt-[18px] pt-[18px] border-t border-border">
            <div className="text-center">
              <div className="font-mono font-bold text-lg tabular-nums">
                {radKills} - {direKills}
              </div>
              <div className="text-[10px] uppercase tracking-label text-text-dim mt-0.5">Kills</div>
            </div>
            {seriesLabel && (
              <div className="text-center">
                <div className="font-mono font-bold text-lg tabular-nums">
                  {radiantWins}–{direWins}
                </div>
                <div className="text-[10px] uppercase tracking-label text-text-dim mt-0.5">
                  {seriesLabel}
                </div>
              </div>
            )}
            {game.duration !== undefined && (
              <div className="text-center">
                <div className="font-mono font-bold text-lg tabular-nums">
                  {formatDuration(game.duration)}
                </div>
                <div className="text-[10px] uppercase tracking-label text-text-dim mt-0.5">
                  Duration
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status pill pinned to bottom + duration for non-featured */}
      <div className="flex items-center gap-3 mt-4">
        <StatusTag status={statusLabel} />
        {!featured && game.duration !== undefined && (
          <span className="text-text-dim text-[11px] tabular-nums font-mono tracking-wide ml-auto">
            {formatDuration(game.duration)}
          </span>
        )}
        {!featured && seriesLabel && game.duration === undefined && (
          <span className="text-text-dim text-[11px] tracking-[0.1em] tabular-nums ml-auto">
            {radiantWins}–{direWins} {seriesLabel}
          </span>
        )}
      </div>
    </Link>
  )
}
