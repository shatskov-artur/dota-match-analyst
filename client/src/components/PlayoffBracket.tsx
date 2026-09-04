import { memo, useMemo } from 'react'
import type { BracketNode } from '../hooks/useArchive'
import SeriesNodeCard, { NODE_CARD_H, NODE_CARD_W, type TeamLookup } from './SeriesNodeCard'

/**
 * A real double-elimination bracket, laid out from Valve's own node graph.
 *
 * Valve gives every node `incoming_node_id_1/2` plus `winning_node_id` / `losing_node_id`,
 * which is a complete description of the tree — TI 2026's playoff is 14 nodes: an upper
 * bracket of 7, a lower bracket of 6 and a Bo5 grand final.
 *
 * Layout is computed, not hand-placed: leaves get evenly spaced slots and every parent
 * sits at the mean of its children, which is what makes the connector lines meet. That
 * also means it adapts to any bracket shape rather than only TI's.
 *
 * Cross-bracket drops (a team losing in the upper bracket falls into the lower one) are
 * NOT drawn as lines. They would cross the whole diagram and make it unreadable; the
 * receiving slot is labelled with where the team comes from instead, which is what
 * printed brackets do.
 */

export interface PlayoffBracketProps {
  nodes: BracketNode[]
  teamNames: TeamLookup
}

const CARD_W = NODE_CARD_W
const CARD_H = NODE_CARD_H
const COL_GAP = 56
const ROW_GAP = 18
const SLOT_H = CARD_H + ROW_GAP

type Bracket = 'upper' | 'lower' | 'final'

