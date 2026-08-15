import { Link, Navigate, useParams } from 'react-router'
import { format, formatDistanceToNowStrict } from 'date-fns'
import PageShell, { SectionTitle } from '../components/PageShell'
import TeamLogo from '../components/TeamLogo'
import H2HPanel from '../components/H2HPanel'
import { SkeletonPanel } from '../components/Skeletons'
import { BentoErrorBoundary } from '../components/BentoErrorBoundary'
import { usePrematch, type RosterPlayer, type TeamRef } from '../hooks/useArchive'

/**
 * A series before it is played: who is playing, when, their rosters, and their history
 * against each other.
 *
 * Keyed on (league, node) rather than a match id, because Valve only mints match ids when
 * the first game starts — the entire point of this page is the window before that.
 *
 * Once the series does start it has real matches, so the page hands off to MatchPage
 * rather than presenting a stale preview next to a live game.
 */

function TeamColumn({ team, align = 'left' }: { team: TeamRef & { roster: RosterPlayer[] }; align?: 'left' | 'right' }) {
  const right = align === 'right'
  return (
    <div className={right ? 'text-right' : ''}>
      <div className={'flex items-center gap-3 mb-4 ' + (right ? 'flex-row-reverse' : '')}>
        <TeamLogo src={team.logoUrl} name={team.name ?? undefined} size={44} />
        <div className={right ? 'text-right' : ''}>
          <div className="text-[18px] font-bold text-text leading-tight">{team.name ?? 'TBD'}</div>
          {team.tag && <div className="text-[11px] uppercase tracking-[0.12em] text-text-dim">{team.tag}</div>}
        </div>
      </div>

      {team.roster.length === 0 ? (
        <p className="text-[12px] text-text-dim">Roster not published.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {team.roster.map((p) => {
            const winRate = p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : null
            return (
              <li
                key={p.accountId ?? p.name}
                className={'flex items-center gap-3 ' + (right ? 'flex-row-reverse' : '')}
              >
                <span className="text-[13px] text-text truncate">{p.name ?? 'Unknown'}</span>
                <span className="text-[11px] text-text-dim tabular-nums whitespace-nowrap">
                  {p.gamesPlayed} games
                  {winRate !== null && <span className="text-text-muted"> · {winRate}%</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function PrematchPage() {
  const { leagueId, nodeId } = useParams()
  const query = usePrematch(leagueId, nodeId)
  const data = query.data

  /**
   * The series is under way: MatchPage is the better page from here on.
   *
   * Gated on the node having STARTED, not on Valve having published a match id for it.
   * Those are minutes apart — `matchIds` was still empty here while the game was live and
   * already in the archive — and the gap covers the draft, which is exactly the part of a
   * match that cannot be watched afterwards. A reader who opened the fixture page to catch
   * the picks sat on a static preview instead.
   *
   * /series/:id is the right destination rather than a match id guessed here: it already
   * resolves the live map from the feed, falls back to the archive, and says so plainly
   * when there is genuinely nothing to show. It never redirects back here, so this cannot
   * bounce.
   */
  const started = data?.node.status === 'live' || data?.node.status === 'finished'
  if (data?.node.seriesId && (data.node.matchIds.length > 0 || started)) {
    return <Navigate to={`/series/${data.node.seriesId}`} replace />
  }

  const t1 = data?.team1
  const t2 = data?.team2
  const scheduled = data?.node.scheduledTime ?? null
  const startsIn =
    scheduled && scheduled * 1000 > Date.now()
      ? `in ${formatDistanceToNowStrict(new Date(scheduled * 1000))}`
      : null

  return (
    <PageShell
      glow
      backTo={leagueId ? { to: `/tournament/${leagueId}`, label: 'Tournament' } : { to: '/', label: 'Matches' }}
      eyebrow={
        [data?.league.name, data?.node.nodeGroupName, data?.node.name].filter(Boolean).join(' · ') || undefined
      }
      title={
        <>
          {t1?.name ?? 'TBD'}
          <span className="text-text-dim"> vs </span>
          {t2?.name ?? 'TBD'}
        </>
      }
      meta={
        <>
          {scheduled ? (
            <span className="text-[13px] text-text-muted tabular-nums">
              {format(new Date(scheduled * 1000), 'EEE d MMM, HH:mm')}
            </span>
          ) : (
            // Not a gap in our data: many organisers publish a bracket with every
            // scheduled_time still 0. Saying so beats an empty header.
            data && <span className="text-[13px] text-text-dim">Start time not announced</span>
          )}
          {startsIn && <span className="text-[13px] text-accent">{startsIn}</span>}
          {data?.node.bestOf && <span className="text-[12px] text-text-dim">Bo{data.node.bestOf}</span>}
        </>
      }
    >
      <BentoErrorBoundary resetKeys={[leagueId, nodeId]}>
        {query.isLoading ? (
          <div className="flex flex-col gap-6">
            <SkeletonPanel lines={5} />
            <SkeletonPanel lines={6} />
          </div>
        ) : query.isError || !data ? (
          <p className="bento-card text-[13px] text-text-dim">
            This series is not in the archive. Only tournaments the recorder syncs have a schedule —{' '}
            <Link to="/" className="text-primary">
              back to live matches
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="bento-card">
              <SectionTitle>Rosters</SectionTitle>
              <div className="grid grid-cols-1 stack:grid-cols-[1fr_auto_1fr] gap-6 items-start">
                <TeamColumn team={t1!} />
                <div className="hidden stack:block w-px self-stretch bg-border" aria-hidden="true" />
                <TeamColumn team={t2!} align="right" />
              </div>
              <p className="mt-4 text-[11px] text-text-dim">
                Rosters and game counts come from OpenDota's team history, so they reflect the
                registered squad rather than who is confirmed to play this series.
              </p>
            </section>

            {/* Same panel as the live match page — one head-to-head, one look. */}
            <H2HPanel
              data={{ radiant: data.radiant, dire: data.dire, h2h: data.h2h }}
              radiantName={t1?.name}
              direName={t2?.name}
            />
          </div>
        )}
      </BentoErrorBoundary>
    </PageShell>
  )
}
