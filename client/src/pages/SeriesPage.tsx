import { Navigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiFetch'
import PageShell from '../components/PageShell'
import { SkeletonSchedule } from '../components/Skeletons'
import { fetchLiveGames } from '../hooks/useLiveGames'
import { findLiveGameForSeries } from '../utils/liveSeries'
import type { ArchivedMatch } from '../hooks/useArchive'

/**
 * A series has no page of its own — it is a redirect to the map worth looking at:
 * the live one, else the last one played, else game 1. Anything else would duplicate
 * MatchPage, which already shows every map of the series in its tabs.
 *
 * The archive alone is not enough to answer that. A game that is being played right now
 * often has no row here yet: Valve publishes the series before it publishes the match id
 * for its current map, so `series.matchIds` is empty for minutes while the game is live and
 * plainly visible in GetLiveLeagueGames. Clicking a live series then found nothing to
 * redirect to and bounced to the home page — the tournament equivalent of a dead link.
 *
 * So the live feed is the second source, matched on team ids within the same league.
 * It is consulted only when the archive has no live row of its own, and it is only waited
 * on when the archive offers nothing at all, so a finished series still redirects at once.
 */

interface SeriesRow {
  seriesId: number
  leagueId: number | null
  nodeId: number | null
  team1Id: number | null
  team2Id: number | null
  team1Name: string | null
  team2Name: string | null
}

/**
 * This page normally exists for a few hundred milliseconds before redirecting, but both of
 * the lookups it waits on can hang — and while they did, the reader was left on a bare line
 * of text with no header, no navigation and no way out but the back button. Same shell and
 * the same skeleton as everywhere else, so a slow answer looks like a slow answer.
 */
function Waiting({ label }: { label: string }) {
  return (
    <PageShell eyebrow={label} title="Opening series" backTo={{ to: '/', label: 'Matches' }}>
      <SkeletonSchedule rows={3} />
    </PageShell>
  )
}

export default function SeriesPage() {
  const { seriesId } = useParams()

  const query = useQuery({
    queryKey: ['series', seriesId],
    queryFn: async () => {
      const r = await apiFetch(`/api/series/${seriesId}`)
      if (!r.ok) throw new Error(`BFF error: ${r.status}`)
      return r.json() as Promise<{ series: SeriesRow | null; games: ArchivedMatch[] }>
    },
    enabled: !!seriesId,
    retry: 1,
  })

  const series = query.data?.series ?? null
  const games = query.data?.games ?? []
  const liveInArchive = games.find((g) => g.ingestStatus === 'live') ?? null
  const newest = [...games].sort((a, b) => (b.gameInSeries ?? 0) - (a.gameInSeries ?? 0))[0] ?? null

  // Fired in parallel with the series lookup rather than after it, and never gated on
  // `enabled`: a disabled query reports isLoading false, so gating it meant the redirect
  // resolved before the feed had been asked and quietly fell through to the archive —
  // which sent a live game 2 to the finished game 1 sitting above it.
  // Same cache entry as useLiveGames, so the home page's poll usually has it warm.
  const live = useQuery({
    queryKey: ['live-games'],
    queryFn: fetchLiveGames,
    staleTime: 25_000,
  })

  if (query.isLoading) return <Waiting label="Loading series…" />

  // On error isLoading drops to false on its own, so a dead feed delays nothing.
  if (live.isLoading) return <Waiting label="Finding the live game…" />

  // The feed outranks the archive's own `live` flag. That flag is cleared by a sweep on
  // the ingest tick, so for a few minutes after a map ends it still says "live" — and
  // trusting it then sends the reader to the map that just finished rather than the one
  // being played. Valve's feed is the definition of what is live; the archive is a cache
  // of it. Both name the same match id whenever they agree, so preferring the feed costs
  // nothing when nothing is stale.
  const fromFeed = series ? findLiveGameForSeries(live.data?.games ?? [], series) : null
  if (fromFeed) return <Navigate to={`/match/${fromFeed}`} replace />
  if (liveInArchive) return <Navigate to={`/match/${liveInArchive.matchId}`} replace />
  if (newest) return <Navigate to={`/match/${newest.matchId}`} replace />

  // Genuinely nothing to show. Say so instead of dropping the reader on the home page,
  // and link out rather than redirect: PrematchPage sends nodes with a match id back
  // here, so an automatic hop would be a loop.
  const teams = series?.team1Name && series?.team2Name ? `${series.team1Name} vs ${series.team2Name}` : null
  return (
    <PageShell
      title={teams ?? `Series #${seriesId}`}
      backTo={series?.leagueId ? { to: `/tournament/${series.leagueId}`, label: 'Tournament' } : { to: '/', label: 'Matches' }}
    >
      <p className="bento-card text-body text-text-dim">
        {series
          ? 'This series has no playable map yet — Valve has not published a match id for it, and it is not in the live feed. It will open as soon as the first game appears.'
          : 'No such series in the archive.'}
      </p>
    </PageShell>
  )
}
