import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import SwissFlow, { buildSwissModel, decidedThresholds, seriesScoreOf, seriesTimeLabel } from './SwissFlow'
import type { BracketNode } from '../hooks/useArchive'
import type { TeamLookup } from './SeriesNodeCard'

/**
 * TI 2026's Swiss stage exactly as GetLeagueData publishes it: 39 nodes, 16 teams,
 * five rounds, the last of which Valve has not seeded yet.
 *
 * It is the payload that makes every shortcut fail, which is why it is the fixture:
 * round 1 is split across two kick-off slots ("Match 1.A" at 04:00 and "Match 1.B" at
 * 07:00) so grouping by time invents a sixth round, and the final round is seven
 * placeholder nodes across two slots so counting slots invents a seventh.
 */
const raw: Array<[number, string, number | null, number | null, number, number, boolean, boolean, number]> = [
  [1, 'Match 1.A', 9247354, 10150538, 2, 1, true, true, 1786586400],
  [2, 'Match 2.A', 10150413, 10136357, 2, 0, true, true, 1786586400],
  [3, 'Match 3.A', 8255888, 2586976, 2, 0, true, true, 1786586400],
  [4, 'Match 4.A', 9572001, 5017210, 2, 1, true, true, 1786586400],
  [5, 'Match 1.B', 7119388, 8261500, 2, 0, true, true, 1786597200],
  [6, 'Match 2.B', 2163, 726228, 2, 0, true, true, 1786597200],
  [7, 'Match 3.B', 9467224, 9964962, 2, 0, true, true, 1786597200],
  [8, 'Match 4.B', 9823272, 10149530, 2, 0, true, true, 1786597200],
  [28, 'Match 5.A', 9572001, 9247354, 2, 1, true, true, 1786608000],
  [29, 'Match 6.A', 8255888, 10150413, 2, 1, true, true, 1786608000],
  [30, 'Match 7.A', 10150538, 5017210, 2, 1, true, true, 1786608000],
  [31, 'Match 8.A', 10136357, 2586976, 2, 0, true, true, 1786608000],
  [32, 'Match 5.B', 7119388, 9467224, 2, 0, true, true, 1786672800],
  [33, 'Match 6.B', 9823272, 2163, 1, 2, true, true, 1786672800],
  [34, 'Match 7.B', 8261500, 9964962, 0, 2, true, true, 1786672800],
  [35, 'Match 8.B', 10149530, 726228, 1, 2, true, true, 1786672800],
  [36, 'Match 9.A', 8255888, 9572001, 0, 2, true, true, 1786683600],
  [37, 'Match 10.A', 10150413, 9247354, 2, 1, true, true, 1786683600],
  [38, 'Match 11.A', 10150538, 10136357, 0, 2, true, true, 1786683600],
  [39, 'Match 12.A', 5017210, 2586976, 2, 0, true, true, 1786683600],
  [40, 'Match 9.B', 2163, 7119388, 1, 2, true, true, 1786694400],
  [41, 'Match 10.B', 9467224, 9823272, 2, 1, true, true, 1786694400],
  [42, 'Match 11.B', 726228, 9964962, 2, 1, true, true, 1786694400],
  [43, 'Match 12.B', 8261500, 10149530, 2, 0, true, true, 1786694400],
  [44, 'Match 13', 2586976, 10149530, 2, 1, true, true, 1786759200],
  [45, 'Match 14', 10150538, 8261500, 2, 1, true, true, 1786759200],
  [46, 'Match 15', 9247354, 9964962, 2, 1, true, true, 1786759200],
  [47, 'Match 16', 5017210, 9823272, 1, 2, true, true, 1786759200],
  [48, 'Match 17', 7119388, 9572001, 0, 0, false, true, 1786770000],
  [49, 'Match 18', 10150413, 2163, 0, 0, false, true, 1786770000],
  [50, 'Match 19', 8255888, 9467224, 0, 0, false, true, 1786770000],
  [51, 'Match 20', 10136357, 726228, 0, 0, false, true, 1786770000],
  [52, 'Match 21', null, null, 0, 0, false, false, 1786780800],
  [53, 'Match 22', null, null, 0, 0, false, false, 1786780800],
  [54, 'Match 23', null, null, 0, 0, false, false, 1786780800],
  [55, 'Match 24', null, null, 0, 0, false, false, 1786780800],
  [56, 'Match 25', null, null, 0, 0, false, false, 1786791600],
  [57, 'Match 26', null, null, 0, 0, false, false, 1786791600],
  [58, 'Match 27', null, null, 0, 0, false, false, 1786791600],
]

