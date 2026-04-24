import { describe, it, expect } from 'vitest'
import { formatGoldDiff } from './formatGoldDiff'

describe('formatGoldDiff', () => {
  it('returns +X,XXX in radiant green when Radiant leads', () => {
    const result = formatGoldDiff(10000, 5000)
    expect(result.text).toBe('+5,000')
    expect(result.color).toBe('#4ade80')
  })

  it('returns −X,XXX in dire red when Dire leads (uses Unicode minus U+2212)', () => {
    const result = formatGoldDiff(5000, 10000)
    expect(result.text).toBe('−5,000')   // '−5,000' with Unicode minus
    expect(result.color).toBe('#ef4444')
  })

  it('returns ±0 in ink-3 when net worths are equal', () => {
    const result = formatGoldDiff(8000, 8000)
    expect(result.text).toBe('±0')
    expect(result.color).toBe('#303030')
  })

  it('returns ±0 when both sides are zero', () => {
    const result = formatGoldDiff(0, 0)
    expect(result.text).toBe('±0')
    expect(result.color).toBe('#303030')
  })

  it('formats numbers with commas for 4+ digit diffs', () => {
    const result = formatGoldDiff(1200, 0)
    expect(result.text).toBe('+1,200')
    expect(result.color).toBe('#4ade80')
  })

  it('uses Unicode minus (not hyphen) for Dire lead with comma formatting', () => {
    const result = formatGoldDiff(0, 1200)
    expect(result.text).toBe('−1,200')   // '−1,200'
    expect(result.color).toBe('#ef4444')
    // Confirm it is NOT a hyphen
    expect(result.text.charCodeAt(0)).toBe(0x2212)  // U+2212
  })
})
