import { describe, it, expect, vi } from 'vitest'

// The module reaches for the archive at import time; the pure extractors under test do not.
vi.mock('../../db/index.js', () => ({ db: null }))
vi.mock('../../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
  extractTimelineFacts,
  extractPlayerFacts,
  detectEvents,
  TEAMFIGHT_MIN_DEATHS,
  type TimelineFacts,
  type PrevState,
  type PlayerFacts,
} from './snapshotWriter.js'
import type { EnrichedLiveGame } from '../liveAggregator.js'

// All 11 tower bits set = every tower standing. 0 = every tower destroyed, NOT "no data"
// (shared/buildingDecoder is explicit about that), so the fixtures never conflate them.
const ALL_TOWERS = 0x7ff
const ALL_RAX = 0x3f

function game(over: Partial<EnrichedLiveGame> = {}, sbOver: Record<string, unknown> = {}): EnrichedLiveGame {
  return {
    match_id: 123,
    league_id: 19719,
    game_state: 5,
    duration: 600,
    league_name: 'The International 2026',
    history: [],
    roshan: null,
    team_logos: { radiant: null, dire: null },
    scoreboard: {
      duration: 600,
      radiant: {
        score: 10,
        tower_state: ALL_TOWERS,
        barracks_state: ALL_RAX,
        players: [
          { net_worth: 6000, xp_per_min: 600 },
          { net_worth: 4000, xp_per_min: 400 },
        ],
      },
      dire: {
        score: 6,
        tower_state: ALL_TOWERS,
        barracks_state: ALL_RAX,
        players: [
          { net_worth: 3000, xp_per_min: 300 },
          { net_worth: 2000, xp_per_min: 200 },
        ],
      },
      ...sbOver,
    },
    ...over,
  } as EnrichedLiveGame
}

describe('extractTimelineFacts', () => {
  it('computes Radiant-positive gold and XP advantage', () => {
    const f = extractTimelineFacts(game())!
    expect(f.radiantGoldAdv).toBe(10_000 - 5_000)
    // Σ(xpm × duration / 60): Radiant (600+400)×10 = 10_000, Dire (300+200)×10 = 5_000
    expect(f.radiantXpAdv).toBe(5_000)
    expect(f.radiantNetWorth).toBe(10_000)
    expect(f.direNetWorth).toBe(5_000)
  })

  it('buckets game seconds into the containing minute', () => {
    expect(extractTimelineFacts(game({ duration: 0 }, { duration: 0 }))!.minute).toBe(0)
    expect(extractTimelineFacts(game({ duration: 59 }, { duration: 59 }))!.minute).toBe(0)
    expect(extractTimelineFacts(game({ duration: 60 }, { duration: 60 }))!.minute).toBe(1)
    expect(extractTimelineFacts(game({ duration: 1234 }, { duration: 1234 }))!.minute).toBe(20)
  })

  it('falls back to scoreboard.duration when the top level omits it', () => {
    const g = game({ duration: undefined }, { duration: 900 })
    expect(extractTimelineFacts(g)!.t).toBe(900)
  })

  it('accepts the legacy `xpm` field name as well as `xp_per_min`', () => {
    const g = game({}, {
      radiant: { score: 0, players: [{ net_worth: 1000, xpm: 600 }] },
      dire: { score: 0, players: [{ net_worth: 1000, xp_per_min: 300 }] },
    })
    expect(extractTimelineFacts(g)!.radiantXpAdv).toBe(3_000)
  })

  it('returns null when there is no clock at all', () => {
    expect(extractTimelineFacts(game({ duration: undefined }, { duration: undefined }))).toBeNull()
  })

  it('reports null rather than 0 when a side has no players (draft)', () => {
    const g = game({}, { radiant: { players: [] }, dire: { players: [] } })
    const f = extractTimelineFacts(g)!
    expect(f.radiantGoldAdv).toBeNull()
    expect(f.radiantNetWorth).toBeNull()
  })

  it('treats non-finite stats as 0 rather than propagating NaN', () => {
    const g = game({}, {
      radiant: { players: [{ net_worth: Number.NaN, xp_per_min: 600 }] },
      dire: { players: [{ net_worth: 1000, xp_per_min: 0 }] },
    })
    expect(extractTimelineFacts(g)!.radiantGoldAdv).toBe(-1000)
  })

  it('reads building_state when tower_state is absent', () => {
    const g = game({}, {
      radiant: { building_state: 1830, players: [{ net_worth: 1 }] },
      dire: { tower_state: 1824, players: [{ net_worth: 1 }] },
    })
    const f = extractTimelineFacts(g)!
    expect(f.radiantTowers).toBe(1830)
    expect(f.direTowers).toBe(1824)
  })
})

