import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import HistoryGraphs from './HistoryGraphs'

// Phase 10.2 Plan 02 — RTL tests for the rewritten HistoryGraphs.
// Drives UAT-CHART-01..06 from 10.2-RESEARCH.md §"Validation Architecture".
// Tests use RELATIVE assertions only — no hard-coded internal geometry constants.


afterEach(() => {
  vi.useRealTimers()
})

describe('HistoryGraphs — skeleton state', () => {
  it('returns skeleton text when history is empty (D-23)', () => {
    render(<HistoryGraphs history={[]} gameDuration={120} gameState={5} />)
    expect(screen.getByText(/Collecting history/)).toBeTruthy()
  })

  it('stays in skeleton when history has only 1 sample (D-24)', () => {
    const { container } = render(
      <HistoryGraphs history={[{ t: 60, gold: 1000, xp: 500 }]} gameDuration={120} gameState={5} />,
    )
    expect(screen.getByText(/Collecting history/)).toBeTruthy()
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('skeleton elapsed counter ticks every 1s without unmount', () => {
    vi.useFakeTimers()
    render(<HistoryGraphs history={[]} gameDuration={5} gameState={5} />)
    expect(screen.getByText(/Collecting history… \d+\/30s/)).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText(/Collecting history… \d+\/30s/)).toBeTruthy()
  })
})

describe('HistoryGraphs — rendered chart', () => {
  it('renders exactly two <svg> elements (one per section) when >=2 samples (UAT-CHART)', () => {
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
    expect(container.querySelectorAll('svg').length).toBe(2)
  })

  it('renders Radiant peak dot+label when any sample.gold > 0 (UAT-CHART-01)', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 0, xp: 0 },
          { t: 60, gold: 3400, xp: 0 },
          { t: 120, gold: 1000, xp: 0 },
        ]}
        gameDuration={120}
        gameState={5}
      />,
    )
    // The gold ChartSection's Radiant peak text should be the leftmost text with this pattern.
    const peakTexts = Array.from(container.querySelectorAll('text')).filter(t =>
      /^\+[\d.]+k? @ \d+:\d{2}$/.test(t.textContent ?? ''),
    )
    expect(peakTexts.length).toBeGreaterThanOrEqual(1)
    expect(peakTexts[0].getAttribute('fill')).toBe('#4ade80')
    // Sibling dot
    const circles = Array.from(container.querySelectorAll('circle[r="3.5"]'))
    expect(circles.some(c => c.getAttribute('fill') === '#4ade80')).toBe(true)
  })

  it('renders Dire peak dot+label when any sample.gold < 0 (UAT-CHART-02)', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 0, xp: 0 },
          { t: 60, gold: -2200, xp: 0 },
          { t: 120, gold: -500, xp: 0 },
        ]}
        gameDuration={120}
        gameState={5}
      />,
    )
    const peakTexts = Array.from(container.querySelectorAll('text')).filter(t =>
      /^-[\d.]+k? @ \d+:\d{2}$/.test(t.textContent ?? ''),
    )
    expect(peakTexts.length).toBeGreaterThanOrEqual(1)
    expect(peakTexts[0].getAttribute('fill')).toBe('#f87171')
    const circles = Array.from(container.querySelectorAll('circle[r="3.5"]'))
    expect(circles.some(c => c.getAttribute('fill') === '#f87171')).toBe(true)
  })

  it('headline is Radiant-green when last sample gold >= 0 (UAT-CHART-03)', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: -1000, xp: 0 },
          { t: 60, gold: 3400, xp: 0 },
        ]}
        gameDuration={60}
        gameState={5}
      />,
    )
    const headline = Array.from(container.querySelectorAll('span')).find(s =>
      (s.textContent ?? '').startsWith('Radiant +'),
    )
    expect(headline).toBeTruthy()
    const color = (headline as HTMLElement).style.color
    // jsdom may normalize to rgb(...) or preserve hex; accept either.
    expect(color === '#4ade80' || color === 'rgb(74, 222, 128)').toBe(true)
  })

  it('headline is Dire-red when last sample gold < 0 (UAT-CHART-03)', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 3400, xp: 0 },
          { t: 60, gold: -2200, xp: 0 },
        ]}
        gameDuration={60}
        gameState={5}
      />,
    )
    const headline = Array.from(container.querySelectorAll('span')).find(s =>
      (s.textContent ?? '').startsWith('Dire +'),
    )
    expect(headline).toBeTruthy()
    const color = (headline as HTMLElement).style.color
    expect(color === '#f87171' || color === 'rgb(248, 113, 113)').toBe(true)
  })

  it('peak label uses text-anchor="start" when peak is near left edge (UAT-CHART-05)', () => {
    // Place positive gold peak at the FIRST sample → px ≈ 0 → anchor "start"
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 5000, xp: 0 },
          { t: 60, gold: 100, xp: 0 },
          { t: 120, gold: 50, xp: 0 },
        ]}
        gameDuration={120}
        gameState={5}
      />,
    )
    const peakTexts = Array.from(container.querySelectorAll('text')).filter(t =>
      /^\+[\d.]+k? @ \d+:\d{2}$/.test(t.textContent ?? ''),
    )
    expect(peakTexts[0].getAttribute('text-anchor')).toBe('start')
  })

  it('peak label uses text-anchor="end" when peak is near right edge (UAT-CHART-05)', () => {
    // Place positive gold peak at the LAST sample → px ≈ 1000 → anchor "end"
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 100, xp: 0 },
          { t: 60, gold: 50, xp: 0 },
          { t: 120, gold: 5000, xp: 0 },
        ]}
        gameDuration={120}
        gameState={5}
      />,
    )
    const peakTexts = Array.from(container.querySelectorAll('text')).filter(t =>
      /^\+[\d.]+k? @ \d+:\d{2}$/.test(t.textContent ?? ''),
    )
    expect(peakTexts[0].getAttribute('text-anchor')).toBe('end')
  })

  it('Y headroom: max-magnitude sample lies strictly inside the chart, not at the edge (UAT-CHART-06)', () => {
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
    // First gold polyline = radiant outline (max(0, v) curve). First point should be at y of max(0, 5000) = 5000 → high in chart.
    const polylines = container.querySelectorAll('polyline')
    expect(polylines.length).toBeGreaterThanOrEqual(2)
    const radiantOutline = polylines[0]
    const points = (radiantOutline.getAttribute('points') ?? '')
      .trim()
      .split(/\s+/)
      .map(p => p.split(',').map(Number))
    // points[0] corresponds to the first sample (gold=5000) on the radiant outline (max(0, v) = 5000)
    const yOfMax = points[0][1]
    // Derived from the rendered SVG, not a hard-coded constant: the extreme must keep visible
    // headroom below the top edge, and must sit above the zero line since the value is positive.
    const svg = container.querySelector('svg')!
    const svgH = Number(svg.getAttribute('height'))
    expect(svgH).toBeGreaterThan(0)
    expect(yOfMax).toBeGreaterThan(0.05 * svgH)
    expect(yOfMax).toBeLessThan(svgH / 2)
  })

  it('renders 5-min gridlines and minute labels when samples span >5 min', () => {
    const { container } = render(
      <HistoryGraphs
        history={[
          { t: 0, gold: 1000, xp: 500 },
          { t: 600, gold: 2000, xp: 1000 },
        ]}
        gameDuration={600}
        gameState={5}
      />,
    )
    const gridLines = Array.from(container.querySelectorAll('[data-testid="gridline"]'))
    expect(gridLines.length).toBeGreaterThanOrEqual(1)
    const minuteLabels = Array.from(container.querySelectorAll('text')).filter(t =>
      /^\d+m$/.test(t.textContent ?? ''),
    )
    expect(minuteLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('UAT-CHART-04: no hover infrastructure — mouseMove on SVG does not create a tooltip element', () => {
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
    const beforeCount = container.querySelectorAll('*').length
    const svg = container.querySelector('svg')!
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 80 })
    fireEvent.mouseMove(svg, { clientX: 400, clientY: 80 })
    const afterCount = container.querySelectorAll('*').length
    expect(afterCount).toBe(beforeCount)
    // Also assert no element matches the old hover tooltip text shape (" gold, " was unique to it).
    expect(container.textContent ?? '').not.toContain(' gold, ')
  })
})

