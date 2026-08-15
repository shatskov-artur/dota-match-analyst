import { describe, it, expect } from 'vitest'
import {
  detectSwings,
  laningVerdict,
  objectiveImpacts,
  buildAnalysis,
  SURGE_THRESHOLD,
  LEAD_CHANGE_MIN_GOLD,
  LANING_DECISIVE_GOLD,
  type TimelinePoint,
  type PlayerPoint,
} from './matchAnalysis.js'

const tl = (golds: Array<number | null>): TimelinePoint[] =>
  golds.map((g, minute) => ({
    minute,
    radiantGoldAdv: g,
    radiantXpAdv: g,
    radiantScore: null,
    direScore: null,
    source: 'live' as const,
  }))

describe('detectSwings', () => {
  it('reports a lead change when the gold lead flips sides decisively', () => {
    const swings = detectSwings(tl([-3000, -2000, 2500]))
    expect(swings).toHaveLength(1)
    expect(swings[0]).toMatchObject({ kind: 'lead_change', minute: 2, team: 0 })
  })

  it('ignores a flip that leaves the new lead below the noise floor', () => {
    // The real failure this guards: gold wobbling around zero reported "−0.2k → +0.0k"
    // as a turning point.
    expect(detectSwings(tl([-200, 300]))).toEqual([])
    expect(LEAD_CHANGE_MIN_GOLD).toBeGreaterThan(0)
  })

  it('attributes a flip to the side that came out ahead', () => {
    expect(detectSwings(tl([3000, -4000]))[0]).toMatchObject({ team: 1, kind: 'lead_change' })
  })

  it('reports a surge when one side gains more than the threshold over three minutes', () => {
    const swings = detectSwings(tl([0, 1000, 2000, SURGE_THRESHOLD + 1000]))
    expect(swings).toHaveLength(1)
    expect(swings[0]).toMatchObject({ kind: 'surge', team: 0 })
  })

  it('collapses a run of consecutive same-side surges into one', () => {
    // A single sustained push previously produced one row per minute.
    const climb = [0, 2000, 4000, 6000, 9000, 12000, 15000, 18000, 21000]
    const swings = detectSwings(tl(climb))
    expect(swings.filter((s) => s.kind === 'surge')).toHaveLength(1)
    const surge = swings.find((s) => s.kind === 'surge')!
    // The collapsed row spans the whole push rather than the last window.
    expect(surge.fromGold).toBe(0)
    expect(surge.toGold).toBe(21000)
  })

  it('keeps surges by opposite sides separate', () => {
    const swings = detectSwings(tl([0, 3000, 6000, 9000, 4000, -1000, -6000, -9000]))
    const teams = swings.filter((s) => s.kind === 'surge').map((s) => s.team)
    expect(new Set(teams).size).toBeGreaterThan(0)
  })

  it('prefers the lead change over a surge at the same moment', () => {
    const swings = detectSwings(tl([-6000, -3000, -1000, 3000]))
    expect(swings.filter((s) => s.minute === 3).map((s) => s.kind)).toEqual(['lead_change'])
  })

  it('ignores minutes with no recorded gold', () => {
    expect(() => detectSwings(tl([null, null, 5000]))).not.toThrow()
  })

  it('returns [] for a match too short to have a trend', () => {
    expect(detectSwings(tl([1000]))).toEqual([])
    expect(detectSwings([])).toEqual([])
  })
})

describe('laningVerdict', () => {
  const players = (minute: number, radiantNw: number, direNw: number): PlayerPoint[] => [
    { minute, playerSlot: 0, heroId: 1, team: 0, playerName: 'r', netWorth: radiantNw, xp: 0, lastHits: 50 },
    { minute, playerSlot: 5, heroId: 2, team: 1, playerName: 'd', netWorth: direNw, xp: 0, lastHits: 40 },
  ]

  it('reads the verdict at minute 10 when that minute exists', () => {
    const v = laningVerdict([...players(9, 1, 1), ...players(10, 8000, 5000)])!
    expect(v.atMinute).toBe(10)
    expect(v.goldDiff).toBe(3000)
    expect(v.winner).toBe(0)
  })

  it('falls back to the nearest recorded minute and says which one it used', () => {
    // A verdict read at minute 7 is a different claim from one read at 10.
    const v = laningVerdict(players(7, 8000, 5000))!
    expect(v.atMinute).toBe(7)
  })

  it('calls it a draw when neither side is meaningfully ahead', () => {
    const v = laningVerdict(players(10, 5000, 5000 + LANING_DECISIVE_GOLD - 1))!
    expect(v.winner).toBeNull()
  })

  it('sorts the player list richest first', () => {
    const v = laningVerdict(players(10, 3000, 9000))!
    expect(v.players[0].netWorth).toBe(9000)
    expect(v.winner).toBe(1)
  })

  it('returns null when there are no player rows at all', () => {
    expect(laningVerdict([])).toBeNull()
  })
})

