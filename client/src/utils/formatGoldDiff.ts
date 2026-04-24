export type GoldDiffResult = {
  text: string
  color: '#4ade80' | '#ef4444' | '#303030'
}

/**
 * Computes and formats net-worth gold difference for display in ScoreHeader.
 * Radiant leading → '+X,XXX' in #4ade80 (radiant green).
 * Dire leading    → '−X,XXX' in #ef4444 (dire red). CRITICAL: Uses Unicode minus U+2212 (−), NOT hyphen (-).
 * Equal           → '±0' in #303030 (ink-3 neutral).
 * Per D-02 and UI-SPEC copywriting contract.
 */
const fmt = new Intl.NumberFormat('en-US')

export function formatGoldDiff(radiantNW: number, direNW: number): GoldDiffResult {
  const diff = radiantNW - direNW
  if (diff === 0) return { text: '±0', color: '#303030' }
  if (diff > 0) return { text: `+${fmt.format(diff)}`, color: '#4ade80' }
  return { text: `−${fmt.format(Math.abs(diff))}`, color: '#ef4444' }
}
