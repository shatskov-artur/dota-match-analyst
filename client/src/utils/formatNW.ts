/**
 * Formats a net worth value for display in ItemsBlock rows.
 * >= 1000 -> "X.Xk" (e.g. 12400 -> "12.4k")
 * < 1000  -> raw string (e.g. 850 -> "850")
 * undefined -> "—" (em dash U+2014)
 */
export function formatNW(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value >= 1000) return (value / 1000).toFixed(1) + 'k'
  return value.toString()
}
