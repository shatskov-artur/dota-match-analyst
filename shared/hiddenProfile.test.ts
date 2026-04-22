import { describe, it, expect } from 'vitest'
import { hiddenProfile } from './hiddenProfile.js'

describe('hiddenProfile', () => {
  it('returns true for the Steam hidden profile sentinel (4294967295)', () => {
    expect(hiddenProfile(4294967295)).toBe(true)
  })

  it('returns false for a normal account_id', () => {
    expect(hiddenProfile(123456789)).toBe(false)
  })

  it('returns false for 0', () => {
    expect(hiddenProfile(0)).toBe(false)
  })

  it('returns false for 4294967294 (one less than sentinel)', () => {
    expect(hiddenProfile(4294967294)).toBe(false)
  })
})
