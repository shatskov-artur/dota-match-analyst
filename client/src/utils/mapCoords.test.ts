import { describe, it, expect } from 'vitest'
import { normalizeMapCoords } from './mapCoords'

describe('normalizeMapCoords', () => {
  it('maps (0, 0) to map center (160, 160)', () => {
    const r = normalizeMapCoords(0, 0)
    expect(r.svgX).toBeCloseTo(160, 5)
    expect(r.svgY).toBeCloseTo(160, 5)
  })
  it('maps (-8192, -8192) (Radiant fountain bound) to lower-left (0, 320)', () => {
    const r = normalizeMapCoords(-8192, -8192)
    expect(r.svgX).toBeCloseTo(0, 5)
    expect(r.svgY).toBeCloseTo(320, 5)
  })
  it('maps (8192, 8192) (Dire fountain bound) to upper-right (320, 0)', () => {
    const r = normalizeMapCoords(8192, 8192)
    expect(r.svgX).toBeCloseTo(320, 5)
    expect(r.svgY).toBeCloseTo(0, 5)
  })
  it('clamps out-of-range coordinates to ±8192', () => {
    const r = normalizeMapCoords(20000, -20000)
    expect(r.svgX).toBeCloseTo(320, 5)
    expect(r.svgY).toBeCloseTo(320, 5)
  })
  it('flips Y axis: positive valveY produces smaller svgY than negative valveY', () => {
    const top = normalizeMapCoords(0, 4096)
    const bottom = normalizeMapCoords(0, -4096)
    expect(top.svgY).toBeLessThan(bottom.svgY)
  })
})
