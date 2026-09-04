import { getStatusLabel, getSeriesLabel } from '../utils/gameState'
import StatusTag from './StatusTag'
import TeamLogo from './TeamLogo'
import { formatGoldDiff } from '../utils/formatGoldDiff'
import { formatDuration } from '../utils/formatDuration'

interface ScoreHeaderProps {
  match: {
    game_state?: number
    radiant_score?: number
    dire_score?: number
    stream_delay_s?: number
    duration?: number
    roshan_respawn_timer?: number
    series_type?: number
    radiant_series_wins?: number
    dire_series_wins?: number
    radiant_team?: { team_name?: string }
    dire_team?: { team_name?: string }
    team_logos?: { radiant: string | null; dire: string | null }
    players?: Array<{ team?: number; net_worth?: number }>
    scoreboard?: {
      radiant?: { score?: number; [key: string]: unknown }
      dire?: { score?: number; [key: string]: unknown }
      [key: string]: unknown
    } | null
  }
  /**
   * v2.0: an archived snapshot carries the game_state it was captured with — 5, in-game —
   * so replaying a finished match would otherwise badge it "Live". Pass false to override
   * the badge without rewriting the payload the rest of the page reads.
   */
  isLive?: boolean
  /**
   * Series score from the archive, already resolved to sides.
   *
   * The payload's own radiant_series_wins is the score AT CAPTURE TIME, so a finished map
   * replays the moment before its own result counted and reads 0–0 for a game that decided
   * the series. Passed in for the live view; left out while scrubbing, where the snapshot's
   * own value is the historically correct one.
   */
  seriesWins?: { radiant: number; dire: number } | null
  /**
   * The archived final result, once the replay has been parsed.
   *
   * A finished match is rendered from its last live snapshot, and that sample is up to
   * 30 seconds older than the ending — every kill, and the whole last push, that happened
   * after it is missing. Here that read 8–33 at 36:33 for a game that ended 7–37 at 37:11,
   * while the event feed beside it already listed OpenDota's exact kills to the final
   * second. The parsed replay is the authority on how a match ended; the snapshot is only
   * the authority on how it looked at the moment it was taken.
   */
  finalResult?: { radiantScore: number; direScore: number; duration: number | null } | null
  /**
   * Whether the numbers on screen describe a moment when the game was still being played.
   *
   * False on the end state of a finished match, where the Roshan countdown is frozen
   * leftover state — "Roshan 0:15" on a game that ended twenty minutes ago counts down to
   * nothing. Scrubbing to a past minute sets it true: there the timer is exactly what it
   * was at that minute, which is the point of replaying it.
   */
  atLiveMoment?: boolean
}

