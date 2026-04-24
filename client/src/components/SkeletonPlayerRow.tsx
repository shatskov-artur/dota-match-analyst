export default function SkeletonPlayerRow() {
  return (
    <div
      className="flex items-center gap-4 px-0 border-b"
      style={{ minHeight: 52, borderColor: '#1e1e1e' }}
    >
      {/* Portrait skeleton — 48px wide to match PlayerRow portrait column */}
      <div
        className="w-12 h-[1px] rounded-full shrink-0"
        style={{
          background: 'linear-gradient(90deg, #181818 0%, #222222 50%, #181818 100%)',
          animation: 'skshimmer 2.4s ease-in-out infinite',
        }}
      />
      {/* Name skeleton — flex-1 to match the player name column */}
      <div
        className="flex-1 h-[1px] rounded-full"
        style={{
          background: 'linear-gradient(90deg, #181818 0%, #222222 50%, #181818 100%)',
          animation: 'skshimmer 2.4s ease-in-out infinite 0.2s',
        }}
      />
      {/* Stats cluster skeleton — fixed width right to suggest K/D/A + NW columns */}
      <div
        className="w-32 h-[1px] rounded-full shrink-0"
        style={{
          background: '#181818',
          animation: 'skshimmer 2.4s ease-in-out infinite 0.4s',
        }}
      />
      <style>{`
        @keyframes skshimmer {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 1;   }
        }
      `}</style>
    </div>
  )
}
