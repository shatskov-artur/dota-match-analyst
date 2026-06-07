import DraftPortrait from './DraftPortrait'
import type { DraftItem } from '../hooks/useDraftDetail'
import type { HeroStatsEntry } from '../hooks/useHeroStats'
import type { PlayerIntel } from '../hooks/useMatchIntel'

interface DraftColumnProps {
  team: 'radiant' | 'dire'
  picks: DraftItem[]
  bans: DraftItem[]
  isActive: boolean   // true when activeTeam matches AND gameState === 2
  tentative: boolean  // D-08 — ambiguous first-pick → dashed border + reduced glow
  activePickIndex?: number  // index of next-to-fill pick slot (-1 or default = no active slot)
  activeBanIndex?: number   // index of next-to-fill ban slot  (-1 or default = no active slot)
  heroStatsMap?: Record<number, HeroStatsEntry>   // optional — undefined while loading
  playerIntelMap?: Record<number, PlayerIntel>    // optional — undefined while loading or non-draft
}

/**
 * One team's draft column per D-01 + D-02.
 * Gap-05: forwards isActive and ordinal badge to each DraftPortrait.
 *   - Picks ordinals: "P1"–"P5" (shown only on filled slots)
 *   - Bans ordinals:  "B1"–"B7" (shown only on filled slots)
 *   - Active slot: the slot at activePickIndex / activeBanIndex gets isActive=true
 *
 * Phase 5 (Pitfall 6): heroStatsMap and playerIntelMap forwarded to pick DraftPortrait instances.
 * Ban DraftPortrait: no heroStats or playerIntel (per D-02 — badge on picks only, tooltip on picks only).
 */
export default function DraftColumn({
  team, picks, bans, isActive, tentative,
  activePickIndex = -1, activeBanIndex = -1,
  heroStatsMap, playerIntelMap,
}: DraftColumnProps) {
  const labelColor = team === 'radiant' ? 'var(--color-radiant)' : 'var(--color-dire)'
  const labelText  = team === 'radiant' ? 'Radiant' : 'Dire'

  // Ember glow: three states (inactive / active confident / active tentative).
  // Values copied verbatim from MatchRow.tsx hover pattern per 04-PATTERNS.md §Ember glow.
  const borderLeft =
    isActive && !tentative ? '2px solid var(--color-primary)'
    : isActive && tentative ? '2px dashed var(--color-primary)'
    : '2px solid transparent'

  const boxShadow =
    isActive && !tentative ? '-4px 0 12px var(--color-primary-soft)'
    : isActive && tentative ? '-4px 0 12px var(--color-primary-soft)'
    : 'none'

  const background = isActive && !tentative ? 'var(--color-surface-2)' : 'transparent'

  return (
    <div
      className="pl-3 py-2"
      style={{
        borderLeft,
        boxShadow,
        background,
        transition: 'border 160ms ease, box-shadow 160ms ease, background 160ms ease',
      }}
    >
      {/* Column group label */}
      <p
        className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2"
        style={{ color: labelColor }}
      >
        {labelText}
      </p>

      {/* Picks + bans on one horizontal line */}
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <DraftPortrait
            key={`pick-${i}`}
            kind="pick"
            heroId={picks[i]?.hero_id}
            isActive={i === activePickIndex}
            ordinal={`P${i + 1}`}
            heroStats={picks[i]?.hero_id !== undefined ? heroStatsMap?.[picks[i].hero_id!] : undefined}
            playerIntel={picks[i]?.hero_id !== undefined ? playerIntelMap?.[picks[i].hero_id!] : undefined}
          />
        ))}
        <div style={{ width: 1, height: 40, background: 'var(--color-border)', margin: '0 4px', flexShrink: 0 }} />
        {Array.from({ length: 7 }).map((_, i) => (
          <DraftPortrait
            key={`ban-${i}`}
            kind="ban"
            heroId={bans[i]?.hero_id}
            isActive={i === activeBanIndex}
            ordinal={`B${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
