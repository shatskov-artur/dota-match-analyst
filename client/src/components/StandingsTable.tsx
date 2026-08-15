import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { BracketNode, Standing } from '../hooks/useArchive'
import TeamLogo from './TeamLogo'

/**
 * Group standings, given the room they deserve.
 *
 * This is the first thing anyone wants from a Swiss stage — who is advancing, who is
 * out — and it was previously a cramped list wedged under the bracket columns.
 *
 * Qualification bands are drawn only when the stage has actually started. Before the
 * first game every team is 0-0, so a green "advancing" stripe on the top rows would be
 * asserting a standing that does not exist yet.
 *
 * Pointing at a row opens that team's results. "2-0" immediately raises "against whom",
 * and the bracket in the same payload already knows — it was simply never joined up.
 */

export interface StandingsTableProps {
  standings: Standing[]
  /** Teams advancing from this group, when the format says so. */
  advancing?: number | null
  /** Teams eliminated from the bottom. */
  eliminated?: number | null
  title?: string
  /** The bracket, so a row can say who those wins and losses were against. */
  nodes?: BracketNode[]
  /** Team id → name and crest, for naming opponents the standings rows do not carry. */
  teamNames?: Map<number, { name: string | null; logoUrl: string | null }>
}

export interface PlayedSeries {
  nodeId: number
  seriesId: number | null
  opponentId: number | null
  won: number
  lost: number
  decided: boolean
}

/**
 * Every series a team has played, from its own point of view.
 *
 * Sides belong to the node, not to the team, so the score is flipped when the team is
 * `team_2` — otherwise half the table would read its own results backwards.
 */
export function playedByTeam(nodes: BracketNode[]): Map<number, PlayedSeries[]> {
  const out = new Map<number, PlayedSeries[]>()
  const push = (teamId: number, entry: PlayedSeries) => {
    const list = out.get(teamId) ?? []
    list.push(entry)
    out.set(teamId, list)
  }
  for (const n of nodes) {
    if (!n.hasStarted && !n.isCompleted) continue
    const { team1Id, team2Id } = n
    if (!team1Id || !team2Id) continue
    const w1 = n.team1Wins ?? 0
    const w2 = n.team2Wins ?? 0
    const base = { nodeId: n.nodeId, seriesId: n.seriesId, decided: n.isCompleted === true }
    push(team1Id, { ...base, opponentId: team2Id, won: w1, lost: w2 })
    push(team2Id, { ...base, opponentId: team1Id, won: w2, lost: w1 })
  }
  return out
}

function ResultsCard({
  series,
  teamNames,
  onEnter,
  onLeave,
}: {
  series: PlayedSeries[]
  teamNames?: StandingsTableProps['teamNames']
  onEnter: () => void
  onLeave: () => void
}) {
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      /*
       * Flush against the row, with no gap to cross. A 4px margin here was enough to
       * break the hover: the pointer left the row, landed on the row BELOW for an
       * instant, and the card unmounted before it could be clicked.
       */
      className="absolute right-0 top-full z-30 w-[280px] rounded-[10px] border border-primary
                 bg-bg-elev p-2 shadow-[0_14px_36px_rgba(0,0,0,0.6)]"
      data-testid="standings-results"
    >
      {series.map((m) => {
        const opp = m.opponentId ? teamNames?.get(m.opponentId) : undefined
        const win = m.decided && m.won > m.lost
        const loss = m.decided && m.lost > m.won
        const body = (
          <span className="flex items-center gap-2 min-w-0">
            <TeamLogo src={opp?.logoUrl} name={opp?.name ?? undefined} size={18} />
            <span className="truncate text-[12px] text-text-muted">{opp?.name ?? 'TBD'}</span>
            <span className="ml-auto font-mono text-[12px] tabular-nums shrink-0">
              <span className={win ? 'text-radiant' : loss ? 'text-dire' : 'text-text'}>{m.won}</span>
              <span className="text-text-dim">:</span>
              <span className="text-text-dim">{m.lost}</span>
            </span>
            {/* A series with no id has not produced a match to open yet. */}
            {m.seriesId && <span className="text-[11px] text-primary shrink-0">→</span>}
            {!m.decided && <span className="text-[10px] text-radiant shrink-0">live</span>}
          </span>
        )
        const cls = 'block rounded-[7px] px-2 py-1.5 transition-colors'
        return m.seriesId ? (
          <Link key={m.nodeId} to={`/series/${m.seriesId}`} className={`${cls} hover:bg-surface`}>
            {body}
          </Link>
        ) : (
          <span key={m.nodeId} className={cls}>
            {body}
          </span>
        )
      })}
    </div>
  )
}

