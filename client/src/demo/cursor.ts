import { create } from 'zustand'

/**
 * Replay position for the demo build.
 *
 * apiFetch reads this synchronously and outside React via `useDemoCursor.getState()`, while
 * DemoBanner subscribes to it as an ordinary hook — which is why this is a store rather than
 * a module-level variable or React context.
 */
interface DemoCursorState {
  /** Index of the capture slice currently on screen. */
  slice: number
  /** Number of slices in the recording — set once by DemoDriver from the snapshot. */
  total: number
  /** Whether the replay is advancing on its own. */
  playing: boolean
  setSlice: (slice: number) => void
  setTotal: (total: number) => void
  togglePlaying: () => void
}

export const useDemoCursor = create<DemoCursorState>((set) => ({
  slice: 0,
  total: 0,
  playing: true,
  setSlice: (slice) => set({ slice }),
  setTotal: (total) => set({ total }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
}))

/** Synchronous read for non-React callers (apiFetch). */
export function currentSlice(): number {
  return useDemoCursor.getState().slice
}