export default function ScoreHeader({
  match,
  isLive = true,
  seriesWins = null,
  finalResult = null,
  atLiveMoment = true,
}: ScoreHeaderProps) {
  // Valve stopped sending radiant_score/dire_score at the top level — across a 20-match live
  // payload not one game carried them, while 16 had scoreboard.{radiant,dire}.score. Reading
  // only the top-level fields rendered every in-game match as 0–0.
  // MatchCard already falls back this way; this mirrors it so the detail page agrees with the
  // card the user just clicked.
  const radiantScore = finalResult?.radiantScore ?? match.scoreboard?.radiant?.score ?? match.radiant_score ?? 0
  const direScore = finalResult?.direScore ?? match.scoreboard?.dire?.score ?? match.dire_score ?? 0

  const radiantNW = match.players
    ?.filter((p) => p.team === 0)
    .reduce((sum, p) => sum + (p.net_worth ?? 0), 0) ?? 0
  const direNW = match.players
    ?.filter((p) => p.team === 1)
    .reduce((sum, p) => sum + (p.net_worth ?? 0), 0) ?? 0
  const goldDiff = formatGoldDiff(radiantNW, direNW)

  // Stream delay is a disclosure about watching along: these numbers trail the broadcast by
  // this much. On a finished match there is nothing left to trail, so it goes with the
  // Roshan countdown. A replayed minute keeps it — the delay was real at that minute.
  const delayLabel = !atLiveMoment
    ? null
    : match.stream_delay_s !== undefined
      ? `~${match.stream_delay_s}s delay`
      : '~120s delay'

  const seriesLabel = getSeriesLabel(match.series_type)
  const radiantWins = seriesWins?.radiant ?? match.radiant_series_wins ?? 0
  const direWins = seriesWins?.dire ?? match.dire_series_wins ?? 0
  const seriesScore = `${radiantWins}–${direWins}${seriesLabel ? ` · ${seriesLabel}` : ''}`

  // game_state 6 is Valve's own post-game marker; isLive=false is the archive saying the
  // same thing about a snapshot that was captured mid-game.
  const status = getStatusLabel(isLive ? match.game_state : 6, match.scoreboard)
  // Same reasoning as the score: the snapshot's clock stopped when sampling did.
  const duration = finalResult?.duration ?? match.duration
  const gameTime = (duration ?? 0) > 0 ? formatDuration(duration!) : null
  const roshanTimer =
    atLiveMoment && (match.roshan_respawn_timer ?? 0) > 0 ? formatDuration(match.roshan_respawn_timer!) : null

  return (
    <div>
      {/* Score row */}
      <div className="flex flex-col gap-4 py-6 border-b border-border md:flex-row md:items-center md:justify-between">
        {/* Left: Radiant team name + kill score + series score */}
        <div className="flex flex-col gap-2 min-w-0">
          <span className="flex items-center gap-2.5 min-w-0">
            <TeamLogo
              src={match.team_logos?.radiant}
              name={match.radiant_team?.team_name}
              side="radiant"
              size={40}
            />
            <span
              className="text-label font-bold uppercase tracking-label truncate"
              style={{ color: 'var(--color-radiant)' }}
            >
              {match.radiant_team?.team_name ?? 'TBD'}
            </span>
          </span>
          <span className="text-[40px] md:text-[44px] lg:text-[56px] font-mono font-bold tabular-nums leading-none text-text">
            {radiantScore}
          </span>
          <span className="text-label tabular-nums text-text-dim">
            {seriesScore}
          </span>
        </div>

        {/* Center: StatusTag + game time + gold diff + delay disclosure */}
        <div className="flex flex-col items-center gap-3">
          <StatusTag status={status} />
          {gameTime && (
            <span className="text-body-lg tabular-nums font-mono text-text-muted">
              {gameTime}
            </span>
          )}
          {roshanTimer && (
            <span
              className="text-body tabular-nums font-mono px-2 py-0.5 rounded border"
              style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', borderColor: 'var(--color-accent)' }}
            >
              Roshan {roshanTimer}
            </span>
          )}
          <span
            className="text-body-lg tabular-nums font-mono font-bold"
            style={{ color: 'var(--color-gold)' }}
          >
            {goldDiff.text}
          </span>
          {delayLabel && (
            <span className="text-label uppercase tracking-label text-text-dim">
              {delayLabel}
            </span>
          )}
        </div>

        {/* Right: Dire kill score + team name + series score (mirrored) */}
        <div className="flex flex-col items-start gap-2 min-w-0 md:items-end">
          {/* Mirrored on laptop+: the avatar sits outside the name, matching the Radiant side. */}
          <span className="flex items-center gap-2.5 min-w-0 md:flex-row-reverse">
            <TeamLogo
              src={match.team_logos?.dire}
              name={match.dire_team?.team_name}
              side="dire"
              size={40}
            />
            <span
              className="text-label font-bold uppercase tracking-label truncate"
              style={{ color: 'var(--color-dire)' }}
            >
              {match.dire_team?.team_name ?? 'TBD'}
            </span>
          </span>
          <span className="text-[40px] md:text-[44px] lg:text-[56px] font-mono font-bold tabular-nums leading-none text-text">
            {direScore}
          </span>
          <span className="text-label tabular-nums text-text-dim">
            {seriesScore}
          </span>
        </div>
      </div>
    </div>
  )
}
