import { useParams } from 'react-router'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { LiveGamesResponse } from '../hooks/useLiveGames'

export default function MatchPlaceholder() {
  const { matchId } = useParams()
  const queryClient = useQueryClient()

  // D-12: look up from TanStack Query cache — no new BFF call
  const games = queryClient.getQueryData<LiveGamesResponse>(['live-games'])
  const match = games?.games?.find((g) => String(g.match_id) === matchId)

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      {/* Back navigation */}
      <Link
        to="/"
        className="text-green-400 text-sm hover:underline mb-6 inline-block"
      >
        ← Back to matches
      </Link>

      {/* UI-SPEC: dev placeholder label */}
      <p className="text-yellow-400 text-sm font-normal mb-4">
        DEV PLACEHOLDER — Phase 3 will replace this view.
      </p>

      {match ? (
        <pre className="bg-gray-900 rounded-lg p-6 overflow-auto text-sm text-gray-300 font-mono">
          {JSON.stringify(match, null, 2)}
        </pre>
      ) : (
        <p className="text-gray-400">
          Match {matchId} not found in cache. Navigate here from the home page.
        </p>
      )}
    </div>
  )
}