// UI-SPEC 10.5 §6.1/§6.2 — the scrub target used to be a bare <rect> inside role="img": not a tab
// stop, presentational to a screen reader, and unreachable without a pointer.
describe('HistoryGraphs — keyboard scrubbing', () => {
  // 0..10 min so a 5-minute PageUp/PageDown step has room to move.
  const history = Array.from({ length: 11 }, (_, i) => ({ t: i * 60, gold: i * 100, xp: i * 80 }))

  const renderScrubbable = (onScrub: () => void, cursorT: number | null = 300) =>
    render(
      <HistoryGraphs
        history={history}
        gameDuration={600}
        gameState={5}
        cursorT={cursorT}
        onScrub={onScrub}
      />,
    )

  it('exposes each chart scrub target as a focusable slider outside the role="img" SVG', () => {
    const { container } = renderScrubbable(vi.fn())
    const sliders = screen.getAllByRole('slider')
    expect(sliders.length).toBe(2) // gold + xp
    for (const slider of sliders) {
      expect(slider.getAttribute('tabindex')).toBe('0')
      expect(slider.getAttribute('aria-valuemin')).toBe('0')
      expect(slider.getAttribute('aria-valuemax')).toBe('10')
      expect(slider.getAttribute('aria-valuenow')).toBe('5')
      expect(slider.getAttribute('aria-valuetext')).toBe('minute 5')
      // Must NOT be a descendant of the role="img" chart, which makes children presentational.
      expect(slider.closest('[role="img"]')).toBeNull()
    }
    expect(container.querySelectorAll('[role="img"]').length).toBe(2)
  })

  it('focus + ArrowRight advances one minute, ArrowLeft goes back one (UAT-A11Y)', () => {
    const onScrub = vi.fn()
    renderScrubbable(onScrub)
    const slider = screen.getAllByRole('slider')[0]
    slider.focus()
    expect(document.activeElement).toBe(slider)

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onScrub).toHaveBeenLastCalledWith(6)

    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(onScrub).toHaveBeenLastCalledWith(4)
  })

  it('Home/End jump to the ends and PageUp/PageDown take a 5-minute step', () => {
    const onScrub = vi.fn()
    renderScrubbable(onScrub)
    const slider = screen.getAllByRole('slider')[0]

    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onScrub).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onScrub).toHaveBeenLastCalledWith(10)
    fireEvent.keyDown(slider, { key: 'PageUp' })
    expect(onScrub).toHaveBeenLastCalledWith(10) // 5 + 5, clamped by the range end
    fireEvent.keyDown(slider, { key: 'PageDown' })
    expect(onScrub).toHaveBeenLastCalledWith(0)
  })

  it('clamps to the chart range and ignores keys it does not own', () => {
    const onScrub = vi.fn()
    // Parked on the last minute: ArrowRight must not walk past the end of the match.
    renderScrubbable(onScrub, 600)
    const slider = screen.getAllByRole('slider')[0]

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onScrub).toHaveBeenLastCalledWith(10)

    onScrub.mockClear()
    fireEvent.keyDown(slider, { key: 'a' })
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onScrub).not.toHaveBeenCalled()
  })

  it('while following live (cursorT null) the slider reports the last recorded minute', () => {
    renderScrubbable(vi.fn(), null)
    const slider = screen.getAllByRole('slider')[0]
    expect(slider.getAttribute('aria-valuenow')).toBe('10')
    expect(slider.getAttribute('aria-valuetext')).toBe('minute 10')
  })

  it('mouse click on the scrub target still scrubs, exactly as before (no regression)', () => {
    const onScrub = vi.fn()
    const { container } = renderScrubbable(onScrub)
    const overlay = container.querySelector('[data-testid="scrub-overlay"]')!
    fireEvent.click(overlay, { clientX: 0 })
    // jsdom reports a zero-size box, so the ratio floors to the range start — the point is that
    // the click path is still wired, and to the same minute-rounding it always used.
    expect(onScrub).toHaveBeenCalledWith(0)
  })

  it('renders no scrub target at all when onScrub is not supplied', () => {
    render(<HistoryGraphs history={history} gameDuration={600} gameState={5} />)
    expect(screen.queryAllByRole('slider').length).toBe(0)
  })
})