describe('extractPlayerFacts', () => {
  const withPlayers = game({
    players: [
      { account_id: 1, hero_id: 10, team: 0, name: 'r1', net_worth: 5000, kills: 3, death: 1, assists: 2, lh: 100, dn: 5, xpm: 600, gpm: 500, level: 12, item0: 1, item1: 2 },
      { account_id: 2, hero_id: 11, team: 1, name: 'd1', net_worth: 4000, kills: 1, death: 3, assists: 0 },
      { account_id: 3, hero_id: 12, team: 0, name: 'r2', net_worth: 3000 },
      { account_id: 99, hero_id: 0, team: 4, name: 'unassigned' },
      { account_id: 98, hero_id: 0, team: 2, name: 'caster' },
    ],
  } as Partial<EnrichedLiveGame>)

  it('assigns Radiant slots 0-4 and Dire slots 5-9 positionally', () => {
    const rows = extractPlayerFacts(withPlayers, 600)
    expect(rows.map((r) => [r.playerName, r.playerSlot])).toEqual([
      ['r1', 0],
      ['d1', 5],
      ['r2', 1],
    ])
  })

  it('drops broadcasters (team 2) and unassigned (team 4)', () => {
    expect(extractPlayerFacts(withPlayers, 600).map((r) => r.playerName)).not.toContain('caster')
    expect(extractPlayerFacts(withPlayers, 600).map((r) => r.playerName)).not.toContain('unassigned')
  })

  it("maps Valve's singular `death` onto deaths", () => {
    expect(extractPlayerFacts(withPlayers, 600)[0].deaths).toBe(1)
  })

  it('derives cumulative xp from xpm and the clock', () => {
    expect(extractPlayerFacts(withPlayers, 600)[0].xp).toBe(6000)
    // No xpm at all → null, not 0: absent is not the same as zero XP.
    expect(extractPlayerFacts(withPlayers, 600)[2].xp).toBeNull()
  })

  it('always emits 10 item slots, padding absent ones with 0', () => {
    const items = extractPlayerFacts(withPlayers, 600)[0].items
    expect(items).toHaveLength(10)
    expect(items.slice(0, 2)).toEqual([1, 2])
    expect(items.slice(2)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('detectEvents', () => {
  const base: TimelineFacts = {
    t: 900,
    minute: 15,
    radiantGoldAdv: 0,
    radiantXpAdv: 0,
    radiantNetWorth: 0,
    direNetWorth: 0,
    radiantScore: 0,
    direScore: 0,
    radiantTowers: ALL_TOWERS,
    direTowers: ALL_TOWERS,
    radiantBarracks: ALL_RAX,
    direBarracks: ALL_RAX,
    roshanKills: 0,
  }
  const prev: PrevState = {
    radiantTowers: ALL_TOWERS,
    direTowers: ALL_TOWERS,
    radiantBarracks: ALL_RAX,
    direBarracks: ALL_RAX,
    roshanKills: 0,
  }

  it('emits nothing on the very first observation', () => {
    // Otherwise a restart mid-game would report every already-dead tower as fresh.
    expect(detectEvents(undefined, { ...base, radiantTowers: 0 })).toEqual([])
  })

  it('emits nothing when nothing changed', () => {
    expect(detectEvents(prev, base)).toEqual([])
  })

  it('reports a single destroyed tower with its lane and tier', () => {
    // Clear bit 3 = Radiant mid tier 1.
    const events = detectEvents(prev, { ...base, radiantTowers: ALL_TOWERS & ~(1 << 3) })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'tower', team: 0, dedupeKey: 'tower:radiant:mid:tier1', t: 900 })
  })

  it('attributes Dire buildings to team 1', () => {
    const events = detectEvents(prev, { ...base, direTowers: ALL_TOWERS & ~(1 << 6) })
    expect(events[0]).toMatchObject({ type: 'tower', team: 1, dedupeKey: 'tower:dire:bot:tier1' })
  })

  it('reports barracks separately from towers', () => {
    const events = detectEvents(prev, { ...base, direBarracks: ALL_RAX & ~(1 << 2) })
    expect(events).toEqual([expect.objectContaining({ type: 'barracks', dedupeKey: 'barracks:dire:mid:meleeRax' })])
  })

  it('reports ancients', () => {
    const events = detectEvents(prev, { ...base, radiantTowers: ALL_TOWERS & ~(1 << 9) })
    expect(events[0].dedupeKey).toBe('tower:radiant:ancient:top')
  })

  it('emits one roshan event per kill when the counter jumps', () => {
    const events = detectEvents({ ...prev, roshanKills: 1 }, { ...base, roshanKills: 3 })
    expect(events.map((e) => e.dedupeKey)).toEqual(['roshan:2', 'roshan:3'])
  })

  it('ignores a missing previous mask instead of inventing kills', () => {
    expect(detectEvents({ ...prev, radiantTowers: null }, { ...base, radiantTowers: 0 })).toEqual([])
  })

  it('produces stable dedupe keys so a repeated tick cannot double-insert', () => {
    const cur = { ...base, radiantTowers: ALL_TOWERS & ~(1 << 3) }
    expect(detectEvents(prev, cur)[0].dedupeKey).toBe(detectEvents(prev, { ...cur, t: 930 })[0].dedupeKey)
  })
})

describe('detectEvents — kills and teamfights', () => {
  const facts: TimelineFacts = {
    t: 900,
    minute: 15,
    radiantGoldAdv: 0,
    radiantXpAdv: 0,
    radiantNetWorth: 0,
    direNetWorth: 0,
    radiantScore: 0,
    direScore: 0,
    radiantTowers: ALL_TOWERS,
    direTowers: ALL_TOWERS,
    radiantBarracks: ALL_RAX,
    direBarracks: ALL_RAX,
    roshanKills: 0,
  }

  const player = (slot: number, kills: number, deaths: number): PlayerFacts =>
    ({
      playerSlot: slot,
      accountId: 100 + slot,
      heroId: 10 + slot,
      team: slot < 5 ? 0 : 1,
      playerName: `p${slot}`,
      netWorth: 1000,
      xp: 0,
      level: 10,
      kills,
      deaths,
      assists: 0,
      lastHits: 0,
      denies: 0,
      gpm: 0,
      xpm: 0,
      items: [],
      positionX: null,
      positionY: null,
      ultimateState: null,
      ultimateCooldown: null,
      respawnTimer: null,
    }) as PlayerFacts

  const prevWith = (rows: PlayerFacts[], t = 870): PrevState => ({
    t,
    radiantTowers: ALL_TOWERS,
    direTowers: ALL_TOWERS,
    radiantBarracks: ALL_RAX,
    direBarracks: ALL_RAX,
    roshanKills: 0,
    players: new Map(
      rows.map((p) => [
        p.playerSlot,
        {
          heroId: p.heroId,
          playerName: p.playerName,
          team: p.team,
          kills: p.kills ?? 0,
          deaths: p.deaths ?? 0,
          assists: p.assists ?? 0,
        },
      ]),
    ),
  })

  it('emits one kill event per death that appeared since the last tick', () => {
    const before = [player(0, 0, 0), player(5, 0, 0)]
    const after = [player(0, 1, 0), player(5, 0, 1)]
    const events = detectEvents(prevWith(before), facts, after).filter((e) => e.type === 'kill')
    expect(events).toHaveLength(1)
    expect(events[0].payload.victimSlot).toBe(5)
  })

  it('records who scored in the window without claiming who killed whom', () => {
    // Valve's live feed has counters, not a kill log — attribution is not available.
    const before = [player(0, 0, 0), player(1, 0, 0), player(5, 0, 0)]
    const after = [player(0, 1, 0), player(1, 1, 0), player(5, 0, 1)]
    const [kill] = detectEvents(prevWith(before), facts, after).filter((e) => e.type === 'kill')
    expect((kill.payload.killers as unknown[]).length).toBe(2)
  })

  it('numbers a death by the victim own running total so a repeat tick cannot duplicate it', () => {
    const before = [player(5, 0, 2)]
    const after = [player(5, 0, 3)]
    const [kill] = detectEvents(prevWith(before), facts, after).filter((e) => e.type === 'kill')
    expect(kill.dedupeKey).toBe('kill:5:3')
  })

  it('emits several kill events when a player dies more than once between ticks', () => {
    const events = detectEvents(prevWith([player(5, 0, 0)]), facts, [player(5, 0, 2)]).filter((e) => e.type === 'kill')
    expect(events.map((e) => e.dedupeKey)).toEqual(['kill:5:1', 'kill:5:2'])
  })

  it('ignores a counter that went backwards (Valve reset the scoreboard)', () => {
    const events = detectEvents(prevWith([player(5, 3, 4)]), facts, [player(5, 0, 0)])
    expect(events.filter((e) => e.type === 'kill')).toEqual([])
  })

  it('calls it a teamfight once enough heroes die in one window', () => {
    const before = [player(0, 0, 0), player(1, 0, 0), player(5, 0, 0), player(6, 0, 0)]
    const after = [player(0, 0, 1), player(1, 0, 1), player(5, 0, 1), player(6, 0, 0)]
    const [fight] = detectEvents(prevWith(before), facts, after).filter((e) => e.type === 'teamfight')
    expect(fight).toBeDefined()
    expect(fight.payload.deaths).toBe(TEAMFIGHT_MIN_DEATHS)
    expect(fight.payload.radiantDeaths).toBe(2)
    expect(fight.payload.direDeaths).toBe(1)
    // Fewer deaths = came out ahead.
    expect(fight.payload.winner).toBe(1)
  })

  it('does not call a pickoff a teamfight', () => {
    const before = [player(0, 0, 0), player(5, 0, 0)]
    const after = [player(0, 1, 0), player(5, 0, 1)]
    expect(detectEvents(prevWith(before), facts, after).filter((e) => e.type === 'teamfight')).toEqual([])
  })

  it('reports no winner when both sides lost the same number of heroes', () => {
    const before = [player(0, 0, 0), player(1, 0, 0), player(5, 0, 0), player(6, 0, 0)]
    const after = [player(0, 0, 1), player(1, 0, 1), player(5, 0, 1), player(6, 0, 1)]
    const [fight] = detectEvents(prevWith(before), facts, after).filter((e) => e.type === 'teamfight')
    expect(fight.payload.winner).toBeNull()
  })

  it('carries the window bounds so the feed can show a span, not a single instant', () => {
    const before = [player(0, 0, 0), player(1, 0, 0), player(5, 0, 0)]
    const after = [player(0, 0, 1), player(1, 0, 1), player(5, 0, 1)]
    const [fight] = detectEvents(prevWith(before, 870), facts, after).filter((e) => e.type === 'teamfight')
    expect(fight.payload.from).toBe(870)
    expect(fight.payload.to).toBe(900)
  })

  it('emits nothing on the first observation, having no counters to diff against', () => {
    expect(detectEvents(undefined, facts, [player(5, 0, 3)])).toEqual([])
  })
})
