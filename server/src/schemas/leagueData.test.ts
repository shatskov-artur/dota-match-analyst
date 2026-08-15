import { describe, it, expect } from 'vitest'
import {
  LeagueDataSchema,
  flattenNodeGroups,
  flattenNodes,
  extractNodeMatchIds,
  nodeTypeToBestOf,
  seriesTypeToBestOf,
} from './leagueData.js'

// Shape mirrors the real GetLeagueData body for The International 2026 (league 19719),
// captured 2026-08-12: two top-level phase groups, each wrapping the real groups, and
// series_infos EMPTY — the reason nodes[].matches[] must also be a supported path.
const TI_LIKE = {
  info: { league_id: 19719, name: 'The International 2026', tier: 5 },
  streams: [{ stream_id: 7964, name: '[A] EN', stream_url: 'https://www.twitch.tv/dota2ti' }],
  series_infos: [],
  node_groups: [
    {
      name: '',
      node_group_id: 1,
      phase: 2,
      team_standings: [{ standing: 0, team_id: 2163, team_name: 'Team Liquid', team_tag: 'Liquid' }],
      nodes: [],
      node_groups: [
        {
          name: 'Swiss',
          node_group_id: 2,
          nodes: [
            {
              name: 'Match 1.A',
              node_id: 1,
              node_type: 2,
              scheduled_time: 1786586400,
              series_id: 0,
              team_id_1: 9247354,
              team_id_2: 10150538,
              matches: [],
            },
          ],
        },
        { name: 'Elimination Round', node_group_id: 3, nodes: [{ node_id: 20, node_type: 3 }] },
      ],
    },
    {
      name: '',
      node_group_id: 4,
      phase: 3,
      node_groups: [{ name: 'Playoff', node_group_id: 5, nodes: [{ node_id: 30, node_type: 4 }] }],
    },
  ],
}

describe('LeagueDataSchema', () => {
  it('parses a TI-shaped payload including nested node_groups', () => {
    const parsed = LeagueDataSchema.safeParse(TI_LIKE)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.info?.name).toBe('The International 2026')
  })

  it('passes unknown fields through rather than stripping them', () => {
    const parsed = LeagueDataSchema.parse({ ...TI_LIKE, brand_new_valve_field: 42 })
    expect((parsed as Record<string, unknown>).brand_new_valve_field).toBe(42)
  })

  it('accepts a payload with no node_groups at all', () => {
    expect(LeagueDataSchema.safeParse({ info: { league_id: 1 } }).success).toBe(true)
  })

  /**
   * The regression that took the whole bracket sync down on TI day one.
   *
   * `series_infos` was an empty array before the first game and filled in afterwards
   * with match ids as STRINGS. One string in one array failed the entire payload, so
   * getLeagueData returned null, the sync logged "upstream miss" and the bracket froze
   * on pre-tournament data while games were being played.
   */
  it('accepts ids as strings and normalises them to numbers', () => {
    const parsed = LeagueDataSchema.parse({
      info: { league_id: '19719' },
      series_infos: [
        { series_id: '1130032', series_type: 1, match_ids: ['8943013334', '8943055466'], team_id_1: '2586976' },
      ],
      node_groups: [{ node_group_id: '5', nodes: [{ node_id: '14', team_id_1: '36', winning_node_id: '18' }] }],
    })
    expect(parsed.series_infos?.[0].match_ids).toEqual([8943013334, 8943055466])
    expect(parsed.series_infos?.[0].series_id).toBe(1130032)
    expect(parsed.series_infos?.[0].team_id_1).toBe(2586976)
    expect(parsed.info?.league_id).toBe(19719)
    expect(parsed.node_groups?.[0].nodes?.[0].node_id).toBe(14)
    expect(parsed.node_groups?.[0].nodes?.[0].winning_node_id).toBe(18)
  })

  it('still accepts the numeric form the same endpoint used yesterday', () => {
    const parsed = LeagueDataSchema.parse({
      series_infos: [{ series_id: 1130032, match_ids: [8943013334] }],
    })
    expect(parsed.series_infos?.[0].match_ids).toEqual([8943013334])
  })

  it('rejects an id that is not digits rather than silently yielding NaN', () => {
    const parsed = LeagueDataSchema.safeParse({ series_infos: [{ match_ids: ['not-an-id'] }] })
    expect(parsed.success).toBe(false)
  })
})

describe('flattenNodeGroups', () => {
  it('walks the tree depth-first and records depth', () => {
    const flat = flattenNodeGroups(TI_LIKE.node_groups)
    expect(flat.map((g) => `${g.node_group_id}@${g.depth}`)).toEqual(['1@0', '2@1', '3@1', '4@0', '5@1'])
  })

  it('returns [] for undefined', () => {
    expect(flattenNodeGroups(undefined)).toEqual([])
  })
})

describe('flattenNodes', () => {
  it('collects nodes from every depth and tags them with their group', () => {
    const nodes = flattenNodes(TI_LIKE.node_groups)
    expect(nodes.map((n) => n.node_id)).toEqual([1, 20, 30])
    expect(nodes[0].nodeGroupName).toBe('Swiss')
    expect(nodes[2].nodeGroupName).toBe('Playoff')
  })

  it('inherits phase from the owning group', () => {
    const nodes = flattenNodes(TI_LIKE.node_groups)
    expect(nodes[2].phase).toBeUndefined() // Playoff group carries no phase of its own
  })
})

describe('extractNodeMatchIds', () => {
  it('accepts bare numeric ids', () => {
    expect(extractNodeMatchIds([8932722908, 8932722909])).toEqual([8932722908, 8932722909])
  })

  it('accepts objects carrying match_id', () => {
    expect(extractNodeMatchIds([{ match_id: 123, winner: 1 }, { match_id: '456' }])).toEqual([123, 456])
  })

  it('ignores shapes it does not recognise instead of throwing', () => {
    // The element shape was unverifiable when written (every TI node had matches: []),
    // so an unexpected shape must degrade to "no ids", never break the sync.
    expect(extractNodeMatchIds([null, 'nope', {}, { match_id: 'abc' }, { id: 5 }, 0, -1])).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(extractNodeMatchIds(undefined)).toEqual([])
  })
})

describe('best-of mapping', () => {
  it('maps node_type 1/2/3 to Bo1/Bo3/Bo5', () => {
    // Established by counting maps actually played in completed nodes: type 2 produced
    // three maps 53 times, which a Bo2 can never do.
    expect([1, 2, 3].map(nodeTypeToBestOf)).toEqual([1, 3, 5])
  })

  it('never reports Bo2 — that reading mislabelled the whole TI 2026 bracket', () => {
    expect([1, 2, 3, 4].map(nodeTypeToBestOf)).not.toContain(2)
  })

  it('maps series_type 0-2 to Bo1/Bo3/Bo5 — a different encoding from node_type', () => {
    expect([0, 1, 2].map(seriesTypeToBestOf)).toEqual([1, 3, 5])
  })

  it('returns null for values Valve has not used', () => {
    expect(nodeTypeToBestOf(4)).toBeNull()
    expect(nodeTypeToBestOf(99)).toBeNull()
    expect(nodeTypeToBestOf(undefined)).toBeNull()
    expect(seriesTypeToBestOf(7)).toBeNull()
  })
})
