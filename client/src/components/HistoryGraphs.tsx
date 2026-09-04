import { memo, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'

// Gold / XP lead over match time — two small multiples in one panel.
// NO chart library (D-25). Pure SVG primitives.
// Visual language from sketch 001-C: line + soft fill + static peak labels, symmetric Y, no hover.
// Canonical spec: .claude/skills/sketch-findings-dota-stats/references/charts-data-viz.md
//
// REDESIGN 2026-08-11 — three defects the sketch spec did not survive contact with:
//
//  1. The spec's `viewBox="0 0 1000 200"` + `preserveAspectRatio="none"` scales EVERYTHING by
//     panelWidth/1000. Once the match page went three-column, this panel landed at ~630px, so a
//     12px label rendered at 7.5px and the chart became unreadable. The SVG is now sized 1:1 in CSS
//     pixels, measured at runtime — SVG units ARE pixels, so type is the size it says it is.
//  2. The section label and the headline sat in the SVG's top padding, exactly where the Radiant
//     peak label is drawn. They collided. Labels now live in an HTML header row above the plot, and
//     the peak labels are clamped inside the plot box.
//  3. `peak = max(|v|) * 1.2` with no floor drew a 50-gold difference as a full-height wedge — the
//     chart screamed about nothing. The domain now snaps to a nice number with a 2k floor, so a
//     negligible lead looks negligible.
//
// Team color consts stay LITERAL hex — HistoryGraphs.test.tsx asserts these fills directly, and
// jsdom does not resolve CSS var() inside SVG attributes.
//
// That is a real constraint, but it leaves the palette with two masters: change
// --color-radiant in index.css and these charts keep the old green, silently disagreeing
// with every other Radiant-coloured thing on the page.
//
// It cannot be closed by a test from this side: Tailwind's Vite plugin intercepts
// `import css from '../index.css?raw'` and hands back an empty string, and the client has
// no node types for fs. So the guard is a reciprocal comment — index.css names this file
// beside the two tokens. Exported anyway, so anything that needs the values imports them
// rather than making a third copy.
export const RADIANT_GREEN = '#4ade80'
export const DIRE_RED      = '#f87171'
// Chrome consts use runtime var() tokens (not test-asserted).
const PANEL_BORDER  = 'var(--color-border)'
const SECONDARY_FG  = 'var(--color-text-muted)'
const TERTIARY_FG   = 'var(--color-text-dim)'
const ZERO_AXIS     = 'var(--color-text-dim)'
const GRID_LINE     = 'var(--color-border)'
const SURFACE       = 'var(--color-surface)'
const ACCENT        = 'var(--color-accent)'  // v2.0 timeline cursor — gold, distinct from both team colors

// Geometry in CSS pixels (1:1 with the viewBox).
const PLOT_H    = 108   // drawing area height
const AXIS_H    = 20    // band under the plot for minute labels — sized IN, never clipped
const GUTTER_L  = 34    // left gutter for the y-scale labels
const PAD_R     = 12    // keeps the endpoint dot and its label off the right edge
const PAD_Y     = 10    // headroom so an extreme never touches the plot edge
const SVG_H     = PLOT_H + AXIS_H
const FALLBACK_W = 560  // pre-measure and jsdom width

// Y domain steps. The first entry is the floor: leads smaller than this render as a flat ripple
// instead of a dramatic wedge, which is the honest reading of "nobody is ahead".
const DOMAIN_STEPS = [2_000, 3_000, 5_000, 8_000, 12_000, 16_000, 20_000, 25_000, 30_000, 40_000, 50_000]

// PageUp/PageDown jump. Five minutes because that is the gridline interval — the coarse step
// lands the cursor on a mark the reader can already see, rather than an arbitrary offset.
const SCRUB_PAGE_STEP = 5

export interface HistoryGraphsProps {
  history: Array<{ t: number; gold: number; xp: number }>
  gameDuration: number | undefined
  gameState: number | undefined
  /** v2.0 — game seconds the scrubber is parked at; null/undefined while following live. */
  cursorT?: number | null
  /** v2.0 — clicking the plot jumps the scrubber to that minute. */
  onScrub?: (minute: number) => void
}

/** Measures an element's width in CSS px. Falls back where ResizeObserver does not exist (jsdom). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(FALLBACK_W)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width)
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, width] as const
}

function fmtMmSs(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// "+3.4k" / "-1.2k" — leading sign always present; "k" only when |v| >= 1000.
function fmtVal(v: number): string {
  const abs = Math.abs(v)
  const body = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : `${Math.round(abs)}`
  return v >= 0 ? `+${body}` : `-${body}`
}

/**
 * Axis tick text: "8k", "0", "-12k" — no decimals, this is a scale not a reading.
 * Sign is applied AFTER the k-suffix decision: testing the signed value meant every negative tick
 * fell through to raw digits ("-20000"), overflowed the gutter and rendered clipped.
 */
function fmtAxis(v: number): string {
  const abs = Math.abs(v)
  const body = abs >= 1000 ? `${Math.round(abs / 1000)}k` : `${Math.round(abs)}`
  return v < 0 ? `-${body}` : body
}

/** Smallest nice domain that clears the largest swing, never below the floor. */
function domainFor(rawPeak: number): number {
  const needed = rawPeak * 1.15
  return DOMAIN_STEPS.find(step => step >= needed) ?? Math.ceil(needed / 10_000) * 10_000
}

function EmptyHistoryPanel({ gameDuration }: { gameDuration: number | undefined }) {
  // 1Hz tick (RoshanBlock pattern) so the wait reads as progress rather than a hang.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = Math.min(30, Math.max(0, Math.floor((gameDuration ?? 0) % 30)))

  return (
    <section
      style={{
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 'var(--radius-lg)',
        padding: '20px 22px',
        minHeight: 2 * (SVG_H + 30) + 40,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PanelTitle />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        {/* Placeholder baseline: shows WHERE the chart will be without faking an axis frame. */}
        <div style={{ width: '70%', height: 1, background: 'var(--color-border)' }} />
        <span style={{ color: SECONDARY_FG, fontSize: 12 }}>
          {`Collecting history… ${elapsed}/30s`}
        </span>
        <span style={{ color: TERTIARY_FG, fontSize: 11 }}>
          Samples are taken every 30 seconds
        </span>
      </div>
    </section>
  )
}

function PanelTitle() {
  return (
    <p
      style={{
        color: SECONDARY_FG,
        fontSize: 11,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        margin: 0,
      }}
    >
      Lead history
    </p>
  )
}

function ChartSection({
  samples,
  pick,
  label,
  cursorT,
  onScrub,
}: {
  samples: HistoryGraphsProps['history']
  pick: 'gold' | 'xp'
  label: string
  /** Game seconds the timeline cursor sits at, or null when following live. */
  cursorT?: number | null
  /** Click-to-scrub. Absent → the chart stays a passive read-out, as it was before v2.0. */
  onScrub?: (minute: number) => void
}) {
  const [hostRef, hostWidth] = useElementWidth<HTMLDivElement>()
  const uid = useId().replace(/:/g, '')  // clipPath ids must be unique per section AND valid in url()

  const W = Math.max(220, hostWidth)      // below this a chart is not worth drawing
  const plotLeft = GUTTER_L
  const plotRight = W - PAD_R
  const plotW = Math.max(1, plotRight - plotLeft)
  const midY = PLOT_H / 2
  const halfH = PLOT_H / 2 - PAD_Y

  const tMin = samples[0].t
  const tMax = samples[samples.length - 1].t
  const span = Math.max(1, tMax - tMin)

  const rawPeak = Math.max(...samples.map(s => Math.abs(s[pick])))
  const domain = domainFor(rawPeak)

  const xOf = (t: number) => plotLeft + ((t - tMin) / span) * plotW
  const yOf = (v: number) => midY - (v / domain) * halfH

  // Closed areas between the midline and the clipped curve, one per side.
  const areaPath = (clip: (v: number) => number) => {
    let d = `M ${xOf(tMin).toFixed(2)} ${midY.toFixed(2)} `
    for (const s of samples) d += `L ${xOf(s.t).toFixed(2)} ${yOf(clip(s[pick])).toFixed(2)} `
    return d + `L ${xOf(tMax).toFixed(2)} ${midY.toFixed(2)} Z`
  }
  const positive = (v: number) => Math.max(0, v)
  const negative = (v: number) => Math.min(0, v)

  // ONE polyline of the true values, stroked twice through half-plane clips: green above the zero
  // line, red below. Drawing a clipped copy per side instead of a clamped copy per side matters —
  // clamping flattened the trailing side onto y=0, so a match where Radiant led throughout still
  // drew a solid red rule across the whole chart, competing with the zero axis.
  const trueOutline = samples
    .map(s => `${xOf(s.t).toFixed(2)},${yOf(s[pick]).toFixed(2)}`)
    .join(' ')

  // Peaks — the one moment each side was furthest ahead. Static labels stand in for hover.
  let rPeak = { v: 0, t: 0 }
  let dPeak = { v: 0, t: 0 }
  for (const s of samples) {
    if (s[pick] > rPeak.v) rPeak = { v: s[pick], t: s.t }
    if (s[pick] < dPeak.v) dPeak = { v: s[pick], t: s.t }
  }

  // Minute gridlines every 5 min, thinned out so ticks never crowd on a narrow panel.
  const stepSeconds = plotW / (span / 300) < 46 ? 600 : 300
  const ticks: number[] = []
  for (let t = Math.ceil(tMin / stepSeconds) * stepSeconds; t <= tMax; t += stepSeconds) ticks.push(t)

  const last = samples[samples.length - 1][pick]
  const headlineColor = last >= 0 ? RADIANT_GREEN : DIRE_RED
  const headlineText = `${last >= 0 ? 'Radiant +' : 'Dire +'}${(Math.abs(last) / 1000).toFixed(1)}k`

  // Keep a label inside the plot box rather than letting it run off either end.
  const anchorFor = (px: number): 'start' | 'middle' | 'end' =>
    px < plotLeft + 46 ? 'start' : px > plotRight - 46 ? 'end' : 'middle'

  const labelStyle: CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: SECONDARY_FG,
  }

  // ── Scrub control (UI-SPEC 10.5 §6.1/§6.2) ────────────────────────────────
  // The chart's minute range, in the same unit onScrub speaks: whole minutes.
  const minMinute = Math.max(0, Math.round(tMin / 60))
  const maxMinute = Math.max(minMinute, Math.round(tMax / 60))
  const cursorMinute = cursorT !== null && cursorT !== undefined ? Math.round(cursorT / 60) : null
  // While following live there is no parked cursor, but a slider still has to report a position.
  // The endpoint is the honest one — it is the sample the headline and the "now" dot describe.
  const scrubMinute = Math.min(maxMinute, Math.max(minMinute, cursorMinute ?? maxMinute))

  const scrubTo = (minute: number) => {
    if (!onScrub) return
    onScrub(Math.min(maxMinute, Math.max(minMinute, minute)))
  }

  const onScrubClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    // The overlay is inset to the plot box, so its own left edge IS x=plotLeft — no gutter
    // subtraction, unlike the full-width <rect> this replaced.
    const box = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - box.left) / plotW
    const t = tMin + Math.min(1, Math.max(0, ratio)) * span
    scrubTo(Math.max(0, Math.round(t / 60)))
  }

  const onScrubKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    let next: number
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':  next = scrubMinute - 1; break
      case 'ArrowRight':
      case 'ArrowUp':    next = scrubMinute + 1; break
      case 'PageDown':   next = scrubMinute - SCRUB_PAGE_STEP; break
      case 'PageUp':     next = scrubMinute + SCRUB_PAGE_STEP; break
      case 'Home':       next = minMinute; break
      case 'End':        next = maxMinute; break
      default: return
    }
    // Every key this handles also scrolls the page by default, which would yank the chart
    // out from under the reader on the same keystroke that moves the cursor.
    e.preventDefault()
    scrubTo(next)
  }

  return (
    <div ref={hostRef} style={{ marginTop: 18 }}>
      {/* Header row — real HTML at real px. Previously these were absolutely positioned over the
          SVG's top padding, which is also where the Radiant peak label is drawn; they overlapped. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 4,
        }}
      >
        <span style={labelStyle}>{label}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: headlineColor,
          }}
        >
          {headlineText}
        </span>
      </div>

      {/* The SVG stays role="img" — its aria-label is the whole read-out for a screen reader, and
          role="img" makes every descendant presentational. So the scrub control cannot live inside
          it; it is a sibling laid over the plot box instead. */}
      <div style={{ position: 'relative' }}>
        <svg
          width={W}
          height={SVG_H}
          viewBox={`0 0 ${W} ${SVG_H}`}
          style={{ display: 'block' }}
          role="img"
          aria-label={`${label}: currently ${headlineText}. Peak Radiant lead ${fmtVal(rPeak.v)}, peak Dire lead ${fmtVal(dPeak.v)}.`}
        >
          {/* 1. Vertical gridlines — solid hairlines. Dashed grid reads as a threshold, not a grid. */}
          {ticks.map(t => (
            <line
              key={`grid-${t}`}
              data-testid="gridline"
              x1={xOf(t)}
              x2={xOf(t)}
              y1={0}
              y2={PLOT_H}
              stroke={GRID_LINE}
              strokeWidth={1}
            />
          ))}

          {/* 2. Y scale — the top and bottom of the domain, so the amplitude is readable at all. */}
          {[
            { v: domain, y: yOf(domain) },
            { v: -domain, y: yOf(-domain) },
          ].map(({ v, y }) => (
            <g key={`yaxis-${v}`}>
              <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke={GRID_LINE} strokeWidth={1} />
              <text
                x={plotLeft - 8}
                y={y + 3}
                fontSize={10}
                fill={TERTIARY_FG}
                textAnchor="end"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtAxis(v)}
              </text>
            </g>
          ))}

          {/* 3. Zero line — the reference every value is read against, so it outranks the grid. */}
          <line x1={plotLeft} x2={plotRight} y1={midY} y2={midY} stroke={ZERO_AXIS} strokeWidth={1} />
          <text x={plotLeft - 8} y={midY + 3} fontSize={10} fill={TERTIARY_FG} textAnchor="end">
            0
          </text>

          {/* 4 + 5. Fills — 0.15 alpha floor: present enough to read at a glance, never a block. */}
          <path d={areaPath(positive)} fill={RADIANT_GREEN} fillOpacity={0.15} />
          <path d={areaPath(negative)} fill={DIRE_RED} fillOpacity={0.15} />

          {/* 6 + 7. Outline — the same curve, clipped to each half-plane so it changes colour exactly
              where the lead changes hands. */}
          <defs>
            <clipPath id={`${uid}-above`}>
              <rect x={plotLeft} y={0} width={plotW} height={midY} />
            </clipPath>
            <clipPath id={`${uid}-below`}>
              <rect x={plotLeft} y={midY} width={plotW} height={PLOT_H - midY} />
            </clipPath>
          </defs>
          <polyline
            points={trueOutline}
            fill="none"
            stroke={RADIANT_GREEN}
            strokeWidth={2}
            strokeLinejoin="round"
            clipPath={`url(#${uid}-above)`}
          />
          <polyline
            points={trueOutline}
            fill="none"
            stroke={DIRE_RED}
            strokeWidth={2}
            strokeLinejoin="round"
            clipPath={`url(#${uid}-below)`}
          />

          {/* 8. Radiant peak */}
          {rPeak.v > 0 && (() => {
            const px = xOf(rPeak.t)
            const py = yOf(rPeak.v)
            return (
              <g key="r-peak">
                <circle cx={px} cy={py} r={3.5} fill={RADIANT_GREEN} stroke={SURFACE} strokeWidth={2} />
                <text
                  x={px}
                  y={Math.max(11, py - 9)}
                  fontSize={11}
                  fontWeight={600}
                  fill={RADIANT_GREEN}
                  textAnchor={anchorFor(px)}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {`${fmtVal(rPeak.v)} @ ${fmtMmSs(rPeak.t)}`}
                </text>
              </g>
            )
          })()}

          {/* 9. Dire peak */}
          {dPeak.v < 0 && (() => {
            const px = xOf(dPeak.t)
            const py = yOf(dPeak.v)
            return (
              <g key="d-peak">
                <circle cx={px} cy={py} r={3.5} fill={DIRE_RED} stroke={SURFACE} strokeWidth={2} />
                <text
                  x={px}
                  y={Math.min(PLOT_H - 3, py + 14)}
                  fontSize={11}
                  fontWeight={600}
                  fill={DIRE_RED}
                  textAnchor={anchorFor(px)}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {`${fmtVal(dPeak.v)} @ ${fmtMmSs(dPeak.t)}`}
                </text>
              </g>
            )
          })()}

          {/* 10. Now marker — the endpoint is the value the headline names, so it gets an anchor. */}
          <circle
            cx={xOf(tMax)}
            cy={yOf(last)}
            r={3}
            fill={headlineColor}
            stroke={SURFACE}
            strokeWidth={2}
          />

          {/* 11. X axis band — inside the SVG height, so it can never be clipped by the card. */}
          {ticks.map(t => (
            <text
              key={`xlabel-${t}`}
              x={xOf(t)}
              y={PLOT_H + 14}
              fontSize={10}
              fill={TERTIARY_FG}
              textAnchor="middle"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {`${Math.round(t / 60)}m`}
            </text>
          ))}

          {/* 12. Timeline cursor (v2.0) — where the scrubber is parked, with the value there.
              Only drawn while scrubbing; the live view keeps the untouched chart. */}
          {cursorT !== null && cursorT !== undefined && cursorT >= tMin && cursorT <= tMax && (() => {
            // Nearest recorded sample, not an interpolation: the chart must never show a
            // number the match did not actually produce.
            let nearest = samples[0]
            for (const s of samples) {
              if (Math.abs(s.t - cursorT) < Math.abs(nearest.t - cursorT)) nearest = s
            }
            const cx = xOf(nearest.t)
            return (
              <g data-testid="timeline-cursor" pointerEvents="none">
                <line x1={cx} x2={cx} y1={0} y2={PLOT_H} stroke={ACCENT} strokeWidth={1} opacity={0.9} />
                <circle cx={cx} cy={yOf(nearest[pick])} r={3.5} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
                <text
                  x={cx}
                  y={PLOT_H + 14}
                  fontSize={10}
                  fill={ACCENT}
                  textAnchor={anchorFor(cx)}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmtVal(nearest[pick])}
                </text>
              </g>
            )
          })()}
        </svg>

        {/* 13. Scrub target. Covers exactly the plot box the old in-SVG <rect> did, so a click or a
            tap lands on the same minute as before — but as a real ARIA slider it is also a tab stop,
            picks up the global :focus-visible ring (§6.1), and answers the arrow keys (§6.2: an
            affordance that only pointers can reach is a defect). */}
        {onScrub && (
          <div
            data-testid="scrub-overlay"
            role="slider"
            tabIndex={0}
            aria-label={`Scrub match timeline — ${label} chart`}
            aria-valuemin={minMinute}
            aria-valuemax={maxMinute}
            aria-valuenow={scrubMinute}
            aria-valuetext={`minute ${scrubMinute}`}
            onClick={onScrubClick}
            onKeyDown={onScrubKeyDown}
            style={{
              position: 'absolute',
              left: plotLeft,
              top: 0,
              width: plotW,
              height: PLOT_H,
              cursor: 'col-resize',
              touchAction: 'manipulation',
            }}
          />
        )}
      </div>
    </div>
  )
}

function HistoryGraphs({
  history,
  gameDuration,
  gameState: _gameState,
  cursorT,
  onScrub,
}: HistoryGraphsProps) {
  // D-23, D-24: a single sample is a dot, not a trend — hold the empty state until there are two.
  if (history.length < 2) {
    return <EmptyHistoryPanel gameDuration={gameDuration} />
  }

  return (
    <section
      style={{
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 'var(--radius-lg)',
        padding: '20px 22px 22px',
      }}
    >
      <PanelTitle />
      <ChartSection samples={history} pick="gold" label="Gold lead" cursorT={cursorT} onScrub={onScrub} />
      <ChartSection samples={history} pick="xp" label="XP lead" cursorT={cursorT} onScrub={onScrub} />
    </section>
  )
}

// Two charts, each rebuilding a path over the whole match from scratch. Nothing here moves
// between minutes, so a 30-second poller has no business redrawing them.
export default memo(HistoryGraphs)
