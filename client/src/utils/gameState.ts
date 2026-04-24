/**
 * Maps Valve game_state integer to display label.
 * Per D-02: 2=Draft, 5=Live, 6=Post-game.
 *
 * Valve omits game_state from the response once a match transitions to in-game (state 5).
 * When game_state is absent but a scoreboard object is present, the match is in-game → 'Live'.
 */
export function getStatusLabel(
  gameState: number | undefined,
  scoreboard?: object | null,
): 'Draft' | 'Live' | 'Post-game' | 'Unknown' {
  if (gameState === 2) return 'Draft'
  if (gameState === 5) return 'Live'
  if (gameState === 6) return 'Post-game'
  if (scoreboard != null) return 'Live'
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
