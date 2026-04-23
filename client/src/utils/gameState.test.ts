import { describe, it, expect } from 'vitest'
import { getStatusLabel, getSeriesLabel } from '../utils/gameState'

describe('getStatusLabel', () => {
  it('returns "Draft" for game_state 2', () => {
    expect(getStatusLabel(2)).toBe('Draft')
  })
  it('returns "Live" for game_state 5', () => {
    expect(getStatusLabel(5)).toBe('Live')
  })
  it('returns "Post-game" for game_state 6', () => {
    expect(getStatusLabel(6)).toBe('Post-game')
  })
  it('returns "Unknown" for unrecognised game_state (e.g. 99)', () => {
    expect(getStatusLabel(99)).toBe('Unknown')
  })
  it('returns "Unknown" for undefined game_state', () => {
    expect(getStatusLabel(undefined)).toBe('Unknown')
  })
})

describe('getSeriesLabel', () => {
  it('returns "Bo1" for series_type 0', () => {
    expect(getSeriesLabel(0)).toBe('Bo1')
  })
  it('returns "Bo3" for series_type 1', () => {
    expect(getSeriesLabel(1)).toBe('Bo3')
  })
  it('returns "Bo5" for series_type 2', () => {
    expect(getSeriesLabel(2)).toBe('Bo5')
  })
  it('returns "" for unknown series_type', () => {
    expect(getSeriesLabel(99)).toBe('')
  })
  it('returns "" for undefined series_type', () => {
    expect(getSeriesLabel(undefined)).toBe('')
  })
})
