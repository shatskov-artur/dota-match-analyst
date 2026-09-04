import { Link } from 'react-router'
import { format } from 'date-fns'
import type { FormEntry, H2HResponse } from '../hooks/useArchive'
import TeamLogo from './TeamLogo'

/**
 * Head-to-head panel: a W/L form strip per team, the record between them, their previous
 * meetings, and each side's last five games.
 *
 * Everything comes from OpenDota's keyless team history, so it works for any pro team
 * without a key or a paid feed.
 */

export interface H2HPanelProps {
  data: H2HResponse | undefined
  radiantName: string | null | undefined
  direName: string | null | undefined
  isLoading?: boolean
  /** Rendered inside a tabbed card, so it must not draw its own card or title. */
  embedded?: boolean
}

function FormStrip({ form, align = 'start' }: { form: FormEntry[]; align?: 'start' | 'end' }) {
  // Newest first from the API; render oldest → newest so the strip reads left to right.
  const ordered = [...form].reverse()
  return (
    <div className={'flex items-center gap-1 ' + (align === 'end' ? 'justify-end' : '')}>
      {ordered.length === 0 && <span className="text-label text-text-dim">no recent games</span>}
      {ordered.map((f) => (
        <span
          key={f.matchId}
          title={`${f.won ? 'Won' : 'Lost'} ${f.score.own}:${f.score.opponent} vs ${f.opponentName ?? '?'}${f.leagueName ? ` — ${f.leagueName}` : ''}`}
          className={
            'w-5 h-5 rounded-full grid place-items-center text-label font-bold ' +
            (f.won ? 'bg-[var(--color-radiant-soft)] text-radiant' : 'bg-[var(--color-dire-soft)] text-dire')
          }
        >
          {f.won ? 'W' : 'L'}
        </span>
      ))}
    </div>
  )
}

/**
 * One past game: when, where, and — the point of the row — who won it.
 *
 * The W/L pill only ever meant "did the team this section is about win", which reads fine
 * in a column of one team's form and not at all in a list of meetings between two, where
 * neither name is obviously the subject. So the winner is named directly: its side is green
 * and bold, the loser's is dimmed. The score stays neutral — it is the evidence, not the
 * verdict. The pill stays because a column of them is what makes the list scannable at a
 * glance; it is no longer the only thing carrying the result.
 */
function MatchLine({ entry, teamName }: { entry: FormEntry; teamName: string }) {
  const when = entry.startTime ? format(new Date(entry.startTime * 1000), 'd MMM yyyy') : ''
  const opponent = entry.opponentName ?? 'Unknown'
  const winner = entry.won ? 'text-radiant font-bold' : 'text-text-dim'
  const loser = entry.won ? 'text-text-dim' : 'text-radiant font-bold'

  return (
    <li
      className="flex items-center gap-2.5 py-1.5 border-b border-border last:border-b-0"
      title={`${when}${entry.leagueName ? ` · ${entry.leagueName}` : ''} — ${
        entry.won ? teamName : opponent
      } won ${Math.max(entry.score.own, entry.score.opponent)}:${Math.min(entry.score.own, entry.score.opponent)}`}
    >
      <span className="font-mono text-label tabular-nums text-text-dim shrink-0 whitespace-nowrap">{when}</span>
      {/* Its own cell rather than sharing a fixed 150px with the date, which left the
          tournament about 78px and rendered every name as "THE INTER…". Capped rather than
          free-growing: given all the slack it pushed the matchup to the far edge of a
          1400px card and the eye had to cross the row to pair a date with a result. */}
      <span className="text-label uppercase tracking-label text-text-dim flex-1 min-w-0 max-w-[210px] truncate">
        {entry.leagueName ?? ''}
      </span>

      <span className="flex items-center gap-2 shrink-0">
        <span className={'text-body text-right truncate w-[104px] ' + winner}>{teamName}</span>
        {/* Kills stay neutral: the winner is already named, and colouring the score too
            made a row of numbers compete with the thing it was meant to support. */}
        <span className="font-mono text-body tabular-nums shrink-0 text-text-muted">
          {entry.score.own}
          <span className="text-text-dim">:</span>
          {entry.score.opponent}
        </span>
        <span className="flex items-center gap-1.5 w-[104px] min-w-0">
          <TeamLogo src={entry.opponentLogo} name={opponent} size={20} />
          <span className={'text-body truncate ' + loser}>{opponent}</span>
        </span>
      </span>

      <span
        className={
          'shrink-0 w-5 h-5 rounded-full grid place-items-center text-label font-bold ml-1 ' +
          (entry.won ? 'bg-[var(--color-radiant-soft)] text-radiant' : 'bg-[var(--color-dire-soft)] text-dire')
        }
      >
        {entry.won ? 'W' : 'L'}
      </span>
      <Link
        to={`/match/${entry.matchId}`}
        className="shrink-0 text-label text-text-dim transition-colors hover:text-primary"
        aria-label={`Open match ${entry.matchId}`}
      >
        →
      </Link>
    </li>
  )
}

