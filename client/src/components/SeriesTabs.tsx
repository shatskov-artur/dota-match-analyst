import { Link } from 'react-router'
import type { ArchivedMatch } from '../hooks/useArchive'

/**
 * Map tabs for a Bo1/Bo3/Bo5.
 *
 * This is the "see what happened on game 1 while game 2 is live" feature: every map in
 * the series is one click away, live or finished, with its own scrubbable timeline.
 */

export interface SeriesTabsProps {
  games: ArchivedMatch[]
  currentMatchId: string | undefined
  bestOf: number | null
  team1Name?: string | null
  team2Name?: string | null
  /** Series score as Valve's bracket reports it. See seriesScore for why both are used. */
  team1Wins?: number | null
  team2Wins?: number | null
  /**
   * A pill BEFORE the maps — head-to-head lives here.
   *
   * First because that is where it belongs in time: previous meetings happened before
   * game one did. It is supporting context rather than a thing that happened in this
   * game, so it is one click away and otherwise out of sight.
   */
  extraTab?: { label: string; active: boolean; onClick: () => void }
}

export interface SeriesScore {
  nameA: string
  nameB: string
  a: number
  b: number
}

/** OpenDota returns some team names with trailing whitespace ("Nigma Galaxy "). */
const norm = (s: string | null | undefined) => (s ?? '').trim()

/**
 * The series score, from whichever source is further ahead.
 *
 * Two independent views, each of which lags the other at different moments:
 *
 *  - Counting our own decided maps needs `radiantWin`, which is only set once OpenDota
 *    has parsed the replay. A game that finished five minutes ago is still `live` here,
 *    so a 2-1 series reads 1-1 until the parse lands — sometimes half an hour.
 *  - Valve's bracket publishes `team_1_wins` within a few minutes of the game ending,
 *    but it has its own lag and occasionally trails a map behind.
 *
 * Taking the higher of the two per team means neither source can drag the score
 * backwards, which is the failure that matters: a series that has visibly been won must
 * never display as still level.
 *
 * Sides swap between maps, so everything is keyed on team NAME, never on side.
 */
export function seriesScore(
  games: ArchivedMatch[],
  valve?: { team1Name?: string | null; team2Name?: string | null; team1Wins?: number | null; team2Wins?: number | null },
): SeriesScore | null {
  const first = games.find((g) => norm(g.radiantTeamName) && norm(g.direTeamName))
  const valveA = norm(valve?.team1Name)
  const valveB = norm(valve?.team2Name)
  // The games decide the naming, because their names are what a per-map winner is
  // compared against. Valve only fills in when the maps carry no names at all — taking
  // Valve's first would make the ownership check below compare a value with itself.
  const nameA = norm(first?.radiantTeamName) || valveA
  const nameB = norm(first?.direTeamName) || valveB
  if (!nameA || !nameB) return null

  let a = 0
  let b = 0
  for (const g of games) {
    if (g.radiantWin === null || g.radiantWin === undefined) continue
    const winner = norm(g.radiantWin ? g.radiantTeamName : g.direTeamName)
    if (winner === nameA) a++
    else if (winner === nameB) b++
  }

  // Merge Valve's numbers only when they describe these same two teams. Valve's team_1 is
  // not necessarily our radiant side of map one, so the reversed pairing counts too — but
  // any other pairing is a different series and is ignored rather than mis-credited.
  if (valveA === nameA && valveB === nameB) {
    a = Math.max(a, valve?.team1Wins ?? 0)
    b = Math.max(b, valve?.team2Wins ?? 0)
  } else if (valveA === nameB && valveB === nameA) {
    a = Math.max(a, valve?.team2Wins ?? 0)
    b = Math.max(b, valve?.team1Wins ?? 0)
  }
  return { nameA, nameB, a, b }
}

export default function SeriesTabs({
  games,
  currentMatchId,
  bestOf,
  team1Name,
  team2Name,
  team1Wins,
  team2Wins,
  extraTab,
}: SeriesTabsProps) {
  if (games.length <= 1 && !extraTab) return null

  const score = seriesScore(games, { team1Name, team2Name, team1Wins, team2Wins })
  const nameA = score?.nameA ?? team1Name ?? 'Team A'
  const nameB = score?.nameB ?? team2Name ?? 'Team B'

  return (
    <div className="bento-card flex flex-wrap items-center gap-3" data-testid="series-tabs">
      <span className="text-[11px] uppercase tracking-[0.12em] text-text-dim">
        {bestOf ? `Best of ${bestOf}` : 'Series'}
      </span>

      {score && (
        <span className="font-mono text-[13px] text-text tabular-nums">
          {nameA} <span className="text-accent">{score.a}</span>
          <span className="text-text-dim"> : </span>
          <span className="text-accent">{score.b}</span> {nameB}
        </span>
      )}

      <div className="flex flex-wrap gap-2 ml-auto">
        {extraTab && (
          <button
            type="button"
            onClick={extraTab.onClick}
            aria-pressed={extraTab.active}
            className={
              'px-3 py-1.5 rounded-[7px] border text-[12px] transition-colors ' +
              (extraTab.active
                ? 'border-primary text-text bg-[var(--color-primary-soft)]'
                : 'border-border text-text-muted hover:border-primary hover:text-text')
            }
          >
            {extraTab.label}
          </button>
        )}
        {games.map((g, i) => {
          const isCurrent = String(g.matchId) === currentMatchId
          const isLive = g.ingestStatus === 'live'
          const decided = g.radiantWin !== null && g.radiantWin !== undefined
          const label = `Game ${g.gameInSeries ?? i + 1}`
          return (
            <Link
              key={g.matchId}
              to={`/match/${g.matchId}`}
              aria-current={isCurrent ? 'page' : undefined}
              className={
                'px-3 py-1.5 rounded-[7px] border text-[12px] transition-colors ' +
                (isCurrent
                  ? 'border-primary text-text bg-[var(--color-primary-soft)]'
                  : 'border-border text-text-muted hover:border-primary hover:text-text')
              }
            >
              <span>{label}</span>
              {isLive && <span className="ml-2 text-radiant">● live</span>}
              {!isLive && decided && (
                <span className="ml-2 font-mono tabular-nums text-text-dim">
                  {g.radiantScore ?? 0}:{g.direScore ?? 0}
                </span>
              )}
              {!isLive && !decided && <span className="ml-2 text-text-dim">—</span>}
            </Link>
          )
        })}

      </div>
    </div>
  )
}