export default function StandingsTable({
  standings,
  advancing,
  eliminated,
  title = 'Standings',
  nodes = [],
  teamNames,
}: StandingsTableProps) {
  const byTeam = useMemo(() => playedByTeam(nodes), [nodes])
  // Which row's results are open.
  const [openTeam, setOpenTeam] = useState<number | null>(null)
  // Read inside the timer callbacks, which must not close over a stale value.
  const openTeamRef = useRef<number | null>(null)
  openTeamRef.current = openTeam
  /*
   * Closing is deferred. Any hover-out — crossing a border, brushing a neighbouring row on
   * the way down — would otherwise close the card mid-journey and there would be no way to
   * reach the links inside it. Re-entering anywhere cancels the pending close.
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  /*
   * Opening is deferred too, and that is the half that actually matters. The card is
   * narrow and pinned right, so a pointer travelling down the LEFT of the row towards it
   * passes over the next row on the way — which used to steal the card instantly and open
   * its own. A row now has to be dwelt on, and merely crossing one changes nothing.
   */
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelOpen = () => {
    if (openTimer.current) clearTimeout(openTimer.current)
    openTimer.current = null
  }
  const open = (teamId: number | null) => {
    cancelClose()
    if (!teamId) return
    // Already showing this row: no delay, and never re-arm.
    if (openTeamRef.current === teamId) return
    cancelOpen()
    openTimer.current = setTimeout(() => setOpenTeam(teamId), 120)
  }
  const closeSoon = () => {
    cancelOpen()
    cancelClose()
    closeTimer.current = setTimeout(() => setOpenTeam(null), 260)
  }
  useEffect(
    () => () => {
      cancelClose()
      cancelOpen()
    },
    [],
  )

  if (standings.length === 0) return null

  const played = standings.some((s) => (s.wins ?? 0) > 0 || (s.losses ?? 0) > 0)
  const total = standings.length

  const bandFor = (index: number): 'advance' | 'eliminate' | null => {
    if (!played) return null
    if (advancing && index < advancing) return 'advance'
    if (eliminated && index >= total - eliminated) return 'eliminate'
    return null
  }

  return (
    <section className="bento-card">
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-text-dim">{title}</h2>
        <span className="text-[11px] text-text-dim">{total} teams</span>
        {!played && <span className="ml-auto text-[11px] text-text-dim">not started</span>}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.12em] text-text-dim">
            <th className="text-left font-normal pb-2 w-8">#</th>
            <th className="text-left font-normal pb-2">Team</th>
            <th className="text-right font-normal pb-2 w-14">W</th>
            <th className="text-right font-normal pb-2 w-14">L</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const band = bandFor(i)
            const results = s.teamId ? (byTeam.get(s.teamId) ?? []) : []
            const isOpen = openTeam !== null && openTeam === s.teamId && results.length > 0
            return (
              <tr
                key={s.teamId ?? i}
                className={'border-t border-border transition-colors ' + (results.length > 0 ? 'hover:bg-surface' : '')}
                onMouseEnter={() => open(s.teamId)}
                onMouseLeave={closeSoon}
                // Keyboard and touch reach it too: the row is focusable and toggles.
                tabIndex={results.length > 0 ? 0 : undefined}
                onFocus={() => open(s.teamId)}
                onBlur={closeSoon}
                style={
                  band === 'advance'
                    ? { boxShadow: 'inset 3px 0 0 var(--color-radiant)' }
                    : band === 'eliminate'
                      ? { boxShadow: 'inset 3px 0 0 var(--color-dire)' }
                      : undefined
                }
              >
                <td className="py-2 pl-2.5 text-[12px] tabular-nums text-text-dim">{i + 1}</td>
                <td className="py-2">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <TeamLogo src={s.logoUrl} name={s.name ?? undefined} size={24} />
                    <span className="truncate text-[13px] text-text">{s.name ?? `#${s.teamId}`}</span>
                    {s.tag && <span className="text-[11px] text-text-dim shrink-0">{s.tag}</span>}
                  </span>
                </td>
                <td className="py-2 text-right font-mono text-[13px] tabular-nums text-radiant">{s.wins ?? 0}</td>
                {/* The card hangs off the last cell, which is `relative` so it can. */}
                <td className="relative py-2 text-right font-mono text-[13px] tabular-nums text-text-dim">
                  {s.losses ?? 0}
                  {isOpen && (
                    <ResultsCard
                      series={results}
                      teamNames={teamNames}
                      onEnter={() => {
                        cancelClose()
                        cancelOpen()
                      }}
                      onLeave={closeSoon}
                    />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {played && (advancing || eliminated) && (
        <div className="mt-3 flex flex-wrap gap-4 text-[10px] uppercase tracking-[0.12em] text-text-dim">
          {advancing ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] rounded-full bg-radiant" /> advances
            </span>
          ) : null}
          {eliminated ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] rounded-full bg-dire" /> eliminated
            </span>
          ) : null}
        </div>
      )}
    </section>
  )
}
