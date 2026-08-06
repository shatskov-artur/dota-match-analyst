/**
 * Static snapshot index for VITE_DEMO_MODE builds.
 *
 * Loads every file written by scripts/capture-snapshot.ts and indexes it by endpoint and
 * capture slice, so apiFetch can answer BFF requests without any network access.
 *
 * WHY import.meta.glob WITH eager: true
 * The JSON is inlined into the bundle rather than served from public/ and fetched at runtime.
 * Chrome blocks fetch() against file:// URLs, so a public/ + fetch approach would make the
 * built page fail when opened straight off disk. Inlining keeps the build genuinely
 * self-contained. It also means glob does the module resolution, so importing JSON needs no
 * `resolveJsonModule` in tsconfig.
 *
 * This module is only ever reached through a dynamic import inside the demo branch of
 * apiFetch, so a production (non-demo) build tree-shakes it — and the whole snapshot — away.
 *
 * NOTHING HERE MODIFIES PAYLOADS. Envelopes are unwrapped and handed back verbatim.
 */

/** Metadata envelope written around every captured payload. Mirrors capture-snapshot.ts. */
export interface DemoEnvelope {
  capturedAt: string
  endpoint: string
  requestUrl: string
  upstreams: string[]
  matchId: number | null
  sliceIndex: number | null
  payload: unknown
}

/** slice index → envelope. Sparse: a match absent from a slice simply has no entry. */
type SliceMap = Map<number, DemoEnvelope>

const liveGamesRaw = import.meta.glob<DemoEnvelope>('../../../demo-data/live-games/*.json', {
  eager: true,
  import: 'default',
})
const perMatchRaw = import.meta.glob<DemoEnvelope>('../../../demo-data/match-*/*/*.json', {
  eager: true,
  import: 'default',
})
const heroStatsRaw = import.meta.glob<DemoEnvelope>('../../../demo-data/heroes-stats.json', {
  eager: true,
  import: 'default',
})

/** Slice index comes from the envelope; the filename is only a fallback. */
function sliceOf(env: DemoEnvelope, filePath: string): number {
  if (typeof env.sliceIndex === 'number') return env.sliceIndex
  const m = filePath.match(/(\d+)\.json$/)
  return m ? Number(m[1]) : 0
}

const liveGames: SliceMap = new Map()
for (const [path, env] of Object.entries(liveGamesRaw)) {
  liveGames.set(sliceOf(env, path), env)
}

type MatchKind = 'draft' | 'winprob' | 'intel'
const perMatch = new Map<number, Record<MatchKind, SliceMap>>()

const MATCH_PATH = /match-(\d+)\/(draft|winprob|intel)\/(\d+)\.json$/
for (const [path, env] of Object.entries(perMatchRaw)) {
  const m = path.match(MATCH_PATH)
  if (!m) continue
  const matchId = Number(m[1])
  const kind = m[2] as MatchKind
  if (!perMatch.has(matchId)) {
    perMatch.set(matchId, { draft: new Map(), winprob: new Map(), intel: new Map() })
  }
  perMatch.get(matchId)![kind].set(sliceOf(env, path), env)
}

const heroStats: DemoEnvelope | undefined = Object.values(heroStatsRaw)[0]

/**
 * Returns the envelope for `slice`, or the most recent EARLIER one when that exact slice
 * was not captured (e.g. a per-match endpoint that failed once).
 *
 * Deliberately never falls forward to a later slice: a match that only entered the capture
 * at slice 10 must read as absent at slice 3, because it genuinely was. Returning future
 * data at an earlier cursor would misrepresent the recording.
 */
function at(map: SliceMap, slice: number): DemoEnvelope | null {
  const exact = map.get(slice)
  if (exact) return exact
  let best: DemoEnvelope | null = null
  let bestKey = -1
  for (const [key, env] of map) {
    if (key <= slice && key > bestKey) {
      bestKey = key
      best = env
    }
  }
  return best
}

/** Highest slice index present in the live-games recording — the replay length. */
export const sliceCount: number =
  liveGames.size > 0 ? Math.max(...liveGames.keys()) + 1 : 0

// ─── Endpoint resolution ──────────────────────────────────────────────────────

const DRAFT_RE = /^\/api\/live\/draft\/(\d+)$/
const WINPROB_RE = /^\/api\/live\/winprob\/(\d+)$/
const INTEL_RE = /^\/api\/live\/intel\/(\d+)$/

/**
 * Maps a BFF path + replay position to the captured payload.
 * Returns null when nothing was captured for that path at that point — apiFetch turns
 * that into a 404, which is exactly what the live BFF answered at the time.
 */
export function resolveDemoResponse(path: string, slice: number): unknown | null {
  if (path === '/api/heroes/stats') return heroStats?.payload ?? null
  if (path === '/api/live/games') return at(liveGames, slice)?.payload ?? null

  for (const [re, kind] of [
    [DRAFT_RE, 'draft'],
    [WINPROB_RE, 'winprob'],
    [INTEL_RE, 'intel'],
  ] as Array<[RegExp, MatchKind]>) {
    const m = path.match(re)
    if (!m) continue
    const entry = perMatch.get(Number(m[1]))
    if (!entry) return null
    return at(entry[kind], slice)?.payload ?? null
  }
  return null
}

/** Wall-clock timestamp of the live-games slice currently on screen. */
export function capturedAtForSlice(slice: number): string | null {
  return at(liveGames, slice)?.capturedAt ?? null
}

// ─── Banner metadata ──────────────────────────────────────────────────────────

interface SnapshotGame {
  match_id?: number
  duration?: number
  game_state?: number
  league_name?: string
  radiant_team?: { team_name?: string }
  dire_team?: { team_name?: string }
}

function gamesAt(slice: number): SnapshotGame[] {
  const payload = at(liveGames, slice)?.payload as { games?: SnapshotGame[] } | undefined
  return payload?.games ?? []
}

/**
 * The match the demo is "about": among matches that were still live in the final slice and
 * that we captured detail endpoints for, the one that had been running longest — i.e. the
 * richest late-game board.
 */
function pickPrimaryMatch(): SnapshotGame | null {
  const last = sliceCount - 1
  const candidates = gamesAt(last).filter(
    (g) => typeof g.match_id === 'number' && perMatch.has(g.match_id),
  )
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => ((b.duration ?? 0) > (a.duration ?? 0) ? b : a))
}

const primary = pickPrimaryMatch()

export const demoMeta = {
  /** ISO timestamp of the first captured slice. */
  capturedAt: at(liveGames, 0)?.capturedAt ?? null,
  /** ISO timestamp of the last captured slice. */
  capturedUntil: at(liveGames, sliceCount - 1)?.capturedAt ?? null,
  sliceCount,
  intervalHintSeconds: 30,
  primaryMatchId: primary?.match_id ?? null,
  primaryMatchLabel:
    primary && (primary.radiant_team?.team_name || primary.dire_team?.team_name)
      ? `${primary.radiant_team?.team_name ?? 'TBD'} vs ${primary.dire_team?.team_name ?? 'TBD'}`
      : null,
  primaryLeagueName: primary?.league_name ?? null,
  /** Every match id we captured detail endpoints for. */
  capturedMatchIds: [...perMatch.keys()],
  /** Distinct upstreams named across the recording — shown in the banner tooltip. */
  upstreams: [...new Set(Object.values(liveGamesRaw).flatMap((e) => e.upstreams))],
} as const
