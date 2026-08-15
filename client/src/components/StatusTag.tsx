type Status = 'Draft' | 'Live' | 'Post-game' | 'Strategy' | 'Starting' | 'Waiting' | 'Break' | 'Unknown'

interface StatusTagProps {
  status: Status
}

// Token-driven status styling — all colors resolve to design-token var(--...) props.
//   Live → Dire-red, Draft → gold (primary), Strategy → steel (accent), Starting → radiant.
//   Glow applies only where a status calls for it (gold for Draft, steel for Strategy).
const styleMap: Record<Status, { color: string; glow?: string; pulse?: boolean }> = {
  'Live':      { color: 'var(--color-dire)' },
  'Draft':     { color: 'var(--color-primary)', glow: 'var(--glow-primary)', pulse: true },
  'Strategy':  { color: 'var(--color-accent)', glow: 'var(--glow-accent)', pulse: true },
  'Starting':  { color: 'var(--color-radiant)', pulse: true },
  'Waiting':   { color: 'var(--color-text-dim)' },
  'Break':     { color: 'var(--color-text-dim)' },
  'Post-game': { color: 'var(--color-text-dim)' },
  'Unknown':   { color: 'var(--color-text-dim)' },
}

export default function StatusTag({ status }: StatusTagProps) {
  const s = styleMap[status]
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ color: s.color }}
    >
      <span
        className={`shrink-0 rounded-full${s.pulse ? ' animate-pulse' : ''}`}
        style={{
          width: 5,
          height: 5,
          background: s.color,
          boxShadow: s.glow ?? 'none',
        }}
      />
      <span className="text-[10px] uppercase tracking-[0.18em] font-medium">
        {status}
      </span>
    </span>
  )
}
