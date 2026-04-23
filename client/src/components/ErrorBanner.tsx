export default function ErrorBanner() {
  return (
    <div className="p-4 bg-red-950 border border-red-800 text-red-300">
      {/* UI-SPEC copywriting contract: exact error state copy */}
      Could not load live matches — Valve API unreachable. Retrying in 30 seconds.
    </div>
  )
}
