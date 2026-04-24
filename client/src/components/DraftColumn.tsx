import DraftPortrait from './DraftPortrait'
import type { DraftItem } from '../hooks/useDraftDetail'

interface DraftColumnProps {
  team: 'radiant' | 'dire'
  picks: DraftItem[]
  bans: DraftItem[]
  isActive: boolean   // true when activeTeam matches AND gameState === 2 (DraftSection handles this)
  tentative: boolean  // D-08 — ambiguous first-pick inference → render dashed border + reduced alpha
}

/**
 * One team's draft column per D-01 + D-02:
 *   - Top: 5 pick slots (portraits, padded with empty placeholders)
 *   - Bottom: 7 ban slots (portraits with red X overlay, padded with empty placeholders)
 *   - Left-edge ember glow when isActive (D-06), dashed variant when tentative (D-08)
 *
 * Ember glow values copied verbatim from MatchRow.tsx hover pattern (lines 22-31) —
 * 04-PATTERNS.md §Ember glow on active element. Do NOT invent different colors or timings.
 */
export default function DraftColumn({ team, picks, bans, isActive, tentative }: DraftColumnProps) {
  const labelColor = team === 'radiant' ? '#4ade80' : '#ef4444'   // radiant / dire tokens
  const labelText = team === 'radiant' ? 'Radiant' : 'Dire'

  // Ember glow: three states (inactive / active confident / active tentative).
  const borderLeft =
    isActive && !tentative ? '2px solid #b03030'
    : isActive && tentative ? '2px dashed #b03030'
    : '2px solid transparent'

  const boxShadow =
    isActive && !tentative ? '-4px 0 12px rgba(176,48,48,0.25)'
    : isActive && tentative ? '-4px 0 12px rgba(176,48,48,0.10)'
    : 'none'

  const background = isActive && !tentative ? '#111111' : 'transparent'

  return (
    <div
      className="flex-1 pl-3 py-2"
      style={{
        borderLeft,
        boxShadow,
        background,
        // 160ms transition matches MatchRow hover (client/src/components/MatchRow.tsx line 23).
        transition: 'border 160ms ease, box-shadow 160ms ease, background 160ms ease',
      }}
    >
      {/* Column group label — 10px uppercase, exact copy-paste of HeroPlayerGrid.tsx lines 64-65 */}
      <p
        className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2"
        style={{ color: labelColor }}
      >
        {labelText}
      </p>

      {/* Picks row — always 5 slots per D-02 (CM 7.40 = 5 picks per team) */}
      <div className="flex items-center gap-1 mb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <DraftPortrait key={`pick-${i}`} kind="pick" heroId={picks[i]?.hero_id} />
        ))}
      </div>

      {/* Bans row — always 7 slots per D-02 (CM 7.40 = 7 bans per team) */}
      <div className="flex items-center gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <DraftPortrait key={`ban-${i}`} kind="ban" heroId={bans[i]?.hero_id} />
        ))}
      </div>
    </div>
  )
}
