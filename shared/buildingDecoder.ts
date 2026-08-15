export interface LaneBuildings {
  tier1: boolean
  tier2: boolean
  tier3: boolean
  meleeRax: boolean
  rangedRax: boolean
}

export interface TeamBuildings {
  top: LaneBuildings
  mid: LaneBuildings
  bot: LaneBuildings
  ancientTop: boolean
  ancientBottom: boolean
}

export interface BuildingState {
  radiant: TeamBuildings
  dire: TeamBuildings
  unavailable: boolean
}

const ALL_ALIVE_LANE: LaneBuildings = { tier1: true, tier2: true, tier3: true, meleeRax: true, rangedRax: true }
const ALL_ALIVE_TEAM: TeamBuildings = {
  top: ALL_ALIVE_LANE,
  mid: ALL_ALIVE_LANE,
  bot: ALL_ALIVE_LANE,
  ancientTop: true,
  ancientBottom: true,
}

interface TowerDecoded {
  top: { tier1: boolean; tier2: boolean; tier3: boolean; meleeRax: boolean; rangedRax: boolean }
  mid: { tier1: boolean; tier2: boolean; tier3: boolean; meleeRax: boolean; rangedRax: boolean }
  bot: { tier1: boolean; tier2: boolean; tier3: boolean; meleeRax: boolean; rangedRax: boolean }
  ancientTop: boolean
  ancientBottom: boolean
}

function decodeTowers(ts: number): TowerDecoded {
  return {
    top: { tier1: !!(ts & (1 << 0)), tier2: !!(ts & (1 << 1)), tier3: !!(ts & (1 << 2)), meleeRax: false, rangedRax: false },
    mid: { tier1: !!(ts & (1 << 3)), tier2: !!(ts & (1 << 4)), tier3: !!(ts & (1 << 5)), meleeRax: false, rangedRax: false },
    bot: { tier1: !!(ts & (1 << 6)), tier2: !!(ts & (1 << 7)), tier3: !!(ts & (1 << 8)), meleeRax: false, rangedRax: false },
    ancientTop: !!(ts & (1 << 9)),
    ancientBottom: !!(ts & (1 << 10)),
  }
}

function mergeRax(towers: TowerDecoded, bs: number): TeamBuildings {
  return {
    ...towers,
    top: { ...towers.top, meleeRax: !!(bs & (1 << 0)), rangedRax: !!(bs & (1 << 1)) },
    mid: { ...towers.mid, meleeRax: !!(bs & (1 << 2)), rangedRax: !!(bs & (1 << 3)) },
    bot: { ...towers.bot, meleeRax: !!(bs & (1 << 4)), rangedRax: !!(bs & (1 << 5)) },
  }
}

/**
 * Decodes Valve's tower_state and barracks_state bitmasks into a structured BuildingState.
 * Per D-09: handles undefined building_state gracefully.
 *
 * towerState layout: lower 16 bits = Radiant, upper 16 bits = Dire (11 tower bits per team)
 * barracksState layout: lower 8 bits = Radiant, upper 8 bits = Dire (6 barracks bits per team)
 * Bit value 1 = building standing (alive), 0 = building destroyed.
 *
 * CRITICAL: towerState === 0 means ALL towers destroyed (NOT absent data).
 *           Only set unavailable:true when towerState is undefined.
 */
function cloneTeam(t: TeamBuildings): TeamBuildings {
  return {
    top: { ...t.top },
    mid: { ...t.mid },
    bot: { ...t.bot },
    ancientTop: t.ancientTop,
    ancientBottom: t.ancientBottom,
  }
}

/**
 * The inverse of buildingDecoder: two PER-TEAM masks → the single packed pair.
 *
 * Valve's live feed carries `tower_state` / `barracks_state` under
 * `scoreboard.{radiant,dire}` and leaves the top level undefined (CLAUDE.md pitfall),
 * while everything downstream expects the packed layout — Radiant in the low bits, Dire
 * shifted up. That packing existed in three separate copies: liveAggregator (which feeds
 * the UI), reconstruct (which rebuilds an archived minute), and NOWHERE in the /winprob
 * route — so the "Est." bar read `tower_state: undefined`, defaulted both sides to "all
 * standing", and silently dropped the tower and barracks terms from its own formula for
 * the entire life of the feature. One packer, so a consumer cannot quietly miss it.
 *
 * `undefined` in means "Valve did not report it", and is preserved rather than defaulted:
 * buildingDecoder distinguishes an absent mask (unavailable) from a zero one (everything
 * destroyed), and that distinction must survive packing.
 */
export function packBuildingState(
  radiantTowers: number | undefined,
  direTowers: number | undefined,
  radiantBarracks: number | undefined,
  direBarracks: number | undefined,
): { towerState: number | undefined; barracksState: number | undefined } {
  return {
    towerState:
      radiantTowers === undefined && direTowers === undefined
        ? undefined
        : ((radiantTowers ?? 0) & 0xffff) | (((direTowers ?? 0) & 0xffff) << 16),
    barracksState:
      radiantBarracks === undefined && direBarracks === undefined
        ? undefined
        : ((radiantBarracks ?? 0x3f) & 0xff) | (((direBarracks ?? 0x3f) & 0xff) << 8),
  }
}

export function buildingDecoder(
  towerState: number | undefined,
  barracksState: number | undefined,
): BuildingState {
  if (towerState === undefined) {
    return { radiant: cloneTeam(ALL_ALIVE_TEAM), dire: cloneTeam(ALL_ALIVE_TEAM), unavailable: true }
  }

  const radiantTower = towerState & 0xFFFF
  const direTower = (towerState >>> 16) & 0xFFFF
  // Default to 0x3F (all 6 barracks bits set = all alive) when absent
  const radiantRax = barracksState !== undefined ? barracksState & 0xFF : 0x3F
  const direRax = barracksState !== undefined ? (barracksState >>> 8) & 0xFF : 0x3F

  return {
    radiant: mergeRax(decodeTowers(radiantTower), radiantRax),
    dire: mergeRax(decodeTowers(direTower), direRax),
    unavailable: false,
  }
}
