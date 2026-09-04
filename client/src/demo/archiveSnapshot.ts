/**
 * Static archive index for VITE_DEMO_MODE builds.
 *
 * Serves the tournament export in demo-data/archive/ — one complete run of The
 * International 2026 — so the bracket, the schedule, the standings, every match's timeline
 * and event log, and the minute scrubber all work in a build that makes no network calls.
 *
 * WHY import.meta.glob WITHOUT `eager`, unlike snapshot.ts
 * The export is 47 MB across 266 files. Inlining it the way the twenty-minute live
 * recording is inlined would put all of it in the entry chunk: nobody should download a
 * tournament to draw a match list. A lazy glob hands back one dynamic import per file,
 * Rollup emits each as its own chunk, and opening a match costs exactly the two files that
 * match needs.
 *
 * This module is only ever reached through a dynamic import inside the demo branch of
 * apiFetch, so a production (non-demo) build drops it — and the whole export — with that
 * branch.
 *
 * NOTHING HERE MODIFIES PAYLOADS. Each file holds a verbatim BFF response and is handed
 * back as it stands. Where the export has nothing, this returns null and apiFetch answers
 * 404 — the same answer the live BFF gave when the export was taken.
 */

/** Vite's lazy glob: path → a function that imports that file's default export. */
type LazyGlob<T> = Record<string, () => Promise<T>>

const rootGlob = import.meta.glob<unknown>('../../../demo-data/archive/*.json', {
  import: 'default',
})
const leagueGlob = import.meta.glob<unknown>('../../../demo-data/archive/league-*/*.json', {
  import: 'default',
})
const matchGlob = import.meta.glob<unknown>('../../../demo-data/archive/match/*.json', {
  import: 'default',
})
const atGlob = import.meta.glob<unknown>('../../../demo-data/archive/at/*.json', {
  import: 'default',
})

// ─── File index ───────────────────────────────────────────────────────────────
//
// Only the glob's keys are read here, never its values, so building these costs no
// payload: nothing is fetched until a loader is actually called.

/** `.../match/8943013334.json` → `8943013334`. */
function indexByStem(glob: LazyGlob<unknown>): Map<string, () => Promise<unknown>> {
  const out = new Map<string, () => Promise<unknown>>()
  for (const [path, load] of Object.entries(glob)) {
    const stem = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '')
    out.set(stem, load)
  }
  return out
}

/** `.../league-19719/bracket.json` → `19719/bracket`. */
function indexByLeague(glob: LazyGlob<unknown>): Map<string, () => Promise<unknown>> {
  const out = new Map<string, () => Promise<unknown>>()
  for (const [path, load] of Object.entries(glob)) {
    const m = path.match(/league-(\d+)\/([a-z]+)\.json$/)
    if (m) out.set(`${m[1]}/${m[2]}`, load)
  }
  return out
}

const rootFiles = indexByStem(rootGlob)
const leagueFiles = indexByLeague(leagueGlob)
const matchFiles = indexByStem(matchGlob)
const atFiles = indexByStem(atGlob)

// ─── Shapes this module has to read rather than pass through ─────────────────
//
// Deliberately partial: only the fields used for routing and for the synthesised status
// are described. Everything else stays `unknown` and is forwarded untouched.

interface ArchiveManifest {
  leagueId: number
  complete: boolean
  counts: {
    matchesExported: number
    matchesWithTimeTravel: number
    minutes: number
    files: number
  }
}

interface TournamentsFile {
  tournaments: Array<{ leagueId: number; name: string | null }>
}

interface LeagueMatchesFile {
  matches: Array<{ matchId: number; seriesId: number | null }>
}

/** match/<id>.json: one member per endpoint, null where that endpoint answered 404. */
type MatchBundle = Record<MatchMember, unknown>

const MATCH_MEMBERS = ['timeline', 'analysis', 'h2h', 'series', 'snapshots'] as const
type MatchMember = (typeof MATCH_MEMBERS)[number]

const isMatchMember = (s: string): s is MatchMember =>
  (MATCH_MEMBERS as readonly string[]).includes(s)

/** at/<id>.json: minute (as a string key) → the /at response recorded for that minute. */
type AtFile = Record<string, unknown>

// ─── Loaders ──────────────────────────────────────────────────────────────────

async function load<T>(
  index: Map<string, () => Promise<unknown>>,
  key: string,
): Promise<T | null> {
  const loader = index.get(key)
  if (!loader) return null
  return (await loader()) as T
}

/**
 * seriesId → one match id belonging to it.
 *
 * Built from the per-league match lists, which carry the series id of every game. The
 * export has no file keyed by series, but match/<id>.json holds the very response
 * /api/series/:id returns for the series that match belongs to — so the index is a lookup,
 * not a reconstruction. Without it the bracket, the standings and every schedule row are
 * dead links, because all three navigate by series id.
 *
 * Cached as the promise, so concurrent callers share one load.
 */
let seriesIndex: Promise<Map<number, number>> | null = null

function loadSeriesIndex(): Promise<Map<number, number>> {
  seriesIndex ??= (async () => {
    const index = new Map<number, number>()
    for (const [key, loader] of leagueFiles) {
      if (!key.endsWith('/matches')) continue
      const file = (await loader()) as LeagueMatchesFile
      for (const row of file.matches) {
        if (row.seriesId !== null && !index.has(row.seriesId)) index.set(row.seriesId, row.matchId)
      }
    }
    return index
  })()
  return seriesIndex
}

