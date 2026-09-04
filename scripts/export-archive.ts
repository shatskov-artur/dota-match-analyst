/**
 * export-archive.ts — dumps a whole tournament archive from the BFF into static JSON
 * files, so the GitHub Pages demo can serve the full The International 2026 without a
 * database behind it.
 *
 * WHY THE BFF AND NOT POSTGRES DIRECTLY
 * Same reason capture-snapshot.ts records the BFF: the client consumes BFF shapes, not
 * table rows. /api/matches/:id/at reconstructs a live-game payload from snapshots and
 * fills the gaps from the OpenDota timeline; /api/tournaments/:id/bracket derives the
 * tree from nodes and series. Reading Postgres would force the demo client to re-derive
 * all of it, which is how a demo starts disagreeing with the real app.
 *
 * WHY SO FEW FILES
 * Vite emits one chunk per imported JSON file, so a naive "one file per endpoint per
 * match per minute" layout would be ~4000 chunks and a build that never finishes. Hence
 * the two bundling decisions below: the five per-match endpoints collapse into ONE file
 * per match, and every time-travel minute of a match collapses into ONE keyed file. That
 * is ~265 files for ~4000 upstream responses.
 *
 * WHAT IT WRITES (under --out, default demo-data/archive)
 *   manifest.json                what was exported, when, counters, per-match index
 *   tournaments.json             GET /api/tournaments
 *   league-<id>/bracket.json     GET /api/tournaments/:id/bracket
 *   league-<id>/schedule.json    GET /api/tournaments/:id/schedule
 *   league-<id>/matches.json     GET /api/matches?leagueId=:id&limit=200
 *   match/<matchId>.json         { timeline, analysis, h2h, series, snapshots }
 *   at/<matchId>.json            { "<minute>": <GET /api/matches/:id/at?minute=N> }
 *
 * Payloads are stored UNMODIFIED. An endpoint that answers 404 or returns nothing is
 * stored as null and logged as a gap — never filled with a plausible-looking stand-in.
 *
 * Before every write the serialized bytes are scanned for the literal secret values in
 * server/.env. A hit aborts the run: demo-data/ is committed, so a leak there is
 * permanent and no partial output is worth it.
 *
 * Usage:
 *   npx tsx scripts/export-archive.ts --league=19719
 *   npx tsx scripts/export-archive.ts --league=19719 --max-minutes=30 --out=demo-data/archive
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ─── CLI ──────────────────────────────────────────────────────────────────────

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

const RAW_LEAGUE = flag('league')
if (!RAW_LEAGUE) throw new Error('--league=<leagueId> is required (e.g. --league=19719)')
const LEAGUE_ID = Number(RAW_LEAGUE)
if (!Number.isInteger(LEAGUE_ID) || LEAGUE_ID <= 0) throw new Error('--league must be a positive integer')

const BASE = flag('base') ?? 'http://localhost:3001'
const OUT_ROOT = join(REPO_ROOT, flag('out') ?? join('demo-data', 'archive'))

const RAW_MAX_MINUTES = flag('max-minutes')
/** null means "every minute the archive has", which is the point of the export. */
const MAX_MINUTES: number | null = RAW_MAX_MINUTES === undefined ? null : Number(RAW_MAX_MINUTES)
if (MAX_MINUTES !== null && (!Number.isInteger(MAX_MINUTES) || MAX_MINUTES <= 0)) {
  throw new Error('--max-minutes must be a positive integer')
}

/** The list endpoint is capped server-side; 200 covers a full TI and then some. */
const MATCH_LIST_LIMIT = 200

// ─── Secret scanner ───────────────────────────────────────────────────────────

/**
 * Reads the literal secret values out of server/.env so we can assert they never appear
 * in an exported payload. Only values longer than 8 chars are checked — shorter ones
 * would produce false positives against ordinary payload content.
 */
function loadSecrets(): Array<{ name: string; value: string }> {
  const envPath = join(REPO_ROOT, 'server', '.env')
  if (!existsSync(envPath)) {
    console.warn('[export] server/.env not found — secret scan limited to generic patterns')
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
      throw new Error(`SECRET LEAK: value of ${s.name} found in ${where}. Aborting — the export is committed.`)
    }
  }
  for (const p of SECRET_PATTERNS) {
    const m = serialized.match(p.re)
    if (m) {
      throw new Error(`SECRET LEAK: ${p.label} matched in ${where} (${m[0].slice(0, 12)}…). Aborting.`)
    }
  }
}

