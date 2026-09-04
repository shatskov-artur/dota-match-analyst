import type { BuildingState, LaneBuildings } from '@shared/buildingDecoder'

interface BuildingsSectionProps {
  buildings: BuildingState
  // Caller guarantees buildings.unavailable === false before rendering this component
}

const RADIANT_ORDER: Array<keyof LaneBuildings> = ['tier1', 'tier2', 'tier3', 'meleeRax', 'rangedRax']
const DIRE_ORDER: Array<keyof LaneBuildings> = ['rangedRax', 'meleeRax', 'tier3', 'tier2', 'tier1']
const LANES: Array<'top' | 'mid' | 'bot'> = ['top', 'mid', 'bot']

function BuildingDot({ standing, team }: { standing: boolean; team: 'radiant' | 'dire' }) {
  const standingColor = team === 'radiant' ? 'var(--color-radiant)' : 'var(--color-dire)'
  return (
    <span
      className="w-2 h-2 rounded-full inline-block"
      style={{
        background: standing ? standingColor : 'var(--color-border)',
        opacity: standing ? 1 : 0.25,
      }}
    />
  )
}

export default function BuildingsSection({ buildings }: BuildingsSectionProps) {
  return (
    <div className="py-4">
      <p className="text-label uppercase tracking-micro mb-4" style={{ color: 'var(--color-text-dim)' }}>
        Buildings
      </p>
      <div className="flex gap-12 justify-center">
        {/* Radiant column */}
        <div className="flex flex-col gap-2">
          {LANES.map((lane) => (
            <div key={lane} className="flex items-center gap-3">
              <span className="text-label uppercase tracking-label w-8" style={{ color: 'var(--color-text-dim)' }}>
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
        <div style={{ width: 1, background: 'var(--color-border)' }} />

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
              <span className="text-label uppercase tracking-label w-8" style={{ color: 'var(--color-text-dim)' }}>
                {lane}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
