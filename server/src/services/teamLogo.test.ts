import { describe, it, expect, vi, afterEach } from 'vitest'

// In-memory redis backing store shared by every `new Redis()` (live.roshan.test.ts pattern), so
// a warm-up write is visible to the peek that follows it.
const redisStore = new Map<string, string>()

// Mock ioredis and env BEFORE importing anything that pulls in cached() (cache.test.ts pattern).
vi.mock('ioredis', () => {
  const client = {
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value)
      return 'OK'
    }),
    on: vi.fn(),
  }
  const RedisMock = vi.fn(function () {
    return client
  })
  return { Redis: RedisMock, default: RedisMock }
})

vi.mock('../env.js', () => ({
  env: {
    PORT: '3001',
    UPSTASH_REDIS_URL: 'rediss://test.upstash.io:6380',
    UPSTASH_REDIS_TOKEN: 'test-token',
    VALVE_API_KEY: 'test-key',
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
  redisStore.clear()
})

/** Mirrors how the service reads a response: text() first, parsed by the service itself. */
function jsonResponse(body: unknown, status = 200): Response {
  return textResponse(JSON.stringify(body), status)
}

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    text: async () => body,
    headers: { get: () => null },
  } as unknown as Response
}

describe('teamRef', () => {
  it('keys by team_id when present — both sources collapse to one cache entry', async () => {
    const { teamRef } = await import('./teamLogo.js')
    expect(teamRef({ team_id: 2163, team_logo: 123 })).toEqual({
      key: 'team-logo:2163',
      teamId: 2163,
      ugcId: '123',
    })
  })

  it('falls back to a ugc-scoped key when the team has no team_id', async () => {
    const { teamRef } = await import('./teamLogo.js')
    expect(teamRef({ team_logo: '99887766' })).toEqual({
      key: 'team-logo:ugc:99887766',
      teamId: undefined,
      ugcId: '99887766',
    })
  })

  // Verified against Valve's own endpoint: the rounded id answers status.code 15, the true id
  // returns the logo. Looking up a value JSON.parse already corrupted can only waste quota.
  it('drops a ugcid past MAX_SAFE_INTEGER — JSON.parse already rounded it to a different file', async () => {
    const { teamRef } = await import('./teamLogo.js')
    expect(teamRef({ team_id: 9684245, team_logo: 15301647012547688 })).toEqual({
      key: 'team-logo:9684245',
      teamId: 9684245,
      ugcId: undefined,
    })
    // A team whose ONLY identifier is a corrupted ugcid is not worth a lookup at all.
    expect(teamRef({ team_logo: 15105118148407527000 })).toBeNull()
  })

  it('keeps a ugcid that arrives as a string — no precision was lost', async () => {
    const { teamRef } = await import('./teamLogo.js')
    expect(teamRef({ team_logo: '15301647012547687' })?.ugcId).toBe('15301647012547687')
  })

  it('returns null for a TBD team so no lookup is attempted', async () => {
    const { teamRef } = await import('./teamLogo.js')
    expect(teamRef(undefined)).toBeNull()
    expect(teamRef({})).toBeNull()
    expect(teamRef({ team_id: 0, team_logo: 0 })).toBeNull()
  })
})

