import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState<string>('checking...')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(d.status === 'ok' ? 'BFF OK' : 'unexpected'))
      .catch(() => setHealth('BFF unreachable'))
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-green-400">Dota 2 Match Analyst</h1>
        <p className="mt-2 text-gray-400">BFF status: {health}</p>
      </div>
    </div>
  )
}
