import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { format } from 'date-fns'
import type { BracketNode } from '../hooks/useArchive'
import type { TeamLookup } from './SeriesNodeCard'
import TeamLogo from './TeamLogo'

/**
 * A Swiss stage drawn as the flow it actually is: a column per round, and inside a column
 * one box per record. Winners rise to the record above, losers fall to the one below.
 *
 * The previous rendering was a flat list of cards grouped by kick-off time, which loses
 * the two things a Swiss stage is about — which round you are looking at, and where a
 * team is heading. Both are recoverable from the same node list, and nothing here is
 * hardcoded to TI's shape:
 *
 *   round   — in Swiss every team plays exactly once per round, so a pairing belongs to
 *             round (games already played by its two teams) + 1. Kick-off time cannot
 *             stand in for it: TI 2026 splits round 1 across two broadcast slots
 *             ("Match 1.A" at 04:00, "Match 1.B" at 07:00) and they are one round.
 *   record  — accumulated from the results in chronological order. Swiss pairs teams on
 *             equal records, so a pairing's record is its bucket. When the two sides
 *             disagree (a down-float, which happens on odd bucket sizes) the bucket is
 *             left unlabelled rather than picking one side's record and calling it fact.
 *   flow    — bucket (w, l) of the next round is fed by the winners of (w-1, l) and the
 *             losers of (w, l-1). That relation is what the connectors draw, and it needs
 *             no knowledge of the tournament beyond the buckets themselves.
 *
 * What is deliberately NOT derived: which record makes the cut. Valve publishes no such
 * field, and guessing "three wins clinches" would be inventing a tournament rule. The
 * panel reports only what is certain — a team has no unplayed game left — with the record
 * it finished on and the placement the organiser itself published.
 */

export interface SwissFlowProps {
  nodes: BracketNode[]
  teamNames: TeamLookup
  leagueId: string | undefined
  /**
   * Unordered team-pair keys currently in Valve's live feed.
   *
   * The bracket's own hasStarted trails it by minutes, and in that gap a running series
   * was labelled as running late. The feed settles it.
   */
  livePairs?: Set<string>
  /** seriesId → teamId → maps won, counted from our own finished games. */
  seriesWins?: Map<number, Map<number, number>>
  /** teamId → Valve's published placement for this stage. */
  standings?: Map<number, number>
}

/** A team the projection places in a bucket, and what it depends on. */
export interface ProjectedTeam {
  teamId: number
  /**
   * null once the team's record is final. Otherwise the running series that decides it:
   * the team lands in this bucket only if `wins` matches the outcome.
   */
  contingentOn: { opponentId: number; wins: boolean } | null
}

export interface SwissBucket {
  /** Stable within a round: "2-0", or "tbd" for a round Valve has not seeded. */
  key: string
  wins: number | null
  losses: number | null
  nodes: BracketNode[]
  /** Teams a projected bucket will hold. Absent on a bucket Valve has seeded. */
  pool?: ProjectedTeam[]
  /** Series a projected bucket will hold — pairs formed inside it. */
  seriesCount?: number
  /** A projected bucket holding one team, which therefore has nobody to play. */
  bye?: boolean
}

export interface SwissRound {
  round: number
  buckets: SwissBucket[]
  /** False when Valve has published no teams for the round yet. */
  seeded: boolean
  /** Unseeded, but its buckets are derived from the round before it. */
  projected?: boolean
  /**
   * Distinct kick-off slots of the round, ascending.
   *
   * Captured before the projection replaces the buckets, because a projected bucket holds
   * a pool of teams rather than nodes and would otherwise have no time at all — which is
   * exactly the column a reader asks "when is this" about.
   */
  slots: number[]
}

/** A team whose stage is over, with the record it finished on. */
export interface SwissOutcome {
  teamId: number
  wins: number
  losses: number
  /** Valve's own placement for the stage. Null until it publishes one. */
  standing: number | null
  /**
   * Decided by the thresholds the organiser revealed, or null when the record falls
   * between them — those teams are through to whatever the stage feeds.
   */
  verdict: 'advanced' | 'eliminated' | null
}

/**
 * The win and loss counts at which this stage stops scheduling a team.
 *
 * Not a rule anyone typed in: Valve announced it by leaving two teams out of the final
 * round. TI 2026's round 5 held seven series for fourteen teams, and the two without a
 * game were the 4-0 and the 0-4 — nothing left to decide about either. So four wins ends
 * the stage in your favour and four losses ends it against you, and a team that reaches
 * four losses a round later is out on the same terms.
 *
 * Returns nulls when no team was ever left out, because then the stage has revealed
 * nothing and any verdict would be invention.
 */
