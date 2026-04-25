import { useRef, useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
import { winrateColor } from '../utils/winrateColor'
import IntelTooltip from './IntelTooltip'
import type { DraftTimelineSlot } from '../utils/draftOrder'
import type { HeroStatsEntry } from '../hooks/useHeroStats'
import type { PlayerIntel } from '../hooks/useMatchIntel'

const PHASE_DIVIDER_BEFORE = new Set([7, 11, 16, 20, 22])

interface DraftTimelineProps {
  slots: DraftTimelineSlot[]
  gameState: number | undefined
  heroStatsMap?: Record<number, HeroStatsEntry>
  playerIntelMap?: Record<number, PlayerIntel>
}

/**
 * Two-row chess layout: Radiant actions on top row, Dire on bottom row.
 * Each column = one CM step. The alternating pattern shows who bans/picks first.
 */
export default function DraftTimeline({ slots, gameState, heroStatsMap, playerIntelMap }: DraftTimelineProps) {
  const isDraft = gameState === 2
  const [hoveredStep, setHoveredStep] = useState<number | null>(null)
  const portraitRefs = useRef<Record<number, HTMLDivElement | null>>({})

  return (
    <div className="flex items-start">
      {/* Row labels */}
      <div className="flex flex-col shrink-0 mr-2" style={{ paddingTop: 10 }}>
        <div className="flex items-center text-[8px] font-bold uppercase tracking-widest"
          style={{ height: 48, color: '#4ade80' }}>R</div>
        <div className="flex items-center text-[8px] font-bold uppercase tracking-widest"
          style={{ height: 48, color: '#ef4444' }}>D</div>
      </div>

      {/* 24 columns — one per CM step */}
      <div className="flex gap-1 flex-wrap">
        {slots.map((slot) => {
          const heroInfo = slot.heroId !== undefined ? heroMapper(slot.heroId) : null
          const isActiveEmpty = slot.isActive && isDraft && !heroInfo
          const showDivider = PHASE_DIVIDER_BEFORE.has(slot.step)
          const heroStats = slot.heroId !== undefined ? heroStatsMap?.[slot.heroId] : undefined
          const playerIntel = slot.heroId !== undefined ? playerIntelMap?.[slot.heroId] : undefined
          const showBadge = slot.action === 'pick' && slot.heroId !== undefined && !!heroInfo && !!heroStats
          const canShowTooltip = slot.action === 'pick' && slot.heroId !== undefined && !!heroInfo && !!playerIntel
          const isHovered = hoveredStep === slot.step

          const portrait = (
            <div
              ref={(el) => { portraitRefs.current[slot.step] = el }}
              className={`w-12 h-12 shrink-0 rounded-sm overflow-hidden${isActiveEmpty ? ' animate-pulse' : ''}`}
              style={{
                background: '#141414',
                border: isActiveEmpty ? '1px solid rgba(176,48,48,0.8)' : '1px solid #1e1e1e',
                position: 'relative',
              }}
            >
              {heroInfo && (
                <>
                  <img src={heroInfo.portrait} alt={heroInfo.name} className="w-full h-full object-cover" />
                  {slot.action === 'ban' && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 24 24" aria-hidden="true"
                      style={{ color: '#ef4444', opacity: 0.75, filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.7))' }}>
                      <path d="M4 4 L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                      <path d="M20 4 L4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                    </svg>
                  )}
                  {showBadge && heroStats && (
                    <div aria-hidden="true" style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'rgba(0,0,0,0.72)', padding: '3px',
                      textAlign: 'center', fontSize: 9, fontVariantNumeric: 'tabular-nums',
                    }}>
                      <span style={{ color: winrateColor(heroStats.win_rate) }}>
                        {Math.round(heroStats.win_rate * 100)}%
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )

          // Transparent spacer — same size as portrait, no background
          const spacer = <div className="w-12 h-12 shrink-0" />

          return (
            <div
              key={slot.step}
              className="relative flex flex-col items-center"
              style={{ gap: 0 }}
              onMouseEnter={() => canShowTooltip && setHoveredStep(slot.step)}
              onMouseLeave={() => setHoveredStep(null)}
            >
              {showDivider && (
                <div style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 1, background: '#2a2a2a' }} />
              )}

              {/* Step number — always at top, small */}
              <span style={{ fontSize: 8, lineHeight: 1, color: '#444', fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.02em', marginBottom: 2 }}>
                {slot.step + 1}
              </span>

              {/* Top row = Radiant (team 0), Bottom row = Dire (team 1) */}
              {slot.team === 0 ? portrait : spacer}
              {slot.team === 1 ? portrait : spacer}

              {/* IntelTooltip — outside portrait overflow-hidden (Pitfall 4 fix) */}
              {isHovered && canShowTooltip && playerIntel && heroInfo && (
                <IntelTooltip
                  playerIntel={playerIntel}
                  heroName={heroInfo.name}
                  anchorRef={{ current: portraitRefs.current[slot.step] ?? null }}
                  isLoading={false}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
