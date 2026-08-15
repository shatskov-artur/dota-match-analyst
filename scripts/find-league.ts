#!/usr/bin/env tsx
/**
 * Resolve a league_id by name so it never has to be hardcoded in source.
 *
 *   npm run find:league -- --name="The International 2026"
 *   npm run find:league -- --name=international --limit=20
 *   npm run find:league -- --live            # leagues with a match live right now
 *
 * Put the winning id into server/.env:
 *   TRACKED_LEAGUE_IDS=18324
 *
 * Sources:
 *   - OpenDota /api/leagues       — keyless, the full league catalogue
 *   - the local BFF /api/live/games — for --live (needs `npm run dev` running)
 */

const OPENDOTA_BASE = 'https://api.opendota.com/api'
const BFF_BASE = process.env.BFF_BASE ?? 'http://localhost:3001'

interface OpenDotaLeague {
  leagueid?: number
  ticket?: string | null
  banner?: string | null
  tier?: string | null
  name?: string | null
}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  const eq = hit.indexOf('=')
  return eq === -1 ? '' : hit.slice(eq + 1)
}

async function fetchLeagues(): Promise<OpenDotaLeague[]> {
  const res = await fetch(`${OPENDOTA_BASE}/leagues`)
  if (!res.ok) throw new Error(`OpenDota /leagues → ${res.status} ${res.statusText}`)
  const raw: unknown = await res.json()
  if (!Array.isArray(raw)) throw new Error('OpenDota /leagues did not return an array')
  return raw as OpenDotaLeague[]
}

async function liveLeagueIds(): Promise<Map<number, { name: string; matches: number }>> {
  const out = new Map<number, { name: string; matches: number }>()
  const res = await fetch(`${BFF_BASE}/api/live/games`)
  if (!res.ok) throw new Error(`BFF /api/live/games → ${res.status} ${res.statusText}`)
  const body = (await res.json()) as { games?: Array<{ league_id?: number; league_name?: string }> }
  for (const g of body.games ?? []) {
    if (typeof g.league_id !== 'number') continue
    const prev = out.get(g.league_id)
    out.set(g.league_id, {
      name: g.league_name ?? prev?.name ?? `League #${g.league_id}`,
      matches: (prev?.matches ?? 0) + 1,
    })
  }
  return out
}

function printRow(id: number, name: string, tier: string | null | undefined, extra = ''): void {
  console.log(`  ${String(id).padStart(6)}  ${(tier ?? '—').padEnd(11)}  ${name}${extra}`)
}

async function main(): Promise<void> {
  const wantLive = arg('live') !== undefined
  const name = arg('name')
  const limit = Number(arg('limit') ?? 15)

  if (wantLive) {
    console.log(`\nLeagues with a live match right now (via ${BFF_BASE}):\n`)
    let live: Awaited<ReturnType<typeof liveLeagueIds>>
    try {
      live = await liveLeagueIds()
    } catch (err) {
      console.error(`  could not reach the BFF: ${(err as Error).message}`)
      console.error('  start it with `npm run dev` (or pass BFF_BASE=...)')
      process.exitCode = 1
      return
    }
    if (live.size === 0) {
      console.log('  (nothing live)')
    } else {
      for (const [id, v] of [...live].sort((a, b) => b[1].matches - a[1].matches)) {
        printRow(id, v.name, null, `  — ${v.matches} match(es) live`)
      }
      console.log(`\nTRACKED_LEAGUE_IDS=${[...live.keys()].join(',')}`)
    }
    if (!name) return
    console.log('')
  }

  if (!name) {
    console.error('usage: npm run find:league -- --name="The International 2026" [--limit=15] [--live]')
    process.exitCode = 1
    return
  }

  const needle = name.toLowerCase()
  const leagues = await fetchLeagues()
  const hits = leagues
    .filter((l) => typeof l.leagueid === 'number' && (l.name ?? '').toLowerCase().includes(needle))
    // Newest first: league ids increase monotonically, so this surfaces the current season.
    .sort((a, b) => (b.leagueid ?? 0) - (a.leagueid ?? 0))

  console.log(`\n${hits.length} league(s) matching "${name}" — newest first:\n`)
  console.log('  league_id  tier         name')
  for (const l of hits.slice(0, limit)) {
    printRow(l.leagueid as number, l.name ?? '(unnamed)', l.tier)
  }
  if (hits.length > limit) console.log(`  … ${hits.length - limit} more (raise --limit)`)

  const best = hits[0]
  if (best?.leagueid !== undefined) {
    console.log(`\nMost likely match → add to server/.env:\n\n  TRACKED_LEAGUE_IDS=${best.leagueid}\n`)
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message)
  process.exit(1)
})