export default function H2HPanel({ data, radiantName, direName, isLoading, embedded = false }: H2HPanelProps) {
  if (isLoading) {
    return (
      <div className="bento-card">
        <p className="text-body text-text-dim">Loading head-to-head…</p>
      </div>
    )
  }
  if (!data) return null

  const rName = radiantName ?? 'Radiant'
  const dName = direName ?? 'Dire'
  const { h2h } = data
  const nothing = h2h.matches.length === 0 && data.radiant.form.length === 0 && data.dire.form.length === 0
  if (nothing) return null

  return (
    <div className={(embedded ? '' : 'bento-card ') + 'flex flex-col gap-5'} data-testid="h2h-panel">
      <div className="flex items-center gap-4 flex-wrap">
        {!embedded && <span className="text-label uppercase tracking-label text-text-dim">Head to head</span>}

        <div className="flex items-center gap-4 ml-auto">
          <FormStrip form={data.radiant.form} />
          <div className="text-center">
            <div className="font-mono text-body-lg tabular-nums text-text">
              <span className="text-radiant">{h2h.wins}</span>
              <span className="text-text-dim"> : </span>
              <span className="text-dire">{h2h.losses}</span>
            </div>
            <div className="text-label uppercase tracking-label text-text-dim">
              {h2h.matches.length} meeting{h2h.matches.length === 1 ? '' : 's'}
            </div>
          </div>
          <FormStrip form={data.dire.form} align="end" />
        </div>
      </div>

      {h2h.matches.length > 0 && (
        <section>
          <h3 className="text-label uppercase tracking-label text-text-dim mb-1">
            Previous meetings
            {/* Say so when the ids disagreed: outside the top tier one organisation is
                registered under several team ids, and a name can be reused by an
                unrelated roster. */}
            {h2h.matchedBy === 'name' && (
              <span className="ml-2 normal-case tracking-normal text-accent">matched by team name</span>
            )}
          </h3>
          {/* A row carries a date, a tournament, two names and a score — about 700px of
              content. Letting it span the full card spread those apart until pairing a
              date with its result meant crossing the page. */}
          <ul className="flex flex-col max-w-[760px]">
            {h2h.matches.map((m) => (
              <MatchLine key={m.matchId} entry={m} teamName={rName} />
            ))}
          </ul>
        </section>
      )}

      {/* Left at full width on purpose: two columns already halve the row, and squeezing
          them further put the tournament back behind an ellipsis. */}
      <div className="grid grid-cols-1 stack:grid-cols-2 gap-5">
        {([
          [rName, data.radiant.form],
          [dName, data.dire.form],
        ] as const).map(([name, form]) =>
          form.length === 0 ? null : (
            <section key={name}>
              <h3 className="text-label uppercase tracking-label text-text-dim mb-1">
                Recent — {name}
              </h3>
              <ul className="flex flex-col">
                {form.map((m) => (
                  <MatchLine key={m.matchId} entry={m} teamName={name} />
                ))}
              </ul>
            </section>
          ),
        )}
      </div>
    </div>
  )
}