// ─── IO ───────────────────────────────────────────────────────────────────────

const written: Array<{ path: string; bytes: number }> = []
let bytesOnDisk = 0

/**
 * Serializes, scans and writes one file. Data files are written compact rather than
 * pretty-printed: indentation would roughly double a ~50 MB export for bytes no browser
 * reads. The manifest is the one file a human opens, so it gets `pretty`.
 */
function writeJson(relPath: string, value: unknown, pretty = false): number {
  const serialized = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)
  assertNoSecrets(serialized, relPath)
  const full = join(OUT_ROOT, relPath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, serialized, 'utf8')
  const bytes = statSync(full).size
  const existing = written.find((w) => w.path === relPath)
  if (existing) {
    // The manifest is rewritten as the run progresses; count its bytes once, not per pass.
    bytesOnDisk += bytes - existing.bytes
    existing.bytes = bytes
  } else {
    written.push({ path: relPath, bytes })
    bytesOnDisk += bytes
  }
  return bytes
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2)
}

// ─── HTTP with rate-limit awareness ───────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A fetch result is three-valued on purpose. `missing` is an answer — the archive has no
 * h2h for a match with unknown teams — and must be recorded as null. `failed` is an
 * absence of an answer, and must never be written as null, because the client could not
 * tell the two apart afterwards.
 */
type FetchResult =
  | { kind: 'ok'; data: unknown }
  | { kind: 'missing'; status: number }
  | { kind: 'failed'; reason: string }

const MAX_ATTEMPTS = 4

/**
 * The BFF rations /api/* at 120 requests a minute per client and this export makes a few
 * thousand, so throttling is the normal case, not an error case. Rather than guess a safe
 * delay we read the budget the server reports back and pause when it runs low; the 429
 * branch stays as the safety net for a budget shared with another caller.
 */
let rateLimitPauseUntil = 0

function noteRateLimit(res: Response): void {
  const remaining = Number(res.headers.get('RateLimit-Remaining'))
  const reset = Number(res.headers.get('RateLimit-Reset'))
  if (!Number.isFinite(remaining) || !Number.isFinite(reset)) return
  // Two spare requests, not zero: a retry may need to fit inside the same window.
  if (remaining <= 2) rateLimitPauseUntil = Date.now() + Math.max(1, reset) * 1000
}

async function respectRateLimit(): Promise<void> {
  const waitMs = rateLimitPauseUntil - Date.now()
  if (waitMs > 0) await sleep(waitMs)
}

async function fetchJson(endpoint: string): Promise<FetchResult> {
  const url = `${BASE}${endpoint}`
  let lastReason = 'unknown'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await respectRateLimit()

    let res: Response
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    } catch (err) {
      lastReason = `network error: ${(err as Error).message}`
      await sleep(500 * attempt)
      continue
    }

    noteRateLimit(res)

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'))
      const waitS = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5
      rateLimitPauseUntil = Date.now() + waitS * 1000
      lastReason = 'HTTP 429 (rate limited)'
      // A throttle is not a failed attempt — the request never reached a handler.
      attempt--
      continue
    }

    // 404 and 204 are the archive saying "nothing here", which is data, not a fault.
    if (res.status === 404 || res.status === 204) return { kind: 'missing', status: res.status }

    if (!res.ok) {
      lastReason = `HTTP ${res.status}`
      // 5xx is worth another try; 4xx will answer the same way forever.
      if (res.status < 500) return { kind: 'failed', reason: lastReason }
      await sleep(500 * attempt)
      continue
    }

    try {
      return { kind: 'ok', data: (await res.json()) as unknown }
    } catch (err) {
      lastReason = `malformed JSON: ${(err as Error).message}`
      await sleep(500 * attempt)
    }
  }

  return { kind: 'failed', reason: `${lastReason} after ${MAX_ATTEMPTS} attempts` }
}

