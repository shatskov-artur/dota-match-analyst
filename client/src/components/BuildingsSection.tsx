import type { BuildingState, LaneBuildings } from '@shared/buildingDecoder'

interface BuildingsSectionProps {
  buildings: BuildingState
  // Caller guarantees buildings.unavailable === false before rendering this component
}

const RADIANT_ORDER: Array<keyof LaneBuildings> = ['tier1', 'tier2', 'tier3', 'meleeRax', 'rangedRax']
const DIRE_ORDER: Array<keyof LaneBuildings> = ['rangedRax', 'meleeRax', 'tier3', 'tier2', 'tier1']
const LANES: Array<'top' | 'mid' | 'bot'> = ['top', 'mid', 'bot']

function BuildingDot({ standing, team }: { standing: boolean; team: 'radiant' | 'dire' }) {
  const standingColor = team === 'radiant' ? '#4ade80' : '#ef4444'
  return (
    <span
      className="w-2 h-2 rounded-full inline-block"
      style={{
        background: standing ? standingColor : '#303030',
        opacity: standing ? 1 : 0.25,
      }}
    />
  )
}

export default function BuildingsSection({ buildings }: BuildingsSectionProps) {
  return (
    <div className="py-4">
      <p className="text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: '#303030' }}>
        Buildings
      </p>
      <div className="flex gap-12">
        {/* Radiant column */}
        <div className="flex flex-col gap-2">
          {LANES.map((lane) => (
            <div key={lane} className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.2em] w-8" style={{ color: '#303030' }}>
                {lane}
              </span>
              <div className="flex items-center gap-1">
                {RADIANT_ORDER.map((key) => (
                  <BuildingDot
                    key={key}
                    standing={buildings.radiant[lane][key]}
                    team="radiant"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Center divider */}
        <div style={{ width: 1, background: '#1e1e1e' }} />

        {/* Dire column */}
        <div className="flex flex-col gap-2">
          {LANES.map((lane) => (
            <div key={lane} className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {DIRE_ORDER.map((key) => (
                  <BuildingDot
                    key={key}
                    standing={buildings.dire[lane][key]}
                    team="dire"
                  />
                ))}
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] w-8" style={{ color: '#303030' }}>
                {lane}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
