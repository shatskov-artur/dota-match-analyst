import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { format } from 'date-fns'
import PageShell, { SectionTitle } from '../components/PageShell'
import PlayoffBracket from '../components/PlayoffBracket'
import StandingsTable from '../components/StandingsTable'
import SwissFlow, { teamPairKey } from '../components/SwissFlow'
import MatchCalendar from '../components/MatchCalendar'
import { bucketByDay, dayKey } from '../utils/day'
import { useLiveGames } from '../hooks/useLiveGames'
import { BentoErrorBoundary } from '../components/BentoErrorBoundary'
import { SkeletonBracket, SkeletonSchedule, SkeletonStandings } from '../components/Skeletons'
import { useBracket, useSchedule, useTournaments, type ScheduleEntry, type BracketNode } from '../hooks/useArchive'
import TeamLogo from '../components/TeamLogo'

/**
 * Three views instead of four crowded ones.
 *
 * Overview answers "what is the state of the tournament": the group table, at full size,
 * with what is on next beside it. Schedule is the complete list when you want to scan
 * every series. Bracket is the playoff tree.
 *
 * Previously all four tabs rendered the same flat list of 27 near-identical rows, so the
 * standings — the thing a Swiss stage is actually about — were buried under the bracket.
 */

type Tab = 'overview' | 'schedule' | 'bracket'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'bracket', label: 'Bracket' },
]

/** Group whose nodes form the playoff tree. Everything else is a group stage. */
const PLAYOFF_GROUP = 'playoff'

/**
 * A published bracket is mostly empty slots: TI 2026 announces 8 dated Swiss games and 19
 * placeholder nodes with no teams and no time. Listing all 27 as "27 upcoming" makes the
 * schedule look like a wall of TBD and hides the eight games that actually have a date.
 */
const SCHEDULE_SECTIONS: Array<{
  id: string
  label: string
  match: (e: ScheduleEntry) => boolean
  collapsed?: boolean
}> = [
  { id: 'live', label: 'Live', match: (e) => e.status === 'live' },
  { id: 'scheduled', label: 'Scheduled', match: (e) => e.status === 'upcoming' && !!e.scheduledTime },
  {
    id: 'unseeded',
    label: 'Not seeded yet',
    match: (e) => e.status === 'upcoming' && !e.scheduledTime,
    collapsed: true,
  },
  { id: 'finished', label: 'Finished', match: (e) => e.status === 'finished' },
]

/**
 * How long ago this bracket was actually read from Valve.
 *
 * Everything on this page is a cache of one undocumented, keyless Valve endpoint, and it
 * fails in the quietest way there is: HTTP 200 with the body `null`. Verified on 2026-08-15
 * — six calls, every league id, with and without browser headers, all `null`. The sync
 * correctly keeps what it already has, so the page went on showing an hour-old bracket
 * looking exactly like a current one, and the only way to find out was to compare it with
 * another site by hand.
 *
 * The sync runs every 5 minutes, so anything past ~10 means the upstream has stopped
 * answering. This cannot conjure fixtures Valve is not publishing — it stops the page from
 * implying that what it has is up to date.
 */
function ScheduleFreshness({ at }: { at: string | null }) {
  if (!at) return null
  const ageMin = Math.floor((Date.now() - new Date(at).getTime()) / 60_000)
  if (Number.isNaN(ageMin)) return null

  const stale = ageMin >= 10
  const label = ageMin < 1 ? 'just now' : ageMin < 60 ? `${ageMin} min ago` : `${Math.floor(ageMin / 60)} h ago`

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] tabular-nums"
      style={{ color: stale ? 'var(--color-danger)' : 'var(--color-text-dim)' }}
      title={
        stale
          ? `Valve's bracket endpoint has not answered since ${format(new Date(at), 'HH:mm')}. ` +
            'Fixtures published since then are missing — this is an upstream outage, not an empty schedule.'
          : `Bracket read from Valve at ${format(new Date(at), 'HH:mm')}`
      }
    >
      {stale && <span aria-hidden="true">⚠</span>}
      Schedule {label}
    </span>
  )
}

function when(ts: number | null | undefined, withDay = true): string {
  if (!ts) return 'TBD'
  return format(new Date(ts * 1000), withDay ? 'EEE d MMM, HH:mm' : 'HH:mm')
}