/** Fetches an endpoint whose absence is acceptable. Throws only when it truly failed. */
async function fetchOrNull(endpoint: string, gaps: string[]): Promise<unknown> {
  const result = await fetchJson(endpoint)
  if (result.kind === 'ok') return result.data
  if (result.kind === 'missing') {
    gaps.push(`${endpoint} → HTTP ${result.status}`)
    return null
  }
  throw new Error(`${endpoint} — ${result.reason}`)
}

/** Fetches an endpoint the export cannot proceed without. */
async function fetchRequired(endpoint: string): Promise<unknown> {
  const result = await fetchJson(endpoint)
  if (result.kind === 'ok') return result.data
  const detail = result.kind === 'missing' ? `HTTP ${result.status}` : result.reason
  throw new Error(`required endpoint ${endpoint} unavailable — ${detail}`)
}

// ─── Payload narrowing ────────────────────────────────────────────────────────
//
// Everything off the wire is `unknown` until checked. These guards read only the fields
// the export itself needs (which matches to visit, which minutes exist); the payloads are
// stored whole regardless of what the guards look at.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

interface MatchListEntry {
  matchId: number
  radiantTeamName: string | null
  direTeamName: string | null
  startTime: number | null
}

function readMatchList(payload: unknown): MatchListEntry[] {
  if (!isRecord(payload) || !Array.isArray(payload.matches)) return []
  const out: MatchListEntry[] = []
  for (const raw of payload.matches) {
    if (!isRecord(raw) || typeof raw.matchId !== 'number') continue
    out.push({
      matchId: raw.matchId,
      radiantTeamName: typeof raw.radiantTeamName === 'string' ? raw.radiantTeamName : null,
      direTeamName: typeof raw.direTeamName === 'string' ? raw.direTeamName : null,
      startTime: typeof raw.startTime === 'number' ? raw.startTime : null,
    })
  }
  return out
}

/**
 * The scrubbable minutes come from the archive, never from a guessed 0..duration range:
 * a match recorded from minute 12 onwards has no minute 3, and asking for one would store
 * a reconstruction that never happened live.
 */
function readSnapshotMinutes(payload: unknown): number[] {
  if (!isRecord(payload) || !Array.isArray(payload.minutes)) return []
  const minutes = payload.minutes.filter((m): m is number => typeof m === 'number' && Number.isFinite(m))
  return [...new Set(minutes)].sort((a, b) => a - b)
}

