import type { TeamMatch } from './openDotaApi.js'

// Head-to-head and recent form, the way an esports match page shows it: a W/L strip per
// team, the record between the two, and their last few games with scores.
//
// Everything is derived from OpenDota's /teams/{id}/matches, which is keyless and already
// carries the opponent's name and logo — no extra lookups.
//
// The one thing to get right: `radiant_win` is about the SIDE, not the team. Whether the
// row is a win depends on `radiant`, which says which side this team played.

export interface FormEntry {
  matchId: number
  won: boolean
  /** Score from this team's point of view. */
  score: { own: number; opponent: number }
  opponentId: number | null
  opponentName: string | null
  opponentLogo: string | null
  leagueName: string | null
  startTime: number | null
  duration: number | null
}

/** True when this team won the row. Undefined side or result → not a win. */
export function didWin(m: TeamMatch): boolean | null {
  if (m.radiant === undefined || m.radiant_win === undefined) return null
  return m.radiant === m.radiant_win
}

export function toFormEntry(m: TeamMatch): FormEntry | null {
  const won = didWin(m)
  if (won === null) return null
  const own = m.radiant ? (m.radiant_score ?? 0) : (m.dire_score ?? 0)
  const opponent = m.radiant ? (m.dire_score ?? 0) : (m.radiant_score ?? 0)
  return {
    matchId: m.match_id,
    won,
    score: { own, opponent },
    opponentId: m.opposing_team_id ?? null,
    opponentName: m.opposing_team_name ?? null,
    opponentLogo: m.opposing_team_logo ?? null,
    leagueName: m.league_name ?? null,
    startTime: m.start_time ?? null,
    duration: m.duration ?? null,
  }
}

/** Most recent N results, newest first. */
export function recentForm(matches: TeamMatch[] | null, limit = 5): FormEntry[] {
  return (matches ?? []).map(toFormEntry).filter((e): e is FormEntry => e !== null).slice(0, limit)
}

export interface HeadToHead {
  /** Wins for the team whose history was searched. */
  wins: number
  losses: number
  matches: FormEntry[]
  /**
   * How the opponent was identified. 'name' means the id lookup found nothing and the
   * rows were matched on team name instead — worth surfacing, because a name can be
   * reused by an unrelated roster.
   */
  matchedBy: 'id' | 'name' | 'none'
}

const normalizeName = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Meetings between the team that owns `matches` and the opponent.
 *
 * Derived from ONE team's history rather than intersecting both: every meeting appears
 * in both teams' lists, so intersecting would only duplicate work and risk disagreeing
 * with itself when the two windows cover different spans.
 *
 * Why the name fallback exists: outside the top tier the SAME organisation is registered
 * under several team ids. Verified 2026-08-12 — "Shinigami Gaming" appears in one
 * opponent's history as ids 9677506 / 9692516 / 9466592 / 9395679 while Valve's live feed
 * reported 9886115 for the very same team. Matching on id alone reported "0 meetings" for
 * two teams that had played ten times. Established orgs keep a stable id, so the id path
 * stays authoritative and the name path only runs when it finds nothing.
 */
export function headToHead(
  matches: TeamMatch[] | null,
  opponentId: number | null,
  opponentName?: string | null,
  limit = 10,
): HeadToHead {
  const rows = matches ?? []
  const build = (subset: TeamMatch[], matchedBy: HeadToHead['matchedBy']): HeadToHead => {
    const meetings = subset.map(toFormEntry).filter((e): e is FormEntry => e !== null)
    return {
      wins: meetings.filter((m) => m.won).length,
      losses: meetings.filter((m) => !m.won).length,
      matches: meetings.slice(0, limit),
      matchedBy: meetings.length > 0 ? matchedBy : 'none',
    }
  }

  if (opponentId) {
    const byId = rows.filter((m) => m.opposing_team_id === opponentId)
    if (byId.length > 0) return build(byId, 'id')
  }

  const needle = normalizeName(opponentName)
  if (needle) {
    const byName = rows.filter((m) => normalizeName(m.opposing_team_name) === needle)
    if (byName.length > 0) return build(byName, 'name')
  }

  return { wins: 0, losses: 0, matches: [], matchedBy: 'none' }
}

export interface H2HTeam {
  teamId: number | null
  name: string | null
  form: FormEntry[]
}

export interface H2HPayload {
  radiant: H2HTeam
  dire: H2HTeam
  /** Record from the RADIANT team's point of view. */
  h2h: HeadToHead
}

export interface BuildH2HInput {
  radiantTeamId: number | null
  direTeamId: number | null
  radiantName?: string | null
  direName?: string | null
  radiantMatches: TeamMatch[] | null
  direMatches: TeamMatch[] | null
  formLimit?: number
}

export function buildH2H(input: BuildH2HInput): H2HPayload {
  const { radiantTeamId, direTeamId, radiantName = null, direName = null, radiantMatches, direMatches, formLimit = 5 } = input
  return {
    radiant: { teamId: radiantTeamId, name: radiantName, form: recentForm(radiantMatches, formLimit) },
    dire: { teamId: direTeamId, name: direName, form: recentForm(direMatches, formLimit) },
    h2h: headToHead(radiantMatches, direTeamId, direName),
  }
}
