type Status = 'Draft' | 'Live' | 'Post-game' | 'Strategy' | 'Starting' | 'Waiting' | 'Break' | 'Unknown'

interface StatusTagProps {
  status: Status
}

const styleMap: Record<Status, { dot: string; text: string; glow?: string; pulse?: boolean }> = {
  'Live':      { dot: '#b03030', text: '#c04040', glow: '#b03030' },
  'Draft':     { dot: '#b08c20', text: '#c8a830', glow: '#b08c20', pulse: true },
  'Strategy':  { dot: '#2060b0', text: '#3080d0', glow: '#2060b0', pulse: true },
  'Starting':  { dot: '#206030', text: '#30a050', glow: '#206030', pulse: true },
  'Waiting':   { dot: '#383838', text: '#555555' },
  'Break':     { dot: '#503020', text: '#806040' },
  'Post-game': { dot: '#303030', text: '#484848' },
  'Unknown':   { dot: '#252525', text: '#383838' },
}

export default function StatusTag({ status }: StatusTagProps) {
  const s = styleMap[status]
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ color: s.text }}
    >
      <span
        className={`shrink-0 rounded-full${s.pulse ? ' animate-pulse' : ''}`}
        style={{
          width: 5,
          height: 5,
          background: s.dot,
          boxShadow: s.glow ? `0 0 6px ${s.glow}` : 'none',
        }}
      />
      <span className="text-[10px] uppercase tracking-[0.18em] font-medium">
        {status}
      </span>
    </span>
  )
}
