import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import HeroPlayerGrid from './HeroPlayerGrid'
import { COL, NAME_MIN_PX } from './playerColumns'

afterEach(cleanup)

// Regression cover for the 2026-08-11 layout break: the row needed 436px inside a 377px card, so
// the LH/DN column was clipped and the name column — the only elastic one — collapsed to 0px,
// hiding every player name. jsdom does not lay out, so these assert the geometry contract that
// produced it rather than pixels: the header must mirror the row, and the name must have a floor.

const player = (over: Record<string, unknown> = {}) => ({
  account_id: 1,
  hero_id: 1,
  name: 'Player One',
  team: 0,
  kills: 5,
  death: 2,
  assists: 9,
  net_worth: 21254,
  level: 23,
  gpm: 624,
  xpm: 863,
  lh: 382,
  dn: 14,
  ...over,
})

function widthsOf(el: Element): number[] {
  return [...el.children]
    .map((c) => parseFloat((c as HTMLElement).style.width))
    .filter((w) => !Number.isNaN(w))
}

describe('HeroPlayerGrid column geometry', () => {
  it('gives the header the same column widths as the data rows, in the same order', () => {
    const { container } = render(
      <HeroPlayerGrid
        radiantPlayers={[player({ account_id: 1 })]}
        direPlayers={[player({ account_id: 2, name: 'Player Two' })]}
        isLoading={false}
      />,
    )

    const header = container.querySelector('.mb-1')!
    const row = [...container.querySelectorAll('div')].find(
      (d) => (d as HTMLElement).style.minHeight === '52px',
    )!

    // A header that drifts from its row silently mislabels a panel full of numbers.
    expect(widthsOf(header)).toEqual(widthsOf(row))
  })

  it('holds the name column above zero so a row can never show stats for nobody', () => {
    const { container } = render(
      <HeroPlayerGrid radiantPlayers={[player()]} direPlayers={[]} isLoading={false} />,
    )
    const row = [...container.querySelectorAll('div')].find(
      (d) => (d as HTMLElement).style.minHeight === '52px',
    )!
    const nameCol = row.children[1] as HTMLElement

    expect(nameCol.style.minWidth).toBe(`${NAME_MIN_PX}px`)
    expect(screen.getByText('Player One')).toBeTruthy()
  })

  it('space-gates the optional columns instead of letting them overflow the card', () => {
    const { container } = render(
      <HeroPlayerGrid radiantPlayers={[player()]} direPlayers={[]} isLoading={false} />,
    )
    const row = [...container.querySelectorAll('div')].find(
      (d) => (d as HTMLElement).style.minHeight === '52px',
    )!

    // Each optional column carries a container-query variant; without one it would render
    // unconditionally and clip, which is exactly what happened before.
    const optional = [...row.children].filter((c) =>
      [COL.gpm, COL.xpm, COL.lhdn].includes(parseFloat((c as HTMLElement).style.width) as never),
    )
    expect(optional.length).toBe(3)
    for (const col of optional) {
      expect(col.className).toContain('hidden')
      expect(col.className).toMatch(/@min-\[\d+px\]:/)
    }
  })

  it('keeps the query root — the variants above match nothing without it', () => {
    const { container } = render(
      <HeroPlayerGrid radiantPlayers={[player()]} direPlayers={[]} isLoading={false} />,
    )
    expect(container.firstElementChild?.className).toContain('@container')
  })

  it('omits a column entirely when the upstream carries no data for it', () => {
    const { container } = render(
      <HeroPlayerGrid
        radiantPlayers={[player({ gpm: undefined, xpm: undefined, lh: undefined, dn: undefined })]}
        direPlayers={[]}
        isLoading={false}
      />,
    )
    const row = [...container.querySelectorAll('div')].find(
      (d) => (d as HTMLElement).style.minHeight === '52px',
    )!
    // Portrait, name, LVL, K/D/A, NW only — draft-phase payloads have no per-minute stats.
    expect(row.children.length).toBe(5)
  })
})
