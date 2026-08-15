/**
 * Loading placeholders shaped like the content they stand in for.
 *
 * The pattern is the one SkeletonRow already established for the home grid: a pulsing
 * `surface-2` block inside the real container, so nothing shifts when data lands.
 * Extended here to the v2.0 surfaces, which were shipping bare "Loading schedule…" text.
 *
 * A skeleton must match the real layout's box, otherwise it trades a spinner for a jump.
 */

/** One pulsing bar. `w` is any Tailwind width class. */
export function SkeletonLine({ w = 'w-24', h = 'h-3' }: { w?: string; h?: string }) {
  return <div className={`${h} ${w} bg-surface-2 rounded animate-pulse`} />
}

/** A circle — team logos, avatars. */
export function SkeletonDot({ size = 'w-5 h-5' }: { size?: string }) {
  return <div className={`${size} bg-surface-2 rounded-sm animate-pulse shrink-0`} />
}

/** Mirrors one row of the schedule list. */
export function SkeletonScheduleRow() {
  return (
    <div className="bento-card flex items-center gap-3">
      <SkeletonLine w="w-[132px]" />
      <SkeletonLine w="w-[100px]" />
      <div className="flex items-center gap-2 ml-2">
        <SkeletonDot />
        <SkeletonLine w="w-28" h="h-4" />
      </div>
      <SkeletonLine w="w-8" h="h-4" />
      <div className="flex items-center gap-2">
        <SkeletonLine w="w-28" h="h-4" />
        <SkeletonDot />
      </div>
      <div className="ml-auto">
        <SkeletonLine w="w-10" />
      </div>
    </div>
  )
}

export function SkeletonSchedule({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading schedule">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonScheduleRow key={i} />
      ))}
    </div>
  )
}

/** Mirrors the standings table: rank, logo, name, record. */
export function SkeletonStandings({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bento-card" aria-busy="true" aria-label="Loading standings">
      <SkeletonLine w="w-24" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonLine w="w-4" />
            <SkeletonDot />
            <SkeletonLine w={i % 3 === 0 ? 'w-40' : 'w-32'} h="h-4" />
            <div className="ml-auto">
              <SkeletonLine w="w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mirrors the bracket: columns of two-slot match cards. */
export function SkeletonBracket({ columns = 4, perColumn = 4 }: { columns?: number; perColumn?: number }) {
  return (
    <div className="flex gap-6 overflow-hidden" aria-busy="true" aria-label="Loading bracket">
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className="w-[240px] shrink-0 flex flex-col gap-3">
          <SkeletonLine w="w-20" />
          {Array.from({ length: Math.max(1, perColumn >> c) }).map((_, i) => (
            <div key={i} className="rounded-[12px] border border-border bg-bg-elev p-2.5 flex flex-col gap-2">
              <SkeletonLine w="w-16" h="h-2" />
              <div className="flex items-center gap-2">
                <SkeletonDot size="w-4 h-4" />
                <SkeletonLine w="w-24" />
              </div>
              <div className="flex items-center gap-2">
                <SkeletonDot size="w-4 h-4" />
                <SkeletonLine w="w-20" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Generic panel placeholder for blocks with no distinctive shape. */
export function SkeletonPanel({ lines = 3, title = true }: { lines?: number; title?: boolean }) {
  return (
    <div className="bento-card flex flex-col gap-2.5" aria-busy="true">
      {title && <SkeletonLine w="w-28" />}
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} w={i === lines - 1 ? 'w-1/2' : 'w-full'} h="h-4" />
      ))}
    </div>
  )
}
