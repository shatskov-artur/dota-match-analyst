import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MatchEventFeed from './MatchEventFeed'
import { useTimelineCursor } from '../store/timelineCursor'
import type { MatchEvent, TimelineRow } from '../hooks/useArchive'

let nextId = 1
const ev = (over: Partial<MatchEvent>): MatchEvent => ({
  id: nextId++,
  t: 600,
  type: 'kill',
  team: null,
  payload: null,
  source: 'live',
  ...over,
})

const row = (minute: number, gold: number): TimelineRow => ({
  minute,
  radiantGoldAdv: gold,
  radiantXpAdv: 0,
  radiantScore: null,
  direScore: null,
  radiantTowers: null,
  direTowers: null,
  roshanKills: null,
  winProbGold: null,
  winProbEstimate: null,
  source: 'live',
})

const feed = (
  events: MatchEvent[],
  timeline: TimelineRow[] = [],
  extra: { newestFirst?: boolean; heroOwners?: Map<number, { player: string | null; tag: string | null; side: 0 | 1 }> } = {},
) =>
  render(
    <MatchEventFeed events={events} timeline={timeline} radiantName="Radiant FC" direName="Dire FC" {...extra} />,
  )

/** Radiant heroes 1-2, Dire heroes 11-12 — enough for the opposing-side filter to bite. */
const ROSTER = new Map<number, { player: string | null; tag: string | null; side: 0 | 1 }>([
  [1, { player: 'Lina', tag: 'RAD', side: 0 }],
  [2, { player: 'Axe', tag: 'RAD', side: 0 }],
  [11, { player: 'Puck', tag: 'DIR', side: 1 }],
  [12, { player: 'Bane', tag: 'DIR', side: 1 }],
])

beforeEach(() => {
  nextId = 1
  useTimelineCursor.setState({ minute: 'live', playing: false, matchId: null })
})

/**
 * Row text as a reader sees it. Kill and building rows now carry hero portraits and team
 * crests between the words, so a sentence is split across several elements and getByText
 * cannot match it — but the wording being checked is unchanged.
 */
const feedText = () => screen.getByTestId('match-event-feed').textContent ?? ''

describe('MatchEventFeed — source precedence', () => {
  it('hides the coarse live rows once precise replay rows exist', () => {
    // Both paths report the same moment at different times; showing both would list one
    // event twice.
    feed([
      ev({ t: 600, type: 'kill', source: 'live', payload: { victimHeroId: 1 } }),
      ev({ t: 612, type: 'kill', source: 'opendota', payload: { victimHero: 'npc_dota_hero_axe', killerHeroId: 2 } }),
    ])
    expect(feedText()).toMatch(/Axe/)
    expect(screen.getByText('10:12')).toBeTruthy()
    expect(screen.queryByText('10:00')).toBeNull()
  })

  it('keeps live rows when nothing precise has arrived yet', () => {
    feed([ev({ t: 600, type: 'kill', source: 'live', payload: { victimName: 'someone' } })])
    expect(screen.getByText('10:00')).toBeTruthy()
    expect(screen.getByText(/live · 30s resolution/)).toBeTruthy()
  })

  it('keeps types only one path produces, such as the draft aegis pickup', () => {
    feed([
      ev({ t: 100, type: 'aegis', source: 'opendota' }),
      ev({ t: 200, type: 'first_blood', source: 'opendota' }),
    ])
    expect(screen.getByText('Aegis picked up')).toBeTruthy()
    // "First blood" is both the type label and the description, hence getAllByText.
    expect(screen.getAllByText('First blood').length).toBeGreaterThan(0)
  })
})

