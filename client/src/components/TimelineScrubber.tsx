import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTimelineCursor } from '../store/timelineCursor'
import type { MatchEvent } from '../hooks/useArchive'

/**
 * Drag through a match minute by minute.
 *
 * The interaction is the demo replay's scrubber (src/demo/DemoBanner.tsx) generalised:
 * a range input over minutes instead of capture slices, backed by the archive instead of
 * bundled JSON. Event ticks under the track mark the moments worth jumping to.
 *
 * It is closed by default and opens as a small floating player.
 *
 * Everything it drives — the graphs, the map, the hero grid, the event stream — is spread
 * down a long page, so a control fixed at the top meant scroll up, drag, scroll back, and
 * try to remember what changed. But sitting in the page full-width was worse value again:
 * most visits never scrub at all, and the bar took a slab of the screen for all of them.
 *
 * So: a button. Press it and a player appears that the viewer drags to wherever it does
 * not cover what they are reading.
 */

export interface TimelineScrubberProps {
  lastMinute: number | null
  currentMinute: number | null
  events: MatchEvent[]
  /** Match still running — enables the LIVE affordance. */
  isLiveMatch: boolean
  /** Minute the archive can actually reconstruct in full (has a raw snapshot). */
  snapshotRange?: { minMinute: number | null; maxMinute: number | null }
}

/** Event classes worth a tick mark, and the colour that reads at 3px wide. */
const TICK_STYLE: Record<string, { color: string; label: string }> = {
  tower: { color: 'var(--color-accent)', label: 'Tower' },
  barracks: { color: 'var(--color-danger)', label: 'Barracks' },
  roshan: { color: 'var(--color-primary)', label: 'Roshan' },
  teamfight: { color: 'var(--color-text-muted)', label: 'Teamfight' },
  first_blood: { color: 'var(--color-dire)', label: 'First blood' },
}

/** Panel size used to keep it on screen; approximate is fine, it only clamps dragging. */
const PANEL_W = 460
const PANEL_H = 120
const EDGE = 8

function mmss(minute: number): string {
  return `${minute}:00`
}

const btn =
  'px-2.5 py-1 rounded-[7px] border border-border text-[12px] text-text-muted transition-colors ' +
  'hover:border-primary hover:text-text disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-muted'

