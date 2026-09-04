interface SkeletonRowProps {
  /** Featured skeleton fills the 2x2 tile with a taller stat-strip placeholder. */
  featured?: boolean
}

/**
 * Neon Bento skeleton tile — matches MatchCard layout so the loading state has no
 * layout jump when real data arrives (ui-ux-pro-max: skeleton over blocking spinner).
 */
export default function SkeletonRow({ featured = false }: SkeletonRowProps) {
  return (
    <div className="flex flex-col w-full h-full rounded-lg border border-border bg-surface p-5">
      {/* League label */}
      <div className="h-3 w-28 bg-surface-2 rounded animate-pulse mb-3" />

      <div className="flex-1 flex flex-col justify-center gap-2.5">
        {/* Team rows */}
        <div className="flex items-center justify-between gap-3">
          <div className={`bg-surface-2 rounded animate-pulse ${featured ? 'h-5 w-40' : 'h-4 w-28'}`} />
          <div className={`bg-surface-2 rounded animate-pulse ${featured ? 'h-8 w-8' : 'h-5 w-5'}`} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className={`bg-surface-2 rounded animate-pulse ${featured ? 'h-5 w-36' : 'h-4 w-24'}`} />
          <div className={`bg-surface-2 rounded animate-pulse ${featured ? 'h-8 w-8' : 'h-5 w-5'}`} />
        </div>

        {/* Featured stat strip placeholder. 16px, not the 18px this shipped with:
            MatchCard's real stat strip is `mt-4 pt-4`, so an off-scale skeleton was also
            an off-by-2px layout jump on arrival. */}
        {featured && (
          <div className="grid grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-border">
            <div className="h-8 bg-surface-2 rounded animate-pulse" />
            <div className="h-8 bg-surface-2 rounded animate-pulse" />
            <div className="h-8 bg-surface-2 rounded animate-pulse" />
          </div>
        )}
      </div>

      {/* Status pill placeholder */}
      <div className="h-5 w-20 bg-surface-2 rounded-full animate-pulse mt-4" />
    </div>
  )
}
