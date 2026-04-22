import { describe, it, expect } from 'vitest'
import { heroMapper } from './heroMapper.js'

describe('heroMapper', () => {
  it('returns name and portrait for a known hero_id', () => {
    const result = heroMapper(1)  // Anti-Mage — always in heroes.json
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Anti-Mage')
    expect(result?.portrait).toMatch(/^https:\/\/cdn\.cloudflare\.steamstatic\.com/)
    expect(result?.portrait).not.toContain('?')  // trailing ? must be stripped
  })

  it('returns null for an unknown hero_id without throwing', () => {
    expect(heroMapper(99999)).toBeNull()
  })

  it('returns null for hero_id 0 (no hero selected)', () => {
    expect(heroMapper(0)).toBeNull()
  })

  it('never throws for any numeric input', () => {
    expect(() => heroMapper(-1)).not.toThrow()
    expect(() => heroMapper(NaN)).not.toThrow()
  })
})
