import { describe, it, expect } from 'vitest'
import { formatDuration } from '../utils/formatDuration'

describe('formatDuration', () => {
  it('formats 0 seconds as "0:00"', () => {
    expect(formatDuration(0)).toBe('0:00')
  })
  it('formats 65 seconds as "1:05" (zero-pads seconds)', () => {
    expect(formatDuration(65)).toBe('1:05')
  })
  it('formats 754 seconds as "12:34"', () => {
    expect(formatDuration(754)).toBe('12:34')
  })
  it('formats 3600 seconds as "60:00" (no hour rollover — minutes are unbounded)', () => {
    expect(formatDuration(3600)).toBe('60:00')
  })
  it('formats 59 seconds as "0:59"', () => {
    expect(formatDuration(59)).toBe('0:59')
  })
  it('formats 60 seconds as "1:00"', () => {
    expect(formatDuration(60)).toBe('1:00')
  })
})
