export default function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 min-h-[44px] border-b border-border">
      {/* Wide bar: team names area */}
      <div className="flex-1 h-4 bg-surface-2 rounded animate-pulse" />
      {/* Narrow bar: status tag area */}
      <div className="w-16 h-4 bg-surface-2 rounded animate-pulse" />
    </div>
  )
}