const SWISS: BracketNode[] = raw.map(([nodeId, name, t1, t2, w1, w2, done, started, time]) => ({
  nodeId,
  nodeGroupId: 2,
  nodeGroupName: 'Swiss',
  name,
  team1Id: t1,
  team2Id: t2,
  team1Wins: w1,
  team2Wins: w2,
  seriesId: done ? nodeId * 1000 : null,
  nodeType: 2,
  bestOf: 3,
  scheduledTime: time,
  actualTime: null,
  isCompleted: done,
  hasStarted: started,
  winningNodeId: null,
  incomingNodeId1: null,
  incomingNodeId2: null,
}))

const shape = (round: { buckets: Array<{ key: string; nodes: unknown[]; seriesCount?: number }> }) =>
  round.buckets.map((b) => `${b.key}:${b.seriesCount ?? b.nodes.length}`)

/**
 * The stage as it ended: round 5 drawn the way Valve drew it, every series decided.
 *
 * The seven round-5 pairings cover fourteen teams. VSN (4-0) and HU (0-4) are absent — the
 * organiser scheduled them nothing, which is the only place the stage's thresholds appear.
 */
const ROUND_5: Record<number, [number, number]> = {
  52: [5017210, 8261500],
  53: [2586976, 9964962],
  54: [10150538, 726228],
  55: [8255888, 9247354],
  56: [2163, 9467224],
  57: [10136357, 7119388],
  58: [9823272, 10150413],
}

/**
 * Round 4's four live series, decided the way they actually were.
 *
 * It matters which side won: VSN taking node 48 is what makes them the 4-0 the stage then
 * stops scheduling. Completing these by rote — "team 1 wins" — flipped that and quietly
 * moved the threshold the whole verdict is read from.
 */
const ROUND_4_RESULT: Record<number, [number, number]> = {
  48: [0, 2], // TSpirit – VSN
  49: [0, 2], // IW – Liquid
  50: [0, 2], // BB – Aurora
  51: [2, 0], // NGX – VG
}

const FINISHED: BracketNode[] = SWISS.map((n) => {
  const pair = ROUND_5[n.nodeId]
  const base = pair ? { ...n, team1Id: pair[0], team2Id: pair[1] } : n
  if (base.isCompleted) return base
  const [w1, w2] = ROUND_4_RESULT[n.nodeId] ?? [2, 0]
  return { ...base, isCompleted: true, hasStarted: true, team1Wins: w1, team2Wins: w2 }
})