export function decidedThresholds(
  tallies: Iterable<{ wins: number; losses: number; games: number }>,
): { clinchWins: number | null; elimLosses: number | null } {
  const all = [...tallies]
  if (all.length === 0) return { clinchWins: null, elimLosses: null }
  const maxGames = Math.max(...all.map((t) => t.games))
  let clinchWins: number | null = null
  let elimLosses: number | null = null
  for (const t of all) {
    // Played fewer games than the field: the stage stopped scheduling them.
    if (t.games >= maxGames) continue
    if (t.wins > t.losses) clinchWins = clinchWins === null ? t.wins : Math.min(clinchWins, t.wins)
    if (t.losses > t.wins) elimLosses = elimLosses === null ? t.losses : Math.min(elimLosses, t.losses)
  }
  return { clinchWins, elimLosses }
}

export interface SwissModel {
  rounds: SwissRound[]
  /** Final record per team, best first. Empty while the stage is still unseeded. */
  outcomes: SwissOutcome[]
  records: Map<number, { wins: number; losses: number }>
}

interface Tally {
  wins: number
  losses: number
  games: number
}

const bucketKey = (w: number | null, l: number | null) => (w === null || l === null ? 'mixed' : `${w}-${l}`)

/**
 * When a series is due — asked only of ones that have not begun.
 *
 * A started series does not need a clock: it has a score, and once it is over the score is
 * the whole story. The question a time answers here is "when do I come back", so it is
 * shown for upcoming series and nowhere else.
 *
 * `late` matters because Valve publishes `scheduled_time` once and never revises it. A
 * tournament running behind keeps advertising the original plan: TI 2026's 10:00 slot
 * actually started between 11:33 and 11:41, and a game of it still undrawn was being shown
 * as "10:00" at 12:41. A time that has already passed is not a schedule, it is a stale
 * promise, and the caller shows the fact of the delay rather than that number.
 *
 * No replacement time is derived. The lag is not constant — 1 minute, then 26-79, then
 * 93-101 across this stage — and a confident wrong clock time would be worse than nothing.
 */
export function seriesTimeLabel(
  node: Pick<BracketNode, 'scheduledTime' | 'actualTime' | 'hasStarted'>,
  nowSeconds: number,
  /**
   * Valve's live feed says these two are playing right now.
   *
   * The bracket learns that minutes later — TI 2026 had a series live at 13:44 whose node
   * still read hasStarted false — and until it does, a started match was being announced as
   * running late. Same lag that hid a live map from its own series; same feed that closes it.
   */
  liveNow = false,
): { at: number; late: boolean } | null {
  if (liveNow || node.hasStarted || node.actualTime) return null
  if (!node.scheduledTime) return null
  return { at: node.scheduledTime, late: node.scheduledTime < nowSeconds }
}

/**
 * The score to show for a series: whichever source is further along.
 *
 * A node's team_1_wins comes from Valve's bracket and trails the game — a map that ended
 * 16-37 sat in the bracket as 0-0 while the archive already held its winner. Counting our
 * own decided maps catches up immediately, but it can also be BEHIND when a replay has not
 * been parsed yet, so neither source can be trusted alone.
 *
 * Taking the higher per side means the score can lag but never go backwards, which is the
 * failure that matters: a series visibly won must not redisplay as level.
 */
export function seriesScoreOf(
  node: Pick<BracketNode, 'team1Id' | 'team2Id' | 'team1Wins' | 'team2Wins' | 'seriesId'>,
  decided?: Map<number, Map<number, number>>,
): { team1: number; team2: number } {
  const fromNode = { team1: node.team1Wins ?? 0, team2: node.team2Wins ?? 0 }
  const tally = node.seriesId ? decided?.get(node.seriesId) : undefined
  if (!tally) return fromNode
  return {
    team1: Math.max(fromNode.team1, (node.team1Id && tally.get(node.team1Id)) || 0),
    team2: Math.max(fromNode.team2, (node.team2Id && tally.get(node.team2Id)) || 0),
  }
}

