import { useArchiveStatus } from '../hooks/useArchive'

/**
 * Why this match has no timeline, no event log and no analysis.
 *
 * Without this the page just quietly omits three panels, which is indistinguishable from
 * a bug. The recorder only archives the leagues named in TRACKED_LEAGUE_IDS, so say which
 * ones those are and what would change the answer.
 */
export interface NotRecordedNoticeProps {
  /** League this match belongs to, from the live payload. */
  leagueId: number | undefined
  leagueName: string | undefined
  /** True when the archive genuinely holds nothing for this match. */
  hasArchive: boolean
}

export default function NotRecordedNotice({ leagueId, leagueName, hasArchive }: NotRecordedNoticeProps) {
  const status = useArchiveStatus()
  if (hasArchive) return null
  if (!status.data) return null

  const tracked = status.data.trackedLeagueIds ?? []
  const names = status.data.trackedLeagues ?? []

  if (!status.data.configured) {
    return (
      <p className="bento-card text-body text-text-dim">
        No archive database configured — timeline, event log and post-match analysis are unavailable.
        Set <code className="text-text-muted">DATABASE_URL</code> in <code className="text-text-muted">server/.env</code>.
      </p>
    )
  }

  const isTracked = tracked.length === 0 || (leagueId !== undefined && tracked.includes(leagueId))

  return (
    <p className="bento-card text-body text-text-dim">
      {isTracked ? (
        <>
          Nothing recorded for this match yet — the recorder writes a snapshot every 30 seconds, so the
          timeline and event log appear about a minute after the game starts.
        </>
      ) : (
        <>
          {leagueName ?? 'This league'} is not being recorded, so there is no timeline, event log or
          post-match analysis for it. Currently archiving:{' '}
          <span className="text-text-muted">
            {names.length > 0 ? names.map((l) => l.name ?? `#${l.leagueId}`).join(', ') : tracked.join(', ')}
          </span>
          . Add a league id to <code className="text-text-muted">TRACKED_LEAGUE_IDS</code> in{' '}
          <code className="text-text-muted">server/.env</code> to record it too.
        </>
      )}
    </p>
  )
}
