import { memo } from 'react'
import type { BuildingState } from '@shared/buildingDecoder'
import { heroMapper } from '../utils/heroMapper'
import { normalizeMapCoords } from '../utils/mapCoords'
import { DIRE_LAYOUT, RADIANT_LAYOUT, type Point } from '../utils/mapBuildings'

interface HeroPosition {
  hero_id: number
  team: 'radiant' | 'dire'
  position_x: number
  position_y: number
}

interface Props {
  buildings: BuildingState
  heroPositions?: HeroPosition[]
  /**
   * Rendered SVG size in pixels (square). ViewBox stays at 320×320, so all
   * hardcoded tower/building dot coordinates scale uniformly. Defaults to 420
   * (matches MatchPage Row 2 left-column allocation post-2026-05-15 UAT).
   */
  size?: number
}

const S = 320

type Side = 'radiant' | 'dire'

const fillFor = (alive: boolean, team: Side) =>
  alive ? (team === 'radiant' ? 'var(--color-radiant)' : 'var(--color-dire)') : 'var(--color-border)'

const glowFor = (alive: boolean, team: Side) =>
  alive
    ? `drop-shadow(0 0 5px ${team === 'radiant' ? 'var(--color-radiant-soft)' : 'var(--color-dire-soft)'})`
    : 'none'

function Tower({ p, alive, team, r = 4 }: { p: Point; alive: boolean; team: Side; r?: number }) {
  return <circle cx={p.x} cy={p.y} r={r} fill={fillFor(alive, team)} style={{ filter: glowFor(alive, team) }} />
}

/** Square, so a barracks is never mistaken for a tower at four pixels across. */
function Rax({ p, alive, team }: { p: Point; alive: boolean; team: Side }) {
  const size = 5.5
  return (
    <rect
      x={p.x - size / 2}
      y={p.y - size / 2}
      width={size}
      height={size}
      rx={1}
      fill={fillFor(alive, team)}
      style={{ filter: glowFor(alive, team) }}
    />
  )
}

function Ancient({ p, alive, team }: { p: Point; alive: boolean; team: Side }) {
  return (
    <g>
      <circle cx={p.x} cy={p.y} r={7} fill="none" stroke={fillFor(alive, team)} strokeWidth={1.5} />
      <circle cx={p.x} cy={p.y} r={4} fill={fillFor(alive, team)} style={{ filter: glowFor(alive, team) }} />
    </g>
  )
}

function DotaMapView({ buildings: b, heroPositions, size = 420 }: Props) {
  const r = b.radiant
  const d = b.dire

  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      preserveAspectRatio="xMidYMid meet"
      className="block"
      style={{ width: '100%', maxWidth: size, aspectRatio: '1 / 1', borderRadius: 6 }}
    >
      {/* Solid backdrop — visible only if the minimap fails to load */}
      <rect width={S} height={S} fill="var(--color-surface)" rx={6} />

      {/* Real Dota 2 minimap (Liquipedia game-map asset, downscaled to 640x640).
          clipPath rounds the corners to match the 6px border radius.

          BASE_URL, not a bare "/minimap.jpg": the demo is served from a GitHub Pages project
          subdirectory, where a root-absolute path resolves to the domain root and 404s. Vite
          substitutes BASE_URL per build, so this stays correct for both the '/' build and the
          relative-base demo. */}
      <defs>
        <clipPath id="map-clip">
          <rect width={S} height={S} rx={6} />
        </clipPath>
      </defs>
      <image
        href={`${import.meta.env.BASE_URL}minimap.jpg`}
        x={0} y={0}
        width={S} height={S}
        preserveAspectRatio="xMidYMid slice"
        clipPath="url(#map-clip)"
      />

      {/* Buildings. Towers are circles, barracks are squares — at this size a shape is
          the only difference the eye picks up reliably, and "which of these dots is a
          rax" was not answerable before. Positions come from mapBuildings.ts. */}
      {([['radiant', RADIANT_LAYOUT, r], ['dire', DIRE_LAYOUT, d]] as const).map(([side, L, state]) => (
        <g key={side}>
          {(['top', 'mid', 'bot'] as const).map((laneName) => {
            const lane = L[laneName]
            const s = state[laneName]
            return (
              <g key={laneName}>
                <Tower p={lane.tier1} alive={s.tier1} team={side} />
                <Tower p={lane.tier2} alive={s.tier2} team={side} />
                <Tower p={lane.tier3} alive={s.tier3} team={side} />
                <Rax p={lane.meleeRax} alive={s.meleeRax} team={side} />
                <Rax p={lane.rangedRax} alive={s.rangedRax} team={side} />
              </g>
            )
          })}
          <Tower p={L.ancientTop} alive={state.ancientTop} team={side} r={3} />
          <Tower p={L.ancientBottom} alive={state.ancientBottom} team={side} r={3} />
          <Ancient p={L.ancient} alive={state.ancientTop || state.ancientBottom} team={side} />
        </g>
      ))}

      {/* Phase 8: hero positions — clipPath defs, then images, then team-colored stroke rings. */}
      {heroPositions && heroPositions.length > 0 && (
        <>
          <defs>
            {heroPositions.map(h => {
              const c = normalizeMapCoords(h.position_x, h.position_y)
              return (
                <clipPath key={`cp-${h.hero_id}-${h.team}`} id={`cp-${h.hero_id}-${h.team}`}>
                  <circle cx={c.svgX} cy={c.svgY} r={8} />
                </clipPath>
              )
            })}
          </defs>
          {heroPositions.map(h => {
            const portrait = heroMapper(h.hero_id)?.portrait
            if (!portrait) return null
            const c = normalizeMapCoords(h.position_x, h.position_y)
            return (
              <image key={`img-${h.hero_id}-${h.team}`}
                href={portrait}
                x={c.svgX - 8} y={c.svgY - 8}
                width={16} height={16}
                clipPath={`url(#cp-${h.hero_id}-${h.team})`}
                preserveAspectRatio="xMidYMid slice"
              />
            )
          })}
          {heroPositions.map(h => {
            const c = normalizeMapCoords(h.position_x, h.position_y)
            return (
              <circle key={`stroke-${h.hero_id}-${h.team}`}
                cx={c.svgX} cy={c.svgY} r={8} fill="none"
                stroke={h.team === 'radiant' ? 'var(--color-radiant)' : 'var(--color-dire)'}
                strokeWidth={1.5}
              />
            )
          })}
        </>
      )}

      {/* Labels */}
      <text x={8} y={14} fontSize={8} fill="var(--color-text-dim)" fontFamily="monospace" letterSpacing={2}>RADIANT</text>
      <text x={S - 8} y={S - 6} fontSize={8} fill="var(--color-text-dim)" fontFamily="monospace" letterSpacing={2} textAnchor="end">DIRE</text>
    </svg>
  )
}

// ~80 SVG nodes redrawn by every poller on the match page, four to five of them, whether
// or not a building or a hero had actually moved.
export default memo(DotaMapView)
