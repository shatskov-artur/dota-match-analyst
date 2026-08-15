import { Link } from 'react-router'
import StatusTag from './StatusTag'
import TeamLogo from './TeamLogo'
import { getStatusLabel, getSeriesLabel } from '../utils/gameState'
import { formatDuration } from '../utils/formatDuration'
import { formatGoldDiff } from '../utils/formatGoldDiff'
import type { EnrichedGame } from '../hooks/useLiveGames'

interface MatchCardProps {
  game: EnrichedGame
  /** Featured tile spans 2x2 on laptop+ and shows extra in-game stats. */
  featured?: boolean
}

/**
 * Neon Bento match tile (replaces the old MatchRow). Mobile-first:
 * one column on phone, the grid (MatchBentoGrid) handles span widths.
 *
 * Number hierarchy (revised 2026-08-11): the big number beside each team is the CURRENT GAME's
 * kill score — the thing a viewer scans a tournament grid for. Series wins used to occupy that
 * slot, which meant nearly every tile displayed a pair of zeroes where the score should be. The
 * series now reads as a compact "1–0" chip, and the format (Bo1/Bo3/Bo5) sits with the league.
 */
export default function MatchCard({ game, featured = false }: MatchCardProps) {
  const radiantName = game.radiant_team?.team_name ?? 'TBD'
  const direName = game.dire_team?.team_name ?? 'TBD'
  const statusLabel = getStatusLabel(game.game_state, game.scoreboard)
  const seriesLabel = getSeriesLabel(game.series_type)
  const radiantWins = game.radiant_series_wins ?? 0
  const direWins = game.dire_series_wins ?? 0
  // Valve stopped sending radiant_score/dire_score at the top level for most games — read the
  // scoreboard first and fall back, the same way ScoreHeader does.
  const radKills = game.scoreboard?.radiant?.score ?? game.radiant_score
  const direKills = game.scoreboard?.dire?.score ?? game.dire_score
  const hasKills = radKills !== undefined && direKills !== undefined
  // A 0–0 series chip is noise: it says "nothing has been decided yet", which is the default.
  const seriesStarted = radiantWins + direWins > 0

  const logoSize = featured ? 32 : 24
  const killSize = featured ? 'text-4xl' : 'text-xl'
  const nameSize = featured ? 'text-lg' : 'text-sm'

  // Featured tile only: the kill score no longer needs a stat strip repeating it, so the extra
  // room goes to the one signal the tile does not already carry — the net-worth lead.
  const radiantNW = game.players?.filter(p => p.team === 0).reduce((sum, p) => sum + (p.net_worth ?? 0), 0) ?? 0
  const direNW = game.players?.filter(p => p.team === 1).reduce((sum, p) => sum + (p.net_worth ?? 0), 0) ?? 0
  const showGoldLead = featured && radiantNW + direNW > 0
  const goldDiff = formatGoldDiff(radiantNW, direNW)

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
      {/* League + format. The format belongs here rather than beside the score: it describes the
          match, not its state, and it keeps the score column to a single number per team. */}
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="text-[11px] font-bold uppercase tracking-label text-text-muted truncate">
          {featured && <span className="text-primary">★ </span>}
          {game.league_name}
        </span>
        {seriesLabel && (
          <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-label text-text-dim">
            {seriesLabel}
          </span>
        )}
      </div>

      {/* Teams + current kills — centered body fills tile height */}
      <div className="flex-1 flex flex-col justify-center">
        <TeamLine
          name={radiantName}
          logo={game.team_logos?.radiant}
          side="radiant"
          kills={radKills}
          hasKills={hasKills}
          logoSize={logoSize}
          killSize={killSize}
          nameSize={nameSize}
        />

        {/* Series score sits between the teams, where a scoreboard separator would be — it is the
            result of the maps already played, so it reads as history, not as the live score. */}
        {seriesStarted && (
          <div className="flex items-center gap-2 my-1.5">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-label text-text-dim tabular-nums shrink-0">
              Series {radiantWins}–{direWins}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        <TeamLine
          name={direName}
          logo={game.team_logos?.dire}
          side="dire"
          kills={direKills}
          hasKills={hasKills}
          logoSize={logoSize}
          killSize={killSize}
          nameSize={nameSize}
          className={seriesStarted ? '' : 'mt-2'}
        />
      </div>

      {showGoldLead && (
        <div className="mt-4 pt-4 border-t border-border flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-label text-text-dim">Net worth</span>
          <span
            className="font-mono font-bold tabular-nums text-lg ml-auto"
            style={{ color: 'var(--color-gold)' }}
          >
            {goldDiff.text}
          </span>
        </div>
      )}

      {/* Status + clock */}
      <div className="flex items-center gap-3 mt-4">
        <StatusTag status={statusLabel} />
        {game.duration !== undefined && (
          <span className="text-text-dim text-[11px] tabular-nums font-mono tracking-wide ml-auto">
            {formatDuration(game.duration)}
          </span>
        )}
      </div>
    </Link>
  )
}

function TeamLine({
  name,
  logo,
  side,
  kills,
  hasKills,
  logoSize,
  killSize,
  nameSize,
  className = '',
}: {
  name: string
  logo?: string | null
  side: 'radiant' | 'dire'
  kills: number | undefined
  hasKills: boolean
  logoSize: number
  killSize: string
  nameSize: string
  className?: string
}) {
  const color = side === 'radiant' ? 'text-radiant' : 'text-dire'

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="flex items-center gap-2.5 min-w-0">
        <TeamLogo src={logo} name={name} side={side} size={logoSize} />
        <span className={`font-bold truncate min-w-0 ${nameSize}`}>{name}</span>
      </span>
      {/* Before the first kill the API sends nothing, so the slot holds an em dash rather than a
          zero — "0 kills" and "the game has not started" are different statements. */}
      <span className={`font-mono font-bold tabular-nums shrink-0 ${color} ${killSize}`}>
        {hasKills ? kills : '–'}
      </span>
    </div>
  )
}
