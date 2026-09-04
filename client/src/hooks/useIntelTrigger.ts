import { useCallback, useEffect, useId, useState } from 'react'

/**
 * Hover, focus and tap parity for a tooltip trigger (UI-SPEC 10.5 §6.2, D-2).
 *
 * `IntelTooltip` carries two of this app's named requirements — DRAFT-04 counterpicks and
 * PLAYER-01 hero stats — and both call sites opened it on `onMouseEnter` alone, on an
 * element nothing could focus. That is not a degraded experience for keyboard and touch
 * readers; it is the feature being absent for them entirely.
 *
 * Lives in one hook because the draft portrait and the player row need the identical
 * behaviour and had already drifted once.
 */
export interface IntelTrigger {
  open: boolean
  /** Wire onto the tooltip so the trigger's `aria-describedby` resolves. */
  tooltipId: string
  triggerProps: {
    onMouseEnter: () => void
    onMouseLeave: () => void
    onFocus: () => void
    onBlur: () => void
    onClick: () => void
    'aria-describedby': string | undefined
  }
}

export function useIntelTrigger(enabled: boolean): IntelTrigger {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)

  const show = useCallback(() => {
    if (enabled) setOpen(true)
  }, [enabled])
  const hide = useCallback(() => setOpen(false), [])
  // Tap has neither hover nor focus to offer, so the trigger itself is the toggle.
  const toggle = useCallback(() => {
    setOpen((v) => (enabled ? !v : false))
  }, [enabled])

  // Listened for on the document rather than the trigger: the tooltip can be opened by a
  // pointer that then never returns, leaving nothing focused for a key event to reach.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return {
    open: open && enabled,
    tooltipId,
    triggerProps: {
      onMouseEnter: show,
      onMouseLeave: hide,
      onFocus: show,
      onBlur: hide,
      onClick: toggle,
      'aria-describedby': open && enabled ? tooltipId : undefined,
    },
  }
}