/** Unordered team-pair key, so a mirrored draw still matches. */
export function teamPairKey(a: number | null | undefined, b: number | null | undefined): string | null {
  if (!a || !b) return null
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/**
 * The buckets the next round will hold, worked out from the round before it.
 *
 * This is arithmetic, not prediction. Every series sends one team to (w+1, l) and one to
 * (w, l-1 inverted) whatever its result, so the SIZE of each bucket is already fixed while
 * the games are still being played — only which team lands where is open. Teams then pair
 * inside their own record, which leaves a bucket holding a single team with nobody to play.
 *
 * Nothing here encodes a tournament rule. The one assumption — that pairing happens within
 * a record — is checked rather than trusted: the pairs it produces must equal the number of
 * placeholder nodes Valve published for the round. When they disagree the shape is
 * something else and the projection is dropped, leaving the round as plain placeholders.
 */
export function projectBuckets(
  previous: SwissRound,
  records: Map<number, { wins: number; losses: number }>,
  nodeCount: number,
): SwissBucket[] | null {
  const size = new Map<string, number>()
  const pool = new Map<string, ProjectedTeam[]>()
  const at = new Map<string, { wins: number; losses: number }>()
  const played = new Set<number>()

  const put = (wins: number, losses: number, team: ProjectedTeam | null) => {
    const key = `${wins}-${losses}`
    at.set(key, { wins, losses })
    if (team) {
      if (!pool.has(key)) pool.set(key, [])
      pool.get(key)!.push(team)
    } else {
      size.set(key, (size.get(key) ?? 0) + 1)
    }
  }

  for (const bucket of previous.buckets) {
    // A bucket whose two sides held different records has no single successor pair, and a
    // round with unpublished teams cannot be walked forward at all.
    if (bucket.wins === null || bucket.losses === null) return null
    for (const n of bucket.nodes) {
      if (!n.team1Id || !n.team2Id) return null
      played.add(n.team1Id)
      played.add(n.team2Id)

      if (n.isCompleted === true) {
        for (const id of [n.team1Id, n.team2Id]) {
          const r = records.get(id)
          if (!r) return null
          put(r.wins, r.losses, null)
          put(r.wins, r.losses, { teamId: id, contingentOn: null })
        }
        continue
      }

      // Still running: one seat up and one seat down are already spoken for, and both
      // teams are candidates for both.
      put(bucket.wins + 1, bucket.losses, null)
      put(bucket.wins, bucket.losses + 1, null)
      for (const [id, other] of [
        [n.team1Id, n.team2Id],
        [n.team2Id, n.team1Id],
      ] as const) {
        put(bucket.wins + 1, bucket.losses, { teamId: id, contingentOn: { opponentId: other, wins: true } })
        put(bucket.wins, bucket.losses + 1, { teamId: id, contingentOn: { opponentId: other, wins: false } })
      }
    }
  }

  // A team idle in the previous round carries its record forward untouched.
  for (const [id, r] of records) {
    if (played.has(id)) continue
    put(r.wins, r.losses, null)
    put(r.wins, r.losses, { teamId: id, contingentOn: null })
  }

  const buckets: SwissBucket[] = []
  let pairs = 0
  for (const [key, count] of size) {
    const seats = at.get(key)!
    const series = Math.floor(count / 2)
    pairs += series
    buckets.push({
      key,
      wins: seats.wins,
      losses: seats.losses,
      nodes: [],
      pool: pool.get(key) ?? [],
      seriesCount: series,
      bye: count === 1,
    })
  }

  // The self-check. Valve published the round's size; if pairing by record does not
  // reproduce it, this is not how the round is drawn and we say nothing.
  if (pairs !== nodeCount) return null

  buckets.sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (a.losses ?? 0) - (b.losses ?? 0))
  return buckets
}

/**
 * Rounds, buckets and running records for one group stage.
 *
 * Exported for the test: every claim the component makes on screen is decided here, so
 * this is the function that has to stay honest against a real Valve payload.
 */
