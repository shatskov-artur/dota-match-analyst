/**
 * Group-stage records, computed from the bracket rather than taken on trust.
 *
 * Valve publishes `team_standings` with names and logos from the moment a tournament is
 * announced, but leaves wins and losses at 0 and every `standing` at 0 until it decides
 * to recompute — which for TI 2026 had not happened after twelve completed Swiss series.
 * The results were sitting in the same payload all along, one level down in the nodes.
 *
 * So the table is derived from finished series and merged with whatever Valve says, taking
 * the higher of the two per team. Same rule as the series score: neither source may drag
 * the other backwards, because both lag at different moments.
 */

export interface BracketResultNode {
  nodeGroupId: number | null
  team1Id: number | null
  team2Id: number | null
  team1Wins: number | null
  team2Wins: number | null
  isCompleted: boolean | null
}

export interface TeamRecord {
  wins: number
  losses: number
}

export interface StandingRow {
  nodeGroupId: number
  teamId: number | null
  standing: number | null
  wins: number | null
  losses: number | null
  [k: string]: unknown
}

const key = (groupId: number | null | undefined, teamId: number) => `${groupId ?? -1}:${teamId}`

/**
 * Series won and lost per team, per group, from completed nodes only.
 *
 * A drawn node is counted for nobody: Bo2 exists, and a 1-1 is not a win for either side.
 */
export function deriveRecords(nodes: BracketResultNode[]): Map<string, TeamRecord> {
  const out = new Map<string, TeamRecord>()
  const bump = (groupId: number | null, teamId: number, field: keyof TeamRecord) => {
    const k = key(groupId, teamId)
    const rec = out.get(k) ?? { wins: 0, losses: 0 }
    rec[field]++
    out.set(k, rec)
  }

  for (const n of nodes) {
    if (!n.isCompleted) continue
    const { team1Id, team2Id } = n
    if (!team1Id || !team2Id) continue
    const w1 = n.team1Wins ?? 0
    const w2 = n.team2Wins ?? 0
    if (w1 === w2) continue
    const winner = w1 > w2 ? team1Id : team2Id
    const loser = w1 > w2 ? team2Id : team1Id
    bump(n.nodeGroupId, winner, 'wins')
    bump(n.nodeGroupId, loser, 'losses')
  }
  return out
}

/**
 * Merge derived records into Valve's rows and rank them.
 *
 * Ranking only happens when Valve has not ranked them itself — every `standing` at 0 or
 * null means "not seeded yet", and a table where sixteen teams all show position 0 tells
 * the reader nothing. Ties break on fewer losses, then on the order Valve listed them,
 * which is its own seeding and better than alphabetical.
 */
export function mergeStandings<T extends StandingRow>(rows: T[], records: Map<string, TeamRecord>): T[] {
  const merged = rows.map((r) => {
    const rec = r.teamId ? records.get(key(r.nodeGroupId, r.teamId)) : undefined
    return {
      ...r,
      wins: Math.max(r.wins ?? 0, rec?.wins ?? 0),
      losses: Math.max(r.losses ?? 0, rec?.losses ?? 0),
    }
  })

  const byGroup = new Map<number, typeof merged>()
  for (const r of merged) {
    if (!byGroup.has(r.nodeGroupId)) byGroup.set(r.nodeGroupId, [])
    byGroup.get(r.nodeGroupId)!.push(r)
  }

  const out: typeof merged = []
  for (const group of byGroup.values()) {
    const valveRanked = group.some((r) => (r.standing ?? 0) > 0)
    if (valveRanked) {
      out.push(...group)
      continue
    }
    const played = group.some((r) => r.wins > 0 || r.losses > 0)
    if (!played) {
      out.push(...group)
      continue
    }
    const order = new Map(group.map((r, i) => [r, i]))
    const ranked = [...group].sort(
      (a, b) => b.wins - a.wins || a.losses - b.losses || order.get(a)! - order.get(b)!,
    )
    ranked.forEach((r, i) => out.push({ ...r, standing: i + 1 }))
  }
  return out as T[]
}