describe('buildSwissModel — leftover slots are not a round', () => {
  /**
   * Taken from the owner's live archive on 2026-08-15, after the Swiss stage had finished.
   *
   * Valve publishes a Swiss stage with more node slots than it needs. When the stage ends,
   * the unused ones are marked completed and started — and left with no teams in them.
   * The real payload for TI 2026 held 47 Swiss nodes: 39 real pairings across five rounds,
   * and eight of these:
   *
   *   node 59..66 | no name | scheduled 1786811785 | is_completed true | has_started true
   *               | team_1_id NULL | team_2_id NULL
   *
   * They landed in the unseeded tail, which packs leftovers into rounds by size, and seven
   * of them opened a column headed "Round 6" over a five-round stage that was already over.
   * The owner saw it on screen and asked where round six came from.
   */
  const SPENT_SLOTS: BracketNode[] = Array.from({ length: 8 }, (_, i) => ({
    nodeId: 59 + i,
    name: null,
    nodeGroupId: null,
    nodeGroupName: 'Swiss',
    team1Id: null,
    team2Id: null,
    team1Wins: null,
    team2Wins: null,
    seriesId: null,
    nodeType: 2,
    bestOf: 3,
    scheduledTime: 1786811785,
    actualTime: null,
    isCompleted: true,
    hasStarted: true,
    winningNodeId: null,
    incomingNodeId1: null,
    incomingNodeId2: null,
  }))

  it('does not invent a sixth round out of slots Valve closed empty', () => {
    const { rounds } = buildSwissModel([...FINISHED, ...SPENT_SLOTS])
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5])
  })

  it('leaves the real rounds untouched by their presence', () => {
    const before = buildSwissModel(FINISHED)
    const after = buildSwissModel([...FINISHED, ...SPENT_SLOTS])
    expect(after.rounds.map((r) => r.round)).toEqual(before.rounds.map((r) => r.round))
    expect(after.rounds.map((r) => r.buckets.reduce((n, b) => n + b.nodes.length, 0))).toEqual(
      before.rounds.map((r) => r.buckets.reduce((n, b) => n + b.nodes.length, 0)),
    )
  })

  it('still shows a placeholder round that has NOT been played', () => {
    // The distinction the fix rests on: an unplayed slot is not completed. Round 5 of the
    // unfinished fixture is exactly that, and it must keep its column.
    const { rounds } = buildSwissModel(SWISS)
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5])
    expect(rounds[4].seeded).toBe(false)
  })
})

