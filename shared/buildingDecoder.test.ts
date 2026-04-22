import { describe, it, expect } from 'vitest'
import { buildingDecoder } from './buildingDecoder.js'

describe('buildingDecoder', () => {
  it('returns unavailable:true and all-alive placeholder when towerState is undefined', () => {
    const state = buildingDecoder(undefined, undefined)
    expect(state.unavailable).toBe(true)
    expect(state.radiant.top.tier1).toBe(true)
    expect(state.radiant.mid.meleeRax).toBe(true)
    expect(state.dire.bot.tier3).toBe(true)
  })

  it('does NOT set unavailable when towerState is 0 (all towers destroyed — bitmask 0 is not absent)', () => {
    const state = buildingDecoder(0, 0)
    expect(state.unavailable).toBe(false)
    expect(state.radiant.top.tier1).toBe(false)
    expect(state.radiant.mid.tier1).toBe(false)
    expect(state.dire.top.tier1).toBe(false)
  })

  it('correctly decodes: Radiant top T1 destroyed (bit 0 = 0), all other Radiant towers standing', () => {
    // Radiant tower_state lower 16 bits: bits 1-10 set, bit 0 clear = 0x7FE
    // Dire tower_state upper 16 bits: bits 0-10 set = 0x7FF
    const radiantTower = 0x7FE  // bit 0 clear = top T1 destroyed
    const direTower = 0x7FF     // all standing
    const towerState = (direTower << 16) | radiantTower
    const state = buildingDecoder(towerState, undefined)
    expect(state.unavailable).toBe(false)
    expect(state.radiant.top.tier1).toBe(false)   // destroyed
    expect(state.radiant.top.tier2).toBe(true)    // standing
    expect(state.radiant.mid.tier1).toBe(true)    // standing (bit 3 set)
    expect(state.dire.top.tier1).toBe(true)       // Dire all standing
  })

  it('defaults barracks to all-alive when barracksState is undefined', () => {
    const state = buildingDecoder(0x7FF7FF, undefined)  // some towers standing
    expect(state.radiant.top.meleeRax).toBe(true)
    expect(state.radiant.top.rangedRax).toBe(true)
  })

  it('decodes barracks state correctly', () => {
    // Radiant lower 8 bits: 0b00000001 = only top melee rax standing
    // Dire upper 8 bits: 0xFF = all standing
    const barracksState = (0xFF << 8) | 0b00000001
    const state = buildingDecoder(0x7FF7FF, barracksState)
    expect(state.radiant.top.meleeRax).toBe(true)    // bit 0 set
    expect(state.radiant.top.rangedRax).toBe(false)  // bit 1 clear
    expect(state.radiant.mid.meleeRax).toBe(false)   // bit 2 clear
    expect(state.dire.top.meleeRax).toBe(true)       // Dire all alive
  })
})
