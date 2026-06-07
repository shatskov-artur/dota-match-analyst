import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

// Phase 10.2 Plan 02 — HistoryGraphs (rewrite per sketch 001 winner C).
// Line + soft fill + static peak labels. No hover. Two stacked sections (gold, xp).
// NO chart library imports (D-25). Pure SVG primitives.
// Canonical spec: .claude/skills/sketch-findings-dota-stats/references/charts-data-viz.md

const RADIANT_GREEN = '#6bcf8a'
const DIRE_RED      = '#e06a72'
const PANEL_BG      = '#0f0f0f'
const PANEL_BORDER  = '#161616'
const SECONDARY_FG  = '#888888'
const TERTIARY_FG   = '#555555'
const ZERO_AXIS     = '#2a2a2a'
const GRID_LINE     = '#1a1a1a'

const W = 1000
const H = 200
const PAD_TOP = 28
const PAD_BOTTOM = 22
const INNER_H = H - PAD_TOP - PAD_BOTTOM // 150
const MID_Y = PAD_TOP + INNER_H / 2       // 103

export interface HistoryGraphsProps {
  history: Array<{ t: number; gold: number; xp: number }>
  gameDuration: number | undefined
  gameState: number | undefined
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

function SkeletonHistoryBlock({ gameDuration }: { gameDuration: number | undefined }) {
  // 1Hz tick (RoshanBlock pattern). Preserves existing behavior.
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

function ChartSection({
  samples,
  pick,
  label,
}: {
  samples: HistoryGraphsProps['history']
  pick: 'gold' | 'xp'
  label: string
}) {
  const tMin = samples[0].t
  const tMax = samples[samples.length - 1].t
  const span = Math.max(1, tMax - tMin)
  const rawPeak = Math.max(...samples.map(s => Math.abs(s[pick])))
  const peak = (rawPeak * 1.20) || 1

  const xOf = (t: number) => ((t - tMin) / span) * W
  const yOf = (v: number) => MID_Y - (v / peak) * (INNER_H / 2)

  // Radiant fill: closed area between midline and max(0, v) curve.
  let radPath = `M ${xOf(tMin).toFixed(2)} ${MID_Y.toFixed(2)} `
  samples.forEach(d => {
    radPath += `L ${xOf(d.t).toFixed(2)} ${yOf(Math.max(0, d[pick])).toFixed(2)} `
  })
  radPath += `L ${xOf(tMax).toFixed(2)} ${MID_Y.toFixed(2)} Z`

  // Dire fill: same shape, reflected to negative side.
  let direPath = `M ${xOf(tMin).toFixed(2)} ${MID_Y.toFixed(2)} `
  samples.forEach(d => {
    direPath += `L ${xOf(d.t).toFixed(2)} ${yOf(Math.min(0, d[pick])).toFixed(2)} `
  })
  direPath += `L ${xOf(tMax).toFixed(2)} ${MID_Y.toFixed(2)} Z`

  // Outline polylines — separated radiant/dire (clipped to half-plane via clamping).
  const radiantOutline = samples
    .map(d => `${xOf(d.t).toFixed(2)},${yOf(Math.max(0, d[pick])).toFixed(2)}`)
    .join(' ')
  const direOutline = samples
    .map(d => `${xOf(d.t).toFixed(2)},${yOf(Math.min(0, d[pick])).toFixed(2)}`)
    .join(' ')

  // Peak detection
  let rPeak = { v: 0, t: 0 }
  let dPeak = { v: 0, t: 0 }
  for (const d of samples) {
    if (d[pick] > rPeak.v) rPeak = { v: d[pick], t: d.t }
    if (d[pick] < dPeak.v) dPeak = { v: d[pick], t: d.t }
  }

  // X-axis minute ticks every 300s within [tMin, tMax]
  const tickStart = Math.ceil(tMin / 300) * 300
  const ticks: number[] = []
  for (let t = tickStart; t <= tMax; t += 300) ticks.push(t)

  // Headline value (latest sample, colored by side)
  const last = samples[samples.length - 1][pick]
  const headlineColor = last >= 0 ? RADIANT_GREEN : DIRE_RED
  const headlineText = `${last >= 0 ? 'Radiant +' : 'Dire +'}${(Math.abs(last) / 1000).toFixed(1)}k`

  // Edge-anchor helper
  const anchorFor = (px: number): 'start' | 'middle' | 'end' =>
    px < 80 ? 'start' : px > W - 80 ? 'end' : 'middle'

  const sectionStyle: CSSProperties = { position: 'relative', marginTop: 16 }

  return (
    <div style={sectionStyle}>
      <span
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          fontSize: 12,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: SECONDARY_FG,
          pointerEvents: 'none',
        }}
      >
        {label}
      </span>
      <span
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
          color: headlineColor,
          pointerEvents: 'none',
        }}
      >
        {headlineText}
      </span>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }}
      >
        {/* 1. Gridlines */}
        {ticks.map(t => (
          <line
            key={`grid-${t}`}
            x1={xOf(t)}
            x2={xOf(t)}
            y1={PAD_TOP}
            y2={PAD_TOP + INNER_H}
            stroke={GRID_LINE}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ))}

        {/* 2. Zero line */}
        <line x1={0} x2={W} y1={MID_Y} y2={MID_Y} stroke={ZERO_AXIS} strokeWidth={1} />

        {/* 3 + 4. Fills */}
        <path d={radPath} fill={RADIANT_GREEN} fillOpacity={0.15} />
        <path d={direPath} fill={DIRE_RED} fillOpacity={0.15} />

        {/* 5 + 6. Outlines */}
        <polyline points={radiantOutline} fill="none" stroke={RADIANT_GREEN} strokeWidth={2} />
        <polyline points={direOutline} fill="none" stroke={DIRE_RED} strokeWidth={2} />

        {/* 7. Radiant peak */}
        {rPeak.v > 0 && (() => {
          const px = xOf(rPeak.t)
          const py = yOf(rPeak.v)
          const ly = Math.max(PAD_TOP + 12, py - 8)
          return (
            <g key="r-peak">
              <circle cx={px} cy={py} r={3.5} fill={RADIANT_GREEN} />
              <text
                x={px}
                y={ly}
                fontSize={12}
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

        {/* 8. Dire peak */}
        {dPeak.v < 0 && (() => {
          const px = xOf(dPeak.t)
          const py = yOf(dPeak.v)
          const ly = Math.min(PAD_TOP + INNER_H - 4, py + 14)
          return (
            <g key="d-peak">
              <circle cx={px} cy={py} r={3.5} fill={DIRE_RED} />
              <text
                x={px}
                y={ly}
                fontSize={12}
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

        {/* 9. X-axis labels */}
        {ticks.map(t => (
          <text
            key={`xlabel-${t}`}
            x={xOf(t)}
            y={H - 4}
            fontSize={12}
            fill={TERTIARY_FG}
            textAnchor="middle"
          >
            {`${Math.round(t / 60)}m`}
          </text>
        ))}
      </svg>
    </div>
  )
}

export default function HistoryGraphs({ history, gameDuration, gameState: _gameState }: HistoryGraphsProps) {
  // D-23, D-24: skeleton when fewer than 2 samples.
  if (history.length < 2) {
    return <SkeletonHistoryBlock gameDuration={gameDuration} />
  }

  const panelStyle: CSSProperties = {
    background: PANEL_BG,
    border: `1px solid ${PANEL_BORDER}`,
    borderRadius: 4,
    padding: '24px 28px 28px',
  }

  return (
    <section style={panelStyle}>
      <p
        style={{
          color: SECONDARY_FG,
          fontSize: 11,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        Историческая динамика
      </p>
      <ChartSection samples={history} pick="gold" label="Gold lead" />
      <ChartSection samples={history} pick="xp" label="XP lead" />
    </section>
  )
}