export function buildSwissModel(
  nodes: BracketNode[],
  /** teamId → Valve's published placement for this stage, when it has one. */
  standings?: Map<number, number>,
): SwissModel {
  // Chronological, so a team's games are tallied in the order they were played. Nodes
  // without a time sort last — they are the unseeded tail of the stage.
  const ordered = [...nodes].sort(
    (a, b) => (a.scheduledTime ?? Infinity) - (b.scheduledTime ?? Infinity) || a.nodeId - b.nodeId,
  )

  const tally = new Map<number, Tally>()
  const of = (id: number): Tally => {
    let t = tally.get(id)
    if (!t) {
      t = { wins: 0, losses: 0, games: 0 }
      tally.set(id, t)
    }
    return t
  }

  const seeded: Array<{ node: BracketNode; round: number; wins: number | null; losses: number | null }> = []
  const unseeded: BracketNode[] = []
  /** Rounds a team holds a game in — the basis for "this team is done". */
  const appearances = new Map<number, Set<number>>()

  for (const n of ordered) {
    if (!n.team1Id || !n.team2Id) {
      unseeded.push(n)
      continue
    }
    const a = of(n.team1Id)
    const b = of(n.team2Id)
    const round = Math.max(a.games, b.games) + 1
    const paired = a.wins === b.wins && a.losses === b.losses
    seeded.push({
      node: n,
      round,
      wins: paired ? a.wins : null,
      losses: paired ? a.losses : null,
    })
    for (const id of [n.team1Id, n.team2Id]) {
      if (!appearances.has(id)) appearances.set(id, new Set())
      appearances.get(id)!.add(round)
    }

    // A game counts towards the round number as soon as it is scheduled — that is what
    // keeps a live round from being read as the next one — but only a finished series
    // moves the record.
    a.games++
    b.games++
    if (n.isCompleted === true) {
      const team1Won = (n.team1Wins ?? 0) > (n.team2Wins ?? 0)
      const winner = team1Won ? a : b
      const loser = team1Won ? b : a
      winner.wins++
      loser.losses++
    }
  }

  const byRound = new Map<number, SwissRound>()
  for (const s of seeded) {
    let r = byRound.get(s.round)
    if (!r) {
      r = { round: s.round, buckets: [], seeded: true, slots: [] }
      byRound.set(s.round, r)
    }
    const key = bucketKey(s.wins, s.losses)
    let bucket = r.buckets.find((b) => b.key === key)
    if (!bucket) {
      bucket = { key, wins: s.wins, losses: s.losses, nodes: [] }
      r.buckets.push(bucket)
    }
    bucket.nodes.push(s.node)
  }

  const rounds = [...byRound.values()].sort((a, b) => a.round - b.round)
  // Best record on top, so "winners rise" is literally upwards on screen.
  for (const r of rounds) {
    r.buckets.sort((a, b) => (b.wins ?? -1) - (a.wins ?? -1) || (a.losses ?? 99) - (b.losses ?? 99))
  }

  // ─── the unseeded tail ─────────────────────────────────────────────────────
  //
  // Valve publishes the last rounds as bare placeholders, so their round number cannot be
  // derived from teams. It can be derived from size: a Swiss round holds at most one game
  // per two teams, and a round may still be split across kick-off slots. So slots are
  // packed into rounds up to that ceiling — the same rule reproduces the four seeded
  // rounds of TI 2026 (4+4 games each) and its seven-game final round (4+3).
  if (unseeded.length > 0) {
    const perRound = Math.floor(tally.size / 2)
    const slots = new Map<number, BracketNode[]>()
    for (const n of unseeded) {
      const key = n.scheduledTime ?? 0
      if (!slots.has(key)) slots.set(key, [])
      slots.get(key)!.push(n)
    }
    const ordered = [...slots.entries()].sort((a, b) => (a[0] || Infinity) - (b[0] || Infinity)).map(([, ns]) => ns)

    /**
     * A round is seeded a few pairings at a time, so the last seeded round is topped up
     * before a new one is opened.
     *
     * Valve draws the next round in pieces: three of round 5's seven games had teams while
     * four were still placeholders. Opening a new column for whatever was left over split
     * one round across two headers and invented a "Round 6" that does not exist — half the
     * stage looked like it had gone missing. The remainder belongs to the round already in
     * progress for as long as that round fits under the ceiling.
     */
    const last = rounds.length > 0 ? rounds[rounds.length - 1] : null
    const lastCount = last ? last.buckets.reduce((n, b) => n + b.nodes.length, 0) : 0

    let round = last?.round ?? 0
    let topUp: BracketNode[] = []
    let current: BracketNode[] = []
    const flush = () => {
      if (current.length === 0) return
      round++
      rounds.push({
        round,
        seeded: false,
        slots: [],
        buckets: [{ key: 'tbd', wins: null, losses: null, nodes: current }],
      })
      current = []
    }
    for (const slot of ordered) {
      if (
        last &&
        perRound > 0 &&
        current.length === 0 &&
        lastCount > 0 &&
        lastCount + topUp.length + slot.length <= perRound
      ) {
        topUp.push(...slot)
        continue
      }
      // perRound of 0 means no team ever played here (a stage published entirely as
      // placeholders); one column is the honest answer, not one column per slot.
      if (perRound > 0 && current.length > 0 && current.length + slot.length > perRound) flush()
      current.push(...slot)
    }
    if (last && topUp.length > 0) {
      last.buckets.push({ key: 'tbd', wins: null, losses: null, nodes: topUp })
    }
    flush()
  }

  // Captured now, while the buckets still hold nodes — the projection below swaps some of
  // them for pools of teams, which carry no time of their own.
  for (const r of rounds) {
    const times = new Set<number>()
    for (const b of r.buckets) for (const n of b.nodes) if (n.scheduledTime) times.add(n.scheduledTime)
    r.slots = [...times].sort((a, b) => a - b)
  }

  const records = new Map<number, { wins: number; losses: number }>()
  for (const [id, t] of tally) records.set(id, { wins: t.wins, losses: t.losses })

  /**
   * The first round holding placeholders is worked out from the round before it.
   *
   * Only the first: beyond it every result is open and the buckets would be guesswork.
   * The round may be partly drawn already, in which case the projection supplies the
   * skeleton — every record bucket and how many games each will hold — and the pairings
   * Valve has published are slotted into it. Teams already drawn against each other drop
   * out of their bucket's pool, so nobody is listed as both playing and waiting.
   */
  const firstBlank = rounds.findIndex((r) => r.buckets.some((b) => b.key === 'tbd'))
  if (firstBlank > 0) {
    const target = rounds[firstBlank]
    const total = target.buckets.reduce((n, b) => n + b.nodes.length, 0)
    const projected = projectBuckets(rounds[firstBlank - 1], records, total)
    if (projected) {
      const drawn = new Map<string, BracketNode[]>()
      const paired = new Set<number>()
      for (const b of target.buckets) {
        if (b.key === 'tbd') continue
        drawn.set(b.key, b.nodes)
        for (const n of b.nodes) {
          if (n.team1Id) paired.add(n.team1Id)
          if (n.team2Id) paired.add(n.team2Id)
        }
      }
      target.buckets = projected.map((b) => ({
        ...b,
        nodes: drawn.get(b.key) ?? [],
        pool: (b.pool ?? []).filter((p) => !paired.has(p.teamId)),
      }))
      target.projected = true
    }
  }

  /**
   * Whose stage is over: no unplayed game left anywhere in it.
   *
   * The earlier rule asked whether a team held a game in the FINAL round, which only ever
   * caught the byes. A team that played the last round and lost it — OG and XG finishing
   * 1-4 here, five games out of five — has just as certainly finished, and was dropped from
   * the panel entirely.
   *
   * Still gated on every pairing being drawn: while a round holds placeholders any of these
   * teams could in principle be drawn into one.
   */
  const outcomes: SwissOutcome[] = []
  if (rounds.length > 0 && rounds.every((r) => r.seeded && !r.projected)) {
    const pending = new Set<number>()
    for (const r of rounds) {
      for (const b of r.buckets) {
        for (const n of b.nodes) {
          if (n.isCompleted === true) continue
          if (n.team1Id) pending.add(n.team1Id)
          if (n.team2Id) pending.add(n.team2Id)
        }
      }
    }
    const { clinchWins, elimLosses } = decidedThresholds(tally.values())
    for (const [id, t] of tally) {
      if (pending.has(id)) continue
      const verdict =
        elimLosses !== null && t.losses >= elimLosses
          ? ('eliminated' as const)
          : clinchWins !== null && t.wins >= clinchWins
            ? ('advanced' as const)
            : null
      outcomes.push({
        teamId: id,
        wins: t.wins,
        losses: t.losses,
        standing: standings?.get(id) ?? null,
        verdict,
      })
    }
    // Valve's own placement when it has published one; the record is the fallback order.
    outcomes.sort(
      (a, b) =>
        (a.standing ?? Number.MAX_SAFE_INTEGER) - (b.standing ?? Number.MAX_SAFE_INTEGER) ||
        b.wins - a.wins ||
        a.losses - b.losses,
    )
  }

  return { rounds, outcomes, records }
}

