/**
 * capture-snapshot.ts — records real BFF responses to disk for the static demo build.
 *
 * WHY THE BFF AND NOT VALVE DIRECTLY
 * The client never sees raw Valve payloads. /api/live/games merges Valve's live-game
 * feed with OpenDota league names, the derived Roshan state and the Redis-backed gold/XP
 * history array. Capturing raw Valve would force the demo client to re-derive all of that,
 * which is exactly the kind of "improving the data" this snapshot must avoid. So we record
 * what the browser actually receives, byte for byte.
 *
 * WHAT IT WRITES
 *   demo-data/heroes-stats.json          one-off, GET /api/heroes/stats
 *   demo-data/live-games/NNN.json        one per slice, GET /api/live/games
 *   demo-data/match-<id>/draft/NNN.json  one per slice, GET /api/live/draft/:id
 *   demo-data/match-<id>/winprob/NNN.json one per slice, GET /api/live/winprob/:id
 *   demo-data/match-<id>/intel/NNN.json  every INTEL_EVERY slices (BFF caches it 15 min)
 *   demo-data/manifest.json              written every slice, so a killed run still leaves
 *                                        a valid manifest describing what was captured
 *
 * Every file carries a metadata envelope (capturedAt / endpoint / upstreams / matchId /
 * sliceIndex) around an UNMODIFIED `payload`. Numbers are never touched.
 *
 * Before each write the serialized payload is scanned for the literal secret values in
 * server/.env. A hit aborts the whole run — demo-data/ is committed, so a leak there is
 * permanent.
 *
 * Usage:
 *   npx tsx scripts/capture-snapshot.ts --minutes=20 --interval=30
 *   npx tsx scripts/capture-snapshot.ts --minutes=5 --targets=8932694667,8932767341
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_ROOT = join(REPO_ROOT, 'demo-data')

// ─── CLI ──────────────────────────────────────────────────────────────────────

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

const BASE = flag('base') ?? 'http://localhost:3001'
const MINUTES = Number(flag('minutes') ?? 20)
const INTERVAL_S = Number(flag('interval') ?? 30)
/** Intel is cached 15 min server-side, so re-fetching it every slice returns the same bytes. */
const INTEL_EVERY = Number(flag('intelEvery') ?? 20)
/** Intel fans out to OpenDota per player and Stratz per hero — cap how many matches pay that cost. */
const INTEL_TARGET_LIMIT = Number(flag('intelTargets') ?? 3)
const EXPLICIT_TARGETS = flag('targets')
  ?.split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n))

if (!Number.isFinite(MINUTES) || MINUTES <= 0) throw new Error('--minutes must be a positive number')
if (!Number.isFinite(INTERVAL_S) || INTERVAL_S < 5) throw new Error('--interval must be >= 5 seconds')

// ─── Secret scanner ───────────────────────────────────────────────────────────

/**
 * Reads the literal secret values out of server/.env so we can assert they never appear
 * in a captured payload. Only values longer than 8 chars are checked — shorter ones would
 * produce false positives against ordinary payload content.
 */
function loadSecrets(): Array<{ name: string; value: string }> {
  const envPath = join(REPO_ROOT, 'server', '.env')
  if (!existsSync(envPath)) {
    console.warn('[capture] server/.env not found — secret scan limited to generic patterns')
    return []
  }
  return readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=')
      return { name: line.slice(0, idx), value: line.slice(idx + 1).trim() }
    })
    .filter((e) => e.value.length > 8)
}

const SECRETS = loadSecrets()

