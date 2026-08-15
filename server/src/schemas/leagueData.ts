import { z } from 'zod'

// GetLeagueData — https://www.dota2.com/webapi/IDOTA2League/GetLeagueData/v001/?league_id=N
//
// Undocumented Valve endpoint, no API key. Verified against The International 2026
// (league_id 19719) on 2026-08-12. CRITICAL: .passthrough() everywhere and every field
// .optional() — this endpoint is not covered by any contract and Valve reshapes it freely.
//
// Three facts learned from the live TI payload that the shape has to accommodate:
//  1. `node_groups` nest recursively (top-level phase groups → "Swiss" / "Playoff" → nodes).
//  2. `series_infos` was EMPTY before the tournament began and fills in once games are
//     played; the same ids also arrive in `nodes[].matches[]`. Both paths must be
//     supported — never one or the other.
//  3. Ids change JSON TYPE mid-tournament. `series_infos[].match_ids` were numbers while
//     the array was empty and became strings with the first game. See `id` below.

/**
 * A Valve id, whatever type it arrives as.
 *
 * This is not defensive programming for its own sake: an id switching from number to
 * string took the ENTIRE bracket sync down at 02:00 on TI day one, because one bad
 * element fails the whole payload and the sync then logs "upstream miss" and keeps stale
 * data. Every id field is written this way so the next reshape costs nothing.
 *
 * Values stay well inside MAX_SAFE_INTEGER (match ids are ~8.9e9), so Number() is safe
 * here — unlike `team_logo`, which is a ugcid and must never be coerced.
 */
const id = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)])

export const LeagueStreamSchema = z
  .object({
    stream_id: id.optional(),
    language: z.number().optional(),
    name: z.string().optional(),
    broadcast_provider: z.number().optional(),
    stream_url: z.string().optional(),
    vod_url: z.string().optional(),
  })
  .passthrough()

export const TeamStandingSchema = z
  .object({
    standing: z.number().optional(),
    team_id: id.optional(),
    team_name: z.string().optional(),
    team_tag: z.string().optional(),
    team_abbreviation: z.string().optional(),
    /** ugcid as a STRING here — never coerce to number, it exceeds MAX_SAFE_INTEGER. */
    team_logo: z.union([z.string(), z.number()]).optional(),
    /** Already a usable CDN URL — this is what we persist. */
    team_logo_url: z.string().optional(),
    wins: z.number().optional(),
    losses: z.number().optional(),
    score: z.union([z.string(), z.number()]).optional(),
    is_pro: z.boolean().optional(),
  })
  .passthrough()

/**
 * A node is one series (Bo1/Bo2/Bo3/Bo5) in the bracket.
 * `matches` is empty until games are played; its element shape is unknown until then,
 * so it is kept as `unknown[]` and mined defensively by extractNodeMatchIds().
 */
export const LeagueNodeSchema = z
  .object({
    name: z.string().optional(),
    node_id: id.optional(),
    node_group_id: id.optional(),
    winning_node_id: id.optional(),
    losing_node_id: id.optional(),
    incoming_node_id_1: id.optional(),
    incoming_node_id_2: id.optional(),
    /** 1=Bo1, 2=Bo2, 3=Bo3, 4=Bo5. TI 2026 group stage is all node_type 2. */
    node_type: z.number().optional(),
    scheduled_time: z.number().optional(),
    actual_time: z.number().optional(),
    series_id: id.optional(),
    team_id_1: id.optional(),
    team_id_2: id.optional(),
    matches: z.array(z.unknown()).optional(),
    team_1_wins: z.number().optional(),
    team_2_wins: z.number().optional(),
    has_started: z.boolean().optional(),
    is_completed: z.boolean().optional(),
    stream_ids: z.array(id).optional(),
    vods: z.array(z.unknown()).optional(),
  })
  .passthrough()

export type LeagueNode = z.infer<typeof LeagueNodeSchema>

// z.lazy is required: node_groups contain node_groups. The explicit type annotation
// breaks the circular inference TypeScript cannot resolve on its own.
export interface LeagueNodeGroup {
  name?: string
  node_group_id?: number
  parent_node_group_id?: number
  incoming_node_group_ids?: number[]
  advancing_node_group_id?: number
  advancing_team_count?: number
  team_count?: number
  node_group_type?: number
  phase?: number
  region?: number
  round?: number
  start_time?: number
  end_time?: number
  is_tiebreaker?: boolean
  is_final_group?: boolean
  is_completed?: boolean
  team_standings?: z.infer<typeof TeamStandingSchema>[]
  nodes?: LeagueNode[]
  node_groups?: LeagueNodeGroup[]
  [k: string]: unknown
}

// Input typed as `unknown`, not LeagueNodeGroup: ids accept string OR number on the way
// in and are numbers on the way out, so input and output shapes genuinely differ. The
// input is untrusted JSON regardless — that is the entire point of parsing it.
export const LeagueNodeGroupSchema: z.ZodType<LeagueNodeGroup, z.ZodTypeDef, unknown> = z.lazy(() =>
  z
    .object({
      name: z.string().optional(),
      node_group_id: id.optional(),
      parent_node_group_id: id.optional(),
      incoming_node_group_ids: z.array(z.number()).optional(),
      advancing_node_group_id: id.optional(),
      advancing_team_count: z.number().optional(),
      team_count: z.number().optional(),
      node_group_type: z.number().optional(),
      phase: z.number().optional(),
      region: z.number().optional(),
      round: z.number().optional(),
      start_time: z.number().optional(),
      end_time: z.number().optional(),
      is_tiebreaker: z.boolean().optional(),
      is_final_group: z.boolean().optional(),
      is_completed: z.boolean().optional(),
      team_standings: z.array(TeamStandingSchema).optional(),
      nodes: z.array(LeagueNodeSchema).optional(),
      node_groups: z.array(LeagueNodeGroupSchema).optional(),
    })
    .passthrough(),
)

