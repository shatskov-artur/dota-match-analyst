import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'

// Phase 10 Plan 03 — HistoryGraphs
// Self-gating dual-SVG panel rendering Radiant-positive gold/xp leads over game-clock time.
// Mirrors DotaMapView (SVG primitives) + WinProbBar (self-gate) + IntelTooltip (anchored
// hover) + RoshanBlock (1Hz client tick). NO chart library imports allowed (D-25).

const RADIANT_GREEN = '#4ade80'
const DIRE_RED      = '#ef4444'
const PANEL_BG      = '#0f0f0f'
const PRIMARY_FG    = '#d8d8d8'
const SECONDARY_FG  = '#888888'
const ZERO_AXIS     = '#2a2a2a'
const HOVER_LINE    = '#d8d8d8'
const TOOLTIP_BG    = '#111111'
const TOOLTIP_BORDER = '#1a1a1a'

const W = 640
const H = 160
const PAD_L = 40
const PAD_R = 12
const PAD_T = 12
const PAD_B = 24

function formatMmSs(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatK(value: number): string {
  // 12345 → "12.3" (caller appends "k")
  return (value / 1000).toFixed(1)
}

export interface HistoryGraphsProps {
  history: Array<{ t: number; gold: number; xp: number }>
  gameDuration: number | undefined
  gameState: number | undefined
}

interface ChartGeometry {
  pointsStr: string
  fillD: string
  yMid: number
  projected: Array<{ x: number; y: number; t: number; value: number }>
  maxAbs: number
  tMin: number
  tMax: number
}

function computeChart(samples: HistoryGraphsProps['history'], pick: 'gold' | 'xp'): ChartGeometry {
  const tMin = samples[0].t
  const tMax = samples[samples.length - 1].t
  const span = Math.max(1, tMax - tMin)
  const maxAbs = Math.max(1, ...samples.map(s => Math.abs(s[pick])))
  const yMid = (H - PAD_T - PAD_B) / 2 + PAD_T
  const usableY = yMid - PAD_T

  const projected = samples.map(s => {
    const x = PAD_L + ((s.t - tMin) / span) * (W - PAD_L - PAD_R)
    const y = yMid - (s[pick] / maxAbs) * usableY
    return { x, y, t: s.t, value: s[pick] }
  })

  const pointsStr = projected.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const first = projected[0]
  const last = projected[projected.length - 1]
  const fillD = `M${first.x.toFixed(2)},${yMid.toFixed(2)} L${pointsStr.replace(/ /g, ' L')} L${last.x.toFixed(2)},${yMid.toFixed(2)} Z`

  return { pointsStr, fillD, yMid, projected, maxAbs, tMin, tMax }
}

interface HoverState {
  cursorXSvg: number
  nearestIndex: number
}

interface ChartProps {
  geom: ChartGeometry
  clipIdRadiant: string
  clipIdDire: string
  hover: HoverState | null
  onMouseMove: (e: ReactMouseEvent<SVGSVGElement>) => void
  onMouseLeave: () => void
  axisLabelTop: string
  axisLabelBottom: string
}

function Chart({
  geom,
  clipIdRadiant,
  clipIdDire,
  hover,
  onMouseMove,
  onMouseLeave,
  axisLabelTop,
  axisLabelBottom,
}: ChartProps) {
  const { yMid, fillD, pointsStr, tMin, tMax } = geom

  // X-axis ticks every 5 min starting at next multiple of 300 >= tMin.
  const tickStart = Math.ceil(tMin / 300) * 300
  const ticks: number[] = []
  for (let t = tickStart; t <= tMax; t += 300) ticks.push(t)
  const xForT = (t: number) => {
    const span = Math.max(1, tMax - tMin)
    return PAD_L + ((t - tMin) / span) * (W - PAD_L - PAD_R)
  }

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ display: 'block', borderRadius: 4 }}
    >
      <defs>
        <clipPath id={clipIdRadiant}>
          <rect x={0} y={0} width={W} height={yMid} />
        </clipPath>
        <clipPath id={clipIdDire}>
          <rect x={0} y={yMid} width={W} height={H - yMid} />
        </clipPath>
      </defs>

      <rect width={W} height={H} fill={PANEL_BG} rx={6} />

      {/* zero axis */}
      <line
        x1={PAD_L}
        y1={yMid}
        x2={W - PAD_R}
        y2={yMid}
        stroke={ZERO_AXIS}
        strokeWidth={1}
      />

      {/* Filled areas — same path, clipped above/below midline */}
      <path d={fillD} fill={RADIANT_GREEN} fillOpacity={0.15} clipPath={`url(#${clipIdRadiant})`} />
      <path d={fillD} fill={DIRE_RED} fillOpacity={0.15} clipPath={`url(#${clipIdDire})`} />

      {/* Line on top */}
      <polyline
        points={pointsStr}
        fill="none"
        stroke={PRIMARY_FG}
        strokeWidth={1.5}
      />

      {/* Y-axis labels — top (Radiant max) and bottom (Dire max) */}
      <text
        x={PAD_L - 4}
        y={PAD_T + 8}
        fontSize={10}
        fill={SECONDARY_FG}
        fontFamily="monospace"
        textAnchor="end"
      >
        {axisLabelTop}
      </text>
      <text
        x={PAD_L - 4}
        y={H - PAD_B + 10}
        fontSize={10}
        fill={SECONDARY_FG}
        fontFamily="monospace"
        textAnchor="end"
      >
        {axisLabelBottom}
      </text>

      {/* X-axis tick labels every 5 min */}
      {ticks.map(t => (
        <text
          key={t}
          x={xForT(t)}
          y={H - 6}
          fontSize={10}
          fill={SECONDARY_FG}
          fontFamily="monospace"
          textAnchor="middle"
        >
          {formatMmSs(t)}
        </text>
      ))}

      {/* Hover crosshair */}
      {hover && (
        <line
          x1={hover.cursorXSvg}
          x2={hover.cursorXSvg}
          y1={PAD_T}
          y2={H - PAD_B}
          stroke={HOVER_LINE}
          strokeWidth={1}
          strokeDasharray="3 3"
          pointerEvents="none"
        />
      )}
    </svg>
  )
}

