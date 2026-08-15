// Where every building sits on the 320×320 minimap.
//
// Towers were hand-placed and roughly right; the barracks were not. All six per side were
// listed at the same two x values, so they rendered as a vertical stack beside the
// fountain instead of an arc around it — top-lane barracks appeared below mid-lane ones,
// nowhere near the lane they belong to.
//
// So barracks and tier-4 towers are DERIVED rather than typed in. On the real map the
// barracks of a lane stand between that lane's tier-3 tower and the ancient, and the two
// tier-4s flank the ancient on the side facing the enemy. Both are stated here as that
// relationship, which means they cannot drift out of agreement with the towers again.

export interface Point {
  x: number
  y: number
}

export type Lane = 'top' | 'mid' | 'bot'

export interface LaneLayout {
  tier1: Point
  tier2: Point
  tier3: Point
  meleeRax: Point
  rangedRax: Point
}

export interface SideLayout {
  top: LaneLayout
  mid: LaneLayout
  bot: LaneLayout
  ancient: Point
  ancientTop: Point
  ancientBottom: Point
}

/** Map centre, used only to work out which side of a base faces the enemy. */
const CENTRE: Point = { x: 160, y: 160 }

/** How far along the tier-3 → ancient line the barracks stand. */
const RAX_ALONG = 0.36
/** Half the gap between the melee and ranged barracks of one lane. */
const RAX_SPREAD = 4.5
/** Distance from the ancient to the tier-4 towers, and their spread. */
const T4_OUT = 14
const T4_SPREAD = 7

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function unit(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

/** Rotate a unit vector 90°, to offset a pair of buildings across their own axis. */
const perp = (v: Point): Point => ({ x: -v.y, y: v.x })

function lane(tier1: Point, tier2: Point, tier3: Point, ancient: Point): LaneLayout {
  const mid = lerp(tier3, ancient, RAX_ALONG)
  const p = perp(unit(tier3, ancient))
  return {
    tier1,
    tier2,
    tier3,
    meleeRax: { x: mid.x + p.x * RAX_SPREAD, y: mid.y + p.y * RAX_SPREAD },
    rangedRax: { x: mid.x - p.x * RAX_SPREAD, y: mid.y - p.y * RAX_SPREAD },
  }
}

function base(
  ancient: Point,
  lanes: { top: [Point, Point, Point]; mid: [Point, Point, Point]; bot: [Point, Point, Point] },
): SideLayout {
  // The tier-4s guard the approach, so they sit between the ancient and the map centre.
  const facing = unit(ancient, CENTRE)
  const p = perp(facing)
  const anchor = { x: ancient.x + facing.x * T4_OUT, y: ancient.y + facing.y * T4_OUT }
  return {
    top: lane(...lanes.top, ancient),
    mid: lane(...lanes.mid, ancient),
    bot: lane(...lanes.bot, ancient),
    ancient,
    ancientTop: { x: anchor.x + p.x * T4_SPREAD, y: anchor.y + p.y * T4_SPREAD },
    ancientBottom: { x: anchor.x - p.x * T4_SPREAD, y: anchor.y - p.y * T4_SPREAD },
  }
}

/** Radiant occupies the bottom-left: top lane runs up the left edge, bot along the bottom. */
export const RADIANT_LAYOUT: SideLayout = base(
  { x: 52, y: 258 },
  {
    top: [{ x: 26, y: 78 }, { x: 26, y: 138 }, { x: 26, y: 192 }],
    mid: [{ x: 158, y: 162 }, { x: 120, y: 200 }, { x: 84, y: 237 }],
    bot: [{ x: 218, y: 294 }, { x: 168, y: 294 }, { x: 116, y: 291 }],
  },
)

/** Dire occupies the top-right: its top lane runs along the top edge, bot up the right. */
export const DIRE_LAYOUT: SideLayout = base(
  { x: 268, y: 62 },
  {
    top: [{ x: 102, y: 26 }, { x: 158, y: 26 }, { x: 212, y: 26 }],
    mid: [{ x: 162, y: 158 }, { x: 200, y: 120 }, { x: 236, y: 83 }],
    bot: [{ x: 294, y: 242 }, { x: 294, y: 182 }, { x: 291, y: 128 }],
  },
)
