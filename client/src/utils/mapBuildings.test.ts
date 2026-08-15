import { describe, it, expect } from 'vitest'
import { RADIANT_LAYOUT, DIRE_LAYOUT, type Point, type SideLayout } from './mapBuildings'

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const CENTRE: Point = { x: 160, y: 160 }
const LANES = ['top', 'mid', 'bot'] as const
const SIDES: Array<[string, SideLayout]> = [
  ['radiant', RADIANT_LAYOUT],
  ['dire', DIRE_LAYOUT],
]

describe.each(SIDES)('%s building layout', (_side, L) => {
  /**
   * The bug: every barracks was typed in at one of two x values, so all six stacked in a
   * column beside the fountain — top-lane barracks rendered below mid-lane ones, nowhere
   * near their own lane. Deriving them from the tier-3 tower makes that impossible.
   */
  it.each(LANES)('puts %s barracks between that lane’s tier 3 and the ancient', (laneName) => {
    const lane = L[laneName]
    for (const rax of [lane.meleeRax, lane.rangedRax]) {
      expect(dist(rax, lane.tier3)).toBeLessThan(dist(lane.tier3, L.ancient))
      expect(dist(rax, L.ancient)).toBeLessThan(dist(lane.tier3, L.ancient))
    }
  })

  it.each(LANES)('keeps the %s melee and ranged barracks apart', (laneName) => {
    const lane = L[laneName]
    const gap = dist(lane.meleeRax, lane.rangedRax)
    expect(gap).toBeGreaterThan(6)
    expect(gap).toBeLessThan(14)
  })

  it('gives each lane its own barracks position', () => {
    const all = LANES.flatMap((l) => [L[l].meleeRax, L[l].rangedRax])
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(dist(all[i], all[j])).toBeGreaterThan(5)
      }
    }
  })

  it('places the tier-4 towers between the ancient and the map centre', () => {
    // They guard the approach; putting them behind the ancient reads as the wrong base.
    for (const t4 of [L.ancientTop, L.ancientBottom]) {
      expect(dist(t4, CENTRE)).toBeLessThan(dist(L.ancient, CENTRE))
      expect(dist(t4, L.ancient)).toBeLessThan(25)
    }
    expect(dist(L.ancientTop, L.ancientBottom)).toBeGreaterThan(10)
  })

  it('keeps every building on the map', () => {
    const points = [
      L.ancient,
      L.ancientTop,
      L.ancientBottom,
      ...LANES.flatMap((l) => [L[l].tier1, L[l].tier2, L[l].tier3, L[l].meleeRax, L[l].rangedRax]),
    ]
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(320)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(320)
    }
  })
})

describe('side placement', () => {
  it('puts Radiant bottom-left and Dire top-right', () => {
    expect(RADIANT_LAYOUT.ancient.x).toBeLessThan(160)
    expect(RADIANT_LAYOUT.ancient.y).toBeGreaterThan(160)
    expect(DIRE_LAYOUT.ancient.x).toBeGreaterThan(160)
    expect(DIRE_LAYOUT.ancient.y).toBeLessThan(160)
  })

  it('never puts a Radiant building inside the Dire base', () => {
    const dire = DIRE_LAYOUT.ancient
    const radiantPoints = LANES.flatMap((l) => [
      RADIANT_LAYOUT[l].meleeRax,
      RADIANT_LAYOUT[l].rangedRax,
    ])
    for (const p of radiantPoints) expect(dist(p, dire)).toBeGreaterThan(60)
  })
})