describe('resolveTeamLogo', () => {
  it('returns the OpenDota logo_url without touching Valve quota', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ team_id: 2163, name: 'Team Liquid', logo_url: 'https://cdn.example/liquid.png' }),
    )
    const { resolveTeamLogo } = await import('./teamLogo.js')

    const url = await resolveTeamLogo({ key: 'team-logo:2163', teamId: 2163, ugcId: '5' })

    expect(url).toBe('https://cdn.example/liquid.png')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/teams/2163')
  })

  it('falls back to the Valve UGC url when OpenDota has no logo for the team', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ team_id: 42, logo_url: null }))
      .mockResolvedValueOnce(jsonResponse({ data: { url: 'https://cdn.example/ugc.png' } }))
    const { resolveTeamLogo } = await import('./teamLogo.js')

    const url = await resolveTeamLogo({ key: 'team-logo:42', teamId: 42, ugcId: '777' })

    expect(url).toBe('https://cdn.example/ugc.png')
  })

  it('returns null (a cacheable miss) when both upstreams answer with no logo', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404))
      .mockResolvedValueOnce(jsonResponse({}))
    const { resolveTeamLogo } = await import('./teamLogo.js')

    expect(await resolveTeamLogo({ key: 'team-logo:42', teamId: 42, ugcId: '777' })).toBeNull()
  })

  // Found against live data 2026-08-11: OpenDota answers 200 with an EMPTY body for team ids it
  // does not carry. Parsing that as JSON throws, and treating the throw as transient made every
  // unknown team re-fetch on every 30s poll — permanent quota burn for a permanent answer.
  it('treats a 200 with an empty body as a cacheable miss, not a transient failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse(''))
    const { resolveTeamLogo } = await import('./teamLogo.js')

    expect(await resolveTeamLogo({ key: 'team-logo:10201608', teamId: 10201608 })).toBeNull()
  })

  it('treats a 200 with a truncated body as a cacheable miss', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse('{"team_id":1,'))
    const { resolveTeamLogo } = await import('./teamLogo.js')

    expect(await resolveTeamLogo({ key: 'team-logo:1', teamId: 1 })).toBeNull()
  })

  it('rethrows a transient failure so cached() never stores a false negative', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 503))
    const { resolveTeamLogo } = await import('./teamLogo.js')

    await expect(resolveTeamLogo({ key: 'team-logo:2163', teamId: 2163 })).rejects.toThrow(/503/)
  })

  it('marks a 429 retryable so cached() backs off instead of caching a blank', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 429))
    const { resolveTeamLogo } = await import('./teamLogo.js')

    await expect(resolveTeamLogo({ key: 'team-logo:2163', teamId: 2163 })).rejects.toMatchObject({
      status: 429,
    })
  })

  it('survives a shape change in the OpenDota response instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ logo_url: 12345 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { resolveTeamLogo } = await import('./teamLogo.js')

    expect(await resolveTeamLogo({ key: 'team-logo:2163', teamId: 2163 })).toBeNull()
  })
})

describe('peekTeamLogo / warmTeamLogo (non-blocking enrichment)', () => {
  const ref = { key: 'team-logo:2163', teamId: 2163 }

  it('returns undefined for a team that has never been resolved — the live route must not wait', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { peekTeamLogo } = await import('./teamLogo.js')

    expect(await peekTeamLogo(ref)).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled() // cache-only: a peek never touches an upstream
  })

  it('distinguishes a resolved miss (null) from an unresolved team (undefined)', async () => {
    redisStore.set(ref.key, JSON.stringify(null))
    const { peekTeamLogo } = await import('./teamLogo.js')

    expect(await peekTeamLogo(ref)).toBeNull()
  })

  it('warms the cache in the background so the next poll serves the logo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ team_id: 2163, logo_url: 'https://cdn.example/liquid.png' }),
    )
    const { peekTeamLogo, warmTeamLogo } = await import('./teamLogo.js')

    warmTeamLogo(ref)
    await vi.waitFor(async () => expect(await peekTeamLogo(ref)).toBe('https://cdn.example/liquid.png'))
  })

  it('collapses concurrent warm-ups for the same team into one upstream call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ team_id: 2163, logo_url: 'https://cdn.example/liquid.png' }),
    )
    const { peekTeamLogo, warmTeamLogo } = await import('./teamLogo.js')

    warmTeamLogo(ref)
    warmTeamLogo(ref)
    warmTeamLogo(ref)
    await vi.waitFor(async () => expect(await peekTeamLogo(ref)).not.toBeUndefined())

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