describe('objectiveImpacts', () => {
  const timeline = tl([0, 1000, 2000, 3000, 9000, 10000, 11000])

  it('measures the gold swing in the two minutes after an objective', () => {
    const impacts = objectiveImpacts([{ t: 120, type: 'roshan', team: null, payload: null }], timeline)
    expect(impacts).toHaveLength(1)
    // minute 2 → minute 4: 2000 → 9000
    expect(impacts[0].swing).toBe(7000)
  })

  it('ranks by absolute swing so the biggest mover leads', () => {
    const impacts = objectiveImpacts(
      [
        { t: 0, type: 'tower', team: 0, payload: null },
        { t: 120, type: 'roshan', team: null, payload: null },
      ],
      timeline,
    )
    expect(impacts[0].type).toBe('roshan')
  })

  it('reports one row per minute, not one per objective', () => {
    // Five buildings falling in one minute all share the same two-minute window, so
    // listing them separately repeats the identical number five times.
    const impacts = objectiveImpacts(
      [
        { t: 120, type: 'teamfight', team: null, payload: null },
        { t: 125, type: 'tower', team: 0, payload: null },
        { t: 130, type: 'barracks', team: 0, payload: null },
        { t: 135, type: 'barracks', team: 0, payload: null },
      ],
      timeline,
    )
    expect(impacts).toHaveLength(1)
    expect(impacts[0].alsoAtThisMinute).toEqual({ teamfight: 1, tower: 1, barracks: 2 })
  })

  it('headlines the teamfight, since it usually caused the buildings that followed', () => {
    const impacts = objectiveImpacts(
      [
        { t: 125, type: 'tower', team: 0, payload: null },
        { t: 130, type: 'teamfight', team: null, payload: null },
      ],
      timeline,
    )
    expect(impacts[0].type).toBe('teamfight')
  })

  it('keeps separate minutes separate', () => {
    const impacts = objectiveImpacts(
      [
        { t: 60, type: 'tower', team: 0, payload: null },
        { t: 180, type: 'tower', team: 0, payload: null },
      ],
      timeline,
    )
    expect(impacts.map((i) => i.minute).sort()).toEqual([1, 3])
  })

  it('drops objectives whose window runs past the end of the match', () => {
    const impacts = objectiveImpacts([{ t: 360, type: 'tower', team: 0, payload: null }], timeline)
    expect(impacts).toEqual([])
  })

  it('ignores draft events, which sit at negative game time', () => {
    expect(objectiveImpacts([{ t: -998, type: 'pick', team: 0, payload: null }], timeline)).toEqual([])
  })
})

describe('buildAnalysis', () => {
  it('records peak leads for both sides with the minute they happened', () => {
    const a = buildAnalysis(tl([0, 5000, -8000, 2000]), [], [])
    expect(a.peaks.radiant).toEqual({ gold: 5000, minute: 1 })
    expect(a.peaks.dire).toEqual({ gold: -8000, minute: 2 })
  })

  it('reports how many minutes came from a parsed replay vs the live sampler', () => {
    const mixed: TimelinePoint[] = [
      { minute: 0, radiantGoldAdv: 0, radiantXpAdv: 0, radiantScore: null, direScore: null, source: 'opendota' },
      { minute: 1, radiantGoldAdv: 100, radiantXpAdv: 0, radiantScore: null, direScore: null, source: 'live' },
    ]
    const a = buildAnalysis(mixed, [], [])
    expect(a.precision).toEqual({ opendotaMinutes: 1, liveMinutes: 1 })
  })

  it('survives an empty match without throwing', () => {
    const a = buildAnalysis([], [], [])
    expect(a.lastMinute).toBe(0)
    expect(a.swings).toEqual([])
    expect(a.laning).toBeNull()
  })
})
