// Captain's Mode 7.40 draft order inference.
// Source: Liquipedia "Dota 2 — Game Modes" verified 2026-04-24 (04-RESEARCH §Section 2).
// 24 steps = 14 bans + 10 picks. Per-team: 7 bans + 5 picks each.
//
// Sequence for "Radiant is first pick" (team 0 takes the first ban of Ban Phase 1):
//   Ban Phase 1  (7 bans):   R D R D R D R          indices 0..6
//   Pick Phase 1 (4 picks):  R D D R                indices 7..10
//   Ban Phase 2  (5 bans):   D R D R D              indices 11..15
//   Pick Phase 2 (4 picks):  D R D R                indices 16..19
//   Ban Phase 3  (2 bans):   D R                    indices 20..21
//   Pick Phase 3 (2 picks):  R D                    indices 22..23
//   Total: 24 steps.
//   Per-team bans: R = 4(P1) + 2(P2) + 1(P3) = 7, D = 3(P1) + 3(P2) + 1(P3) = 7 ✓
//   Per-team picks: R = 2(P1) + 2(P2) + 1(P3) = 5, D = 2(P1) + 2(P2) + 1(P3) = 5 ✓

const CM_740_RADIANT_FIRST: ReadonlyArray<readonly [0 | 1, 'ban' | 'pick']> = [
  // Ban Phase 1 (7 bans): R D R D R D R
  [0, 'ban'], [1, 'ban'], [0, 'ban'], [1, 'ban'], [0, 'ban'], [1, 'ban'], [0, 'ban'],
  // Pick Phase 1 (4 picks): R D D R
  [0, 'pick'], [1, 'pick'], [1, 'pick'], [0, 'pick'],
  // Ban Phase 2 (5 bans): D R D R D
  [1, 'ban'], [0, 'ban'], [1, 'ban'], [0, 'ban'], [1, 'ban'],
  // Pick Phase 2 (4 picks): D R D R
  [1, 'pick'], [0, 'pick'], [1, 'pick'], [0, 'pick'],
  // Ban Phase 3 (2 bans): D R
  [1, 'ban'], [0, 'ban'],
  // Pick Phase 3 (2 picks): R D
  [0, 'pick'], [1, 'pick'],
]

/**
 * Swap every team index (0 ↔ 1) so the same phase pattern applies when Dire
 * has first pick.
 */
function mirror(
  seq: ReadonlyArray<readonly [0 | 1, 'ban' | 'pick']>,
): ReadonlyArray<readonly [0 | 1, 'ban' | 'pick']> {
  return seq.map(([t, a]) => [t === 0 ? 1 : 0, a] as const)
}

const CM_740_DIRE_FIRST = mirror(CM_740_RADIANT_FIRST)

/**
 * Pure inference: given per-team completed counts and the (maybe unknown) first-pick team,
 * return the team + action expected NEXT in the CM 7.40 sequence.
 *
 * Returns `null` when:
 *   - `firstPickTeam` is `null` (ambiguous — caller surfaces D-08 tentative state).
 *   - `completedSteps >= 24` (draft complete — no next action).
 *
 * Pure, no side effects, no React imports — exported for unit testing per 04-PATTERNS.md.
 */
export function inferActiveTeam(
  counts: { rPicks: number; dPicks: number; rBans: number; dBans: number },
  firstPickTeam: 0 | 1 | null,
): { team: 0 | 1; action: 'pick' | 'ban' } | null {
  if (firstPickTeam === null) return null
  const seq = firstPickTeam === 0 ? CM_740_RADIANT_FIRST : CM_740_DIRE_FIRST
  const completedSteps = counts.rPicks + counts.dPicks + counts.rBans + counts.dBans
  if (completedSteps >= seq.length) return null
  const [team, action] = seq[completedSteps]
  return { team, action }
}

/**
 * Heuristic: infer which team has first pick by walking both candidate sequences
 * and checking which (if any) is the unique match for the observed per-team counts.
 *
 * Returns:
 *   - `0` (Radiant first) when only Radiant-first-sequence can produce the observed counts.
 *   - `1` (Dire first)   when only Dire-first-sequence can produce the observed counts.
 *   - `null` when BOTH candidates match (ambiguous — symmetric state like step 0, step 2,
 *     etc.) OR when NEITHER matches (corrupt payload / non-CM mode per PF-5).
 *
 * Caller (useDraftDetail) surfaces `null` return as the D-08 tentative marker.
 */
