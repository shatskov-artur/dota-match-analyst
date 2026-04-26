/**
 * Maps Valve game_state integer to display label.
 * Per D-02: 2=Draft, 5=Live, 6=Post-game.
 *
 * Valve sometimes omits game_state. When absent, distinguish phase by scoreboard content:
 * - scoreboard.radiant.players[] present → in-game → 'Live'
 * - scoreboard present but no players (only picks/bans) → draft → 'Draft'
 * The old `scoreboard != null → 'Live'` fallback was too broad: scoreboard exists during
 * draft too (with picks/bans), causing draft matches to be labelled 'Live' incorrectly.
 */
export function getStatusLabel(
  gameState: number | undefined,
  scoreboard?: object | null,
): 'Draft' | 'Live' | 'Post-game' | 'Unknown' {
  if (gameState === 2) return 'Draft'
  if (gameState === 5) return 'Live'
  if (gameState === 6) return 'Post-game'
  if (scoreboard != null) {
    const sb = scoreboard as Record<string, unknown>
    const radiant = sb.radiant as Record<string, unknown> | undefined
    const hasPlayers = Array.isArray(radiant?.players) && (radiant.players as unknown[]).length > 0
    return hasPlayers ? 'Live' : 'Draft'
  }
  return 'Unknown'
}

/**
 * Maps Valve series_type integer to display format string.
 * Per D-03: 0=Bo1, 1=Bo3, 2=Bo5. Any other value → '' (empty, omit series label).
 */
export function getSeriesLabel(seriesType: number | undefined): string {
  if (seriesType === 0) return 'Bo1'
  if (seriesType === 1) return 'Bo3'
  if (seriesType === 2) return 'Bo5'
  return ''
}
