// Derived insights over an archived match — the "advanced HLTV for Dota" layer.
//
// Everything here is a pure function of rows already in the archive, so it can be
// recomputed at any time and never costs an upstream call. The analyser runs once a
// match reaches `complete`, and writes a single jsonb blob to match_analysis.
//
// Design rule: report only what the data supports. Where the live sampler's 30s
// resolution makes a claim shaky (exact swing timings, laning at a precise minute),
// the output carries the minute it was measured at rather than implying second-level
// precision.

export interface TimelinePoint {
  minute: number
  radiantGoldAdv: number | null
  radiantXpAdv: number | null
  radiantScore: number | null
  direScore: number | null
  source: 'live' | 'opendota'
}

export interface PlayerPoint {
  minute: number
  playerSlot: number
  heroId: number | null
  team: number | null
  playerName: string | null
  netWorth: number | null
  xp: number | null
  lastHits: number | null
}

export interface EventPoint {
  t: number
  type: string
  team: number | null
  payload: Record<string, unknown> | null
}

// ─── Momentum ────────────────────────────────────────────────────────────────

export interface Swing {
  /** Minute the swing completed. */
  minute: number
  fromGold: number
  toGold: number
  delta: number
  /** 'lead_change' when the sign of the gold lead flipped, else a large same-side move. */
  kind: 'lead_change' | 'surge'
  /** Which side benefited: 0 Radiant, 1 Dire. */
  team: 0 | 1
}

/** Gold swings smaller than this are noise at 30s sampling, not a turning point. */
export const SURGE_THRESHOLD = 5_000
/**
 * A lead change only counts once the new lead is real. Without this, gold wobbling
 * around zero early on reports a "turning point" at −0.2k → +0.0k.
 */
export const LEAD_CHANGE_MIN_GOLD = 1_000
const WINDOW_MINUTES = 3

/**
 * Turning points: minutes where the gold lead changed hands, plus large same-side surges.
 *
 * Two pieces of noise control, both learned from real data:
 *  - a sign flip is only a lead change once the new lead clears LEAD_CHANGE_MIN_GOLD
 *  - consecutive surges by the same side collapse into the single largest one, because a
 *    rolling 3-minute window over one sustained push otherwise fires every single minute
 *    (a real match produced six identical-looking "surge" rows for one teamfight chain)
 */
export function detectSwings(timeline: TimelinePoint[]): Swing[] {
  const pts = timeline.filter((p) => p.radiantGoldAdv !== null) as Array<TimelinePoint & { radiantGoldAdv: number }>
  if (pts.length < 2) return []

  const leadChanges: Swing[] = []
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1].radiantGoldAdv
    const cur = pts[i].radiantGoldAdv
    if (prev === 0 || cur === 0) continue
    if (Math.sign(prev) === Math.sign(cur)) continue
    if (Math.abs(cur) < LEAD_CHANGE_MIN_GOLD) continue
    leadChanges.push({
      minute: pts[i].minute,
      fromGold: prev,
      toGold: cur,
      delta: cur - prev,
      kind: 'lead_change',
      team: cur > 0 ? 0 : 1,
    })
  }

  const rawSurges: Swing[] = []
  for (let i = WINDOW_MINUTES; i < pts.length; i++) {
    const from = pts[i - WINDOW_MINUTES].radiantGoldAdv
    const to = pts[i].radiantGoldAdv
    const delta = to - from
    if (Math.abs(delta) < SURGE_THRESHOLD) continue
    // A lead change at the same moment is the better headline for it.
    if (leadChanges.some((s) => Math.abs(s.minute - pts[i].minute) <= 1)) continue
    rawSurges.push({
      minute: pts[i].minute,
      fromGold: from,
      toGold: to,
      delta,
      kind: 'surge',
      team: delta > 0 ? 0 : 1,
    })
  }

  // Collapse runs: consecutive minutes trending the same way are one push, not many.
  const surges: Swing[] = []
  for (const s of rawSurges) {
    const last = surges[surges.length - 1]
    const continues = last && last.team === s.team && s.minute - last.minute <= WINDOW_MINUTES
    if (!continues) {
      surges.push(s)
      continue
    }
    // Keep the widest span of the run: earliest start, latest end.
    surges[surges.length - 1] = {
      ...last,
      minute: s.minute,
      toGold: s.toGold,
      delta: s.toGold - last.fromGold,
    }
  }

  return [...leadChanges, ...surges].sort((a, b) => a.minute - b.minute)
}