function SkeletonHistoryBlock({ gameDuration }: { gameDuration: number | undefined }) {
  // 1Hz tick (RoshanBlock pattern). Counter ticks client-side via setInterval — no React Query.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = Math.min(30, Math.max(0, Math.floor((gameDuration ?? 0) % 30)))

  const wrapperStyle: CSSProperties = {
    background: PANEL_BG,
    borderRadius: 6,
    padding: 12,
    height: 380,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <section style={wrapperStyle}>
      <span style={{ color: SECONDARY_FG, fontSize: 12 }}>
        {`Накапливаем историю… (${elapsed}/30с)`}
      </span>
    </section>
  )
}

export default function HistoryGraphs({ history, gameDuration, gameState: _gameState }: HistoryGraphsProps) {
  // Hooks MUST be declared before any early return (rules-of-hooks).
  const wrapperRef = useRef<HTMLElement | null>(null)
  const [hover, setHover] = useState<{
    chart: 'gold' | 'xp'
    cursorXSvg: number
    nearestIndex: number
    tooltipLeftPx: number
    tooltipTopPx: number
  } | null>(null)

  // D-23, D-24: skeleton when fewer than 2 samples (single-point edge case stays in skeleton).
  if (history.length < 2) {
    return <SkeletonHistoryBlock gameDuration={gameDuration} />
  }

  const goldGeom = computeChart(history, 'gold')
  const xpGeom = computeChart(history, 'xp')

  function makeMouseMove(chart: 'gold' | 'xp', geom: ChartGeometry) {
    return (e: ReactMouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget
      const rect = svg.getBoundingClientRect()
      const cursorPxX = e.clientX - rect.left
      const cursorPxY = e.clientY - rect.top
      const cursorXSvg = (cursorPxX / Math.max(1, rect.width)) * W

      // Find nearest sample by SVG x.
      let nearestIndex = 0
      let bestDist = Infinity
      for (let i = 0; i < geom.projected.length; i++) {
        const d = Math.abs(geom.projected[i].x - cursorXSvg)
        if (d < bestDist) {
          bestDist = d
          nearestIndex = i
        }
      }

      const wrapper = wrapperRef.current
      let tooltipLeftPx = cursorPxX + 12
      let tooltipTopPx = cursorPxY + 12
      if (wrapper) {
        const wrapperRect = wrapper.getBoundingClientRect()
        const svgOffsetLeft = rect.left - wrapperRect.left
        const svgOffsetTop = rect.top - wrapperRect.top
        const TOOLTIP_W_EST = 240
        tooltipLeftPx = svgOffsetLeft + cursorPxX + 12
        tooltipTopPx = svgOffsetTop + cursorPxY + 12
        tooltipLeftPx = Math.max(0, Math.min(wrapperRect.width - TOOLTIP_W_EST, tooltipLeftPx))
      }

      setHover({ chart, cursorXSvg, nearestIndex, tooltipLeftPx, tooltipTopPx })
    }
  }

  function onMouseLeave() {
    setHover(null)
  }

  // Tooltip text — uses gold sign for prefix word so a single combined tooltip remains
  // unambiguous (CONTEXT D-22 sign-convention rule).
  const tooltipText = (() => {
    if (!hover) return null
    const sample = history[hover.nearestIndex]
    if (!sample) return null
    const prefix = sample.gold >= 0 ? 'Radiant' : 'Dire'
    const goldStr = formatK(Math.abs(sample.gold))
    const xpStr = formatK(Math.abs(sample.xp))
    return `${formatMmSs(sample.t)} — ${prefix} +${goldStr}k gold, +${xpStr}k xp`
  })()

  const goldAxisLabel = `${formatK(goldGeom.maxAbs)}k`
  const xpAxisLabel = `${formatK(xpGeom.maxAbs)}k`

  // Wrapper MUST be position:relative AND MUST NOT have overflow:hidden (Phase 5 IntelTooltip pitfall).
  const wrapperStyle: CSSProperties = {
    position: 'relative',
    background: PANEL_BG,
    borderRadius: 6,
    padding: 12,
  }

  return (
    <section ref={wrapperRef} style={wrapperStyle}>
      <h3
        style={{
          color: PRIMARY_FG,
          fontSize: 14,
          fontWeight: 700,
          margin: 0,
          marginBottom: 8,
        }}
      >
        Историческая динамика
      </h3>

      <div style={{ marginBottom: 4 }}>
        <span style={{ color: SECONDARY_FG, fontSize: 11 }}>Gold lead</span>
      </div>
      <Chart
        geom={goldGeom}
        clipIdRadiant="historyGraphs-radiantFillGold"
        clipIdDire="historyGraphs-direFillGold"
        hover={hover && hover.chart === 'gold' ? { cursorXSvg: hover.cursorXSvg, nearestIndex: hover.nearestIndex } : null}
        onMouseMove={makeMouseMove('gold', goldGeom)}
        onMouseLeave={onMouseLeave}
        axisLabelTop={goldAxisLabel}
        axisLabelBottom={goldAxisLabel}
      />

      <div style={{ marginBottom: 4, marginTop: 8 }}>
        <span style={{ color: SECONDARY_FG, fontSize: 11 }}>XP lead (approx.)</span>
      </div>
      <Chart
        geom={xpGeom}
        clipIdRadiant="historyGraphs-radiantFillXp"
        clipIdDire="historyGraphs-direFillXp"
        hover={hover && hover.chart === 'xp' ? { cursorXSvg: hover.cursorXSvg, nearestIndex: hover.nearestIndex } : null}
        onMouseMove={makeMouseMove('xp', xpGeom)}
        onMouseLeave={onMouseLeave}
        axisLabelTop={xpAxisLabel}
        axisLabelBottom={xpAxisLabel}
      />

      {hover && tooltipText && (
        <div
          style={{
            position: 'absolute',
            zIndex: 50,
            left: hover.tooltipLeftPx,
            top: hover.tooltipTopPx,
            background: TOOLTIP_BG,
            border: `1px solid ${TOOLTIP_BORDER}`,
            borderRadius: 4,
            padding: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
            color: PRIMARY_FG,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltipText}
        </div>
      )}
    </section>
  )
}
