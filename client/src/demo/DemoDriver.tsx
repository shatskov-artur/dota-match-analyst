import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDemoCursor } from './cursor'
import { sliceCount } from './snapshot'

/** How long each captured slice stays on screen. The capture itself was 30s per slice. */
export const STEP_MS = 4000

/**
 * Advances the replay and forces the hooks to re-read the snapshot.
 *
 * WHY invalidateQueries RATHER THAN TOUCHING THE POLLING LOGIC
 * Each hook decides its own cadence through a pure, unit-tested helper
 * (computeDraftInterval, computeWinProbInterval, computeMatchInterval, computeIntelInterval)
 * and several of them correctly return `false` — most notably on game_state === 6, where
 * polling MUST stop. Rewriting those for the demo would mean shipping different polling
 * behaviour from the one that is tested and documented.
 *
 * So the cadence code is left completely untouched: this driver moves the cursor and
 * invalidates the cache, which makes TanStack Query refetch every active query regardless of
 * its refetchInterval. Every one of those refetches is served by apiFetch from bundled JSON,
 * so the replay animates without a single network request.
 *
 * Renders nothing.
 */
export default function DemoDriver() {
  const queryClient = useQueryClient()
  const playing = useDemoCursor((s) => s.playing)
  const setTotal = useDemoCursor((s) => s.setTotal)

  useEffect(() => {
    setTotal(sliceCount)
  }, [setTotal])

  useEffect(() => {
    if (!playing || sliceCount === 0) return
    const id = setInterval(() => {
      const { slice } = useDemoCursor.getState()
      // Loop back to the start so the page keeps showing motion for as long as it is open.
      useDemoCursor.setState({ slice: (slice + 1) % sliceCount })
      void queryClient.invalidateQueries()
    }, STEP_MS)
    return () => clearInterval(id)
  }, [playing, queryClient])

  return null
}