describe('buildSwissModel', () => {
  it('derives five rounds from games played, not from kick-off slots', () => {
    const { rounds } = buildSwissModel(SWISS)
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5])
    // Eight games a round, except the last where two teams already sit out.
    expect(rounds.map((r) => r.buckets.reduce((n, b) => n + (b.seriesCount ?? b.nodes.length), 0))).toEqual([
      8, 8, 8, 8, 7,
    ])
  })

  it('keeps a round split across two broadcast slots as one round', () => {
    const { rounds } = buildSwissModel(SWISS)
    const first = rounds[0].buckets.flatMap((b) => b.nodes.map((n) => n.nodeId))
    // 1.A-4.A kick off at 04:00 and 1.B-4.B at 07:00; all eight are round 1.
    expect(first).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('buckets each round by the record both teams carry into it', () => {
    const { rounds } = buildSwissModel(SWISS)
    expect(shape(rounds[0])).toEqual(['0-0:8'])
    expect(shape(rounds[1])).toEqual(['1-0:4', '0-1:4'])
    expect(shape(rounds[2])).toEqual(['2-0:2', '1-1:4', '0-2:2'])
    expect(shape(rounds[3])).toEqual(['3-0:1', '2-1:3', '1-2:3', '0-3:1'])
  })

  it('packs the unseeded tail into one round rather than one per slot', () => {
    const { rounds } = buildSwissModel(SWISS)
    // Four placeholders at 21:00 and three at 00:00 — seven games, one round, not two.
    expect(rounds).toHaveLength(5)
    expect(rounds[4].seeded).toBe(false)
    expect(rounds[4].buckets.reduce((n, b) => n + (b.seriesCount ?? b.nodes.length), 0)).toBe(7)
  })

  it('counts a started-but-undecided series towards the round, not the record', () => {
    const { rounds, records } = buildSwissModel(SWISS)
    // Match 17-20 are round 4 and in progress, so their teams still show three results.
    expect(rounds[3].buckets.flatMap((b) => b.nodes.map((n) => n.nodeId))).toContain(48)
    expect(records.get(7119388)).toEqual({ wins: 3, losses: 0 })
    expect(records.get(9572001)).toEqual({ wins: 3, losses: 0 })
  })

  it('claims nobody has advanced or been eliminated while a round is unseeded', () => {
    // The thresholds are Valve's and unpublished; with a placeholder round outstanding any
    // team could still be drawn into it, so no verdict is a fact yet.
    expect(buildSwissModel(SWISS).outcomes).toEqual([])
  })

  it('reads the stage thresholds off the teams it stopped scheduling', () => {
    // TI 2026 left exactly two teams out of round 5: the 4-0 and the 0-4. That is the
    // organiser stating where the stage ends, without publishing a rule anywhere.
    const { records } = buildSwissModel(FINISHED)
    const tallies = [...records.values()].map((r) => ({ ...r, games: r.wins + r.losses }))
    expect(decidedThresholds(tallies)).toEqual({ clinchWins: 4, elimLosses: 4 })
  })

  it('claims no threshold when nobody was ever left out', () => {
    expect(decidedThresholds([{ wins: 2, losses: 1, games: 3 }, { wins: 1, losses: 2, games: 3 }])).toEqual({
      clinchWins: null,
      elimLosses: null,
    })
  })

  it('counts a team finished when it has no unplayed game left, win or lose', () => {
    // Every published pairing decided: the whole field is finished, including the teams
    // that played the last round and LOST it. Asking instead whether a team held a game in
    // the final round only ever caught the byes, and dropped OG and XG, who finished 1-4
    // having played all five.
    const done = buildSwissModel(FINISHED).outcomes
    expect(done).toHaveLength(16)
    expect(done.some((o) => o.wins < o.losses)).toBe(true)
    expect(done.some((o) => o.wins > o.losses)).toBe(true)

    // Four losses is out however late it arrives — a team that played the final round and
    // lost it lands on the same record as the one that was left out a round earlier.
    for (const o of done.filter((x) => x.losses >= 4)) expect(o.verdict).toBe('eliminated')
    for (const o of done.filter((x) => x.wins >= 4)) expect(o.verdict).toBe('advanced')
    // Three losses is not four: those teams carry on into whatever the stage feeds.
    for (const o of done.filter((x) => x.wins < 4 && x.losses < 4)) expect(o.verdict).toBeNull()
  })

  it('carries the placement Valve published and orders by it', () => {
    const played = SWISS.filter((n) => n.team1Id !== null).map((n) =>
      n.isCompleted ? n : { ...n, isCompleted: true, team1Wins: 2, team2Wins: 0 },
    )
    const standings = new Map<number, number>([[9572001, 1], [7119388, 2]])
    const done = buildSwissModel(played, standings).outcomes
    expect(done[0].teamId).toBe(9572001)
    expect(done[0].standing).toBe(1)
    expect(done[1].standing).toBe(2)
    // A team Valve has not ranked still appears, just after the ranked ones.
    expect(done.at(-1)?.standing).toBeNull()
  })

  it('projects the unseeded round from the round before it', () => {
    const { rounds } = buildSwissModel(SWISS)
    const five = rounds[4]
    expect(five.projected).toBe(true)
    // Every round-4 series sends one team up and one down whatever the result, so the
    // sizes are fixed while four of those series are still being played: 4-0 and 0-4 hold
    // one team each and nobody to play, the rest pair inside their record.
    expect(five.buckets.map((b) => `${b.key}:${b.seriesCount}`)).toEqual([
      '4-0:0',
      '3-1:2',
      '2-2:3',
      '1-3:2',
      '0-4:0',
    ])
    expect(five.buckets.filter((b) => b.bye).map((b) => b.key)).toEqual(['4-0', '0-4'])
    // Seven series, which is exactly what Valve published for the round.
    expect(five.buckets.reduce((n, b) => n + (b.seriesCount ?? 0), 0)).toBe(7)
  })

  it('separates settled teams from the ones still playing for their record', () => {
    const { rounds } = buildSwissModel(SWISS)
    const bucket = (key: string) => rounds[4].buckets.find((b) => b.key === key)!

    // Round 4's 1-2 and 0-3 series are decided, so 1-3 is entirely settled: the three
    // teams that lost out of 1-2 plus the one that won out of 0-3.
    const settled = bucket('1-3')
      .pool!.filter((p) => !p.contingentOn)
      .map((p) => p.teamId)
      .sort()
    expect(settled).toEqual([2586976, 5017210, 8261500, 9964962].sort())

    // 3-1 is the opposite: every seat depends on a series still being played — three won
    // out of 2-1, one lost out of 3-0 — so no team can be named yet.
    const pending = bucket('3-1').pool!
    expect(pending.length).toBeGreaterThan(0)
    expect(pending.every((p) => p.contingentOn !== null)).toBe(true)

    // Whoever wins into 3-1 is the same team that would lose into 2-2.
    const down = bucket('2-2').pool!
    for (const p of pending.filter((x) => x.contingentOn!.wins)) {
      expect(down.some((d) => d.teamId === p.teamId && d.contingentOn?.wins === false)).toBe(true)
    }
  })

  it('keeps a half-drawn round in one column instead of opening a phantom next one', () => {
    // Valve seeds a round a few pairings at a time. Three of round 5's seven games have
    // teams here; the other four are still placeholders and belong to the same round.
    // The three pairings Valve actually drew first, each a distinct pair of teams that
    // have all played four games — so all three belong to round 5.
    const drawn: Record<number, [number, number]> = {
      52: [5017210, 8261500],
      53: [2586976, 9964962],
      54: [10150538, 726228],
    }
    const partial = SWISS.map((n) =>
      drawn[n.nodeId] ? { ...n, team1Id: drawn[n.nodeId][0], team2Id: drawn[n.nodeId][1] } : n,
    )
    const { rounds } = buildSwissModel(partial)
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5])
    expect(rounds[4].projected).toBe(true)
    // Seven games in the round however they are split between drawn and undrawn.
    expect(rounds[4].buckets.reduce((n, b) => n + (b.seriesCount ?? b.nodes.length), 0)).toBe(7)
  })

  it('names nobody finished while part of a round is still undrawn', () => {
    // The dangerous case: a half-drawn round IS seeded, so a check on `seeded` alone
    // declared teams eliminated while they sat in a pool waiting for a pairing.
    const partial = SWISS.map((n) =>
      n.nodeId === 52 ? { ...n, team1Id: 5017210, team2Id: 8261500 } : n,
    )
    expect(buildSwissModel(partial).outcomes).toEqual([])
  })

  it('drops the projection when pairing by record does not reproduce the published size', () => {
    // Valve publishes eight placeholders where pairing inside a record yields seven. The
    // round is drawn some other way, so nothing is claimed about it.
    const wrongSize = SWISS.concat({ ...SWISS[38], nodeId: 59, name: 'Match 28' })
    const { rounds } = buildSwissModel(wrongSize)
    const last = rounds[rounds.length - 1]
    expect(last.projected).toBeUndefined()
    expect(last.buckets.map((b) => b.key)).toEqual(['tbd'])
  })

  it('refuses to project past a round whose own teams are unpublished', () => {
    // Two blank rounds in a row: the first cannot be walked forward, so neither is claimed.
    const blank = SWISS.filter((n) => n.nodeId < 44)
    const { rounds } = buildSwissModel(blank.concat(SWISS.slice(32)))
    expect(rounds.filter((r) => r.projected).length).toBeLessThanOrEqual(1)
  })

  it('leaves a mismatched pairing unlabelled instead of picking one side', () => {
    // A down-float: a 1-0 team drawn against a 0-1 one. Neither record describes the
    // bucket, so it must not claim either.
    const odd = SWISS.slice(0, 8).concat({
      ...SWISS[8],
      nodeId: 900,
      team1Id: 9247354, // won Match 1.A, so 1-0
      team2Id: 10150538, // lost it, so 0-1
      isCompleted: false,
    })
    const { rounds } = buildSwissModel(odd)
    expect(rounds[1].buckets.map((b) => b.key)).toEqual(['mixed'])
  })
})

