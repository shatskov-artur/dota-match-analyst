import { describe, it, expect, vi } from 'vitest'

vi.mock('../../db/index.js', () => ({ db: null }))
vi.mock('../openDotaApi.js', () => ({ getMatchDetail: vi.fn() }))
// env.ts validates VALVE_API_KEY etc. at import time and would throw in a unit test.
// The backfill queue reads trackedLeagueIds to serve the recorded tournament first.
vi.mock('../../env.js', () => ({ env: {}, trackedLeagueIds: new Set<number>(), isTrackedLeague: () => true }))
vi.mock('../../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
  expandMinutes,
  expandPlayerMinutes,
  expandEvents,
  expandKills,
  parseBuildingKey,
  normalizeTeam,
} from './postMatchBackfill.js'

describe('expandMinutes', () => {
  it('turns the Radiant-positive advantage arrays into one row per minute', () => {
    const rows = expandMinutes({ radiant_gold_adv: [0, 500, -200], radiant_xp_adv: [0, 300, 100] })
    expect(rows).toHaveLength(3)
    expect(rows[1]).toMatchObject({ minute: 1, radiantGoldAdv: 500, radiantXpAdv: 300 })
    expect(rows[2].radiantGoldAdv).toBe(-200)
  })

  it('pads to the longer of the two arrays rather than truncating', () => {
    const rows = expandMinutes({ radiant_gold_adv: [1, 2, 3], radiant_xp_adv: [1] })
    expect(rows).toHaveLength(3)
    expect(rows[2].radiantXpAdv).toBeNull()
  })

  it('returns [] for an unparsed match with no advantage arrays', () => {
    expect(expandMinutes({ match_id: 1, version: null })).toEqual([])
  })

  it('reconstructs a cumulative per-minute score from kills_log', () => {
    const rows = expandMinutes({
      radiant_gold_adv: [0, 0, 0, 0],
      players: [
        // player_slot < 128 is Radiant
        { player_slot: 0, kills_log: [{ time: 65 }, { time: 130 }] },
        { player_slot: 128, kills_log: [{ time: 70 }] },
      ],
    })
    expect(rows.map((r) => `${r.radiantScore}:${r.direScore}`)).toEqual(['0:0', '1:1', '2:1', '2:1'])
  })

  it('clamps pre-horn kills (negative time) into minute 0', () => {
    const rows = expandMinutes({
      radiant_gold_adv: [0, 0],
      players: [{ player_slot: 0, kills_log: [{ time: -30 }] }],
    })
    expect(rows[0].radiantScore).toBe(1)
  })

  it('leaves scores null when no kills_log exists, rather than claiming 0:0', () => {
    const rows = expandMinutes({ radiant_gold_adv: [0, 0], players: [{ player_slot: 0 }] })
    expect(rows[0].radiantScore).toBeNull()
    expect(rows[0].direScore).toBeNull()
  })
})

describe('expandPlayerMinutes', () => {
  const match = {
    players: [
      { player_slot: 0, account_id: 1, hero_id: 10, name: 'r1', gold_t: [0, 500, 1200], xp_t: [0, 400, 900], lh_t: [0, 5, 12] },
      { player_slot: 128, account_id: 2, hero_id: 11, personaname: 'd1', gold_t: [0, 300], xp_t: [0, 250], lh_t: [0, 3] },
    ],
  }

  it("normalises OpenDota's 0-4 / 128-132 slots to the archive's 0-9", () => {
    const rows = expandPlayerMinutes(match)
    expect([...new Set(rows.map((r) => r.playerSlot))]).toEqual([0, 5])
  })

  it('emits one row per player per minute from the cumulative arrays', () => {
    const rows = expandPlayerMinutes(match)
    expect(rows.filter((r) => r.playerSlot === 0)).toHaveLength(3)
    expect(rows.filter((r) => r.playerSlot === 5)).toHaveLength(2)
    expect(rows.find((r) => r.playerSlot === 0 && r.minute === 2)).toMatchObject({
      netWorth: 1200,
      xp: 900,
      lastHits: 12,
      team: 0,
    })
  })

  it('marks slots 5-9 as Dire', () => {
    expect(expandPlayerMinutes(match).find((r) => r.playerSlot === 5)?.team).toBe(1)
  })

  it('falls back to personaname when name is absent', () => {
    expect(expandPlayerMinutes(match).find((r) => r.playerSlot === 5)?.playerName).toBe('d1')
  })

  it('skips players with no per-minute arrays instead of emitting empty rows', () => {
    expect(expandPlayerMinutes({ players: [{ player_slot: 0, account_id: 1 }] })).toEqual([])
  })
})