// ─── rendering ───────────────────────────────────────────────────────────────

/**
 * Rounds share the width they are given rather than claiming a fixed slice of it.
 *
 * Fixed 236px columns made a five-round stage 1324px wide and put the whole thing behind a
 * horizontal scrollbar on an ordinary screen — which hides exactly the thing the layout
 * exists to show, the shape of the stage in one look. Flexible columns fit five rounds in
 * about 1120px instead.
 *
 * The minimum is set by the widest thing a column holds: a projected row naming two
 * candidate teams ("Resilience or GL"). Below it the flex items stop shrinking and the
 * scroller takes over — a fallback for a genuinely narrow window, not the normal case.
 * The maximum stops five rounds from sprawling across an ultrawide monitor.
 */
const COL_MIN = 208
const COL_MAX = 300

function Side({
  teamId,
  score,
  won,
  decided,
  teamNames,
  align,
  onHover,
}: {
  teamId: number | null
  score: number | null
  won: boolean
  decided: boolean
  teamNames: TeamLookup
  align: 'left' | 'right'
  onHover: (id: number | null) => void
}) {
  const team = teamId ? teamNames.get(teamId) : undefined
  const label = team?.tag || team?.name || 'TBD'
  return (
    <span
      // Per half, not per row: following a path means pointing at one team, and a row
      // holds two of them.
      onMouseEnter={() => onHover(teamId)}
      className={
        'flex items-center gap-1.5 min-w-0 flex-1 px-1.5 py-1 rounded-[5px] ' +
        (align === 'right' ? 'flex-row-reverse ' : '') +
        (won ? 'bg-[var(--color-radiant-soft)]' : '')
      }
    >
      <TeamLogo src={team?.logoUrl} name={team?.name ?? undefined} size={16} />
      <span
        className={
          'truncate text-[11px] ' +
          (!team ? 'text-text-dim italic' : won ? 'text-text font-semibold' : decided ? 'text-text-muted' : 'text-text')
        }
        title={team?.name ?? undefined}
      >
        {label}
      </span>
      {score !== null && (
        <span
          className={
            'font-mono text-[11px] tabular-nums shrink-0 ' + (align === 'right' ? 'mr-auto ' : 'ml-auto ') +
            (won ? 'text-radiant' : 'text-text-dim')
          }
        >
          {score}
        </span>
      )}
    </span>
  )
}

