import { Link } from 'react-router'
import { format } from 'date-fns'
import type { BracketNode } from '../hooks/useArchive'
import TeamLogo from './TeamLogo'

/**
 * One series in a bracket or group stage: two team slots, the format, and its state.
 *
 * Shared so the playoff tree and the group-stage lists are literally the same object at
 * the same size. They were drifting apart — the group cards were rendering three times
 * the height of a bracket node for the same two lines of content.
 */

export type TeamLookup = Map<number, { name: string | null; tag: string | null; logoUrl: string | null }>

export interface SeriesNodeCardProps {
  node: BracketNode
  teamNames: TeamLookup
  /** Placeholder text per slot when the team is not decided ("Loser of UB QF A"). */
  slotLabels?: [string | null, string | null]
  /**
   * Header text when Valve publishes no node name. The playoff tree derives a round name
   * ("UB Semifinal A") because the fallback below is a raw node id, which reads as a
   * match number and is not one.
   */
  title?: string
  className?: string
  style?: React.CSSProperties
}

/** Fixed metrics so a card is the same object wherever it appears. */
export const NODE_CARD_W = 232
export const NODE_CARD_H = 66

function TeamSlot({
  teamId,
  wins,
  isWinner,
  placeholder,
  showScore,
  teamNames,
}: {
  teamId: number | null
  wins: number | null
  isWinner: boolean
  placeholder?: string
  /** A series that has not begun has no score; "0" there reads as a result. */
  showScore: boolean
  teamNames: TeamLookup
}) {
  const team = teamId ? teamNames.get(teamId) : undefined
  return (
    <div className="flex items-center gap-2 min-w-0 h-[22px]">
      <TeamLogo src={team?.logoUrl} name={team?.name ?? undefined} size={20} />
      <span
        className={
          'truncate ' +
          (team
            ? 'text-body ' + (isWinner ? 'text-text font-bold' : 'text-text-muted')
            : // A step down, because the whole width is needed for "Winner of UB Final".
              'text-label text-text-dim italic')
        }
      >
        {team?.name ?? placeholder ?? 'TBD'}
      </span>
      {showScore && (
        <span className="ml-auto font-mono text-body tabular-nums text-text-dim shrink-0">{wins ?? 0}</span>
      )}
    </div>
  )
}

export default function SeriesNodeCard({ node, teamNames, slotLabels, title, className = '', style }: SeriesNodeCardProps) {
  const decided = node.isCompleted === true
  const live = node.hasStarted === true && !decided
  const t1Won = decided && (node.team1Wins ?? 0) > (node.team2Wins ?? 0)
  const t2Won = decided && (node.team2Wins ?? 0) > (node.team1Wins ?? 0)

  const cls =
    'rounded-sm border p-2 flex flex-col justify-center transition-colors ' +
    (live ? 'border-radiant bg-[var(--color-radiant-soft)]' : decided ? 'border-border bg-surface' : 'border-border bg-bg-elev') +
    (node.seriesId ? ' hover:border-primary' : '') +
    (className ? ` ${className}` : '')

  const body = (
    <>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-label uppercase tracking-label text-text-dim truncate">
          {node.name?.trim() || title || `Match ${node.nodeId}`}
        </span>
        {/* Group-stage cards carry a kick-off time; bracket nodes are unseeded and do not. */}
        {node.scheduledTime ? (
          <span className="font-mono text-label tabular-nums text-text-dim shrink-0 ml-auto">
            {format(new Date(node.scheduledTime * 1000), 'd MMM HH:mm')}
          </span>
        ) : null}
        <span className={'text-label text-text-dim shrink-0' + (node.scheduledTime ? '' : ' ml-auto')}>
          {live && <span className="text-radiant mr-1.5">●</span>}
          {node.bestOf ? `Bo${node.bestOf}` : ''}
        </span>
      </div>
      <TeamSlot
        teamId={node.team1Id}
        wins={node.team1Wins}
        isWinner={t1Won}
        placeholder={slotLabels?.[0] ?? undefined}
        showScore={live || decided}
        teamNames={teamNames}
      />
      <TeamSlot
        teamId={node.team2Id}
        wins={node.team2Wins}
        isWinner={t2Won}
        placeholder={slotLabels?.[1] ?? undefined}
        showScore={live || decided}
        teamNames={teamNames}
      />
    </>
  )

  return node.seriesId ? (
    <Link to={`/series/${node.seriesId}`} className={cls} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  )
}
