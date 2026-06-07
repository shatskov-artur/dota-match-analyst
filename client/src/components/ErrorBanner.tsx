export default function ErrorBanner() {
  return (
    <div
      className="p-4 border rounded-md text-sm"
      style={{
        background: 'var(--color-dire-soft)',
        borderColor: 'var(--color-danger)',
        color: 'var(--color-danger)',
      }}
    >
      {/* UI-SPEC copywriting contract: exact error state copy */}
      <p className="font-semibold">Couldn't load live matches.</p>
      <p className="mt-1">We'll keep retrying automatically. Check your connection if this persists.</p>
    </div>
  )
}