describe('seriesScoreOf', () => {
  const node = { team1Id: 9823272, team2Id: 10150413, team1Wins: 0, team2Wins: 0, seriesId: 1130665 }

  it('uses our own decided maps while Valve still reports nothing', () => {
    // The reported case: a map ended 16-37, the archive had its winner, and the bracket
    // node still read 0-0.
    const decided = new Map([[1130665, new Map([[10150413, 1]])]])
    expect(seriesScoreOf(node, decided)).toEqual({ team1: 0, team2: 1 })
  })

  it('keeps the node score when it is the one further ahead', () => {
    // The mirror case: Valve has counted a map whose replay we have not parsed yet.
    expect(seriesScoreOf({ ...node, team1Wins: 2 }, new Map())).toEqual({ team1: 2, team2: 0 })
  })

  it('never lets a score go backwards', () => {
    const behind = new Map([[1130665, new Map([[9823272, 1]])]])
    expect(seriesScoreOf({ ...node, team1Wins: 2, team2Wins: 1 }, behind)).toEqual({ team1: 2, team2: 1 })
  })

  it('falls back to the node when the series is unknown to us', () => {
    expect(seriesScoreOf({ ...node, seriesId: null, team2Wins: 1 })).toEqual({ team1: 0, team2: 1 })
  })
})