describe('expandEvents', () => {
  it('maps the objective chat types onto archive event types', () => {
    const events = expandEvents({
      objectives: [
        { time: 300, type: 'CHAT_MESSAGE_FIRSTBLOOD', player_slot: 1 },
        { time: 620, type: 'CHAT_MESSAGE_TOWER_KILL', team: 2 },
        { time: 1500, type: 'CHAT_MESSAGE_ROSHAN_KILL', team: 3 },
        { time: 1800, type: 'CHAT_MESSAGE_BARRACKS_KILL', key: '2' },
        { time: 1900, type: 'CHAT_MESSAGE_COURIER_LOST' },
      ],
    })
    expect(events.map((e) => e.type)).toEqual(['first_blood', 'tower', 'roshan', 'barracks'])
  })

  it('carries the original objective payload through untouched', () => {
    const events = expandEvents({ objectives: [{ time: 620, type: 'CHAT_MESSAGE_TOWER_KILL', team: 2, key: 'npc_x' }] })
    expect(events[0].payload).toMatchObject({ key: 'npc_x', team: 2 })
  })

  it('emits one event per teamfight, anchored at its start', () => {
    const events = expandEvents({ teamfights: [{ start: 800, end: 830, deaths: 4, last_death: 828 }] })
    expect(events[0]).toMatchObject({ type: 'teamfight', t: 800 })
    expect(events[0].payload).toMatchObject({ end: 830, deaths: 4 })
  })

  it('places draft picks and bans before minute 0, in pick order', () => {
    const events = expandEvents({
      picks_bans: [
        { is_pick: false, hero_id: 1, team: 0, order: 0 },
        { is_pick: true, hero_id: 2, team: 1, order: 1 },
      ],
    })
    expect(events.map((e) => [e.type, e.t])).toEqual([
      ['ban', -1000],
      ['pick', -999],
    ])
  })

  it('namespaces dedupe keys with od: so they never collide with sampler-detected events', () => {
    const events = expandEvents({ objectives: [{ time: 620, type: 'CHAT_MESSAGE_TOWER_KILL' }] })
    expect(events[0].dedupeKey.startsWith('od:')).toBe(true)
  })

  it('returns [] for a match with none of those sections', () => {
    expect(expandEvents({ match_id: 1 })).toEqual([])
  })

  it('splits teamfight deaths per side so the feed can name who came out ahead', () => {
    // teamfights[].players is positional: 0-4 Radiant, 5-9 Dire.
    const players = Array.from({ length: 10 }, (_, i) => ({ deaths: i < 5 ? 1 : 0 }))
    const [fight] = expandEvents({ teamfights: [{ start: 600, end: 630, deaths: 5, players }] })
    expect(fight.payload.radiantDeaths).toBe(5)
    expect(fight.payload.direDeaths).toBe(0)
    expect(fight.payload.winner).toBe(1)
  })

  it('routes a parsed building_kill to the specific tower or barracks type', () => {
    const events = expandEvents({
      objectives: [
        { time: 600, type: 'building_kill', key: 'npc_dota_badguys_tower2_mid' },
        { time: 900, type: 'building_kill', key: 'npc_dota_goodguys_melee_rax_top' },
      ],
    })
    expect(events.map((e) => e.type)).toEqual(['tower', 'barracks'])
    expect(events[0].payload).toMatchObject({ side: 'dire', lane: 'mid', tier: 'T2' })
    expect(events[0].team).toBe(1)
  })
})

describe('normalizeTeam', () => {
  it('maps Valve chat encoding (2/3) onto the archive convention (0/1)', () => {
    expect(normalizeTeam(2)).toBe(0)
    expect(normalizeTeam(3)).toBe(1)
  })

  it('passes 0/1 through unchanged', () => {
    expect(normalizeTeam(0)).toBe(0)
    expect(normalizeTeam(1)).toBe(1)
  })

  it('is null for anything else', () => {
    expect(normalizeTeam(undefined)).toBeNull()
    expect(normalizeTeam(9)).toBeNull()
  })
})

