import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import PlayoffBracket from './PlayoffBracket'
import type { BracketNode } from '../hooks/useArchive'

/**
 * The real TI 2026 playoff topology, straight out of GetLeagueData: a 14-node double
 * elimination tree whose nodes Valve leaves entirely unnamed. Everything a reader sees on
 * a card — the round it belongs to and where its teams come from — is derived here, so
 * this is the test that keeps the derivation honest.
 */
const node = (over: Partial<BracketNode> & { nodeId: number }): BracketNode => ({
  nodeGroupId: 5,
  nodeGroupName: 'Playoff',
  name: null,
  team1Id: null,
  team2Id: null,
  team1Wins: null,
  team2Wins: null,
  seriesId: null,
  nodeType: 2,
  bestOf: 3,
  scheduledTime: null,
  actualTime: null,
  isCompleted: false,
  hasStarted: false,
  winningNodeId: null,
  incomingNodeId1: null,
  incomingNodeId2: null,
  ...over,
})

const TI_PLAYOFF: BracketNode[] = [
  node({ nodeId: 14, winningNodeId: 18 }),
  node({ nodeId: 15, winningNodeId: 18 }),
  node({ nodeId: 16, winningNodeId: 19 }),
  node({ nodeId: 17, winningNodeId: 19 }),
  node({ nodeId: 18, incomingNodeId1: 14, incomingNodeId2: 15, winningNodeId: 20 }),
  node({ nodeId: 19, incomingNodeId1: 16, incomingNodeId2: 17, winningNodeId: 20 }),
  node({ nodeId: 20, incomingNodeId1: 18, incomingNodeId2: 19, winningNodeId: 21 }),
  node({ nodeId: 21, incomingNodeId1: 20, incomingNodeId2: 27, nodeType: 3, bestOf: 5 }),
  node({ nodeId: 22, incomingNodeId1: 14, incomingNodeId2: 15, winningNodeId: 24 }),
  node({ nodeId: 23, incomingNodeId1: 16, incomingNodeId2: 17, winningNodeId: 25 }),
  node({ nodeId: 24, incomingNodeId1: 19, incomingNodeId2: 22, winningNodeId: 26 }),
  node({ nodeId: 25, incomingNodeId1: 18, incomingNodeId2: 23, winningNodeId: 26 }),
  node({ nodeId: 26, incomingNodeId1: 24, incomingNodeId2: 25, winningNodeId: 27 }),
  node({ nodeId: 27, incomingNodeId1: 20, incomingNodeId2: 26, winningNodeId: 21 }),
]

const renderBracket = (nodes = TI_PLAYOFF) =>
  render(
    <MemoryRouter>
      <PlayoffBracket nodes={nodes} teamNames={new Map()} />
    </MemoryRouter>,
  )

describe('PlayoffBracket', () => {
  it('splits the graph into upper, lower and grand final', () => {
    renderBracket()
    expect(screen.getByText('Upper bracket')).toBeTruthy()
    expect(screen.getByText('Lower bracket')).toBeTruthy()
    expect(screen.getByText('Grand final')).toBeTruthy()
  })

  it('names upper rounds by distance from the final, indexed within the round', () => {
    renderBracket()
    for (const letter of ['A', 'B', 'C', 'D']) {
      expect(screen.getByText(`UB Quarterfinal ${letter}`)).toBeTruthy()
    }
    expect(screen.getByText('UB Semifinal A')).toBeTruthy()
    expect(screen.getByText('UB Semifinal B')).toBeTruthy()
    expect(screen.getByText('UB Final')).toBeTruthy()
    expect(screen.getByText('Grand Final')).toBeTruthy()
  })

  it('numbers lower rounds instead — a lower round of two is not a semifinal', () => {
    renderBracket()
    expect(screen.getByText('LB Round 1 A')).toBeTruthy()
    expect(screen.getByText('LB Round 1 B')).toBeTruthy()
    expect(screen.getByText('LB Round 2 A')).toBeTruthy()
    expect(screen.getByText('LB Round 3')).toBeTruthy()
    expect(screen.getByText('LB Final')).toBeTruthy()
    expect(screen.queryByText(/LB Quarterfinal/)).toBeNull()
  })

  it('never falls back to a raw node id when the round is known', () => {
    renderBracket()
    // "Match 22" would read as the tournament's 22nd game. It is the first lower-bracket one.
    expect(screen.queryByText(/^Match \d+$/)).toBeNull()
  })

  it('labels cross-bracket feeds per slot, not twice on the same card', () => {
    renderBracket()
    // The first lower round is fed only by upper-bracket losers, one per slot.
    expect(screen.getByText('Loser of UB QF A')).toBeTruthy()
    expect(screen.getByText('Loser of UB QF B')).toBeTruthy()
    expect(screen.getByText('Loser of UB QF C')).toBeTruthy()
    expect(screen.getByText('Loser of UB QF D')).toBeTruthy()
    // A slot whose feed is drawn as a connector carries no label.
    expect(screen.getAllByText('Loser of UB SF A')).toHaveLength(1)
    expect(screen.getAllByText('Loser of UB SF B')).toHaveLength(1)
  })

  it('calls a winner a winner and a loser a loser', () => {
    renderBracket()
    // Both grand-final slots arrive by winning; the lower final also takes the UB final's loser.
    expect(screen.getByText('Winner of UB Final')).toBeTruthy()
    expect(screen.getByText('Winner of LB Final')).toBeTruthy()
    expect(screen.getByText('Loser of UB Final')).toBeTruthy()
  })

  it('renders nothing when there is no bracket', () => {
    const { container } = renderBracket([])
    expect(container.innerHTML).toBe('')
  })
})