// ─── Laning ──────────────────────────────────────────────────────────────────

export interface LaningVerdict {
  /** Minute the snapshot was taken at (10 when available, else the closest recorded). */
  atMinute: number
  radiantNetWorth: number
  direNetWorth: number
  goldDiff: number
  radiantLastHits: number
  direLastHits: number
  /** 0 Radiant, 1 Dire, null when neither side is meaningfully ahead. */
  winner: 0 | 1 | null
  /** Per-player net worth at that minute, sorted richest first. */
  players: Array<{ playerSlot: number; heroId: number | null; playerName: string | null; netWorth: number | null; lastHits: number | null }>
}

/** Below this the laning stage is a draw, not a win. */
export const LANING_DECISIVE_GOLD = 1_500

/**
 * Laning verdict, read at minute 10 — the conventional end of the laning stage.
 *
 * Falls back to the nearest recorded minute when 10 is missing, and reports which one
 * it used, because a verdict read at minute 7 is a different claim.
 */
export function laningVerdict(players: PlayerPoint[], target = 10): LaningVerdict | null {
  if (players.length === 0) return null
  const minutes = [...new Set(players.map((p) => p.minute))]
  if (minutes.length === 0) return null
  const atMinute = minutes.reduce((best, m) => (Math.abs(m - target) < Math.abs(best - target) ? m : best), minutes[0])

  const at = players.filter((p) => p.minute === atMinute)
  const sum = (team: number, key: 'netWorth' | 'lastHits') =>
    at.filter((p) => p.team === team).reduce((s, p) => s + (p[key] ?? 0), 0)

  const radiantNetWorth = sum(0, 'netWorth')
  const direNetWorth = sum(1, 'netWorth')
  const goldDiff = radiantNetWorth - direNetWorth

  return {
    atMinute,
    radiantNetWorth,
    direNetWorth,
    goldDiff,
    radiantLastHits: sum(0, 'lastHits'),
    direLastHits: sum(1, 'lastHits'),
    winner: Math.abs(goldDiff) < LANING_DECISIVE_GOLD ? null : goldDiff > 0 ? 0 : 1,
    players: [...at]
      .sort((a, b) => (b.netWorth ?? 0) - (a.netWorth ?? 0))
      .map((p) => ({ playerSlot: p.playerSlot, heroId: p.heroId, playerName: p.playerName, netWorth: p.netWorth, lastHits: p.lastHits })),
  }
}

// ─── Objective impact ────────────────────────────────────────────────────────

export interface ObjectiveImpact {
  /** The headline objective for this minute. */
  type: string
  t: number
  minute: number
  team: number | null
  goldBefore: number | null
  goldAfter: number | null
  /** Radiant-positive swing across the window. */
  swing: number | null
  /** Everything that happened in the same minute, e.g. { teamfight: 1, barracks: 3 }. */
  alsoAtThisMinute: Record<string, number>
}

/** How long after an objective its economic effect is attributed to it. */
export const IMPACT_WINDOW_MINUTES = 2

/**
 * Gold swing in the two minutes after each objective.
 *
 * Correlation, not causation — a Roshan and the fight that produced it are the same
 * event to a 30s sampler. Presented as "what moved after this", which is what it is.
 */