describe('parseBuildingKey', () => {
  it('reads side, lane and tier off a tower key', () => {
    expect(parseBuildingKey('npc_dota_badguys_tower3_bot')).toEqual({
      side: 'dire',
      lane: 'bot',
      tier: 'T3',
      kind: 'tower',
    })
  })

  it('maps goodguys to Radiant', () => {
    expect(parseBuildingKey('npc_dota_goodguys_tower1_top')?.side).toBe('radiant')
  })

  it('treats tier-4 towers as guarding the ancient rather than a lane', () => {
    expect(parseBuildingKey('npc_dota_goodguys_tower4')).toMatchObject({ lane: 'ancient', tier: 'T4' })
  })

  it('distinguishes melee from ranged barracks', () => {
    expect(parseBuildingKey('npc_dota_badguys_range_rax_mid')).toEqual({
      side: 'dire',
      lane: 'mid',
      tier: 'ranged',
      kind: 'barracks',
    })
  })

  it('recognises the ancient itself', () => {
    expect(parseBuildingKey('npc_dota_goodguys_fort')?.kind).toBe('fort')
  })

  it('returns null for a key that names no side', () => {
    expect(parseBuildingKey('npc_dota_neutral_something')).toBeNull()
    expect(parseBuildingKey(undefined)).toBeNull()
  })
})

describe('expandKills', () => {
  const match = {
    players: [
      {
        player_slot: 0,
        hero_id: 5,
        name: 'carry',
        kills_log: [
          { time: 300, key: 'npc_dota_hero_axe' },
          { time: 800, key: 'npc_dota_hero_lina' },
        ],
      },
      { player_slot: 128, hero_id: 9, personaname: 'mid', kills_log: [{ time: 450, key: 'npc_dota_hero_juggernaut' }] },
    ],
  }

  it('emits one event per logged kill, in time order', () => {
    const kills = expandKills(match)
    expect(kills.map((k) => k.t)).toEqual([300, 450, 800])
  })

  it('names the victim hero from the log key', () => {
    expect(expandKills(match)[0].payload.victimHero).toBe('npc_dota_hero_axe')
  })

  it('normalises the killer slot to the archive 0-9 range', () => {
    expect(expandKills(match).map((k) => k.payload.killerSlot)).toEqual([0, 5, 0])
  })

  it('attributes the event to the killer team', () => {
    expect(expandKills(match).map((k) => k.team)).toEqual([0, 1, 0])
  })

  it('namespaces dedupe keys so they never collide with live-detected kills', () => {
    expect(expandKills(match).every((k) => k.dedupeKey.startsWith('od:kill:'))).toBe(true)
  })

  it('returns [] for an unparsed match with no kill logs', () => {
    expect(expandKills({ players: [{ player_slot: 0, hero_id: 1 }] })).toEqual([])
  })
})

describe('expandPlayerMinutes — denies', () => {
  /**
   * dn_t sits in the same payload beside lh_t and was simply never read, so a
   * reconstructed match showed "118/—" with the denies column permanently blank.
   */
  it('reads dn_t alongside lh_t', () => {
    const rows = expandPlayerMinutes({
      players: [{ player_slot: 0, hero_id: 5, gold_t: [0, 500], xp_t: [0, 400], lh_t: [0, 12], dn_t: [0, 3] }],
    } as never)
    expect(rows.map((r) => [r.minute, r.lastHits, r.denies])).toEqual([
      [0, 0, 0],
      [1, 12, 3],
    ])
  })

  it('leaves denies null when the replay has no dn_t', () => {
    const rows = expandPlayerMinutes({
      players: [{ player_slot: 0, gold_t: [0, 500], xp_t: [0, 400], lh_t: [0, 12] }],
    } as never)
    expect(rows.every((r) => r.denies === null)).toBe(true)
  })

  it('counts dn_t towards the row count, so a longer array is not truncated', () => {
    const rows = expandPlayerMinutes({
      players: [{ player_slot: 128, dn_t: [0, 1, 2] }],
    } as never)
    expect(rows).toHaveLength(3)
    // Dire's 128 maps onto the archive's slot 5.
    expect(rows[0].playerSlot).toBe(5)
  })
})
