/**
 * Returns the badge color for a hero's patch winrate.
 * Thresholds per 05-UI-SPEC.md §Color and 05-CONTEXT.md §Specific Ideas:
 *   > 0.52  → radiant green  (#4ade80) — high winrate
 *   < 0.48  → dire red       (#ef4444) — low winrate
 *   0.48–0.52 (inclusive) → neutral grey (#888888)
 */
export function winrateColor(winRate: number): string {
  if (winRate > 0.52) return '#4ade80'
  if (winRate < 0.48) return '#ef4444'
  return '#888888'
}
