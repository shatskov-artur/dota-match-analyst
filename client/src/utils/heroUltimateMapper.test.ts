import { describe, it, expect } from 'vitest'
import { heroUltimateMapper, heroUltimateIconUrl } from './heroUltimateMapper'

describe('heroUltimateMapper', () => {
  it('returns "antimage_mana_void" for hero id 1', () => {
    expect(heroUltimateMapper(1)).toBe('antimage_mana_void')
  })
  it('returns "axe_culling_blade" for hero id 2', () => {
    expect(heroUltimateMapper(2)).toBe('axe_culling_blade')
  })
  it('returns null for unknown hero id', () => {
    expect(heroUltimateMapper(999999)).toBeNull()
  })
})

describe('heroUltimateIconUrl', () => {
  it('returns full Valve CDN URL for known id', () => {
    expect(heroUltimateIconUrl(1)).toBe(
      'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/antimage_mana_void.png'
    )
  })
  it('returns null for unknown id', () => {
    expect(heroUltimateIconUrl(999999)).toBeNull()
  })
})
