export default function ErrorBanner() {
  return (
    <div
      className="p-4 border rounded-md text-body-lg"
      style={{
        background: 'var(--color-dire-soft)',
        // Border keeps --color-danger (non-text, 3:1); the copy does not — #EF4444 on this
        // tint measures 4.38:1, and error copy is the last text that should be hard to read.
        borderColor: 'var(--color-danger)',
        color: 'var(--color-danger-text)',
      }}
    >
      {/* UI-SPEC copywriting contract: exact error state copy */}
      <p className="font-bold">Couldn't load live matches.</p>
      <p className="mt-1">We'll keep retrying automatically. Check your connection if this persists.</p>
    </div>
  )
}