export default function TimelineScrubber({
  lastMinute,
  currentMinute,
  events,
  isLiveMatch,
  snapshotRange,
}: TimelineScrubberProps) {
  const minute = useTimelineCursor((s) => s.minute)
  const playing = useTimelineCursor((s) => s.playing)
  const setMinute = useTimelineCursor((s) => s.setMinute)
  const goLive = useTimelineCursor((s) => s.goLive)
  const togglePlaying = useTimelineCursor((s) => s.togglePlaying)
  const open = useTimelineCursor((s) => s.timelineOpen)
  const floatPos = useTimelineCursor((s) => s.floatPos)
  const setOpen = useTimelineCursor((s) => s.setTimelineOpen)
  const setFloatPos = useTimelineCursor((s) => s.setFloatPos)

  const max = lastMinute ?? 0
  const scrubbing = minute !== 'live'
  // Nothing to scrub through: either the match is not archived at all, or only minute 0
  // exists so far. A control with a single position is furniture, not a feature — the
  // whole panel stays out of the layout until the archive has a range to drag across.
  const hasRange = max > 0
  // The live clock can run ahead of the archive — the recorder writes every 30s, and it
  // may not be recording this league at all. Show the real clock, but never let the slider
  // sit past the last minute that actually exists.
  const liveMinute = currentMinute ?? max
  const value = Math.max(0, Math.min(scrubbing ? (minute as number) : liveMinute, max))
  const displayMinute = scrubbing ? value : liveMinute
  const archiveLagging = !scrubbing && liveMinute > max

  // Draft picks/bans sit at negative t; they are not points on the game clock.
  const ticks = useMemo(() => {
    if (max <= 0) return []
    const seen = new Set<string>()
    return events
      .filter((e) => e.t >= 0 && TICK_STYLE[e.type])
      .map((e) => ({ type: e.type, minute: Math.min(Math.floor(e.t / 60), max) }))
      .filter((e) => {
        const key = `${e.type}:${e.minute}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [events, max])

  // ── Dragging ──────────────────────────────────────────────────────────────
  // Pointer events rather than mouse events, so a touchscreen drags it too, and pointer
  // capture so releasing outside the panel still ends the drag.
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  const clamp = useCallback((x: number, y: number) => {
    const maxX = Math.max(EDGE, window.innerWidth - PANEL_W - EDGE)
    const maxY = Math.max(EDGE, window.innerHeight - PANEL_H - EDGE)
    return { x: Math.min(Math.max(EDGE, x), maxX), y: Math.min(Math.max(EDGE, y), maxY) }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only the handle drags; buttons and the slider inside must keep working.
    if ((e.target as HTMLElement).closest('button, input')) return
    const rect = e.currentTarget.parentElement!.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    setFloatPos(clamp(e.clientX - d.dx, e.clientY - d.dy))
  }
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // A window that shrank can leave the panel off screen; pull it back rather than
  // stranding the control somewhere unreachable.
  useEffect(() => {
    if (!open || !floatPos) return
    const onResize = () => setFloatPos(clamp(floatPos.x, floatPos.y))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, floatPos, clamp, setFloatPos])

  const step = (delta: number) => setMinute(Math.max(0, Math.min(max, value + delta)))

  // Placed after every hook so the hook order stays stable across renders.
  if (!hasRange) return null

  const outsideSnapshots =
    scrubbing &&
    snapshotRange?.minMinute != null &&
    typeof minute === 'number' &&
    minute < snapshotRange.minMinute

  const controls = (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-[0.12em] text-text-dim">Timeline</span>

        <button
          type="button"
          onClick={togglePlaying}
          disabled={!scrubbing}
          aria-label={playing ? 'Pause playback' : 'Play from here'}
          className={btn}
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} disabled={value <= 0} aria-label="Previous minute" className={btn}>
            −1m
          </button>
          <button type="button" onClick={() => step(1)} disabled={value >= max} aria-label="Next minute" className={btn}>
            +1m
          </button>
        </div>

        <span className="font-mono text-[13px] text-text tabular-nums">{mmss(displayMinute)}</span>
        <span className="text-[11px] text-text-dim">
          {archiveLagging ? `· archived to ${mmss(max)}` : `/ ${mmss(max)}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={goLive}
            disabled={!scrubbing}
            className={
              'px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.12em] transition-colors ' +
              (scrubbing
                ? 'border border-danger text-danger hover:bg-[var(--color-dire-soft)]'
                : isLiveMatch
                  ? 'border border-radiant text-radiant'
                  : 'border border-border text-text-dim')
            }
          >
            {scrubbing ? 'Back to live' : isLiveMatch ? '● Live' : 'Final'}
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close timeline" className={btn}>
            ✕
          </button>
        </div>
      </div>

      <div className="relative">
        <input
          type="range"
          min={0}
          max={Math.max(max, 1)}
          step={1}
          value={value}
          aria-label="Match minute"
          onChange={(e) => setMinute(Number(e.target.value))}
          className="w-full accent-[var(--color-primary)] disabled:opacity-40"
        />
        {/* Event ticks. pointer-events-none so they never steal a drag from the input. */}
        <div className="relative h-3 mt-0.5 pointer-events-none" aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={`${t.type}-${t.minute}`}
              title={`${TICK_STYLE[t.type].label} @ ${mmss(t.minute)}`}
              className="absolute top-0 w-[2px] h-2 rounded-full"
              style={{
                left: `${max > 0 ? (t.minute / max) * 100 : 0}%`,
                backgroundColor: TICK_STYLE[t.type].color,
                opacity: 0.85,
              }}
            />
          ))}
        </div>
      </div>

      {outsideSnapshots && (
        <p className="text-[11px] text-accent">
          Showing the earliest recorded state — the archive starts at {mmss(snapshotRange!.minMinute!)}.
        </p>
      )}
    </>
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          // Open it where the finger already is. Defaulting to the bottom of the screen
          // meant the panel arrived somewhere the eye was not, which reads as a delay
          // even though nothing is delayed.
          const r = e.currentTarget.getBoundingClientRect()
          if (!floatPos) setFloatPos(clamp(r.left, r.bottom + 8))
          setOpen(true)
        }}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border
                   text-[12px] text-text-muted transition-colors hover:border-primary hover:text-text"
        data-testid="timeline-open"
      >
        <span aria-hidden="true">⏱</span>
        Timeline
        <span className="text-[11px] text-text-dim">{mmss(max)}</span>
      </button>
    )
  }

  // Normally set from the button's own position the moment it was pressed; the bottom
  // centre is only the fallback for an open state restored without one.
  const pos = floatPos ?? {
    x: Math.max(EDGE, (window.innerWidth - PANEL_W) / 2),
    y: Math.max(EDGE, window.innerHeight - PANEL_H - 24),
  }

  return (
    <div
      className="fixed z-50 flex flex-col gap-2 rounded-[12px] border border-primary bg-surface p-3
                 shadow-[0_18px_48px_rgba(0,0,0,0.6)]"
      style={{ left: pos.x, top: pos.y, width: PANEL_W, maxWidth: 'calc(100vw - 16px)' }}
      data-testid="timeline-scrubber"
      data-floating="true"
    >
      {/* Drag handle. Everything interactive is excluded in onPointerDown. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex flex-col gap-2 cursor-grab active:cursor-grabbing touch-none"
        data-testid="timeline-drag-handle"
      >
        {controls}
      </div>
    </div>
  )
}