function MatchRow({
  node,
  teamNames,
  leagueId,
  hovered,
  onHover,
  livePairs,
  seriesWins,
}: {
  node: BracketNode
  teamNames: TeamLookup
  leagueId: string | undefined
  hovered: number | null
  onHover: (id: number | null) => void
  livePairs?: Set<string>
  seriesWins?: Map<number, Map<number, number>>
}) {
  const pair = teamPairKey(node.team1Id, node.team2Id)
  const liveNow = pair !== null && livePairs?.has(pair) === true
  const decided = node.isCompleted === true
  const live = (liveNow || node.hasStarted === true) && !decided
  const showScore = live || decided
  const score = seriesScoreOf(node, seriesWins)
  const team1Won = decided && score.team1 > score.team2
  const team2Won = decided && score.team2 > score.team1

  const involves = hovered !== null && (node.team1Id === hovered || node.team2Id === hovered)
  // Dimming only kicks in while a team is hovered, so the default view has no faded rows.
  const focus = hovered === null ? '' : involves ? ' ring-1 ring-primary' : ' opacity-30'

  const when = seriesTimeLabel(node, Math.floor(Date.now() / 1000), liveNow)

  const cls =
    'block rounded-[7px] border px-1 py-0.5 transition-all ' +
    (live ? 'border-radiant bg-[var(--color-radiant-soft)]' : 'border-transparent hover:border-primary') +
    focus

  // A played series links to its maps; an unplayed slot to the prematch page, which is
  // addressed by node because no match id exists until the first game starts.
  const href = node.seriesId ? `/series/${node.seriesId}` : `/tournament/${leagueId}/node/${node.nodeId}`

  return (
    <Link
      to={href}
      className={cls}
      onMouseLeave={() => onHover(null)}
      title={node.scheduledTime ? `Scheduled ${format(new Date(node.scheduledTime * 1000), 'EEE d MMM, HH:mm')}` : undefined}
    >
      <span className="flex items-stretch gap-1">
        <Side
          teamId={node.team1Id}
          score={showScore ? score.team1 : null}
          won={team1Won}
          decided={decided}
          teamNames={teamNames}
          align="left"
          onHover={onHover}
        />
        {/* Between the sides, where the score sits once there is one — an upcoming series
            has that space free and the kick-off is the only number it has.
            A slot already in the past is reported as the delay itself: repeating "10:00"
            at 12:41 is the thing that misled in the first place. The plan stays in the
            row's title for anyone who wants it. */}
        {when && (
          <span
            className={
              'self-center shrink-0 font-mono text-[9px] tabular-nums px-1 ' +
              (when.late ? 'text-accent' : 'text-text-dim')
            }
          >
            {when.late ? 'late' : format(new Date(when.at * 1000), 'HH:mm')}
          </span>
        )}
        <Side
          teamId={node.team2Id}
          score={showScore ? score.team2 : null}
          won={team2Won}
          decided={decided}
          teamNames={teamNames}
          align="right"
          onHover={onHover}
        />
      </span>
    </Link>
  )
}

function Chip({
  teamId,
  teamNames,
  hovered,
  onHover,
  muted = false,
}: {
  teamId: number
  teamNames: TeamLookup
  hovered: number | null
  onHover: (id: number | null) => void
  muted?: boolean
}) {
  const team = teamNames.get(teamId)
  return (
    <span
      onMouseEnter={() => onHover(teamId)}
      onMouseLeave={() => onHover(null)}
      className={
        'flex items-center gap-1.5 min-w-0 transition-opacity ' +
        (hovered !== null && hovered !== teamId ? 'opacity-30' : '')
      }
    >
      <TeamLogo src={team?.logoUrl} name={team?.name ?? undefined} size={16} />
      <span className={'truncate text-[11px] ' + (muted ? 'text-text-muted' : 'text-text')}>
        {team?.tag || team?.name || teamId}
      </span>
    </span>
  )
}

/**
 * The teams a projected bucket will hold.
 *
 * Two kinds of row, and the difference matters: a team whose record is already final is
 * simply listed, while a pair still playing shows as both candidates with the outcome that
 * would send them here. Reads without hovering — the highlight is a bonus, not the message.
 */