// ─── Minute resolution ────────────────────────────────────────────────────────

/** Non-negative integers only; anything else is a request the server would have rejected. */
function parseCount(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/**
 * The recorded /at response for `minute`, or the nearest EARLIER one.
 *
 * Mirrors the server: it answers with the latest snapshot at or before the requested
 * minute, and falls back to the earliest one it has when the request predates the
 * recording. Never interpolates and never falls forward — a minute on screen is always a
 * minute that was actually recorded.
 *
 * The stored payload's own flags (`exact`, `reconstructed`, `itemsAreFinal`,
 * `assistsKnown`) are left exactly as the server set them: they describe the minute that
 * is returned, which is what the page reports.
 */
function pickMinute(file: AtFile, minute: number): unknown | null {
  const exact = file[String(minute)]
  if (exact !== undefined) return exact

  const available = Object.keys(file)
    .map(Number)
    .filter((m) => Number.isInteger(m))
    .sort((a, b) => a - b)
  if (available.length === 0) return null

  let best: number | null = null
  for (const m of available) {
    if (m <= minute) best = m
    else break
  }
  return file[String(best ?? available[0])] ?? null
}

// ─── Synthesised status ───────────────────────────────────────────────────────

/**
 * /api/archive/status has no recorded response — it reports on a database, and the demo
 * has none. It is answered from the export's own manifest instead, which is the same claim
 * the live endpoint makes about the live archive: what is configured, whether it can be
 * read, how much is in it, and which leagues it covers. Getting this wrong is not cosmetic:
 * `trackedLeagueIds` is what the nav and NotRecordedNotice use to say which tournament this
 * build actually holds.
 */
async function archiveStatus(): Promise<unknown | null> {
  const manifest = await load<ArchiveManifest>(rootFiles, 'manifest')
  if (!manifest) return null

  const tournaments = await load<TournamentsFile>(rootFiles, 'tournaments')
  const name = tournaments?.tournaments.find((t) => t.leagueId === manifest.leagueId)?.name ?? null

  return {
    configured: true,
    // The export is a file on disk that was just read: reachable is the honest answer, and
    // `complete` from the manifest is what says the export finished rather than aborted.
    reachable: manifest.complete,
    // Counts describe the export, not a database — these are the only totals that exist.
    counts: {
      matches: manifest.counts.matchesExported,
      matchesWithTimeTravel: manifest.counts.matchesWithTimeTravel,
      minutes: manifest.counts.minutes,
      files: manifest.counts.files,
    },
    trackedLeagueIds: [manifest.leagueId],
    trackedLeagues: [{ leagueId: manifest.leagueId, name }],
  }
}

// ─── Endpoint resolution ──────────────────────────────────────────────────────

const TOURNAMENT_RE = /^\/api\/tournaments\/(\d+)\/(bracket|schedule)$/
const MATCH_MEMBER_RE = /^\/api\/matches\/(\d+)\/([a-z0-9]+)$/
const SERIES_RE = /^\/api\/series\/(\d+)$/

/**
 * Maps a BFF path to the exported payload.
 *
 * Returns null when the export holds nothing for it — apiFetch turns that into a 404,
 * which is exactly what the live BFF answered for the endpoints recorded as gaps
 * (analysis before a replay is parsed, h2h for a team OpenDota has no history for) and for
 * the endpoints that were never exported at all.
 *
 * Async because every file behind it is a lazy chunk.
 */
export async function resolveArchiveResponse(path: string): Promise<unknown | null> {
  const [pathname, rawQuery = ''] = path.split('?')
  const query = new URLSearchParams(rawQuery)

  if (pathname === '/api/archive/status') return archiveStatus()

  if (pathname === '/api/tournaments') return load(rootFiles, 'tournaments')

  const tournament = pathname.match(TOURNAMENT_RE)
  if (tournament) return load(leagueFiles, `${tournament[1]}/${tournament[2]}`)

  if (pathname === '/api/matches') {
    // The export is per league, so a league-wide question can be answered and a global one
    // cannot. The file is the recorded response to `?leagueId=<id>&limit=200`; it is handed
    // back whole rather than re-filtered, because a filtered list would be a response the
    // server never gave.
    const leagueId = query.get('leagueId')
    return leagueId === null ? null : load(leagueFiles, `${leagueId}/matches`)
  }

  const series = pathname.match(SERIES_RE)
  if (series) {
    const matchId = (await loadSeriesIndex()).get(Number(series[1]))
    if (matchId === undefined) return null
    const bundle = await load<MatchBundle>(matchFiles, String(matchId))
    return bundle?.series ?? null
  }

  const member = pathname.match(MATCH_MEMBER_RE)
  if (member) {
    const [, matchId, endpoint] = member

    if (endpoint === 'at') {
      const file = await load<AtFile>(atFiles, matchId)
      // No at/<id>.json at all: this match has no live snapshot record, so the export
      // carries no state to travel to. Absent, not empty.
      if (!file) return null
      // `t` is seconds into the game and `minute` is minutes; the export is keyed by
      // minute, so seconds resolve to the minute that contains them.
      const t = parseCount(query.get('t'))
      const minute = t !== null ? Math.floor(t / 60) : parseCount(query.get('minute'))
      if (minute === null) return null
      return pickMinute(file, minute)
    }

    if (!isMatchMember(endpoint)) return null
    const bundle = await load<MatchBundle>(matchFiles, matchId)
    // A null member is a 404 the export recorded, not a hole in the export.
    return bundle?.[endpoint] ?? null
  }

  return null
}