export function objectiveImpacts(events: EventPoint[], timeline: TimelinePoint[]): ObjectiveImpact[] {
  const goldAt = new Map<number, number>()
  for (const p of timeline) {
    if (p.radiantGoldAdv !== null) goldAt.set(p.minute, p.radiantGoldAdv)
  }
  if (goldAt.size === 0) return []

  const interesting = new Set(['roshan', 'tower', 'barracks', 'teamfight'])
  /**
   * Headline priority within a minute. A teamfight is usually the CAUSE of the towers and
   * barracks that follow it, so it leads; Roshan outranks a lone building.
   */
  const PRIORITY: Record<string, number> = { teamfight: 4, roshan: 3, barracks: 2, tower: 1 }

  // Group by minute. The swing is a property of the two-minute window, so listing five
  // objectives from one minute repeats the same number five times and buries the signal.
  const byMinute = new Map<number, { lead: EventPoint; counts: Record<string, number> }>()
  for (const e of events) {
    if (!interesting.has(e.type) || e.t < 0) continue
    const minute = Math.floor(e.t / 60)
    const slot = byMinute.get(minute)
    if (!slot) {
      byMinute.set(minute, { lead: e, counts: { [e.type]: 1 } })
      continue
    }
    slot.counts[e.type] = (slot.counts[e.type] ?? 0) + 1
    if ((PRIORITY[e.type] ?? 0) > (PRIORITY[slot.lead.type] ?? 0)) slot.lead = e
  }

  return [...byMinute.entries()]
    .map(([minute, { lead, counts }]) => {
      const before = goldAt.get(minute) ?? null
      const after = goldAt.get(minute + IMPACT_WINDOW_MINUTES) ?? null
      return {
        type: lead.type,
        t: lead.t,
        minute,
        team: lead.team,
        goldBefore: before,
        goldAfter: after,
        swing: before !== null && after !== null ? after - before : null,
        alsoAtThisMinute: counts,
      }
    })
    .filter((i) => i.swing !== null)
    .sort((a, b) => Math.abs(b.swing as number) - Math.abs(a.swing as number))
}

// ─── Assembly ────────────────────────────────────────────────────────────────

export interface MatchAnalysis {
  version: number
  lastMinute: number
  /** Fraction of minutes that came from a parsed replay rather than the 30s sampler. */
  precision: { opendotaMinutes: number; liveMinutes: number }
  swings: Swing[]
  laning: LaningVerdict | null
  topObjectives: ObjectiveImpact[]
  /** Largest lead either side held, and when. */
  peaks: { radiant: { gold: number; minute: number } | null; dire: { gold: number; minute: number } | null }
}

export const ANALYSIS_VERSION = 1

export function buildAnalysis(
  timeline: TimelinePoint[],
  players: PlayerPoint[],
  events: EventPoint[],
): MatchAnalysis {
  let radiantPeak: { gold: number; minute: number } | null = null
  let direPeak: { gold: number; minute: number } | null = null
  for (const p of timeline) {
    if (p.radiantGoldAdv === null) continue
    if (p.radiantGoldAdv > (radiantPeak?.gold ?? 0)) radiantPeak = { gold: p.radiantGoldAdv, minute: p.minute }
    if (p.radiantGoldAdv < (direPeak?.gold ?? 0)) direPeak = { gold: p.radiantGoldAdv, minute: p.minute }
  }

  return {
    version: ANALYSIS_VERSION,
    lastMinute: timeline.length > 0 ? timeline[timeline.length - 1].minute : 0,
    precision: {
      opendotaMinutes: timeline.filter((p) => p.source === 'opendota').length,
      liveMinutes: timeline.filter((p) => p.source === 'live').length,
    },
    swings: detectSwings(timeline),
    laning: laningVerdict(players),
    topObjectives: objectiveImpacts(events, timeline).slice(0, 8),
    peaks: { radiant: radiantPeak, dire: direPeak },
  }
}