function PoolList({
  pool,
  teamNames,
  hovered,
  onHover,
}: {
  pool: ProjectedTeam[]
  teamNames: TeamLookup
  hovered: number | null
  onHover: (id: number | null) => void
}) {
  const settled = pool.filter((p) => !p.contingentOn)
  // Both sides of a running series land in the same bucket on the same outcome, so they
  // collapse into one "A or B" row instead of two rows that look like two teams.
  const pending: Array<{ a: number; b: number; wins: boolean }> = []
  const seen = new Set<string>()
  for (const p of pool) {
    if (!p.contingentOn) continue
    const { opponentId, wins } = p.contingentOn
    const key = [Math.min(p.teamId, opponentId), Math.max(p.teamId, opponentId), wins].join(':')
    if (seen.has(key)) continue
    seen.add(key)
    pending.push({ a: p.teamId, b: opponentId, wins })
  }

  return (
    <div className="flex flex-col gap-1 px-1.5 py-1">
      {settled.map((p) => (
        <Chip key={p.teamId} teamId={p.teamId} teamNames={teamNames} hovered={hovered} onHover={onHover} />
      ))}
      {pending.map(({ a, b, wins }) => (
        // Wraps rather than truncates: two long tags ("Resilience or GamerLegion") must
        // stay readable when the column is at its narrowest.
        <div key={`${a}:${b}:${wins}`} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
          <span
            className={
              'font-mono text-[9px] w-[9px] shrink-0 ' + (wins ? 'text-radiant' : 'text-dire')
            }
            title={wins ? 'the winner of a series still being played' : 'the loser of a series still being played'}
          >
            {wins ? 'W' : 'L'}
          </span>
          <Chip teamId={a} teamNames={teamNames} hovered={hovered} onHover={onHover} muted />
          <span className="text-[9px] text-text-dim shrink-0">or</span>
          <Chip teamId={b} teamNames={teamNames} hovered={hovered} onHover={onHover} muted />
        </div>
      ))}
    </div>
  )
}

interface Geom {
  x: number
  y: number
  w: number
  h: number
}