interface Placed {
  node: BracketNode
  bracket: Bracket
  col: number
  /** Vertical slot, in units of SLOT_H. Fractional for parents. */
  slot: number
  /** Children drawn with a connector — same bracket, immediately preceding column. */
  drawnChildren: number[]
  /**
   * Placeholder per SLOT, aligned to incoming_node_id_1 / _2 — not a flat list.
   * Indexing a flat list by [0] and [length-1] made both slots of a node with a single
   * cross-bracket feed read "Loser of #19", twice.
   * null means the connector already shows where the team comes from.
   */
  slotLabels: [string | null, string | null]
  /** Round name for the card header, e.g. "UB Quarterfinal A". */
  title: string
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * What to call a round, given its distance from the end of its own bracket.
 *
 * Only the upper bracket is a plain single-elimination tree, so only there do
 * "quarterfinal" and "semifinal" mean what they say — a lower-bracket round of two is
 * not a semifinal. Lower rounds are numbered, which is how the broadcast talks about them.
 *
 * The short form exists because it also has to fit inside another card as
 * "Loser of UB QF A", where the slot is about 160px wide.
 */
function roundNames(bracket: Bracket, col: number, lastCol: number): { long: string; short: string } {
  if (bracket === 'final') return { long: 'Grand Final', short: 'Grand Final' }
  const p = bracket === 'upper' ? 'UB' : 'LB'
  const fromEnd = lastCol - col
  if (fromEnd === 0) return { long: `${p} Final`, short: `${p} Final` }
  if (bracket === 'upper' && fromEnd === 1) return { long: 'UB Semifinal', short: 'UB SF' }
  if (bracket === 'upper' && fromEnd === 2) return { long: 'UB Quarterfinal', short: 'UB QF' }
  return { long: `${p} Round ${col + 1}`, short: `${p} R${col + 1}` }
}

/**
 * Splits the graph into upper / lower / final and assigns each node a column.
 *
 * "Upper" is everything reachable from a seed (a node with no incoming links) by
 * following winner edges only. The terminal node — the one whose winner goes nowhere —
 * is the grand final. Everything else arrives via a loser edge, so it is the lower bracket.
 */
function place(nodes: BracketNode[]): Placed[] {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const incoming = (n: BracketNode) => [n.incomingNodeId1, n.incomingNodeId2].filter((x): x is number => !!x && byId.has(x))

  const seeds = nodes.filter((n) => incoming(n).length === 0)
  const terminal = nodes.find((n) => !n.winningNodeId || !byId.has(n.winningNodeId))

  const upper = new Set<number>()
  for (const s of seeds) {
    let cur: BracketNode | undefined = s
    while (cur && cur.nodeId !== terminal?.nodeId) {
      upper.add(cur.nodeId)
      const next: number | null = cur.winningNodeId
      cur = next && byId.has(next) ? byId.get(next) : undefined
    }
  }

  const bracketOf = (n: BracketNode): Bracket =>
    n.nodeId === terminal?.nodeId ? 'final' : upper.has(n.nodeId) ? 'upper' : 'lower'

  // Column = longest chain of same-bracket ancestors. Memoised depth-first; the graph is
  // acyclic by construction (a winner always advances forward).
  const depth = new Map<number, number>()
  const depthOf = (n: BracketNode): number => {
    const cached = depth.get(n.nodeId)
    if (cached !== undefined) return cached
    depth.set(n.nodeId, 0) // cycle guard
    const sameBracket = incoming(n)
      .map((id) => byId.get(id)!)
      .filter((c) => bracketOf(c) === bracketOf(n))
    const d = sameBracket.length === 0 ? 0 : Math.max(...sameBracket.map((c) => depthOf(c) + 1))
    depth.set(n.nodeId, d)
    return d
  }
  for (const n of nodes) depthOf(n)

  // Slots: leaves of each bracket stack in order, parents centre on their drawn children.
  const slot = new Map<number, number>()
  const assign = (list: BracketNode[]) => {
    let next = 0
    const walk = (n: BracketNode): number => {
      const cached = slot.get(n.nodeId)
      if (cached !== undefined) return cached
      slot.set(n.nodeId, next) // cycle guard
      const kids = incoming(n)
        .map((id) => byId.get(id)!)
        .filter((c) => bracketOf(c) === bracketOf(n) && depth.get(c.nodeId)! < depth.get(n.nodeId)!)
      const s = kids.length === 0 ? next++ : kids.map(walk).reduce((a, b) => a + b, 0) / kids.length
      slot.set(n.nodeId, s)
      return s
    }
    // Deepest first so leaves claim their slots in reading order.
    for (const n of [...list].sort((a, b) => depth.get(a.nodeId)! - depth.get(b.nodeId)! || a.nodeId - b.nodeId)) {
      walk(n)
    }
  }
  assign(nodes.filter((n) => bracketOf(n) === 'upper'))
  assign(nodes.filter((n) => bracketOf(n) === 'lower'))

  // Round names. Valve leaves every playoff node's `name` blank, so without this the
  // cards read "Match 14" … "Match 27" — node ids, which no viewer counts in.
  const lastCol = new Map<Bracket, number>()
  for (const n of nodes) {
    const b = bracketOf(n)
    lastCol.set(b, Math.max(lastCol.get(b) ?? 0, depth.get(n.nodeId) ?? 0))
  }
  const rounds = new Map<string, BracketNode[]>()
  for (const n of nodes) {
    const key = `${bracketOf(n)}:${depth.get(n.nodeId) ?? 0}`
    if (!rounds.has(key)) rounds.set(key, [])
    rounds.get(key)!.push(n)
  }
  const named = new Map<number, { long: string; short: string }>()
  for (const [key, members] of rounds) {
    const b = key.split(':')[0] as Bracket
    const col = Number(key.split(':')[1])
    const { long, short } = roundNames(b, col, lastCol.get(b) ?? col)
    members
      .sort((a, c) => (slot.get(a.nodeId) ?? 0) - (slot.get(c.nodeId) ?? 0) || a.nodeId - c.nodeId)
      .forEach((m, i) => {
        const suffix = members.length > 1 ? ` ${LETTERS[i] ?? i + 1}` : ''
        named.set(m.nodeId, { long: long + suffix, short: short + suffix })
      })
  }
  // Valve's own name wins when it bothers to publish one (it does for Swiss, not here).
  const refOf = (n: BracketNode) => n.name?.trim() || named.get(n.nodeId)?.short || `Match ${n.nodeId}`

  return nodes.map((n) => {
    const b = bracketOf(n)
    const kids = incoming(n).map((id) => byId.get(id)!)
    const drawn = kids.filter((c) => bracketOf(c) === b && depth.get(c.nodeId)! < depth.get(n.nodeId)!)
    const drawnIds = new Set(drawn.map((c) => c.nodeId))

    // Slot i is fed by incoming_node_id_(i+1). Keep that correspondence so the label
    // lands on the row the team will actually occupy.
    const labelFor = (sourceId: number | null): string | null => {
      if (!sourceId) return null
      const c = byId.get(sourceId)
      if (!c || drawnIds.has(sourceId)) return null
      return c.winningNodeId === n.nodeId ? `Winner of ${refOf(c)}` : `Loser of ${refOf(c)}`
    }

    return {
      node: n,
      bracket: b,
      col: depth.get(n.nodeId) ?? 0,
      slot: b === 'final' ? 0 : (slot.get(n.nodeId) ?? 0),
      drawnChildren: drawn.map((c) => c.nodeId),
      slotLabels: [labelFor(n.incomingNodeId1), labelFor(n.incomingNodeId2)],
      title: n.name?.trim() || named.get(n.nodeId)?.long || `Match ${n.nodeId}`,
    }
  })
}

function BracketSection({
  label,
  placed,
  teamNames,
}: {
  label: string
  placed: Placed[]
  teamNames: TeamLookup
}) {
  if (placed.length === 0) return null

  const cols = Math.max(...placed.map((p) => p.col)) + 1
  const maxSlot = Math.max(...placed.map((p) => p.slot))
  const width = cols * CARD_W + (cols - 1) * COL_GAP
  const height = (maxSlot + 1) * SLOT_H
  const xOf = (col: number) => col * (CARD_W + COL_GAP)
  const yOf = (s: number) => s * SLOT_H
  const byId = new Map(placed.map((p) => [p.node.nodeId, p]))

  return (
    <section>
      <h3 className="text-label uppercase tracking-label text-text-dim mb-3">{label}</h3>
      <div className="relative" style={{ width, height }}>
        {/* Connectors first so cards paint over the line ends. */}
        <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden="true">
          {placed.flatMap((p) =>
            p.drawnChildren.map((childId) => {
              const c = byId.get(childId)
              if (!c) return null
              const x1 = xOf(c.col) + CARD_W
              const y1 = yOf(c.slot) + CARD_H / 2
              const x2 = xOf(p.col)
              const y2 = yOf(p.slot) + CARD_H / 2
              const mid = x1 + COL_GAP / 2
              return (
                <polyline
                  key={`${p.node.nodeId}-${childId}`}
                  points={`${x1},${y1} ${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
              )
            }),
          )}
        </svg>

        {placed.map((p) => (
          <SeriesNodeCard
            key={p.node.nodeId}
            node={p.node}
            teamNames={teamNames}
            slotLabels={p.slotLabels}
            title={p.title}
            className="absolute"
            style={{ left: xOf(p.col), top: yOf(p.slot), width: CARD_W, height: CARD_H }}
          />
        ))}
      </div>
    </section>
  )
}

function PlayoffBracket({ nodes, teamNames }: PlayoffBracketProps) {
  const placed = useMemo(() => (nodes.length > 0 ? place(nodes) : []), [nodes])
  if (placed.length === 0) return null

  return (
    // Wide content scrolls inside its own box; the page never scrolls sideways.
    <div className="overflow-x-auto -mx-1 px-1 pb-2 scroll-slim">
      {/* One gap value for every section, so the tree does not sit at a different
          distance from the grand final than from the group stages around it. */}
      <div className="min-w-min flex flex-col gap-8">
        <BracketSection
          label="Upper bracket"
          placed={placed.filter((p) => p.bracket === 'upper')}
          teamNames={teamNames}
        />
        <BracketSection
          label="Lower bracket"
          placed={placed.filter((p) => p.bracket === 'lower')}
          teamNames={teamNames}
        />
        <BracketSection
          label="Grand final"
          placed={placed.filter((p) => p.bracket === 'final')}
          teamNames={teamNames}
        />
      </div>
    </div>
  )
}

// Lays out the whole tree and draws its connectors. The tournament page shares the
// 30-second ['live-games'] poll, which has nothing to say about a bracket.
export default memo(PlayoffBracket)
