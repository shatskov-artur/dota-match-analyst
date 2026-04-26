/**
 * Formats a duration in seconds to "M:SS" display string.
 * Minutes are unbounded (no hour rollover — matches can exceed 60 min in DotA 2).
 * Per D-04: call site must guard against absent duration:
 *   {game.duration !== undefined && formatDuration(game.duration)}
 *
 * Examples: 0 → "0:00", 65 → "1:05", 754 → "12:34", 3600 → "60:00"
 */
export function formatDuration(seconds: number): string {
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
