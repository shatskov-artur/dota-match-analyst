// Pure coordinate transform — Valve world space (centered ±8192) → SVG 320×320 (origin top-left).
// VERIFIED 2026-04-28 against real GetLiveLeagueGames sample:
//   X ∈ [-7285, +6992], Y ∈ [-6776, +6511]; map center is (0, 0) in Valve coords.
// Y-FLIP IS MANDATORY: Valve +Y points North; SVG +Y points down. Without the flip the
// Radiant fountain renders at the top of the minimap.
// See .planning/phases/08-ability-cooldowns-map/08-RESEARCH.md §Pattern 3.

const HALF = 8192
const SVG = 320

/**
 * Converts Valve world-space `position_x` / `position_y` (range ±8192, +Y = North)
 * to SVG pixel space (320×320, origin top-left, +Y = down).
 * Out-of-range inputs are clamped to ±HALF to defend against fountain corner offsets.
 *
 * @param valveX position_x from scoreboard.{radiant,dire}.players[]
 * @param valveY position_y from scoreboard.{radiant,dire}.players[]
 * @returns `{ svgX, svgY }` — both in [0, 320]
 */
export function normalizeMapCoords(valveX: number, valveY: number): { svgX: number; svgY: number } {
  const x = Math.max(-HALF, Math.min(HALF, valveX))
  const y = Math.max(-HALF, Math.min(HALF, valveY))
  const svgX = ((x + HALF) / (2 * HALF)) * SVG
  const svgY = (1 - (y + HALF) / (2 * HALF)) * SVG // Y-flip mandatory
  return { svgX, svgY }
}