export default function SwissFlow({ nodes, teamNames, leagueId, livePairs, standings, seriesWins }: SwissFlowProps) {
  const model = useMemo(() => buildSwissModel(nodes, standings), [nodes, standings])
  const [hovered, setHovered] = useState<number | null>(null)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const boxRefs = useRef(new Map<string, HTMLDivElement>())
  const [geom, setGeom] = useState<Map<string, Geom>>(new Map())

  // Connectors are drawn against measured boxes rather than a computed grid, because the
  // boxes are as tall as their contents and no two rounds hold the same number of games.
  useLayoutEffect(() => {
    const measure = () => {
      const host = hostRef.current
      if (!host) return
      const origin = host.getBoundingClientRect()
      const next = new Map<string, Geom>()
      for (const [key, el] of boxRefs.current) {
        const r = el.getBoundingClientRect()
        next.set(key, { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height })
      }
      setGeom(next)
    }
    measure()
    // Connectors are a refinement, not the content: where ResizeObserver is missing the
    // single measurement above still places them, they just stop following a resize.
    if (typeof ResizeObserver === 'undefined') return
    // The SVG overlay is absolutely positioned, so measuring can never resize what it
    // measures — no feedback loop here.
    const ro = new ResizeObserver(measure)
    if (hostRef.current) ro.observe(hostRef.current)
    for (const el of boxRefs.current.values()) ro.observe(el)
    return () => ro.disconnect()
  }, [model])

  const links = useMemo(() => {
    const out: Array<{ from: string; to: string; win: boolean }> = []
    for (let i = 0; i < model.rounds.length - 1; i++) {
      const here = model.rounds[i]
      const next = model.rounds[i + 1]
      for (const b of here.buckets) {
        if (b.wins === null || b.losses === null) continue
        const target = (w: number, l: number) => next.buckets.find((n) => n.wins === w && n.losses === l)
        const up = target(b.wins + 1, b.losses)
        const down = target(b.wins, b.losses + 1)
        if (up) out.push({ from: `${here.round}:${b.key}`, to: `${next.round}:${up.key}`, win: true })
        if (down) out.push({ from: `${here.round}:${b.key}`, to: `${next.round}:${down.key}`, win: false })
      }
    }
    return out
  }, [model])

  if (model.rounds.length === 0) return null

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2 scroll-slim">
      <div ref={hostRef} className="relative w-full flex gap-5 items-start">
        {/* overflow-visible so connectors still draw when the columns bottom out at their
            minimum width and spill past the overlay's box. */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" aria-hidden="true">
          {links.map((l) => {
            const a = geom.get(l.from)
            const b = geom.get(l.to)
            if (!a || !b) return null
            const x1 = a.x + a.w
            const y1 = a.y + a.h / 2
            const x2 = b.x
            const y2 = b.y + b.h / 2
            const mid = x1 + (x2 - x1) / 2
            return (
              <path
                key={`${l.from}->${l.to}`}
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={l.win ? 'var(--color-radiant)' : 'var(--color-dire)'}
                strokeWidth={1.5}
                opacity={0.45}
              />
            )
          })}
        </svg>

        {model.rounds.map((round) => (
          <section
            key={round.round}
            className="flex-1 flex flex-col gap-3"
            style={{ minWidth: COL_MIN, maxWidth: COL_MAX }}
          >
            <h4 className="text-[11px] uppercase tracking-[0.12em] text-text-dim flex items-baseline gap-2 flex-wrap">
              Round {round.round}
              {/* Kick-off slots of the round — the only time a projected bucket has, since
                  its contents are a pool of teams rather than scheduled series. */}
              {round.slots.length > 0 && (
                <span className="font-mono text-[9px] normal-case tracking-normal tabular-nums text-text-dim">
                  {round.slots.map((t) => format(new Date(t * 1000), 'HH:mm')).join(' · ')}
                </span>
              )}
              {/* Flagged while any game in the round is still undrawn — whether that is
                  the whole round or only the tail of one already under way. */}
              {(!round.seeded || round.buckets.some((b) => b.nodes.length < (b.seriesCount ?? 0))) && (
                <span className="text-[9px] normal-case tracking-normal">
                  {round.projected ? 'projected' : 'not seeded'}
                </span>
              )}
            </h4>

            {round.buckets.map((bucket) => (
              <div
                key={bucket.key}
                ref={(el) => {
                  const key = `${round.round}:${bucket.key}`
                  if (el) boxRefs.current.set(key, el)
                  else boxRefs.current.delete(key)
                }}
                // Dashed while nothing in the bucket has been drawn yet — the outline is
                // per bucket, not per round, because a round is seeded a few games at a time.
                className={
                  'relative rounded-[10px] border bg-surface p-1.5 ' +
                  (bucket.nodes.length > 0 ? 'border-border' : 'border-dashed border-border')
                }
              >
                {/* One bucket in a round means every team is on the same record — round 1,
                    where a "0-0" chip says nothing the column header has not said. */}
                {round.buckets.length > 1 && (
                  <div className="flex items-center gap-2 px-1 pb-1.5">
                    <span className="font-mono text-[10px] tabular-nums text-text-muted">
                      {bucket.wins !== null ? `${bucket.wins}-${bucket.losses}` : 'mixed'}
                    </span>
                    <span className="flex-1 h-px bg-border" />
                    <span className="text-[9px] text-text-dim tabular-nums">
                      {bucket.bye ? 'no game' : (bucket.seriesCount ?? bucket.nodes.length)}
                    </span>
                  </div>
                )}
                {/* Drawn pairings first, then whoever is still waiting for one — a bucket
                    mid-draw legitimately holds both. */}
                {bucket.nodes.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {bucket.nodes.map((n) => (
                      <MatchRow
                        key={n.nodeId}
                        node={n}
                        teamNames={teamNames}
                        leagueId={leagueId}
                        hovered={hovered}
                        onHover={setHovered}
                        livePairs={livePairs}
                        seriesWins={seriesWins}
                      />
                    ))}
                  </div>
                )}
                {bucket.pool && bucket.pool.length > 0 && (
                  <PoolList pool={bucket.pool} teamNames={teamNames} hovered={hovered} onHover={setHovered} />
                )}
              </div>
            ))}
          </section>
        ))}

        {model.outcomes.length > 0 && (
          <section className="flex-1 flex flex-col gap-3" style={{ minWidth: COL_MIN, maxWidth: COL_MAX }}>
            <h4 className="text-[11px] uppercase tracking-[0.12em] text-text-dim flex items-baseline gap-2">
              Stage over
              <span className="text-[9px] normal-case tracking-normal">no games left</span>
            </h4>
            {/* Green and red only where the stage itself settled it — see
                decidedThresholds. A record between the two thresholds gets no colour: those
                teams are through to whatever this stage feeds, and calling 2-3 "eliminated"
                would have been wrong for exactly the teams it matters most for. */}
            <div className="rounded-[10px] border border-border bg-surface p-1.5">
              <div className="flex flex-col gap-0.5">
                {model.outcomes.map((o) => {
                  const team = teamNames.get(o.teamId)
                  const tone =
                    o.verdict === 'advanced' ? 'radiant' : o.verdict === 'eliminated' ? 'dire' : null
                  return (
                    <div
                      key={o.teamId}
                      className={
                        'flex items-center gap-1.5 px-1.5 py-1 rounded-[5px] transition-opacity ' +
                        (hovered === null || hovered === o.teamId ? '' : 'opacity-30')
                      }
                      style={tone ? { background: `var(--color-${tone}-soft)` } : undefined}
                      onMouseEnter={() => setHovered(o.teamId)}
                      onMouseLeave={() => setHovered(null)}
                      title={
                        (o.standing !== null ? `Placed ${o.standing} in the stage` : '') +
                        (o.verdict ? ` — ${o.verdict}` : '')
                      }
                    >
                      {o.standing !== null && (
                        <span className="font-mono text-[10px] tabular-nums text-text-dim w-3 shrink-0">
                          {o.standing}
                        </span>
                      )}
                      <TeamLogo src={team?.logoUrl} name={team?.name ?? undefined} size={16} />
                      <span
                        className="truncate text-[11px]"
                        style={{ color: tone ? `var(--color-${tone})` : 'var(--color-text)' }}
                      >
                        {team?.tag || team?.name || o.teamId}
                      </span>
                      <span className="ml-auto font-mono text-[11px] tabular-nums text-text-muted">
                        {o.wins}-{o.losses}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
