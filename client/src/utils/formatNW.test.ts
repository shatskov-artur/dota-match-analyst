import { describe, it, expect } from 'vitest'
import { formatNW } from './formatNW'

describe('formatNW', () => {
  it('formats 12400 as "12.4k"', () => {
    expect(formatNW(12400)).toBe('12.4k')
  })

  it('formats 850 as "850" (below 1000 threshold)', () => {
    expect(formatNW(850)).toBe('850')
  })

  it('formats 1000 as "1.0k" (exactly at threshold)', () => {
    expect(formatNW(1000)).toBe('1.0k')
  })

  it('returns em dash for undefined', () => {
    expect(formatNW(undefined)).toBe('—')
  })

  it('formats 0 as "0"', () => {
    expect(formatNW(0)).toBe('0')
  })
})