export function inferFirstPickFromHistory(scoreboard: {
  radiant?: { picks?: unknown[]; bans?: unknown[] }
  dire?:    { picks?: unknown[]; bans?: unknown[] }
}): 0 | 1 | null {
  const rPicks = scoreboard.radiant?.picks?.length ?? 0
  const dPicks = scoreboard.dire?.picks?.length    ?? 0
  const rBans  = scoreboard.radiant?.bans?.length  ?? 0
  const dBans  = scoreboard.dire?.bans?.length     ?? 0
  const totalSteps = rPicks + dPicks + rBans + dBans

  if (totalSteps === 0) return null // pristine — both candidates equally plausible

  // Walk prefix of each candidate sequence; count expected R/D picks/bans at `totalSteps`.
  const countsFor = (seq: ReadonlyArray<readonly [0 | 1, 'ban' | 'pick']>) => {
    let rP = 0, dP = 0, rB = 0, dB = 0
    for (let i = 0; i < Math.min(totalSteps, seq.length); i++) {
      const [team, action] = seq[i]
      if (team === 0 && action === 'pick') rP++
      else if (team === 1 && action === 'pick') dP++
      else if (team === 0 && action === 'ban') rB++
      else if (team === 1 && action === 'ban') dB++
    }
    return { rP, dP, rB, dB }
  }

  const matchesRFirst = (() => {
    const e = countsFor(CM_740_RADIANT_FIRST)
    return e.rP === rPicks && e.dP === dPicks && e.rB === rBans && e.dB === dBans
  })()
  const matchesDFirst = (() => {
    const e = countsFor(CM_740_DIRE_FIRST)
    return e.rP === rPicks && e.dP === dPicks && e.rB === rBans && e.dB === dBans
  })()

  if (matchesRFirst && !matchesDFirst) return 0
  if (matchesDFirst && !matchesRFirst) return 1
  return null // both match OR neither matches — ambiguous
}

// ---------------------------------------------------------------------------
// buildDraftTimeline — reconstruct the global CM 7.40 pick/ban order from
// Valve scoreboard data. Exported for DraftTimeline.tsx consumption.
// ---------------------------------------------------------------------------

export interface DraftTimelineSlot {
  /** 0-based global step in the CM 7.40 sequence (0 = first ban, 23 = last pick). */
  step: number
  /** 0 = Radiant, 1 = Dire */
  team: 0 | 1
  action: 'pick' | 'ban'
  /** hero_id from Valve scoreboard. undefined when slot not yet filled. */
  heroId: number | undefined
  /** true when this slot is the NEXT to be filled (the "active" cursor). */
  isActive: boolean
}

/**
 * Reconstruct an ordered list of 24 draft slots in global CM 7.40 sequence.
 *
 * Returns null when firstPickTeam is null (ambiguous — caller should fall
 * back to a per-team layout). When non-null, the returned array always has
 * exactly 24 entries regardless of how many steps have been completed.
 *
 * Mapping: slot.heroId is read from the Nth occurrence of (team, action) in the
 * sequence — i.e. the per-team array index is derived by counting prior entries.
 *
 * Pure, no side effects, no React imports.
 */
export function buildDraftTimeline(
  scoreboard: {
    radiant?: { picks?: Array<{ hero_id?: number }>; bans?: Array<{ hero_id?: number }> }
    dire?:    { picks?: Array<{ hero_id?: number }>; bans?: Array<{ hero_id?: number }> }
  },
  firstPickTeam: 0 | 1 | null,
): DraftTimelineSlot[] | null {
  if (firstPickTeam === null) return null

  const seq = firstPickTeam === 0 ? CM_740_RADIANT_FIRST : CM_740_DIRE_FIRST
  const rPicks = scoreboard.radiant?.picks ?? []
  const rBans  = scoreboard.radiant?.bans  ?? []
  const dPicks = scoreboard.dire?.picks    ?? []
  const dBans  = scoreboard.dire?.bans     ?? []

  const totalCompleted = rPicks.length + rBans.length + dPicks.length + dBans.length

  // Per-(team, action) index counters for array lookup.
  const idx: Record<string, number> = { '0:pick': 0, '1:pick': 0, '0:ban': 0, '1:ban': 0 }

  return seq.map(([team, action], i) => {
    const key = `${team}:${action}`
    const pos = idx[key]
    idx[key]++

    const arr =
      team === 0
        ? action === 'pick' ? rPicks : rBans
        : action === 'pick' ? dPicks : dBans

    return {
      step: i,
      team,
      action,
      heroId: arr[pos]?.hero_id,
      isActive: i === totalCompleted,
    }
  })
}