function hasSnapshots(payload: unknown): boolean {
  return isRecord(payload) && Array.isArray(payload.snapshots) && payload.snapshots.length > 0
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

interface ManifestMatch {
  matchId: number
  radiantTeamName: string | null
  direTeamName: string | null
  startTime: number | null
  hasTimeTravel: boolean
  /** Minutes actually written to at/<matchId>.json, in ascending order. */
  minutes: number[]
  /** How many minutes the archive holds, before --max-minutes trimmed anything. */
  minutesAvailable: number
  /** Endpoints that answered "nothing here" and are stored as null. */
  gaps: string[]
}

interface FailedMatch {
  matchId: number
  reason: string
}

const exportedMatches: ManifestMatch[] = []
const failedMatches: FailedMatch[] = []
const skippedMinutes: Array<{ matchId: number; minute: number; reason: string }> = []

function buildManifest(startedAt: Date, complete: boolean): unknown {
  const minutesTotal = exportedMatches.reduce((sum, m) => sum + m.minutes.length, 0)
  return {
    generatedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    complete,
    base: BASE,
    leagueId: LEAGUE_ID,
    maxMinutesPerMatch: MAX_MINUTES,
    layout: {
      tournaments: 'tournaments.json',
      bracket: `league-${LEAGUE_ID}/bracket.json`,
      schedule: `league-${LEAGUE_ID}/schedule.json`,
      matches: `league-${LEAGUE_ID}/matches.json`,
      match: 'match/<matchId>.json',
      at: 'at/<matchId>.json',
    },
    counts: {
      matchesListed: exportedMatches.length + failedMatches.length,
      matchesExported: exportedMatches.length,
      matchesFailed: failedMatches.length,
      matchesWithTimeTravel: exportedMatches.filter((m) => m.hasTimeTravel).length,
      matchesWithoutTimeTravel: exportedMatches.filter((m) => !m.hasTimeTravel).length,
      minutes: minutesTotal,
      files: written.length,
      // Self-referential: the manifest states the size of a tree that includes the
      // manifest, so this can be a byte or two off its own final length. It is a sanity
      // figure for a human, not something to validate the export against.
      bytes: bytesOnDisk,
    },
    matches: exportedMatches,
    failedMatches,
    skippedMinutes,
    note:
      'Payloads are unmodified BFF responses. match/<id>.json bundles the timeline, analysis, ' +
      'h2h, series and snapshots endpoints; a null member means that endpoint answered 404. ' +
      'at/<id>.json is keyed by minute and exists only for matches with a live snapshot record.',
  }
}

// ─── Per-match export ─────────────────────────────────────────────────────────

/** Returns the manifest entry for one match, or throws so the caller can record a failure. */
async function exportMatch(entry: MatchListEntry): Promise<ManifestMatch> {
  const id = entry.matchId
  const gaps: string[] = []

  // Fetched before the bundle is written so a hard failure on any of the five leaves no
  // half-populated file behind — a null here would be indistinguishable from a real 404.
  const timeline = await fetchOrNull(`/api/matches/${id}/timeline`, gaps)
  const analysis = await fetchOrNull(`/api/matches/${id}/analysis`, gaps)
  const h2h = await fetchOrNull(`/api/matches/${id}/h2h`, gaps)
  const series = await fetchOrNull(`/api/matches/${id}/series`, gaps)
  const snapshots = await fetchOrNull(`/api/matches/${id}/snapshots`, gaps)

  writeJson(`match/${id}.json`, { timeline, analysis, h2h, series, snapshots })

  // Time travel is offered only where a live recording exists. /at answers 200 for any
  // match by reconstructing from the OpenDota timeline, so the snapshot list — not the
  // endpoint's willingness to answer — is what decides whether a scrubber is honest here.
  const allMinutes = hasSnapshots(snapshots) ? readSnapshotMinutes(snapshots) : []
  const minutesToFetch = MAX_MINUTES === null ? allMinutes : allMinutes.slice(0, MAX_MINUTES)

  const atByMinute: Record<string, unknown> = {}
  for (const minute of minutesToFetch) {
    const result = await fetchJson(`/api/matches/${id}/at?minute=${minute}`)
    if (result.kind === 'ok') {
      atByMinute[String(minute)] = result.data
    } else {
      // One unreadable minute must not cost the other sixty-seven, so it is dropped from
      // the keyed object and reported instead of being written as a null the client would
      // have to render as a blank board.
      const reason = result.kind === 'missing' ? `HTTP ${result.status}` : result.reason
      skippedMinutes.push({ matchId: id, minute, reason })
    }
  }

  const writtenMinutes = Object.keys(atByMinute).map(Number)
  if (writtenMinutes.length > 0) writeJson(`at/${id}.json`, atByMinute)

  return {
    matchId: id,
    radiantTeamName: entry.radiantTeamName,
    direTeamName: entry.direTeamName,
    startTime: entry.startTime,
    hasTimeTravel: writtenMinutes.length > 0,
    minutes: writtenMinutes,
    minutesAvailable: allMinutes.length,
    gaps,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = new Date()
  console.log(`[export] base=${BASE} league=${LEAGUE_ID} out=${OUT_ROOT}`)
  console.log(`[export] max-minutes per match: ${MAX_MINUTES ?? 'all'}`)
  console.log(`[export] secret scan armed for ${SECRETS.length} env value(s) + ${SECRET_PATTERNS.length} pattern(s)`)

  const status = await fetchRequired('/api/archive/status')
  console.log(`[export] archive status: ${JSON.stringify(status)}`)

  // Tournament-level files first: if the league is not in the archive at all, fail now
  // rather than after four thousand per-match requests.
  const tournaments = await fetchRequired('/api/tournaments')
  writeJson('tournaments.json', tournaments)

  const bracket = await fetchRequired(`/api/tournaments/${LEAGUE_ID}/bracket`)
  writeJson(`league-${LEAGUE_ID}/bracket.json`, bracket)

  const schedule = await fetchRequired(`/api/tournaments/${LEAGUE_ID}/schedule`)
  writeJson(`league-${LEAGUE_ID}/schedule.json`, schedule)

  const matchesPayload = await fetchRequired(`/api/matches?leagueId=${LEAGUE_ID}&limit=${MATCH_LIST_LIMIT}`)
  writeJson(`league-${LEAGUE_ID}/matches.json`, matchesPayload)

  const matches = readMatchList(matchesPayload)
  if (matches.length === 0) throw new Error(`no matches found for league ${LEAGUE_ID} — nothing to export`)
  if (matches.length === MATCH_LIST_LIMIT) {
    console.warn(`[export] match list hit the ${MATCH_LIST_LIMIT} limit — the league may have more matches`)
  }
  console.log(`[export] ${matches.length} matches to export\n`)

  let minutesDone = 0
  for (let i = 0; i < matches.length; i++) {
    const entry = matches[i]
    const label = `${entry.radiantTeamName ?? '?'} vs ${entry.direTeamName ?? '?'}`
    try {
      const result = await exportMatch(entry)
      exportedMatches.push(result)
      minutesDone += result.minutes.length
      const trimmed = result.minutesAvailable - result.minutes.length
      const timeTravel = result.hasTimeTravel
        ? `${result.minutes.length} min${trimmed > 0 ? ` (of ${result.minutesAvailable})` : ''}`
        : 'no time travel'
      const gapNote = result.gaps.length > 0 ? `  gaps: ${result.gaps.length}` : ''
      console.log(
        `[export] ${i + 1}/${matches.length} ${entry.matchId} ${label} — ${timeTravel}${gapNote}` +
          `  | total ${minutesDone} min, ${written.length} files, ${mb(bytesOnDisk)} MB`,
      )
      for (const gap of result.gaps) console.log(`           gap: ${gap}`)
    } catch (err) {
      const reason = (err as Error).message
      // A secret hit is not a per-match problem — it invalidates the whole output.
      if (reason.startsWith('SECRET LEAK')) throw err
      failedMatches.push({ matchId: entry.matchId, reason })
      console.error(`[export] ${i + 1}/${matches.length} ${entry.matchId} ${label} — FAILED: ${reason}`)
    }

    // Rewritten as we go, so a killed run still leaves a manifest describing what is there.
    writeJson('manifest.json', buildManifest(startedAt, false), true)
  }

  writeJson('manifest.json', buildManifest(startedAt, true), true)

  // ─── Report ─────────────────────────────────────────────────────────────────

  const largest = [...written].sort((a, b) => b.bytes - a.bytes)[0]
  const withTimeTravel = exportedMatches.filter((m) => m.hasTimeTravel)
  const withoutTimeTravel = exportedMatches.filter((m) => !m.hasTimeTravel)
  const elapsedS = Math.round((Date.now() - startedAt.getTime()) / 1000)

  console.log('\n──────────────────────────────────────────────')
  console.log(`[export] done in ${Math.floor(elapsedS / 60)}m ${elapsedS % 60}s`)
  console.log(`[export] output:            ${OUT_ROOT}`)
  console.log(`[export] files:             ${written.length}`)
  console.log(`[export] total size:        ${mb(bytesOnDisk)} MB`)
  if (largest) console.log(`[export] largest file:      ${largest.path} (${mb(largest.bytes)} MB)`)
  console.log(`[export] matches exported:  ${exportedMatches.length}`)
  console.log(`[export] with time travel:  ${withTimeTravel.length}`)
  console.log(`[export] without:           ${withoutTimeTravel.length}`)
  console.log(`[export] minutes captured:  ${minutesDone}`)
  console.log(`[export] matches failed:    ${failedMatches.length}`)
  for (const f of failedMatches) console.log(`           ${f.matchId}: ${f.reason}`)
  console.log(`[export] minutes skipped:   ${skippedMinutes.length}`)
  const gapTotal = exportedMatches.reduce((sum, m) => sum + m.gaps.length, 0)
  console.log(`[export] endpoint gaps:     ${gapTotal} (stored as null)`)
  console.log('──────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('[export] FATAL:', (err as Error).message)
  process.exit(1)
})
