import { useCallback, useEffect, useState } from 'react'

/**
 * Leagues the reader has starred, kept in this browser.
 *
 * No account, no server: the app has no notion of a user, and "the tournaments I follow"
 * is a preference rather than data anyone else needs. localStorage is the whole store.
 *
 * Shared across every mounted component through a storage event and a local subscriber
 * list — two filter bars on the same page must not disagree about what is starred, and
 * `storage` alone does not fire in the tab that made the change.
 */

const KEY = 'dota-stats:starred-leagues'

const listeners = new Set<(ids: number[]) => void>()

function read(): number[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    // Anything could be in storage — a stale format, a hand-edited value. Take only the
    // numbers rather than letting a bad entry break the filter bar.
    return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === 'number') : []
  } catch {
    return []
  }
}

function write(ids: number[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // Private mode, quota, or storage disabled — starring simply does not persist.
  }
  for (const fn of listeners) fn(ids)
}

export function useStarredLeagues() {
  const [starred, setStarred] = useState<number[]>(read)

  useEffect(() => {
    const onLocal = (ids: number[]) => setStarred(ids)
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setStarred(read())
    }
    listeners.add(onLocal)
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(onLocal)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const toggle = useCallback((leagueId: number) => {
    const next = read()
    const at = next.indexOf(leagueId)
    if (at >= 0) next.splice(at, 1)
    else next.push(leagueId)
    write(next)
  }, [])

  const isStarred = useCallback((leagueId: number) => starred.includes(leagueId), [starred])

  return { starred, toggle, isStarred }
}
