import { useQueryClient } from '@tanstack/react-query'
import { useDemoCursor } from './cursor'
import { demoMeta, capturedAtForSlice } from './snapshot'

/**
 * Honest disclosure bar, always visible in the demo build.
 *
 * This is not decoration and must not be made dismissible: the page is a replay of a
 * recording, and anyone looking at it — recruiter or otherwise — has to be able to tell that
 * at a glance, without reading the README. It states what the data is, when it was captured,
 * which match it belongs to, and why nothing is live.
 *
 * The scrubber is deliberately exposed too: being able to drag through the recording makes
 * the "this is a snapshot" claim self-evident rather than something you have to take on faith.
 */

/** Renders an ISO timestamp as UTC, so the label can't be misread as a local wall clock. */
function utcLabel(iso: string | null, withTime = true): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  const date = d.toISOString().slice(0, 10)
  return withTime ? `${date} ${d.toISOString().slice(11, 16)} UTC` : date
}

export default function DemoBanner() {
  const queryClient = useQueryClient()
  const slice = useDemoCursor((s) => s.slice)
  const total = useDemoCursor((s) => s.total)
  const playing = useDemoCursor((s) => s.playing)
  const setSlice = useDemoCursor((s) => s.setSlice)
  const togglePlaying = useDemoCursor((s) => s.togglePlaying)

  const nowShowing = capturedAtForSlice(slice)

  function scrubTo(next: number) {
    setSlice(next)
    void queryClient.invalidateQueries()
  }

  return (
    <div className="sticky top-0 z-50 border-b border-border bg-bg/95 backdrop-blur-sm">
      <div className="max-w-[1320px] mx-auto px-4 md:px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-primary/50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-label text-primary">
          <span className="w-[5px] h-[5px] rounded-full bg-primary" />
          Demo
        </span>

        <p className="min-w-0 text-xs text-text-muted leading-relaxed">
          <span className="text-text">Recorded live data</span>, captured{' '}
          <span className="text-text">{utcLabel(demoMeta.capturedAt)}</span>
          {demoMeta.primaryMatchId !== null && (
            <>
              {' '}from match{' '}
              <span className="text-text">{demoMeta.primaryMatchId}</span>
              {demoMeta.primaryMatchLabel && <> ({demoMeta.primaryMatchLabel})</>}
            </>
          )}
          . The live service is switched off so it does not consume Valve API quota — this page
          replays the recording and makes no network requests.
        </p>

        {total > 1 && (
          <div className="ml-auto flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={togglePlaying}
              aria-label={playing ? 'Pause replay' : 'Play replay'}
              className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-text-dim cursor-pointer transition-colors hover:text-primary hover:border-primary/50"
            >
              {playing ? 'Pause' : 'Play'}
            </button>

            <input
              type="range"
              min={0}
              max={total - 1}
              value={slice}
              onChange={(e) => scrubTo(Number(e.target.value))}
              aria-label="Replay position"
              className="w-28 md:w-40 cursor-pointer accent-[var(--color-primary)]"
            />

            <span className="tabular-nums text-[11px] text-text-dim whitespace-nowrap">
              {slice + 1}/{total}
              {nowShowing && <> · {new Date(nowShowing).toISOString().slice(11, 19)} UTC</>}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
