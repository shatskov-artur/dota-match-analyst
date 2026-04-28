import { describe, it, expect } from 'vitest'
import { itemMapper } from './itemMapper'

describe('itemMapper', () => {
  it('returns "blink" for item id 1 (Blink Dagger)', () => {
    expect(itemMapper(1)).toBe('blink')
  })

  it('returns null for id 0 (empty slot sentinel)', () => {
    expect(itemMapper(0)).toBeNull()
  })

  it('returns null for unknown item id', () => {
    expect(itemMapper(999999)).toBeNull()
  })

  it('returns "radiance" for item id 137', () => {
    expect(itemMapper(137)).toBe('radiance')
  })
})
