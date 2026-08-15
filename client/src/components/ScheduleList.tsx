import { Link } from 'react-router'
import { format } from 'date-fns'
import TeamLogo from './TeamLogo'
import { SectionTitle } from './PageShell'
import type { ScheduleRangeEntry } from '../hooks/useArchive'

/**
 * Series as rows: what was played, what is running, what is still to come.
 *
 * Purely presentational. The page owns the query, because the calendar beside this list is
 * drawn from the same response — a list that fetched for itself could show a day the
 * calendar had not dotted yet.
 *
 * Coverage note: a series only appears here if its tournament's bracket has been synced,
 * which the ingest job does for the tracked leagues plus whatever is live. It is not a
 * complete record of professional Dota, and the empty state says so.
 */

export interface ScheduleListProps {
  entries: readonly ScheduleRangeEntry[]
  /** Uppercase micro-heading. Omitted → the rows stand alone. */
  title?: string
  /** Cap the rows; the count of what was hidden is shown beside the heading. */
  limit?: number
  emptyNote?: string
  /**
   * The list is empty because the request FAILED, not because the day was quiet.
   *
   * Those are opposite statements and they were rendered identically: with the archive
   * down, a day full of recorded matches read "Nothing recorded on this day." The note
   * is drawn in the danger colour so an outage never passes for an answer.
   */
  error?: boolean
}

function Row({ entry }: { entry: ScheduleRangeEntry }) {
  const live = entry.status === 'live'
  const finished = entry.status === 'finished'
  const wins1 = entry.team1.wins ?? 0
  const wins2 = entry.team2.wins ?? 0
  // A decided series knows its score; one rebuilt from a league history sometimes does
  // not. "0:0" under a played series is a claim that nobody won it — a dash says the same
  // thing the data does, which is nothing.
  const score = wins1 + wins2 > 0 ? `${wins1}:${wins2}` : null

  const href = entry.seriesId
    ? `/series/${entry.seriesId}`
    : entry.nodeId !== null
      ? `/tournament/${entry.leagueId}/node/${entry.nodeId}`
      : null

  const body = (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[13px] text-text tabular-nums w-[52px] shrink-0">
        {format(new Date(entry.time * 1000), 'HH:mm')}
      </span>

      {/* 150px cut "The International 2026" off by a single pixel. Widened with room to
          spare, and a title for the genuinely long ones — "Ultras Dota Pro League
          2025-26" will never fit a column this list can afford. */}
      <span
        className="text-[10px] uppercase tracking-[0.12em] text-text-dim w-[190px] shrink-0 truncate"
        title={entry.leagueName ?? undefined}
      >
        {entry.leagueName ?? `League #${entry.leagueId}`}
      </span>

      <span className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <TeamLogo src={entry.team1.logoUrl} name={entry.team1.name ?? undefined} size={24} />
          <span className="text-[13px] text-text truncate">{entry.team1.name ?? 'TBD'}</span>
        </span>
        <span
          className={
            'shrink-0 tabular-nums ' +
            (score
              ? 'font-mono text-[13px] text-text'
              : 'text-[11px] uppercase tracking-[0.12em] text-text-dim')
          }
        >
          {score ?? (finished ? '—' : 'vs')}
        </span>
        <span className="flex items-center gap-2 min-w-0 flex-row-reverse text-right">
          <TeamLogo src={entry.team2.logoUrl} name={entry.team2.name ?? undefined} size={24} />
          <span className="text-[13px] text-text truncate">{entry.team2.name ?? 'TBD'}</span>
        </span>
      </span>

      <span className="flex items-center gap-2.5 shrink-0 justify-end">
        {live && <span className="text-[11px] text-radiant whitespace-nowrap">● live</span>}
        {entry.bestOf && !live && !finished && (
          <span className="text-[11px] text-text-dim">Bo{entry.bestOf}</span>
        )}
        {href && <span className="text-[11px] text-primary">→</span>}
      </span>
    </div>
  )

  // A row with neither a series nor a bracket node has nothing to open — rendered as a
  // record rather than a dead link.
  return href ? (
    <Link to={href} className="bento-card block">
      {body}
    </Link>
  ) : (
    <div className="bento-card">{body}</div>
  )
}

export default function ScheduleList({ entries, title, limit, emptyNote, error = false }: ScheduleListProps) {
  const rows = limit ? entries.slice(0, limit) : entries

  if (rows.length === 0) {
    if (!emptyNote) return null
    return (
      <section>
        {title && <SectionTitle>{title}</SectionTitle>}
        <div className="bento-card" style={error ? { borderColor: 'var(--color-danger)' } : undefined}>
          <p className={error ? 'text-[13px] text-danger' : 'text-[13px] text-text-dim'}>{emptyNote}</p>
        </div>
      </section>
    )
  }

  return (
    <section>
      {title && (
        <SectionTitle aside={limit && entries.length > rows.length ? `+${entries.length - rows.length} more` : undefined}>
          {title}
        </SectionTitle>
      )}
      <div className="flex flex-col gap-3">
        {rows.map((e) => (
          <Row key={e.seriesId ?? `${e.leagueId}-${e.nodeId}-${e.time}`} entry={e} />
        ))}
      </div>
    </section>
  )
}
