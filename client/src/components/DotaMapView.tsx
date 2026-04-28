import type { BuildingState } from '@shared/buildingDecoder'
import { heroMapper } from '../utils/heroMapper'
import { normalizeMapCoords } from '../utils/mapCoords'

interface HeroPosition {
  hero_id: number
  team: 'radiant' | 'dire'
  position_x: number
  position_y: number
}

interface Props {
  buildings: BuildingState
  heroPositions?: HeroPosition[]
}

const S = 320

function Dot({
  x, y, alive, team, r = 4,
}: { x: number; y: number; alive: boolean; team: 'radiant' | 'dire'; r?: number }) {
  const color = alive
    ? team === 'radiant' ? '#4ade80' : '#ef4444'
    : '#1c1c1c'
  const shadow = alive
    ? team === 'radiant' ? '0 0 5px rgba(74,222,128,0.6)' : '0 0 5px rgba(239,68,68,0.6)'
    : 'none'
  return <circle cx={x} cy={y} r={r} fill={color} style={{ filter: alive ? `drop-shadow(${shadow})` : 'none' }} />
}

export default function DotaMapView({ buildings: b, heroPositions }: Props) {
  const r = b.radiant
  const d = b.dire

  return (
    <svg
      width={S} height={S} viewBox={`0 0 ${S} ${S}`}
      style={{ borderRadius: 6, display: 'block' }}
    >
      {/* Background — solid fill is the bottom layer */}
      <rect width={S} height={S} fill="#07100a" rx={6} />

      {/* River diagonal strip — fallback art (visible only when minimap image is missing) */}
      <polygon points="105,0 148,0 0,148 0,105" fill="#0b1a0d" />
      <polygon points="172,320 215,320 320,215 320,172" fill="#0b1a0d" />

      {/* Lane paths (faint) — fallback art */}
      {/* Top lane: Radiant base → left edge up → across top → Dire base */}
      <polyline points="52,258 26,230 26,26 230,26" fill="none" stroke="#0f1f12" strokeWidth={10} strokeLinejoin="round" strokeLinecap="round" />
      {/* Bot lane: Radiant base → across bottom → right edge up → Dire base */}
      <polyline points="52,258 90,294 294,294 294,128" fill="none" stroke="#0f1f12" strokeWidth={10} strokeLinejoin="round" strokeLinecap="round" />
      {/* Mid lane */}
      <line x1={52} y1={258} x2={268} y2={52} stroke="#0f1f12" strokeWidth={10} />

      {/* Base area rings — fallback art */}
      <circle cx={52} cy={258} r={48} fill="none" stroke="#162a18" strokeWidth={1} />
      <circle cx={268} cy={52} r={48} fill="none" stroke="#2a1618" strokeWidth={1} />

      {/* ── RADIANT buildings ── */}
      {/* Top lane (left edge, top to bottom from T1→T3→Rax) */}
      <Dot x={26} y={78}  alive={r.top.tier1}     team="radiant" />
      <Dot x={26} y={138} alive={r.top.tier2}     team="radiant" />
      <Dot x={26} y={192} alive={r.top.tier3}     team="radiant" />
      <Dot x={48} y={224} alive={r.top.meleeRax}  team="radiant" r={3} />
      <Dot x={60} y={224} alive={r.top.rangedRax} team="radiant" r={3} />
      {/* Mid lane (diagonal) */}
      <Dot x={158} y={162} alive={r.mid.tier1}     team="radiant" />
      <Dot x={120} y={200} alive={r.mid.tier2}     team="radiant" />
      <Dot x={84}  y={237} alive={r.mid.tier3}     team="radiant" />
      <Dot x={48}  y={243} alive={r.mid.meleeRax}  team="radiant" r={3} />
      <Dot x={60}  y={243} alive={r.mid.rangedRax} team="radiant" r={3} />
      {/* Bot lane (bottom edge) */}
      <Dot x={218} y={294} alive={r.bot.tier1}     team="radiant" />
      <Dot x={168} y={294} alive={r.bot.tier2}     team="radiant" />
      <Dot x={116} y={291} alive={r.bot.tier3}     team="radiant" />
      <Dot x={48}  y={263} alive={r.bot.meleeRax}  team="radiant" r={3} />
      <Dot x={60}  y={263} alive={r.bot.rangedRax} team="radiant" r={3} />
      {/* Ancient towers */}
      <Dot x={38}  y={248} alive={r.ancientTop}    team="radiant" r={3.5} />
      <Dot x={38}  y={270} alive={r.ancientBottom} team="radiant" r={3.5} />
      {/* Ancient */}
      <circle cx={52} cy={258} r={7} fill="none" stroke={r.ancientTop || r.ancientBottom ? '#4ade80' : '#1c1c1c'} strokeWidth={1.5} />
      <Dot x={52}  y={258} alive={r.ancientTop || r.ancientBottom} team="radiant" r={4} />

      {/* ── DIRE buildings ── */}
      {/* Top lane (top edge, left→right from T1→T3→Rax) */}
      <Dot x={102} y={26}  alive={d.top.tier1}     team="dire" />
      <Dot x={158} y={26}  alive={d.top.tier2}     team="dire" />
      <Dot x={212} y={26}  alive={d.top.tier3}     team="dire" />
      <Dot x={260} y={48}  alive={d.top.meleeRax}  team="dire" r={3} />
      <Dot x={272} y={48}  alive={d.top.rangedRax} team="dire" r={3} />
      {/* Mid lane */}
      <Dot x={162} y={158} alive={d.mid.tier1}     team="dire" />
      <Dot x={200} y={120} alive={d.mid.tier2}     team="dire" />
      <Dot x={236} y={83}  alive={d.mid.tier3}     team="dire" />
      <Dot x={260} y={68}  alive={d.mid.meleeRax}  team="dire" r={3} />
      <Dot x={272} y={68}  alive={d.mid.rangedRax} team="dire" r={3} />
      {/* Bot lane (right edge) */}
      <Dot x={294} y={242} alive={d.bot.tier1}     team="dire" />
      <Dot x={294} y={182} alive={d.bot.tier2}     team="dire" />
      <Dot x={291} y={128} alive={d.bot.tier3}     team="dire" />
      <Dot x={260} y={88}  alive={d.bot.meleeRax}  team="dire" r={3} />
      <Dot x={272} y={88}  alive={d.bot.rangedRax} team="dire" r={3} />
      {/* Ancient towers */}
      <Dot x={282} y={60}  alive={d.ancientTop}    team="dire" r={3.5} />
      <Dot x={282} y={72}  alive={d.ancientBottom} team="dire" r={3.5} />
      {/* Ancient */}
      <circle cx={268} cy={62} r={7} fill="none" stroke={d.ancientTop || d.ancientBottom ? '#ef4444' : '#1c1c1c'} strokeWidth={1.5} />
      <Dot x={268} y={62} alive={d.ancientTop || d.ancientBottom} team="dire" r={4} />

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
                stroke={h.team === 'radiant' ? '#4ade80' : '#ef4444'}
                strokeWidth={1.5}
              />
            )
          })}
        </>
      )}

      {/* Labels */}
      <text x={8} y={14} fontSize={8} fill="#1e3020" fontFamily="monospace" letterSpacing={2}>RADIANT</text>
      <text x={S - 8} y={S - 6} fontSize={8} fill="#301e1e" fontFamily="monospace" letterSpacing={2} textAnchor="end">DIRE</text>
    </svg>
  )
}