/** Generic belt-and-braces patterns for secrets that are not in server/.env. */
const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'steam api key query param', re: /[?&]key=[A-Za-z0-9]{16,}/i },
  { label: 'bearer token', re: /Bearer\s+[A-Za-z0-9._-]{20,}/i },
  { label: 'redis connection url', re: /rediss?:\/\/[^"\s]*@/i },
  { label: 'upstash token', re: /\bA[A-Za-z0-9_-]{40,}=*\b/ },
]

function assertNoSecrets(serialized: string, where: string): void {
  for (const s of SECRETS) {
    if (serialized.includes(s.value)) {
      throw new Error(`SECRET LEAK: value of ${s.name} found in ${where}. Aborting — demo-data/ is committed.`)
    }
  }
  for (const p of SECRET_PATTERNS) {
    const m = serialized.match(p.re)
    if (m) {
      throw new Error(`SECRET LEAK: ${p.label} matched in ${where} (${m[0].slice(0, 12)}…). Aborting.`)
    }
  }
}

// ─── Envelope + IO ────────────────────────────────────────────────────────────

/** Which upstream actually produced each endpoint's data. Kept honest per endpoint. */
const UPSTREAMS: Record<string, string[]> = {
  '/api/live/games': ['Valve Web API (GetLiveLeagueGames)', 'OpenDota (league names)', 'BFF-derived (Roshan state, gold/XP history)'],
  '/api/live/draft': ['Valve Web API (GetLiveLeagueGames)'],
  '/api/live/winprob': ['Stratz (live win rate)', 'BFF-derived (logistic win-probability heuristic)'],
  '/api/live/intel': ['OpenDota (player hero history)', 'Stratz (hero matchups)'],
  '/api/heroes/stats': ['OpenDota (hero stats)'],
}

interface Envelope {
  capturedAt: string
  endpoint: string
  requestUrl: string
  upstreams: string[]
  matchId: number | null
  sliceIndex: number | null
  payload: unknown
}

function upstreamsFor(endpoint: string): string[] {
  const key = Object.keys(UPSTREAMS).find((k) => endpoint.startsWith(k))
  return key ? UPSTREAMS[key] : ['unknown']
}

function pad(n: number): string {
  return String(n).padStart(3, '0')
}

function write(relPath: string, env: Envelope): void {
  const serialized = JSON.stringify(env, null, 2)
  assertNoSecrets(serialized, relPath)
  const full = join(OUT_ROOT, relPath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, serialized, 'utf8')
}

/**
 * Fetches one endpoint and writes it. Returns the payload, or null when the request failed —
 * a failed slice is logged and skipped, never substituted with older or invented data.
 */
async function capture(
  endpoint: string,
  relPath: string,
  opts: { matchId?: number; sliceIndex?: number } = {},
): Promise<unknown | null> {
  const url = `${BASE}${endpoint}`
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  } catch (err) {
    console.error(`  ✗ ${endpoint} — network error: ${(err as Error).message}`)
    return null
  }
  if (!res.ok) {
    console.error(`  ✗ ${endpoint} — HTTP ${res.status}`)
    return null
  }
  const payload: unknown = await res.json()
  write(relPath, {
    capturedAt: new Date().toISOString(),
    endpoint,
    requestUrl: url,
    upstreams: upstreamsFor(endpoint),
    matchId: opts.matchId ?? null,
    sliceIndex: opts.sliceIndex ?? null,
    payload,
  })
  return payload
}

// ─── Target selection ─────────────────────────────────────────────────────────

interface LiveGame {
  match_id?: number
  game_state?: number
  duration?: number
  radiant_team?: { team_name?: string }
  dire_team?: { team_name?: string }
  scoreboard?: Record<string, unknown>
}

function describe(g: LiveGame): string {
  const r = g.radiant_team?.team_name ?? '?'
  const d = g.dire_team?.team_name ?? '?'
  return `${g.match_id} state=${g.game_state} dur=${Math.round(g.duration ?? 0)}s ${r} vs ${d}`
}

/**
 * Picks capture targets when --targets is not given: the longest-running in-game match
 * (richest late-game state) plus a match still in draft (game_state === 2), so the demo
 * can show both a real draft board and a real late-game board.
 */
function autoSelect(games: LiveGame[]): number[] {
  const ids: number[] = []
  const inGame = games
    .filter((g) => g.game_state === 5 && typeof g.match_id === 'number')
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
  if (inGame[0]?.match_id) ids.push(inGame[0].match_id)
  // Second-longest as an insurance target in case the leader ends mid-capture.
  if (inGame[1]?.match_id) ids.push(inGame[1].match_id)
  const drafting = games.filter((g) => g.game_state === 2 && typeof g.match_id === 'number')
  if (drafting[0]?.match_id) ids.push(drafting[0].match_id)
  return ids
}