export const SeriesInfoSchema = z
  .object({
    series_id: id.optional(),
    /** 0=Bo1, 1=Bo3, 2=Bo5. */
    series_type: z.number().optional(),
    start_time: z.number().optional(),
    match_ids: z.array(id).optional(),
    team_id_1: id.optional(),
    team_id_2: id.optional(),
  })
  .passthrough()

export const LeagueInfoSchema = z
  .object({
    league_id: id.optional(),
    name: z.string().optional(),
    tier: z.number().optional(),
    region: z.number().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    start_timestamp: z.number().optional(),
    end_timestamp: z.number().optional(),
    status: z.number().optional(),
    most_recent_activity: z.number().optional(),
  })
  .passthrough()

export const LeagueDataSchema = z
  .object({
    info: LeagueInfoSchema.optional(),
    prize_pool: z
      .object({
        base_prize_pool: z.number().optional(),
        total_prize_pool: z.number().optional(),
      })
      .passthrough()
      .optional(),
    streams: z.array(LeagueStreamSchema).optional(),
    node_groups: z.array(LeagueNodeGroupSchema).optional(),
    series_infos: z.array(SeriesInfoSchema).optional(),
  })
  .passthrough()

export type LeagueData = z.infer<typeof LeagueDataSchema>
export type TeamStanding = z.infer<typeof TeamStandingSchema>
export type SeriesInfo = z.infer<typeof SeriesInfoSchema>

// ─── Pure helpers (unit-tested) ──────────────────────────────────────────────

export interface FlatNodeGroup extends LeagueNodeGroup {
  depth: number
}

/** Depth-first flatten of the recursive node_groups tree. */
export function flattenNodeGroups(
  groups: LeagueNodeGroup[] | undefined,
  depth = 0,
): FlatNodeGroup[] {
  const out: FlatNodeGroup[] = []
  for (const g of groups ?? []) {
    out.push({ ...g, depth })
    out.push(...flattenNodeGroups(g.node_groups, depth + 1))
  }
  return out
}

export interface FlatNode extends LeagueNode {
  nodeGroupName: string | undefined
  nodeGroupId: number | undefined
  parentNodeGroupId: number | undefined
  phase: number | undefined
}

/** Every node in the league, tagged with the group it came from. */
export function flattenNodes(groups: LeagueNodeGroup[] | undefined): FlatNode[] {
  return flattenNodeGroups(groups).flatMap((g) =>
    (g.nodes ?? []).map((n) => ({
      ...n,
      nodeGroupName: g.name,
      nodeGroupId: g.node_group_id ?? n.node_group_id,
      parentNodeGroupId: g.parent_node_group_id,
      phase: g.phase,
    })),
  )
}

/**
 * Mine match ids out of `nodes[].matches[]`.
 *
 * The element shape is unverified — the array was empty on every TI node at the time
 * this was written. Valve's other league endpoints use either bare ids or objects with
 * a `match_id` field, so both are accepted and anything else is ignored rather than
 * throwing: a shape surprise must not stop the rest of the sync.
 */
export function extractNodeMatchIds(matches: unknown[] | undefined): number[] {
  const out: number[] = []
  for (const m of matches ?? []) {
    if (typeof m === 'number' && Number.isFinite(m) && m > 0) {
      out.push(m)
      continue
    }
    if (m && typeof m === 'object') {
      const id = (m as Record<string, unknown>).match_id
      if (typeof id === 'number' && Number.isFinite(id) && id > 0) out.push(id)
      else if (typeof id === 'string' && /^\d+$/.test(id)) out.push(Number(id))
    }
  }
  return out
}

/**
 * node_type → "best of N".
 *
 * Derived from data, not documentation. Counting the maps actually played in completed
 * nodes across TI 2025, the TI 2026 qualifiers, FISSURE Playground and FSL Monthly:
 *
 *   node_type 1 → 1 map, always                  → Bo1
 *   node_type 2 → 2 maps (×74) or 3 maps (×53)   → Bo3   (2-0 or 2-1)
 *   node_type 3 → 4 maps (×1) or 5 maps (×2)     → Bo5   (3-1 or 3-2)
 *
 * The three-map cases are what rule out Bo2: a Bo2 always plays exactly two. An earlier
 * reading of the community wiki ("node_type 1-4 for BO1-BO5") had this as Bo2 and
 * labelled the whole TI 2026 bracket wrong.
 *
 * node_type 4 has never been observed; it stays null rather than being guessed at.
 */
export function nodeTypeToBestOf(nodeType: number | undefined): number | null {
  switch (nodeType) {
    case 1:
      return 1
    case 2:
      return 3
    case 3:
      return 5
    default:
      return null
  }
}

/** series_type → "best of N" (a different encoding from node_type — do not merge them). */
export function seriesTypeToBestOf(seriesType: number | undefined): number | null {
  switch (seriesType) {
    case 0:
      return 1
    case 1:
      return 3
    case 2:
      return 5
    default:
      return null
  }
}