describe('MatchEventFeed — descriptions', () => {
  it('names killer and victim when the replay attributed the kill', () => {
    feed([ev({ type: 'kill', source: 'opendota', payload: { victimHero: 'npc_dota_hero_shadow_fiend', killerHeroId: 5 } })])
    expect(feedText()).toMatch(/killed\s*Shadow Fiend/)
  })

  it('names the killer when the live window holds exactly one', () => {
    // One counter moved against one death: the pairing is not a guess.
    feed([ev({ type: 'kill', source: 'live', payload: { victimName: 'Puck', killers: [{ playerName: 'Lina' }] } })])
    expect(feedText()).toMatch(/Lina\s*killed\s*Puck/)
  })

  it('narrows a window to the killer using the side that cannot have done it', () => {
    // The window credits a kill to one player from each side. A dead Dire hero can only
    // have been killed by the Radiant one, so the row resolves to a single attribution.
    const killers = [{ heroId: 1, playerName: 'Lina' }, { heroId: 11, playerName: 'Puck' }]
    feed(
      [
        ev({ t: 262, payload: { victimHeroId: 12, victimName: 'Bane', victimTeam: 1, killers } }),
        ev({ t: 262, payload: { victimHeroId: 2, victimName: 'Axe', victimTeam: 0, killers } }),
      ],
      [],
      { heroOwners: ROSTER },
    )
    const text = feedText()
    // One row per death, each naming exactly one killer — and never a team-mate. The names
    // sit directly either side of "killed": had the filter not bitten, the row would read
    // "Lina or Puck killed Bane" instead.
    expect(text).toMatch(/RAD\s*Lina\s*killed\s*DIR\s*Bane/)
    expect(text).toMatch(/DIR\s*Puck\s*killed\s*RAD\s*Axe/)
  })

  it('offers both candidates rather than picking when two opponents scored', () => {
    const killers = [{ heroId: 1, playerName: 'Lina' }, { heroId: 2, playerName: 'Axe' }]
    feed([ev({ t: 262, payload: { victimHeroId: 11, victimName: 'Puck', victimTeam: 1, killers } })], [], {
      heroOwners: ROSTER,
    })
    expect(feedText()).toMatch(/RAD\s*Lina\s*or\s*RAD\s*Axe\s*killed\s*DIR\s*Puck/)
  })

  it('says only that a hero died when nobody was credited', () => {
    // A tower or the creeps took it; no kill counter moved.
    feed([ev({ payload: { victimHeroId: 11, victimName: 'Puck', victimTeam: 1, killers: [] } })], [], {
      heroOwners: ROSTER,
    })
    expect(feedText()).toMatch(/Puck\s*died/)
  })

  it('names the assists separately so a support is not read as the killer', () => {
    feed([
      ev({
        payload: {
          victimName: 'Puck',
          killers: [{ playerName: 'Lina' }],
          assisters: [{ playerName: 'Crystal Maiden' }],
        },
      }),
    ])
    // "killed" now comes from the crossed-swords mark's <title>, which textContent keeps.
    expect(feedText()).toMatch(/Lina\s*killed\s*Puck\s*assists\s*Crystal Maiden/)
  })

  it('spells out which building fell', () => {
    feed([ev({ type: 'tower', source: 'opendota', payload: { side: 'dire', lane: 'mid', tier: 'T2' } })])
    expect(feedText()).toMatch(/Dire FC\s*lost mid T2/)
  })

  it('handles the live tier spelling as well as the replay one', () => {
    feed([ev({ type: 'tower', source: 'live', payload: { side: 'radiant', lane: 'top', tier: 'tier1' } })])
    expect(feedText()).toMatch(/Radiant FC\s*lost top T1/)
  })

  it('reads barracks from either payload shape', () => {
    feed([
      ev({ t: 600, type: 'barracks', source: 'live', payload: { side: 'radiant', lane: 'top', kind: 'meleeRax' } }),
    ])
    expect(feedText()).toMatch(/Radiant FC\s*lost top melee barracks/)
  })

  it('prices a teamfight from the gold lead two minutes later', () => {
    // A teamfight is now a framed block: the window, the verdict, and the kills inside it.
    feed(
      [ev({ t: 600, type: 'teamfight', source: 'opendota', payload: { from: 600, to: 640, radiantDeaths: 1, direDeaths: 4 } })],
      [row(10, 1000), row(12, 8000)],
    )
    const block = screen.getByTestId('teamfight-block').textContent ?? ''
    expect(block).toMatch(/10:00–10:40/)
    expect(block).toMatch(/Radiant FC\s*\+7\.0k/)
    // Read as kills and led by the winner: four Dire deaths are four Radiant kills, so
    // Radiant is named first and its margin spelled out.
    expect(block).toMatch(/kills\s*Radiant FC\s*4\s*–\s*1\s*Dire FC/)
    expect(block).toMatch(/Radiant FC up 3/)
  })

  it('still shows a teamfight when the gold window is missing', () => {
    feed([ev({ t: 600, type: 'teamfight', source: 'opendota', payload: { from: 600, to: 640, deaths: 5 } })], [])
    // No gold rows to price it with, but the fight itself is still on the page.
    expect(screen.getByTestId('teamfight-block').textContent).toMatch(/Teamfight/)
    expect(screen.getByTestId('teamfight-block').textContent).toMatch(/10:00–10:40/)
  })
})

describe('MatchEventFeed — interaction and filtering', () => {
  it('clicking a row parks the timeline on that minute', () => {
    feed([ev({ t: 905, type: 'roshan', source: 'live', payload: { killNumber: 2 } })])
    fireEvent.click(screen.getByText(/Roshan killed/))
    expect(useTimelineCursor.getState().minute).toBe(15)
  })

  it('leaves draft picks and bans out — they belong to the draft panel', () => {
    const { container } = feed([ev({ t: -1000, type: 'pick', source: 'opendota' })])
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing at all when there is nothing to show', () => {
    const { container } = feed([])
    expect(container.firstChild).toBeNull()
  })

  it('runs oldest first, so time reads downwards like the match was played', () => {
    feed([
      ev({ t: 60, type: 'roshan', source: 'live', payload: { killNumber: 1 } }),
      ev({ t: 600, type: 'roshan', source: 'live', payload: { killNumber: 2 } }),
    ])
    const times = screen.getAllByText(/^\d+:\d\d$/).map((n) => n.textContent)
    expect(times).toEqual(['1:00', '10:00'])
  })

  it('can still be flipped for a live match', () => {
    feed([
      ev({ t: 60, type: 'roshan', source: 'live', payload: { killNumber: 1 } }),
      ev({ t: 600, type: 'roshan', source: 'live', payload: { killNumber: 2 } }),
    ], [], { newestFirst: true })
    expect(screen.getAllByText(/^\d+:\d\d$/).map((n) => n.textContent)).toEqual(['10:00', '1:00'])
  })
})