function TeamCell({ team, align = 'left' }: { team: ScheduleEntry['team1']; align?: 'left' | 'right' }) {
  const logo = <TeamLogo src={team.logoUrl} name={team.name ?? undefined} size={24} />
  return (
    <span className={'flex items-center gap-2 min-w-0 ' + (align === 'right' ? 'flex-row-reverse text-right' : '')}>
      {logo}
      <span className="text-[13px] text-text truncate">{team.name ?? 'TBD'}</span>
    </span>
  )
}

/** One series row. Same shape in Overview and Schedule so the two never look different. */
function SeriesRow({ entry, leagueId, compact = false }: { entry: ScheduleEntry; leagueId: string | undefined; compact?: boolean }) {
  const hasGames = entry.matchIds.length > 0
  const started = entry.status !== 'upcoming'

  const inner = (
    <div className="flex items-center gap-3">
      {/* Compact drops the weekday — the narrow Overview column was squeezing team names
          down to "Team Falc…" to make room for it. */}
      <span
        className={
          // 124px is what "Sat 15 Aug, 10:00" needs; below it the line wraps in two.
          'font-mono text-[12px] text-text-dim tabular-nums shrink-0 whitespace-nowrap ' +
          (compact ? 'w-[84px]' : 'w-[124px]')
        }
      >
        {when(entry.scheduledTime, !compact)}
      </span>
      {!compact && (
        <span
          className="text-[10px] uppercase tracking-[0.12em] text-text-dim w-[76px] shrink-0 truncate"
          title={entry.nodeGroupName ?? undefined}
        >
          {entry.nodeGroupName || '—'}
        </span>
      )}

      {/* Capped rather than free-growing: given the whole row the two 1fr cells pushed the
          names to opposite ends of the card and the eye had to travel to pair a team with
          its score. */}
      <span className="flex-1 min-w-0 max-w-[440px] grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamCell team={entry.team1} />
        {/* An unplayed series has no score; "0:0" reads as a result that happened. */}
        {started ? (
          <span className="font-mono text-[13px] tabular-nums shrink-0 text-text">
            {entry.team1.wins ?? 0}
            <span className="text-text-dim">:</span>
            {entry.team2.wins ?? 0}
          </span>
        ) : (
          <span className="text-[11px] uppercase tracking-[0.12em] text-text-dim shrink-0">vs</span>
        )}
        <TeamCell team={entry.team2} align="right" />
      </span>

      <span className="flex items-center gap-2.5 shrink-0 justify-end">
        {entry.status === 'live' && <span className="text-[11px] text-radiant whitespace-nowrap">● live</span>}
        {entry.bestOf && entry.status !== 'live' && (
          <span className="text-[11px] text-text-dim">Bo{entry.bestOf}</span>
        )}
        {hasGames && <span className="text-[11px] text-primary">→</span>}
      </span>
    </div>
  )

  // A played series goes to its maps; an unplayed one to the prematch preview, which is
  // addressed by bracket node because no match id exists until the first game starts.
  const href = entry.seriesId && hasGames ? `/series/${entry.seriesId}` : `/tournament/${leagueId}/node/${entry.nodeId}`
  return (
    <Link to={href} className="bento-card block">
      {inner}
    </Link>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="bento-card text-[13px] text-text-dim">{children}</p>
}

export default function TournamentPage() {
  const { leagueId } = useParams()
  // Tab lives in the URL so "here's the bracket" is a link, and a reload keeps your place.
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.some((t) => t.id === raw) ? (raw as Tab) : 'overview'
  const setTab = (next: Tab) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true })

  const tournaments = useTournaments()
  const schedule = useSchedule(leagueId)
  const bracket = useBracket(leagueId)

  /**
   * Which pairings are actually being played, straight from Valve's live feed.
   *
   * The bracket's own `hasStarted` is minutes behind it — a TI series live at 13:44 still
   * read false — and in that window the stage announced a running match as late. Shared
   * ['live-games'] cache, so this costs nothing the page was not already paying.
   */
  const live = useLiveGames()
  const livePairs = useMemo(() => {
    const out = new Set<string>()
    for (const g of live.data?.games ?? []) {
      const key = teamPairKey(g.radiant_team?.team_id, g.dire_team?.team_id)
      if (key) out.add(key)
    }
    return out
  }, [live.data])

  /**
   * Maps each series has actually decided, from our own finished games.
   *
   * Valve's node score trails the game — a map that ended 16-37 showed as 0-0 in the
   * bracket while the archive already had its winner — so the bracket keeps whichever
   * source is further ahead.
   */
  const seriesWins = useMemo(() => {
    const out = new Map<number, Map<number, number>>()
    for (const s of bracket.data?.seriesResults ?? []) {
      out.set(s.seriesId, new Map(s.wins.map((w) => [w.teamId, w.wins])))
    }
    return out
  }, [bracket.data])

  const league = tournaments.data?.tournaments.find((t) => String(t.leagueId) === leagueId)

  // Team lookup, assembled from standings — the only place team names and logos are
  // published for teams that have not played yet.
  const teamNames = useMemo(() => {
    const map = new Map<number, { name: string | null; tag: string | null; logoUrl: string | null }>()
    for (const s of bracket.data?.standings ?? []) {
      if (s.teamId) map.set(s.teamId, { name: s.name, tag: s.tag, logoUrl: s.logoUrl })
    }
    for (const e of schedule.data?.schedule ?? []) {
      for (const t of [e.team1, e.team2]) {
        if (t.id && !map.has(t.id)) map.set(t.id, { name: t.name, tag: t.tag, logoUrl: t.logoUrl })
      }
    }
    return map
  }, [bracket.data, schedule.data])

  const entries = schedule.data?.schedule ?? []

  /**
   * Which day the schedule is showing, in the URL beside the tab so a link carries it and
   * a reload keeps it. Null means every day.
   */
  const day = params.get('day')
  const setDay = (next: string | null) => {
    const p = new URLSearchParams(params)
    p.set('tab', 'schedule')
    if (next) p.set('day', next)
    else p.delete('day')
    setParams(p, { replace: true })
  }
  // Same bucketing as the home calendar, so a day means the same thing on both pages.
  const days = useMemo(() => bucketByDay(entries, (e) => e.actualTime || e.scheduledTime), [entries])
  const dayEntries = useMemo(() => {
    if (day === null) return entries
    // Read the same instant the calendar dotted, or a series that started late would be
    // filtered out of the very day its dot sits on.
    return entries.filter((e) => {
      const t = e.actualTime || e.scheduledTime
      return t && dayKey(t) === day
    })
  }, [entries, day])
  const counts = {
    // Dated only. Counting the unseeded placeholders here advertised "27 upcoming" for a
    // tournament with eight announced games.
    upcoming: entries.filter((e) => e.status === 'upcoming' && e.scheduledTime).length,
    live: entries.filter((e) => e.status === 'live').length,
    finished: entries.filter((e) => e.status === 'finished').length,
  }

  const nodes = bracket.data?.nodes ?? []
  const playoffNodes = nodes.filter((n) => (n.nodeGroupName ?? '').toLowerCase().includes(PLAYOFF_GROUP))
  const otherGroups = useMemo(() => {
    const map = new Map<number, { id: number; name: string; nodes: BracketNode[] }>()
    for (const n of nodes) {
      if (playoffNodes.includes(n)) continue
      const id = n.nodeGroupId ?? -1
      if (!map.has(id)) map.set(id, { id, name: n.nodeGroupName || 'Stage', nodes: [] })
      map.get(id)!.nodes.push(n)
    }
    // Valve numbers groups in the order they are played, so this is the running order:
    // Swiss (2) → Elimination Round (3) → Playoff (5), which is rendered separately.
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g)
    // playoffNodes is derived from nodes; nodes alone is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes])

  // Standings are published per group; the biggest one is the group stage worth showing.
  const mainStandings = useMemo(() => {
    const all = bracket.data?.standings ?? []
    const byGroup = new Map<number, typeof all>()
    for (const s of all) {
      if (!byGroup.has(s.nodeGroupId)) byGroup.set(s.nodeGroupId, [])
      byGroup.get(s.nodeGroupId)!.push(s)
    }
    /**
     * Valve publishes standings for the parent phase group AND for the stage inside it,
     * both listing all sixteen teams — but only the inner one carries results. Picking by
     * row count alone was a coin flip between them, and it kept landing on the empty one,
     * so the table read 0-0 for every team while the bracket beside it showed twelve
     * finished series. A group with results always wins.
     */
    const played = (rows: typeof all) => rows.some((r) => (r.wins ?? 0) > 0 || (r.losses ?? 0) > 0)
    let best: { groupId: number; rows: typeof all } | null = null
    for (const [groupId, rows] of byGroup) {
      if (!best) {
        best = { groupId, rows }
        continue
      }
      const better =
        played(rows) !== played(best.rows) ? played(rows) : rows.length > best.rows.length
      if (better) best = { groupId, rows }
    }
    if (!best) return null
    const groupName = nodes.find((n) => n.nodeGroupId === best!.groupId)?.nodeGroupName
    return { name: groupName || 'Standings', rows: best.rows, groupId: best.groupId }
  }, [bracket.data, nodes])

  // "Next up" means next: an undecided slot with no date is not next, it is unscheduled.
  const nextUp = entries.filter((e) => e.status === 'live' || (e.status === 'upcoming' && e.scheduledTime)).slice(0, 6)
  const loadingOverview = bracket.isLoading || schedule.isLoading

  return (
    <PageShell
      eyebrow={league?.tier === 5 ? 'Premium tournament' : undefined}
      title={league?.name ?? `League #${leagueId}`}
      meta={
        <>
          {league?.startTimestamp && (
            <span className="text-[12px] text-text-muted tabular-nums">
              {when(league.startTimestamp)} — {when(league.endTimestamp)}
            </span>
          )}
          {league?.totalPrizePool ? (
            <span className="text-[13px] font-mono tabular-nums text-accent">
              ${league.totalPrizePool.toLocaleString('en-US')}
            </span>
          ) : null}
        </>
      }
      status={
        <>
          {counts.live > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-text-muted">
              <span className="w-[5px] h-[5px] rounded-full bg-dire animate-pulse" />
              {counts.live} live
            </span>
          )}
          <ScheduleFreshness at={schedule.data?.lastSyncedAt ?? null} />
        </>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'true' : undefined}
              className={
                'px-3.5 py-1.5 rounded-full border text-[12px] transition-colors ' +
                (tab === t.id
                  ? 'border-primary text-text bg-[var(--color-primary-soft)]'
                  : 'border-border text-text-muted hover:border-primary hover:text-text')
              }
            >
              {t.label}
            </button>
          ))}
          {league?.streams && league.streams.length > 0 && (
            <span className="ml-auto flex flex-wrap gap-2">
              {league.streams.slice(0, 4).map((s, i) => (
                <a
                  key={i}
                  href={s.stream_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-full border border-border text-[11px] text-text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {s.name ?? 'Stream'}
                </a>
              ))}
            </span>
          )}
        </div>
      }
    >
      <BentoErrorBoundary resetKeys={[leagueId, tab]}>
        {tab === 'overview' && (
          loadingOverview ? (
            <div className="grid grid-cols-1 stack:grid-cols-[1.35fr_1fr] gap-6">
              <SkeletonStandings rows={10} />
              <SkeletonSchedule rows={4} />
            </div>
          ) : (
            <div className="grid grid-cols-1 stack:grid-cols-[1.35fr_1fr] gap-6 items-start">
              {mainStandings ? (
                <StandingsTable
                  standings={mainStandings.rows}
                  title={mainStandings.name}
                  // The bracket the table is describing — hovering a row shows that
                  // team's results and links through to them.
                  nodes={nodes.filter((n) => n.nodeGroupId === mainStandings.groupId)}
                  teamNames={teamNames}
                />
              ) : (
                <EmptyNote>No standings published for this tournament yet.</EmptyNote>
              )}

              <div>
                <SectionTitle aside={counts.upcoming > nextUp.length ? `${counts.upcoming} upcoming` : undefined}>
                  Next up
                </SectionTitle>
                {nextUp.length === 0 ? (
                  <EmptyNote>Nothing scheduled.</EmptyNote>
                ) : (
                  <div className="flex flex-col gap-3">
                    {nextUp.map((e) => (
                      <SeriesRow key={e.nodeId} entry={e} leagueId={leagueId} compact />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {tab === 'schedule' && (
          schedule.isLoading ? (
            <SkeletonSchedule rows={8} />
          ) : entries.length === 0 ? (
            <EmptyNote>No series published for this tournament yet.</EmptyNote>
          ) : (
            // Calendar beside the list rather than above it: the list is the subject and
            // the picker is a control, and on a wide screen stacking them pushed the first
            // series below the fold.
            //
            // The list is capped rather than free-growing. A schedule row carries a time, a
            // stage, two names and a score — around 800px of content — and letting it span
            // a 1300px page spread those apart until reading one meant crossing the screen.
            <div className="grid grid-cols-1 stack:grid-cols-[248px_minmax(0,860px)] gap-6 items-start">
              {/* Sticky: the schedule is long and the picker is what you reach for while
                  scrolling it, so it follows rather than leaving a tall void behind. */}
              <div className="stack:sticky stack:top-4">
                <MatchCalendar
                  days={days}
                  selected={day}
                  onSelect={setDay}
                  undated={entries.filter((e) => !e.scheduledTime).length}
                />
              </div>

              <div className="flex flex-col gap-8 min-w-0">
              {SCHEDULE_SECTIONS.map(({ id, label, match, collapsed }) => {
                // A series with no published time belongs to no day, so a day filter hides
                // it rather than pretending it falls on the one that happens to be picked.
                if (day !== null && collapsed) return null
                const rows = dayEntries.filter(match)
                if (rows.length === 0) return null
                const list = (
                  <div className="flex flex-col gap-3">
                    {rows.map((e) => (
                      <SeriesRow key={e.nodeId} entry={e} leagueId={leagueId} />
                    ))}
                  </div>
                )
                // Nineteen rows of "TBD vs TBD" is not a schedule. They stay reachable —
                // each one is a real bracket slot with a prematch page — but folded away,
                // because the Bracket tab already shows how they connect.
                return collapsed ? (
                  <details key={id} className="group">
                    <summary className="cursor-pointer list-none marker:content-none flex items-center gap-2">
                      <span className="text-[10px] text-text-dim transition-transform group-open:rotate-90">▶</span>
                      <span className="flex-1">
                        <SectionTitle aside={`${rows.length}`}>{label}</SectionTitle>
                      </span>
                    </summary>
                    {list}
                  </details>
                ) : (
                  <section key={id}>
                    <SectionTitle aside={`${rows.length}`}>{label}</SectionTitle>
                    {list}
                  </section>
                )
              })}
              {dayEntries.length === 0 && (
                <EmptyNote>Nothing scheduled on this day.</EmptyNote>
              )}
              </div>
            </div>
          )
        )}

        {tab === 'bracket' && (
          bracket.isLoading ? (
            <SkeletonBracket />
          ) : nodes.length === 0 ? (
            <EmptyNote>No bracket published for this tournament yet.</EmptyNote>
          ) : (
            // Read top to bottom in running order: the group stages a team plays first,
            // then the tree they reach by surviving them.
            <div className="flex flex-col gap-8">
              {/* A Swiss stage is not a tree, so it is not drawn as one — but it is not a
                  flat list either. SwissFlow lays it out as rounds across and records
                  down, which is the shape the stage actually has. */}
              {otherGroups.map((g) => (
                <section key={g.name}>
                  <SectionTitle aside={`${g.nodes.length} series`}>{g.name}</SectionTitle>
                  <SwissFlow
                    nodes={g.nodes}
                    teamNames={teamNames}
                    leagueId={leagueId}
                    livePairs={livePairs}
                    seriesWins={seriesWins}
                    // Valve ranks each stage group separately, so take the rows for this one.
                    standings={
                      new Map(
                        (bracket.data?.standings ?? [])
                          .filter((s) => s.nodeGroupId === g.id && s.teamId && s.standing)
                          .map((s) => [s.teamId as number, s.standing as number]),
                      )
                    }
                  />
                </section>
              ))}

              {playoffNodes.length > 0 && <PlayoffBracket nodes={playoffNodes} teamNames={teamNames} />}
            </div>
          )
        )}
      </BentoErrorBoundary>
    </PageShell>
  )
}
