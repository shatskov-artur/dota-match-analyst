import { buildingDecoder, packBuildingState } from '../../../shared/buildingDecoder.js'

// Sigmoid helper — used by all heuristic estimators
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

// Probability clamp: never show 0% or 100% — extremes are misleading at 30s resolution
function clamp(p: number): number {
  return Math.min(0.95, Math.max(0.05, p))
}

// popcount — count 1-bits in a 32-bit integer
function popcount(n: number): number {
  let count = 0
  let v = n >>> 0
  while (v) {
    count += v & 1
    v >>>= 1
  }
  return count
}

export interface ScoreboardInputs {
  goldDiff: number // sum(radiant net_worth) - sum(dire net_worth)
  killDiff: number // radiant_score - dire_score
  towerAdv: number // popcount(radiant tower bits) - popcount(dire tower bits)
  raxAdv: number // popcount(radiant rax bits) - popcount(dire rax bits)
}

/**
 * Extracts heuristic inputs from a Valve live game object.
 * Returns zero-valued inputs when data is absent (graceful degradation).
 *
 * tower_state layout: lower 16 bits = Radiant (bits 0-10), upper 16 bits = Dire (bits 16-26).
 * barracks_state layout: lower 8 bits = Radiant (bits 0-5), upper 8 bits = Dire (bits 8-13).
 * buildingDecoder handles the bitmask splitting — use it, do not replicate.
 */
export function extractScoreboardInputs(
  game: Record<string, unknown> | undefined,
): ScoreboardInputs {
  if (!game) return { goldDiff: 0, killDiff: 0, towerAdv: 0, raxAdv: 0 }

  // Gold diff from scoreboard players
  const sb = game.scoreboard as Record<string, unknown> | undefined
  const sbRadiant = sb?.radiant as Record<string, unknown> | undefined
  const sbDire = sb?.dire as Record<string, unknown> | undefined
  const radiantPlayers =
    (sbRadiant?.players as Array<Record<string, unknown>> | undefined) ?? []
  const direPlayers =
    (sbDire?.players as Array<Record<string, unknown>> | undefined) ?? []
  const radiantGold = radiantPlayers.reduce(
    (sum, p) => sum + (typeof p.net_worth === 'number' ? p.net_worth : 0),
    0,
  )
  const direGold = direPlayers.reduce(
    (sum, p) => sum + (typeof p.net_worth === 'number' ? p.net_worth : 0),
    0,
  )
  const goldDiff = radiantGold - direGold

  // Kill diff — top-level radiant_score/dire_score when present, else scoreboard.{radiant,dire}.score
  const sbRadiantScore = sbRadiant?.score
  const sbDireScore = sbDire?.score
  const radiantScore =
    typeof game.radiant_score === 'number'
      ? game.radiant_score
      : typeof sbRadiantScore === 'number'
        ? sbRadiantScore
        : 0
  const direScore =
    typeof game.dire_score === 'number'
      ? game.dire_score
      : typeof sbDireScore === 'number'
        ? sbDireScore
        : 0
  const killDiff = radiantScore - direScore

  // Building advantage.
  //
  // Accepts BOTH shapes on purpose. An enriched payload (liveAggregator, and every archived
  // snapshot) carries the packed masks at the top level; a RAW Valve game does not — there
  // the masks live per team under scoreboard.{radiant,dire}. /api/live/winprob passed the
  // raw object, so tower_state was always undefined, towerAdv and raxAdv were always 0, and
  // the multi-factor "Est." bar was silently identical to the gold-only one no matter how
  // many barracks had fallen. Falling back to the per-team masks makes the function correct
  // for whichever shape it is handed, rather than correct only for the caller that
  // remembered to pack first.
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
  const packed = packBuildingState(
    num(sbRadiant?.tower_state),
    num(sbDire?.tower_state),
    num(sbRadiant?.barracks_state),
    num(sbDire?.barracks_state),
  )
  const towerState = num(game.tower_state) ?? packed.towerState
  const barracksState = num(game.barracks_state) ?? packed.barracksState

  // Invoke buildingDecoder for type validation (D-09: unavailable flag handling)
  const buildings = buildingDecoder(towerState, barracksState)
  void buildings

  // popcount towers per team: 11 relevant bits per team (bits 0-10 radiant, bits 16-26 dire)
  const radiantTowerBits = towerState !== undefined ? towerState & 0x7ff : 0x7ff
  const direTowerBits = towerState !== undefined ? (towerState >>> 16) & 0x7ff : 0x7ff
  const towerAdv = popcount(radiantTowerBits) - popcount(direTowerBits)

  // popcount rax per team: 6 bits per team (bits 0-5 radiant, bits 8-13 dire)
  const radiantRaxBits = barracksState !== undefined ? barracksState & 0x3f : 0x3f
  const direRaxBits = barracksState !== undefined ? (barracksState >>> 8) & 0x3f : 0x3f
  const raxAdv = popcount(radiantRaxBits) - popcount(direRaxBits)

  return { goldDiff, killDiff, towerAdv, raxAdv }
}

/**
 * Gold-only sigmoid estimator.
 * P = sigmoid(0.0335 + 0.000267 × goldDiff)
 * Derived from logistic regression on professional match outcomes.
 * Clamped to [0.05, 0.95] — never claims certainty.
 */
export function computeGoldWinProb(goldDiff: number): number {
  return clamp(sigmoid(0.0335 + 0.000267 * goldDiff))
}

/**
 * Multi-feature estimator (Est. bar).
 * P = sigmoid(0.0335 + 0.000267·goldDiff + 0.18·killDiff + 0.3·towerAdv + 0.6·raxAdv)
 * Clamped to [0.05, 0.95].
 */
export function computeEstWinProb(inputs: ScoreboardInputs): number {
  const { goldDiff, killDiff, towerAdv, raxAdv } = inputs
  const x =
    0.0335 +
    0.000267 * goldDiff +
    0.18 * killDiff +
    0.3 * towerAdv +
    0.6 * raxAdv
  return clamp(sigmoid(x))
}