// ─── Main loop ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  const startedAt = new Date()
  const totalSlices = Math.ceil((MINUTES * 60) / INTERVAL_S)
  console.log(`[capture] base=${BASE} minutes=${MINUTES} interval=${INTERVAL_S}s slices=${totalSlices}`)
  console.log(`[capture] secret scan armed for ${SECRETS.length} env value(s) + ${SECRET_PATTERNS.length} pattern(s)`)

  // One-off: hero stats (OpenDota, 6h server cache — never changes during a capture).
  const heroStats = await capture('/api/heroes/stats', 'heroes-stats.json')
  console.log(`[capture] hero stats: ${heroStats ? `${Object.keys(heroStats as object).length} heroes` : 'FAILED'}`)

  let targets = EXPLICIT_TARGETS ?? []
  /** Targets confirmed present in the current slice's live list — reset every tick. */
  let liveTargets: number[] = []
  const sliceLog: Array<{ slice: number; capturedAt: string; games: number; liveTargets: number[] }> = []

  for (let slice = 0; slice < totalSlices; slice++) {
    const tickStart = Date.now()
    console.log(`\n[capture] slice ${slice + 1}/${totalSlices} — ${new Date().toISOString()}`)

    const live = (await capture('/api/live/games', `live-games/${pad(slice)}.json`, { sliceIndex: slice })) as
      | { games?: LiveGame[] }
      | null

    liveTargets = []
    if (live?.games) {
      if (targets.length === 0) {
        targets = autoSelect(live.games)
        console.log(`  targets auto-selected: ${targets.join(', ')}`)
        for (const id of targets) {
          const g = live.games.find((x) => x.match_id === id)
          if (g) console.log(`    → ${describe(g)}`)
        }
      }
      const present = live.games.filter((g) => targets.includes(g.match_id ?? -1))
      liveTargets = present.map((g) => g.match_id as number)
      const dropped = targets.filter((id) => !liveTargets.includes(id))
      console.log(`  games=${live.games.length}  targets live=${present.length}`)
      for (const g of present) console.log(`    ${describe(g)}`)
      if (dropped.length) console.log(`    (not live this slice, skipped: ${dropped.join(', ')})`)
      sliceLog.push({
        slice,
        capturedAt: new Date().toISOString(),
        games: live.games.length,
        liveTargets: [...liveTargets],
      })
    }

    // CRITICAL: only capture per-match endpoints for targets present in THIS slice's live list.
    // /api/live/winprob/:id answers 200 with a zeroed heuristic for a match that has already
    // ended (live.ts computes the heuristic even when the game is absent), which would write a
    // plausible-looking file full of data that never described a real game state.
    for (const id of liveTargets) {
      await capture(`/api/live/draft/${id}`, `match-${id}/draft/${pad(slice)}.json`, { matchId: id, sliceIndex: slice })
      await capture(`/api/live/winprob/${id}`, `match-${id}/winprob/${pad(slice)}.json`, { matchId: id, sliceIndex: slice })
      // Intel is expensive upstream (OpenDota per player + Stratz per hero), so restrict it to
      // the first few targets and to every INTEL_EVERY-th slice — the BFF caches it 15 min anyway.
      if (slice % INTEL_EVERY === 0 && liveTargets.indexOf(id) < INTEL_TARGET_LIMIT) {
        await capture(`/api/live/intel/${id}`, `match-${id}/intel/${pad(slice)}.json`, { matchId: id, sliceIndex: slice })
      }
    }

    // Manifest is rewritten every slice so an interrupted run still leaves a usable one.
    writeFileSync(
      join(OUT_ROOT, 'manifest.json'),
      JSON.stringify(
        {
          startedAt: startedAt.toISOString(),
          lastSliceAt: new Date().toISOString(),
          base: BASE,
          intervalSeconds: INTERVAL_S,
          plannedSlices: totalSlices,
          capturedSlices: sliceLog.length,
          targets,
          slices: sliceLog,
          note: 'Payloads are unmodified BFF responses. See each file for its own metadata envelope.',
        },
        null,
        2,
      ),
      'utf8',
    )

    if (slice < totalSlices - 1) {
      const elapsed = Date.now() - tickStart
      await sleep(Math.max(0, INTERVAL_S * 1000 - elapsed))
    }
  }

  console.log(`\n[capture] done — ${sliceLog.length} slices, targets ${targets.join(', ')}`)
  console.log(`[capture] output: ${OUT_ROOT}`)
}

main().catch((err) => {
  console.error('[capture] FATAL:', (err as Error).message)
  process.exit(1)
})
