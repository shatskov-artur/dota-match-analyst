import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import HistoryGraphs from './HistoryGraphs'

// Phase 10 Plan 03 — co-located RTL tests for HistoryGraphs.
// Drives D-04, D-17, D-22, D-23, D-24 from 10-CONTEXT.md.

afterEach(() => {
  vi.useRealTimers()
})

function mockBCR<T extends Element>(el: T, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = (() => ({
    width: 640,
    height: 160,
    top: 0,
    left: 0,
    right: 640,
    bottom: 160,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  })) as never
}

describe('HistoryGraphs', () => {
  it('returns skeleton text when history is empty (D-23)', () => {
    render(<HistoryGraphs history={[]} gameDuration={120} gameState={5} />)
    expect(screen.getByText(/Накапливаем историю/)).toBeTruthy()
  })

  it('stays in skeleton when history has only 1 sample (D-24)', () => {
    const { container } = render(
      <HistoryGraphs history={[{ t: 60, gold: 1000, xp: 500 }]} gameDuration={120} gameState={5} />,
    )
    expect(screen.getByText(/Накапливаем историю/)).toBeTruthy()
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('skeleton elapsed counter ticks every 1s without unmount', () => {
    vi.useFakeTimers()
    render(<HistoryGraphs history={[]} gameDuration={5} gameState={5} />)
    expect(screen.getByText(/Накапливаем историю… \(\d+\/30с\)/)).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    // After 2s, skeleton still mounted and counter regex still matches.
    expect(screen.getByText(/Накапливаем историю… \(\d+\/30с\)/)).toBeTruthy()
  })

  it('with >=2 samples renders 2 polyline elements (one per chart)', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 1000, xp: 500 },
          { t: 60, gold: 2000, xp: 1000 },
        ]}
        gameDuration={60}
        gameState={5}
      />,
    )
    expect(container.querySelectorAll('polyline').length).toBe(2)
  })

  it('shows XP lead (approx.) disclosure label (D-17)', () => {
    render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 1000, xp: 500 },
          { t: 60, gold: 2000, xp: 1000 },
        ]}
        gameDuration={60}
        gameState={5}
      />,
    )
    expect(screen.getByText(/XP lead/)).toBeTruthy()
  })

  it('symmetric Y — positive gold sample lies above midline; negative below', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 5000, xp: 0 },
          { t: 60, gold: -5000, xp: 0 },
        ]}
        gameDuration={60}
        gameState={5}
      />,
    )
    const goldPolyline = container.querySelector('polyline')!
    const points = goldPolyline.getAttribute('points')!
    // Each "x,y" pair separated by space.
    const parts = points.trim().split(/\s+/).map(p => p.split(',').map(Number))
    // Midline computation matches component: yMid = (H - PAD_T - PAD_B)/2 + PAD_T = (160-12-24)/2 + 12 = 74
    const yMid = 74
    // First sample is gold:+5000 — must be above midline (smaller y in SVG coords).
    expect(parts[0][1]).toBeLessThan(yMid)
    // Second sample is gold:-5000 — must be below midline.
    expect(parts[1][1]).toBeGreaterThan(yMid)
  })

  it('Y-axis label uses one-decimal Xk format (D-04)', () => {
    render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 12345, xp: 1000 },
          { t: 60, gold: 12345, xp: 1000 },
        ]}
        gameDuration={60}
        gameState={5}
      />,
    )
    // "12.3k" appears for both top & bottom labels of the gold chart.
    const labels = screen.getAllByText('12.3k')
    expect(labels.length).toBeGreaterThanOrEqual(1)
  })

  it('X-axis ticks use MM:SS format', () => {
    render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 1000, xp: 500 },
          { t: 600, gold: 2000, xp: 1000 },
        ]}
        gameDuration={600}
        gameState={5}
      />,
    )
    // Should render at least one tick label like "5:00" or "10:00".
    const ticks = screen.getAllByText(/^\d+:\d{2}$/)
    expect(ticks.length).toBeGreaterThanOrEqual(1)
  })

  it('mouseMove on gold chart shows tooltip with Radiant prefix when nearest.gold >= 0', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 1000, xp: 500 },
          { t: 60, gold: 2000, xp: 1000 },
        ]}
        gameDuration={60}
        gameState={5}
      />,
    )
    const wrapper = container.querySelector('section')!
    mockBCR(wrapper, { width: 800, height: 400 })
    const svg = container.querySelector('svg')!
    mockBCR(svg, { width: 640, left: 0, top: 0 })
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 80 })
    expect(screen.getByText(/\d+:\d{2} — Radiant \+\d+\.\dk gold, \+\d+\.\dk xp/)).toBeTruthy()
  })

  it('mouseMove tooltip swaps to Dire prefix when nearest.gold < 0', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: -1000, xp: -500 },
          { t: 60, gold: -2000, xp: -1000 },
        ]}
        gameDuration={60}
        gameState={5}
      />,
    )
    const wrapper = container.querySelector('section')!
    mockBCR(wrapper, { width: 800, height: 400 })
    const svg = container.querySelector('svg')!
    mockBCR(svg, { width: 640 })
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 80 })
    expect(screen.getByText(/Dire \+\d+\.\dk gold/)).toBeTruthy()
  })

  it('mouseLeave clears the tooltip', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 1000, xp: 500 },
          { t: 60, gold: 2000, xp: 1000 },
        ]}
        gameDuration={60}
        gameState={5}
      />,
    )
    const wrapper = container.querySelector('section')!
    mockBCR(wrapper, { width: 800, height: 400 })
    const svg = container.querySelector('svg')!
    mockBCR(svg, { width: 640 })
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 80 })
    expect(screen.queryByText(/Radiant \+|Dire \+/)).not.toBeNull()
    fireEvent.mouseLeave(svg)
    expect(screen.queryByText(/Radiant \+|Dire \+/)).toBeNull()
  })
})