describe('seriesTimeLabel', () => {
  // TI 2026's 10:00 slot, which actually started at 11:33 and was still being played at 12:41.
  const SLOT = 1786780800 // 10:00 local
  const STARTED = 1786786380 // 11:33 local
  const NOW = 1786790506 // 12:41 local

  it('says nothing about a series that has already begun', () => {
    // It has a score by then; the clock answers "when do I come back", nothing else.
    expect(seriesTimeLabel({ scheduledTime: SLOT, actualTime: STARTED, hasStarted: true }, NOW)).toBeNull()
    expect(seriesTimeLabel({ scheduledTime: SLOT, actualTime: null, hasStarted: true }, NOW)).toBeNull()
  })

  it('flags a slot that has passed with nobody having played it', () => {
    // The bug as reported: "match at 10:00" shown at 12:41. Valve never revises
    // scheduled_time, so the only honest move is to say the plan has slipped.
    expect(seriesTimeLabel({ scheduledTime: SLOT, actualTime: null, hasStarted: false }, NOW)).toEqual({
      at: SLOT,
      late: true,
    })
  })

  it('leaves a genuinely upcoming slot alone', () => {
    const later = NOW + 3600
    expect(seriesTimeLabel({ scheduledTime: later, actualTime: null, hasStarted: false }, NOW)).toEqual({
      at: later,
      late: false,
    })
  })

  it('never calls a series late while the live feed is showing it', () => {
    // The bracket learns hasStarted minutes after the fact — TI 2026 had a series live at
    // 13:44 whose node still read false, and it was announced as running late.
    expect(seriesTimeLabel({ scheduledTime: SLOT, actualTime: null, hasStarted: false }, NOW, true)).toBeNull()
  })

  it('says nothing when there is no time at all', () => {
    expect(seriesTimeLabel({ scheduledTime: null, actualTime: null, hasStarted: false }, NOW)).toBeNull()
  })
})

describe('SwissFlow', () => {
  const teamNames: TeamLookup = new Map([
    [9247354, { name: 'Team Falcons', tag: 'Falcons', logoUrl: null }],
    [10150538, { name: 'LGD Gaming', tag: 'LGD', logoUrl: null }],
  ])

  const renderFlow = () =>
    render(
      <MemoryRouter>
        <SwissFlow nodes={SWISS} teamNames={teamNames} leagueId="19719" />
      </MemoryRouter>,
    )

  it('labels every round and marks the unseeded one', () => {
    renderFlow()
    for (const r of [1, 2, 3, 4, 5]) expect(screen.getByText(`Round ${r}`)).toBeTruthy()
    // Round 5 has no teams but its buckets are derived, so it says so rather than
    // presenting itself as unknown.
    expect(screen.getByText('projected')).toBeTruthy()
    expect(screen.queryByText('not seeded')).toBeNull()
  })

  it('shows record chips only where a round holds more than one', () => {
    renderFlow()
    // Round 1 is a single 0-0 bucket; a chip there says nothing the header has not.
    expect(screen.queryByText('0-0')).toBeNull()
    expect(screen.getByText('1-0')).toBeTruthy()
    expect(screen.getByText('3-0')).toBeTruthy()
  })

  it('links a played series to its maps', () => {
    renderFlow()
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toContain('/series/1000')
  })

  it('shows the projected round as record buckets rather than anonymous placeholders', () => {
    renderFlow()
    for (const record of ['4-0', '3-1', '2-2', '1-3', '0-4']) {
      expect(screen.getByText(record)).toBeTruthy()
    }
    // The two teams with nobody left on their record are called out, not silently dropped.
    expect(screen.getAllByText('no game')).toHaveLength(2)
  })
})
