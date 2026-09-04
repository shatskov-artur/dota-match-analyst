import { useRef } from 'react'
import { heroMapper } from '../utils/heroMapper'
import { hiddenProfile } from '@shared/hiddenProfile'
import { useIntelTrigger } from '../hooks/useIntelTrigger'
import IntelTooltip from './IntelTooltip'
import { COL, NAME_MIN_PX, SHOW_GPM, SHOW_XPM, SHOW_LHDN, STAT_CELL } from './playerColumns'
import type { PlayerIntel } from '../hooks/useMatchIntel'

interface PlayerRowProps {
  player: {
    account_id?: number
    hero_id?: number
    name?: string
    team?: number
    kills?: number
    death?: number       // field is 'death', NOT 'deaths'
    assists?: number
    net_worth?: number
    respawn_timer?: number
    level?: number       // D-08 optional
    gpm?: number         // D-08 optional
    xpm?: number         // D-08 optional
    lh?: number          // D-08 last hits
    dn?: number          // D-08 denies
  }
  hasGpm: boolean        // controlled at grid level — show GPM column for all rows or none
  hasXpm: boolean        // controlled at grid level
  hasLhDn: boolean       // controlled at grid level
  playerIntel?: PlayerIntel  // counterpick + player stats; tooltip on portrait hover (all match stages)
  /** The map is over — no respawn countdown. */
  matchOver?: boolean
}

export default function PlayerRow({ player, hasGpm, hasXpm, hasLhDn, playerIntel, matchOver = false }: PlayerRowProps) {
  const heroInfo = player.hero_id !== undefined ? heroMapper(player.hero_id) : null
  const portraitRef = useRef<HTMLButtonElement>(null)
  const canShowTooltip = !!heroInfo && !!playerIntel
  const { open: showTooltip, tooltipId, triggerProps } = useIntelTrigger(canShowTooltip)
  // isDraftSlot: hero_id is explicitly absent (undefined), not an unknown ID
  const isDraftSlot = player.hero_id === undefined
  // isDead: respawn_timer > 0 means dead with countdown; 0 means alive; undefined = treat as alive
  // A finished match still carries whatever respawn timer the last snapshot happened to
  // catch; counting it down forever reads as a game still in progress.
  const isDead = !matchOver && player.respawn_timer !== undefined && player.respawn_timer > 0
  // Hidden profile: show Valve name + portrait + KDA; never crash; do not fetch OpenDota stats
  const isHidden = player.account_id !== undefined && hiddenProfile(player.account_id)
  // isHidden is declared to satisfy the threat model guard — rendering is unchanged (silently skip missing data)
  void isHidden

  const portraitBody = (
    <>
      {heroInfo ? (
        <img
          src={heroInfo.portrait}
          alt={heroInfo.name}
          className="w-12 h-12 object-cover rounded-sm"
          style={{
            opacity: isDead ? 0.3 : 1,
            boxShadow: `inset 0 0 0 1.5px ${player.team === 1 ? 'var(--color-dire)' : 'var(--color-radiant)'}`,
          }}
        />
      ) : (
        <div className="w-12 h-12 rounded-sm bg-surface" />
      )}
      {isDead && (
        <span
          className="absolute bottom-0 left-0 right-0 text-label text-center text-text-dim"
        >
          {player.respawn_timer}s
        </span>
      )}
    </>
  )

  return (
    <div
      className="flex items-center gap-2 px-0 border-b border-border transition-colors duration-150 hover:bg-surface-2"
      style={{ minHeight: 52 }}
    >
      {/* Portrait column — 48px fixed, dead overlay, respawn countdown.
          PLAYER-01 (D-2): where there is intel to reveal the portrait is a button, so the
          panel is reachable by keyboard and by tap and not only by a hovering mouse. A
          portrait with no intel behind it stays inert rather than adding an empty tab stop
          to every one of the ten rows. */}
      {canShowTooltip && playerIntel && heroInfo ? (
        <button
          type="button"
          ref={portraitRef}
          className="relative shrink-0"
          style={{ width: COL.portrait }}
          {...triggerProps}
        >
          {portraitBody}
          {showTooltip && (
            <IntelTooltip
              id={tooltipId}
              playerIntel={playerIntel}
              heroName={heroInfo.name}
              anchorRef={portraitRef}
              isLoading={false}
            />
          )}
        </button>
      ) : (
        <div className="relative shrink-0" style={{ width: COL.portrait }}>
          {portraitBody}
        </div>
      )}

      {/* Name column — flex-1 with a floor: it is the only elastic column, so without a minimum
          the fixed stat columns squeeze it to zero and the panel shows numbers for nobody. */}
      <div className="flex-1 min-w-0" style={{ minWidth: NAME_MIN_PX }}>
        <p className="text-body-lg leading-none truncate text-text">
          {isDraftSlot ? '—' : (player.name ?? '—')}
        </p>
        {heroInfo && !isDraftSlot && (
          <p className="text-label leading-none mt-0.5 truncate text-text-dim">
            {heroInfo.name}
          </p>
        )}
      </div>

      {/* LVL column */}
      <span className={`text-body tabular-nums text-text-muted ${STAT_CELL}`} style={{ width: COL.lvl }}>
        {isDraftSlot ? '—' : (player.level ?? '—')}
      </span>

      {/* K/D/A column */}
      <span className={`text-body font-mono tabular-nums ${STAT_CELL}`} style={{ width: COL.kda }}>
        <span className="text-text">{isDraftSlot ? '—' : (player.kills ?? '—')}</span>
        <span className="text-text-dim">/</span>
        <span style={{ color: 'var(--color-dire)' }}>{isDraftSlot ? '—' : (player.death ?? '—')}</span>
        <span className="text-text-dim">/</span>
        <span className="text-text">{isDraftSlot ? '—' : (player.assists ?? '—')}</span>
      </span>

      {/* NW column — gold mono per UI-SPEC */}
      <span className={`text-body font-mono tabular-nums ${STAT_CELL}`} style={{ width: COL.nw, color: 'var(--color-gold)' }}>
        {isDraftSlot ? '—' : (player.net_worth !== undefined ? player.net_worth.toLocaleString() : '—')}
      </span>

      {/* Optional GPM column — present only when the data exists AND the card is wide enough */}
      {hasGpm && (
        <span className={`text-label tabular-nums text-text-muted ${STAT_CELL} ${SHOW_GPM}`} style={{ width: COL.gpm }}>
          {isDraftSlot ? '—' : (player.gpm ?? '—')}
        </span>
      )}

      {/* Optional XPM column */}
      {hasXpm && (
        <span className={`text-label tabular-nums text-text-muted ${STAT_CELL} ${SHOW_XPM}`} style={{ width: COL.xpm }}>
          {isDraftSlot ? '—' : (player.xpm ?? '—')}
        </span>
      )}

      {/* Optional LH/DN column — first to go when space runs out */}
      {hasLhDn && (
        <span className={`text-label tabular-nums text-text-muted ${STAT_CELL} ${SHOW_LHDN}`} style={{ width: COL.lhdn }}>
          {isDraftSlot ? '—' : (player.lh !== undefined ? `${player.lh}/${player.dn ?? '—'}` : '—')}
        </span>
      )}
    </div>
  )
}
