import { create } from 'zustand'

/**
 * Where in a match the viewer is looking.
 *
 * Generalises the demo replay cursor (src/demo/cursor.ts) from "which capture slice" to
 * "which game minute", and points it at the archive instead of bundled JSON. `'live'`
 * means follow the real clock — the default, and what the LIVE button returns to.
 */
export type CursorPosition = number | 'live'

interface TimelineCursorState {
  minute: CursorPosition
  /** Auto-advance through the archive, one minute per PLAYBACK_MS. */
  playing: boolean
  /** The match the cursor currently belongs to; changing match resets it to live. */
  matchId: string | null
  setMinute: (minute: CursorPosition) => void
  goLive: () => void
  togglePlaying: () => void
  setPlaying: (playing: boolean) => void
  /** Called on mount / match switch. Resets rather than carrying a stale minute across. */
  bindMatch: (matchId: string | null) => void

  /**
   * The scrubber is open as a floating player.
   *
   * Closed is the default and by far the common case: most of the time nobody is
   * scrubbing, and a full-width control bar sitting in the page for all of it was paying
   * rent it did not earn. A button opens it.
   *
   * Kept here rather than in the component so it survives switching between the maps of a
   * series — having placed the player where you want it, having it snap back on every tab
   * click would be worse than not being able to move it at all. `bindMatch` deliberately
   * leaves both alone for the same reason.
   */
  timelineOpen: boolean
  /** Viewport coordinates of the floating player; null means "not placed yet". */
  floatPos: { x: number; y: number } | null
  setTimelineOpen: (open: boolean) => void
  setFloatPos: (pos: { x: number; y: number }) => void
}

export const PLAYBACK_MS = 1200

export const useTimelineCursor = create<TimelineCursorState>((set, get) => ({
  minute: 'live',
  playing: false,
  matchId: null,
  setMinute: (minute) => set({ minute, playing: minute === 'live' ? false : get().playing }),
  goLive: () => set({ minute: 'live', playing: false }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (playing) => set({ playing }),
  bindMatch: (matchId) => {
    if (get().matchId === matchId) return
    set({ matchId, minute: 'live', playing: false })
  },

  timelineOpen: false,
  floatPos: null,
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  setFloatPos: (floatPos) => set({ floatPos }),
}))

/** True when the cursor is parked in the past. */
export function isScrubbing(minute: CursorPosition): minute is number {
  return minute !== 'live'
}
