import { memo, useMemo, type ReactNode } from 'react'
// CRITICAL per 04-PATTERNS.md: import from client/src/utils/heroMapper — NOT
// '@shared/heroMapper', whose createRequire() does not exist in a browser build.
import { heroMapper, heroIdFromNpcName } from '../utils/heroMapper'
import { EVENT_CATEGORY_STYLE } from '../utils/eventCategoryColors'
import { useTimelineCursor } from '../store/timelineCursor'
import type { AnalysisResponse, MatchEvent, TimelineRow } from '../hooks/useArchive'

type Laning = NonNullable<AnalysisResponse['laning']>
type Swing = AnalysisResponse['swings'][number]

/** Everything the stream can hold, ordered by `t` before rendering. */
type StreamItem =
  | { kind: 'event'; key: string; t: number; event: MatchEvent; swing: number | null }
  | { kind: 'fight'; key: string; t: number; event: MatchEvent; kills: MatchEvent[] }
  | { kind: 'laning'; key: string; t: number; laning: Laning }
  | { kind: 'swing'; key: string; t: number; swing: Swing }

/**
 * Chronological log of what happened in the match: kills, objectives, and teamfights
 * with a verdict on who came out ahead.
 *
 * Two precisions coexist in the archive. While a match is live, kills and teamfights come
 * from diffing Valve's per-player counters every 30 seconds — the victim is known, the
 * killer is not. Once the replay is parsed, OpenDota supplies exact per-second kills and
 * its own teamfight windows. When both are present the precise set wins and the coarse one
 * is hidden, so the same moment is never listed twice at two different times.
 */

type HeroOwners = Map<number, { player: string | null; tag: string | null; side: 0 | 1 }>

export interface MatchEventFeedProps {
  /** Rendered inside a tabbed card, so it must not draw its own card or title. */
  embedded?: boolean
  /** Team crests, so "LGD Gaming lost bot T3" is scannable without reading the name. */
  radiantLogo?: string | null
  direLogo?: string | null
  /** Post-match read, folded into the stream rather than shown as a rival panel. */
  analysis?: AnalysisResponse | undefined
  events: MatchEvent[]
  /** Used to price a teamfight: gold lead before vs. two minutes after. */
  timeline: TimelineRow[]
  radiantName: string | null | undefined
  direName: string | null | undefined
  /**
   * hero id → who is playing it, for the log lines.
   *
   * "Nature's Prophet killed Drow Ranger" is a fact about two heroes; at a tournament the
   * question is which player and which side, and a reader following a series knows the
   * rosters better than the hero pool. The tag rather than the full team name because this
   * sits on every line — "IW" scans, "Iron Wing" pushes the sentence off the row.
   */
  heroOwners?: HeroOwners
  /**
   * Oldest first by default: the stream is read as the story of the match, so time runs
   * downwards the way it does everywhere else. Newest-first put the ancient falling above
   * the laning phase, which meant reading the game backwards.
   */
  newestFirst?: boolean
}

/** Types the coarse live path and the precise OpenDota path both produce. */
const DUAL_SOURCE_TYPES = new Set(['kill', 'teamfight', 'tower', 'barracks', 'roshan'])

const mmss = (t: number) => {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const kfmt = (gold: number) => `${gold > 0 ? '+' : gold < 0 ? '−' : ''}${(Math.abs(gold) / 1000).toFixed(1)}k`

/** Which event types this feed renders at all — the keys double as the render filter. */
const TYPE_STYLE = EVENT_CATEGORY_STYLE

const heroName = (id: unknown): string | null =>
  typeof id === 'number' ? (heroMapper(id)?.name ?? null) : null

/** "npc_dota_hero_shadow_fiend" → "Shadow Fiend". */
function heroFromKey(key: unknown): string | null {
  if (typeof key !== 'string') return null
  return key
    .replace(/^npc_dota_hero_/, '')
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Everything a row needs that is not the row itself, in one object.
 *
 * The row components live at module scope rather than inside the feed. Declared inside, each
 * render produced a NEW component type, so React unmounted and remounted every row on every
 * poll tick and on every scrubber move — hundreds of rows, four times a minute. At module
 * scope they are stable types and can be memoised; bundling their shared inputs into a
 * single memoised object is what makes that memoisation actually hold.
 */
interface FeedContext {
  rName: string
  dName: string
  radiantLogo?: string | null
  direLogo?: string | null
  heroOwners?: HeroOwners
  goldByMinute: Map<number, number>
  /** Parks the timeline on the minute a row belongs to. */
  jump: (t: number) => () => void
}

/** Team crest + name, for the building rows. */
function Team({ name, ctx }: { name: string; ctx: FeedContext }) {
  const logo = name === ctx.rName ? ctx.radiantLogo : name === ctx.dName ? ctx.direLogo : null
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {logo && <img src={logo} alt="" aria-hidden="true" loading="lazy" className="h-4 w-4 rounded-xs object-contain" />}
      <span>{name}</span>
    </span>
  )
}

/**
 * Small hero portrait. Reading "Lina killed Mirana" means resolving two names against
 * memory; two faces is instant, which is the whole reason a feed like this has icons.
 */
function Face({ heroId }: { heroId: number | null }) {
  const hero = heroId ? heroMapper(heroId) : null
  if (!hero) return null
  return (
    <img
      src={hero.portrait}
      alt={hero.name}
      title={hero.name}
      loading="lazy"
      width={28}
      height={16}
      className="inline-block h-4 w-7 rounded-xs object-cover align-[-3px]"
    />
  )
}

/**
 * One actor in a line, read the way the in-game kill feed reads it: the portrait says
 * which hero, so the words are spent on who is playing it — team tag first, then the
 * player. Spelling the hero out as well made three labels for two facts.
 *
 * The tag is coloured by side, the one thing accents are reserved for here, so a line
 * can be scanned for "who did it to whom" without reading either name.
 *
 * Falls back to the hero name whenever the roster is unknown — an event can name a hero
 * before the snapshot listing it arrives, and a nameless row would be worse than a
 * redundant one. The hero name stays in the title either way.
 */
function Hero({ id, name, ctx }: { id: number | null; name: string; ctx: FeedContext }) {
  const owner = id !== null ? ctx.heroOwners?.get(id) : undefined
  const side = owner?.side
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-xs pl-0.5 pr-1.5 py-0.5"
      title={name}
      style={
        side === undefined
          ? undefined
          : { background: side === 0 ? 'var(--color-radiant-soft)' : 'var(--color-dire-soft)' }
      }
    >
      <Face heroId={id} />
      {owner?.tag && (
        <span style={{ color: side === 0 ? 'var(--color-radiant)' : 'var(--color-dire)' }}>{owner.tag}</span>
      )}
      <span>{owner?.player ?? name}</span>
    </span>
  )
}

/**
 * Crossed swords between killer and victim, the way the in-game feed marks a kill.
 *
 * Drawn rather than typed: the ⚔ character renders as a full-colour emoji on Windows and
 * as flat glyph elsewhere, which would be a different mark on every reader's machine.
 * The title keeps the word for screen readers — and for anyone hovering it.
 */
function KillMark() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" className="shrink-0 text-text-dim" role="img">
      <title>killed</title>
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none">
        <path d="M2.5 2.5 L9.5 9.5" />
        <path d="M11.5 2.5 L4.5 9.5" />
        <path d="M8.6 10.4 L11.2 13" />
        <path d="M5.4 10.4 L2.8 13" />
      </g>
    </svg>
  )
}

function describe(e: MatchEvent, ctx: FeedContext): { node: ReactNode; accent?: string } {
  const { rName, dName } = ctx
  const sideName = (team: number | null | undefined) => (team === 0 ? rName : team === 1 ? dName : null)
  const p = (e.payload ?? {}) as Record<string, unknown>
  switch (e.type) {
    case 'kill': {
      // OpenDota shape: killer + victim hero. Live shape: victim + everyone who scored
      // in the window, because counter diffing cannot attribute a killer to a victim.
      const victimFromKey = heroFromKey(p.victimHero)
      if (victimFromKey) {
        const killer = heroName(p.killerHeroId) ?? (typeof p.killerName === 'string' ? p.killerName : null)
        const killerId = typeof p.killerHeroId === 'number' ? p.killerHeroId : null
        const victimId = heroIdFromNpcName(p.victimHero)
        return {
          node: killer ? (
            <>
              <Hero id={killerId} name={killer} ctx={ctx} />
              <KillMark />
              <Hero id={victimId} name={victimFromKey} ctx={ctx} />
            </>
          ) : (
            <>
              <Hero id={victimId} name={victimFromKey} ctx={ctx} /> died
            </>
          ),
        }
      }
      const victim = heroName(p.victimHeroId) ?? (typeof p.victimName === 'string' ? p.victimName : 'A hero')
      const killers = Array.isArray(p.killers) ? (p.killers as Array<Record<string, unknown>>) : []
      // Named the same way as the victim, minus the portrait: a 30s window can credit
      // five heroes at once, and five faces on one line stops being scannable.
      const scorers = killers
        .map((k) => ({
          id: typeof k.heroId === 'number' ? k.heroId : null,
          name: heroName(k.heroId) ?? (typeof k.playerName === 'string' ? k.playerName : null),
        }))
        .filter((k): k is { id: number | null; name: string } => !!k.name)
      const victimId = typeof p.victimHeroId === 'number' ? p.victimHeroId : null

      // A merged window: every scorer on the left, everyone who died on the right, and
      // the assists named separately so a support is never mistaken for the killer.
      const assisters = Array.isArray(p.assisters)
        ? (p.assisters as Array<Record<string, unknown>>)
            .map((a) => ({
              id: typeof a.heroId === 'number' ? a.heroId : null,
              name: heroName(a.heroId) ?? (typeof a.playerName === 'string' ? a.playerName : null),
            }))
            .filter((a): a is { id: number | null; name: string } => !!a.name)
        : []

      const list = (xs: Array<{ id: number | null; name: string }>) =>
        xs.map((x, i) => (
          <span key={`${x.id ?? x.name}-${i}`}>
            {i > 0 && ', '}
            <Hero id={x.id} name={x.name} ctx={ctx} />
          </span>
        ))

      const assists =
        assisters.length === 0 ? null : (
          <>
            <span className="text-label uppercase tracking-label text-text-dim">assists</span>
            {list(assisters)}
          </>
        )

      // Nobody was credited — a tower or the creeps took it.
      if (scorers.length === 0) {
        return {
          node: (
            <>
              <Hero id={victimId} name={victim} ctx={ctx} />
              <span className="text-text-dim">died</span>
            </>
          ),
        }
      }

      /**
       * Killer first, then victim, the way the in-game feed reads it. With more than one
       * candidate left after the opposing-side filter the row offers both rather than
       * picking — still one row for one death.
       */
      return {
        node: (
          <>
            {scorers.map((k, i) => (
              <span key={`${k.id ?? k.name}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-label uppercase tracking-label text-text-dim">or</span>}
                <Hero id={k.id} name={k.name} ctx={ctx} />
              </span>
            ))}
            <KillMark />
            <Hero id={victimId} name={victim} ctx={ctx} />
            {assists}
          </>
        ),
      }
    }
    case 'teamfight': {
      const from = typeof p.from === 'number' ? p.from : e.t
      const to = typeof p.to === 'number' ? p.to : (typeof p.end === 'number' ? p.end : e.t)
      const deaths = typeof p.deaths === 'number' ? p.deaths : null
      const rd = typeof p.radiantDeaths === 'number' ? p.radiantDeaths : null
      const dd = typeof p.direDeaths === 'number' ? p.direDeaths : null

      // Gold verdict from the timeline: lead before the fight vs. two minutes after.
      const beforeMin = Math.floor(from / 60)
      const before = ctx.goldByMinute.get(beforeMin) ?? null
      const after = ctx.goldByMinute.get(beforeMin + 2) ?? null
      const swing = before !== null && after !== null ? after - before : null

      const span = to > from ? `${mmss(from)}–${mmss(to)}` : mmss(from)
      const tally = rd !== null && dd !== null ? ` · ${dName} ${rd}–${dd} ${rName}` : deaths !== null ? ` · ${deaths} deaths` : ''
      if (swing === null) return { node: `Teamfight ${span}${tally}` }
      const ahead = swing > 0 ? rName : dName
      return {
        node: `Teamfight ${span}${tally} — ${ahead} ahead by ${kfmt(Math.abs(swing))} two minutes later`,
        accent: swing > 0 ? 'var(--color-radiant)' : 'var(--color-dire)',
      }
    }
    // Both paths write { side, lane, tier } but spell the details differently: the live
    // diff uses tier:'tier1' / kind:'meleeRax', OpenDota's key parser uses tier:'T1' /
    // tier:'melee'. Normalise here so one row shape covers both.
    case 'tower':
    case 'building': {
      const side = typeof p.side === 'string' ? p.side : null
      const lane = typeof p.lane === 'string' ? p.lane : null
      const tier = typeof p.tier === 'string' ? p.tier.replace(/^tier/, 'T') : null
      const owner = side ? (side === 'radiant' ? rName : dName) : sideName(e.team)
      // The fort IS the end of the game. Listing it as "lost a building" buried the one
      // event every reader is scrolling towards.
      if (p.kind === 'fort') {
        const winner = owner === rName ? dName : rName
        return {
          node: <>Ancient destroyed — <Team name={winner} ctx={ctx} /> win</>,
          accent: owner === rName ? 'var(--color-dire)' : 'var(--color-radiant)',
        }
      }
      if (owner && lane) return { node: <><Team name={owner} ctx={ctx} /> lost {lane} {tier ?? 'tower'}</> }
      if (owner && tier) return { node: <><Team name={owner} ctx={ctx} /> lost a {tier} tower</> }
      return { node: owner ? <><Team name={owner} ctx={ctx} /> lost a building</> : 'A building fell' }
    }
    case 'barracks': {
      const side = typeof p.side === 'string' ? p.side : null
      const lane = typeof p.lane === 'string' ? p.lane : null
      const rawKind = typeof p.kind === 'string' ? p.kind : null
      const kind =
        rawKind && rawKind.endsWith('Rax')
          ? rawKind.replace('Rax', '')
          : typeof p.tier === 'string' && (p.tier === 'melee' || p.tier === 'ranged')
            ? p.tier
            : null
      const owner = side ? (side === 'radiant' ? rName : dName) : sideName(e.team)
      if (owner && lane) return { node: <><Team name={owner} ctx={ctx} /> lost {lane} {kind ? `${kind} ` : ''}barracks</> }
      return { node: owner ? <><Team name={owner} ctx={ctx} /> lost barracks</> : 'Barracks destroyed' }
    }
    case 'roshan': {
      const n = typeof p.killNumber === 'number' ? p.killNumber : null
      const by = sideName(e.team)
      return { node: `Roshan killed${n ? ` (#${n})` : ''}${by ? ` by ${by}` : ''}` }
    }
    case 'aegis':
      return { node: 'Aegis picked up' }
    case 'first_blood':
      return { node: 'First blood' }
    default:
      return { node: e.type }
  }
}

/** One ordinary event: time, kind, what happened, and what it turned out to be worth. */
const EventRow = memo(function EventRow({
  event,
  swing,
  inFight = false,
  ctx,
}: {
  event: MatchEvent
  swing?: number | null
  inFight?: boolean
  ctx: FeedContext
}) {
  const style = TYPE_STYLE[event.type]
  const { node, accent } = describe(event, ctx)
  return (
    <button
      type="button"
      onClick={ctx.jump(event.t)}
      className={
        // items-start so a wrapped description stacks under itself instead of dragging
        // the timestamp down to its baseline.
        // D-9 (§6.3): 31px rows in a full-width vertical log — height is free here.
        'w-full flex items-start gap-3 py-1.5 max-sm:min-h-11 text-left transition-colors hover:text-text ' +
        (inFight ? '' : 'border-b border-border')
      }
      title="Jump the timeline here"
    >
      <span className="font-mono text-body tabular-nums text-accent w-[52px] shrink-0">{mmss(event.t)}</span>
      {!inFight && (
        <span className="text-label uppercase tracking-label w-[80px] shrink-0" style={{ color: style.color }}>
          {style.label}
        </span>
      )}
      {/* Wraps, and takes the leftover width to wrap inside.
          A merged window names everyone who scored and everyone who died — a dozen
          items on one line. In a nowrap flex row that could not shrink (every name is
          whitespace-nowrap by design, so a hero never breaks mid-word) they overflowed
          the row and printed on top of each other. */}
      <span
        className="flex flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-body text-text-muted min-w-0"
        style={accent ? { color: accent } : undefined}
      >
        {node}
      </span>
      {/* What the objective was worth — the number that used to live in a rival panel,
          now on the row it is about. */}
      {swing !== null && swing !== undefined && (
        <span
          className="ml-auto font-mono text-label tabular-nums shrink-0"
          style={{ color: swing > 0 ? 'var(--color-radiant)' : 'var(--color-dire)' }}
          title="Gold swing over the next two minutes"
        >
          {kfmt(swing)}
        </span>
      )}
    </button>
  )
})

/** A teamfight, holding the kills that made it. */
const FightBlock = memo(function FightBlock({
  event,
  kills,
  ctx,
}: {
  event: MatchEvent
  kills: MatchEvent[]
  ctx: FeedContext
}) {
  const { rName, dName } = ctx
  const p = (event.payload ?? {}) as Record<string, unknown>
  const from = typeof p.from === 'number' ? p.from : event.t
  const to = typeof p.to === 'number' ? p.to : typeof p.end === 'number' ? p.end : event.t
  const rd = typeof p.radiantDeaths === 'number' ? p.radiantDeaths : null
  const dd = typeof p.direDeaths === 'number' ? p.direDeaths : null

  const before = ctx.goldByMinute.get(Math.floor(from / 60)) ?? null
  const after = ctx.goldByMinute.get(Math.floor(from / 60) + 2) ?? null
  const swing = before !== null && after !== null ? after - before : null
  const ahead = swing === null ? null : swing > 0 ? rName : dName

  return (
    <div className="my-1.5 rounded-sm border border-border bg-surface px-3 py-2" data-testid="teamfight-block">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-label uppercase tracking-label" style={{ color: TYPE_STYLE.teamfight.color }}>
          Teamfight
        </span>
        <button type="button" onClick={ctx.jump(from)} className="font-mono text-body tabular-nums text-accent">
          {mmss(from)}–{mmss(to)}
        </button>
        {swing !== null && (
          <span
            className="ml-auto font-mono text-body tabular-nums"
            style={{ color: swing > 0 ? 'var(--color-radiant)' : 'var(--color-dire)' }}
          >
            {ahead} {kfmt(Math.abs(swing))}
            <span className="text-text-dim"> after</span>
          </span>
        )}
      </div>

      {kills.length > 0 && (
        <div className="mt-1.5 flex flex-col">
          {kills.map((k) => (
            <EventRow key={k.id} event={k} inFight ctx={ctx} />
          ))}
        </div>
      )}

      {/* Read as kills, not deaths, and led by whoever won the fight.
          "Vici Gaming 2 – 1 LGD" was a death count, so the team it named first was the
          one that lost people — the opposite of how anyone talks about a fight. Kills of
          one side are the deaths of the other, so the same two numbers say it directly. */}
      {rd !== null && dd !== null && (() => {
        const radiantKills = dd
        const direKills = rd
        const [aName, aKills, bName, bKills, aWon] =
          radiantKills >= direKills
            ? [rName, radiantKills, dName, direKills, true]
            : [dName, direKills, rName, radiantKills, false]
        const level = radiantKills === direKills
        return (
          <div className="mt-1.5 border-t border-border pt-1.5 flex items-baseline gap-2 font-mono text-body tabular-nums text-text-muted">
            <span className="text-label uppercase tracking-label text-text-dim">kills</span>
            <span className={level ? '' : aWon ? 'text-radiant' : 'text-dire'}>
              {aName} {aKills}
            </span>
            <span className="text-text-dim">–</span>
            <span>
              {bKills} {bName}
            </span>
            {!level && (
              <span className="text-text-dim">
                · {aName} up {aKills - bKills}
              </span>
            )}
          </div>
        )
      })()}
    </div>
  )
})

/** A band across the stream: things that describe a moment rather than happen at one. */
const Band = memo(function Band({
  label,
  t,
  tone,
  ctx,
  children,
}: {
  label: string
  t: number
  tone: string
  ctx: FeedContext
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={ctx.jump(t)}
      className="my-1.5 w-full rounded-sm border border-border bg-bg-elev px-3 py-2 text-left transition-colors hover:border-primary"
      data-testid="stream-band"
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-label uppercase tracking-label" style={{ color: tone }}>
          {label}
        </span>
        <span className="font-mono text-label tabular-nums text-accent">{mmss(t)}</span>
      </div>
      <div className="mt-1 text-body text-text-muted">{children}</div>
    </button>
  )
})

function MatchEventFeed({
  events,
  timeline,
  radiantName,
  direName,
  newestFirst = false,
  embedded = false,
  radiantLogo,
  direLogo,
  analysis,
  heroOwners,
}: MatchEventFeedProps) {
  const setMinute = useTimelineCursor((s) => s.setMinute)
  const cursor = useTimelineCursor((s) => s.minute)
  // While the timeline is parked in the past the log stops there too. Reading a 44-minute
  // scoreline next to a board frozen at minute 12 is the kind of contradiction that makes
  // a replay untrustworthy.
  const cutoff = typeof cursor === 'number' ? cursor * 60 + 59 : null

  const goldByMinute = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of timeline) if (r.radiantGoldAdv !== null) m.set(r.minute, r.radiantGoldAdv)
    return m
  }, [timeline])

  /**
   * One stream instead of a log beside a summary.
   *
   * A teamfight is not an event that happens between kills — it IS those kills, so it
   * becomes a frame that holds them and they leave the flat list. The rest of the
   * post-match read lands where it belongs in time as well: the laning verdict at the
   * minute it describes, each turning point at its own minute, and the gold a tower or
   * Roshan was worth on the row of that tower or Roshan.
   */
  const stream = useMemo(() => {
    // Draft picks and bans sit at negative game time; they belong to the draft panel.
    const inGame = events.filter((e) => e.t >= 0 && TYPE_STYLE[e.type])
    const hasPrecise = inGame.some((e) => e.source === 'opendota' && DUAL_SOURCE_TYPES.has(e.type))
    const kept = hasPrecise
      ? inGame.filter((e) => e.source === 'opendota' || !DUAL_SOURCE_TYPES.has(e.type))
      : inGame
    const beforeMerge = cutoff === null ? kept : kept.filter((e) => e.t <= cutoff)

    /**
     * One row per ambiguous window instead of one per victim.
     *
     * Counter diffing emits a kill event per death, each carrying every player whose kill
     * counter moved in the same 30 seconds. Three deaths in one window therefore produced
     * three rows repeating the same three scorers — which read as though each of them
     * killed each victim, and put the victim first, backwards from every other line in the
     * feed. Merging the window states what the data actually supports: these players got
     * the kills, these heroes died, in that order, once.
     */
    /**
     * One row per death, with the killer narrowed by the side that cannot have done it.
     *
     * Counter diffing lists everyone whose kill count moved in the same 30 seconds, and
     * merging those into a single window row produced something nobody could read. But a
     * kill is always credited to the OPPOSING side, and that constraint was going unused:
     * a dead Vici player can only have been killed by an LGD one. Filter the window's
     * scorers down to the other team and the list usually collapses to a single name —
     * a real attribution, not a guess — and the row becomes an ordinary kill line.
     *
     * Where two opponents both scored in the same window the victim keeps both, and the row
     * says "or" rather than picking one.
     */
    const sideOfHero = (heroId: unknown): number | undefined =>
      typeof heroId === 'number' ? heroOwners?.get(heroId)?.side : undefined

    const upToCursor = beforeMerge.map((e) => {
      if (e.type !== 'kill' || e.source === 'opendota') return e
      const p = (e.payload ?? {}) as Record<string, unknown>
      const killers = Array.isArray(p.killers) ? (p.killers as Array<Record<string, unknown>>) : []
      if (killers.length <= 1) return e

      const victimSide = sideOfHero(p.victimHeroId) ?? (typeof p.victimTeam === 'number' ? p.victimTeam : null)
      if (victimSide === null) return e

      const opposing = killers.filter((k) => {
        const side = sideOfHero(k.heroId)
        return side !== undefined && side !== victimSide
      })
      // Nothing to narrow, or nothing left to name — leave the row as it was.
      if (opposing.length === 0 || opposing.length === killers.length) return e
      return { ...e, payload: { ...p, killers: opposing } }
    })

    const fights = upToCursor.filter((e) => e.type === 'teamfight')
    const windowOf = (e: MatchEvent) => {
      const p = (e.payload ?? {}) as Record<string, unknown>
      const from = typeof p.from === 'number' ? p.from : e.t
      const to = typeof p.to === 'number' ? p.to : typeof p.end === 'number' ? p.end : e.t
      return { from, to: Math.max(to, from) }
    }

    // Kills inside a fight window belong to that fight, not to the flat list.
    const claimed = new Set<number>()
    const killsFor = new Map<number, MatchEvent[]>()
    for (const f of fights) {
      const { from, to } = windowOf(f)
      const mine = upToCursor.filter((e) => e.type === 'kill' && e.t >= from && e.t <= to)
      for (const k of mine) claimed.add(k.id)
      killsFor.set(f.id, mine)
    }

    // What a tower or Roshan turned out to be worth, keyed to the row it belongs to.
    const swingAt = new Map<string, number>()
    for (const o of analysis?.topObjectives ?? []) {
      if (o.swing !== null && o.swing !== undefined) swingAt.set(`${o.type}:${o.minute}`, o.swing)
    }

    const items: StreamItem[] = []
    for (const e of upToCursor) {
      if (claimed.has(e.id)) continue
      if (e.type === 'teamfight') {
        items.push({ kind: 'fight', key: `f${e.id}`, t: windowOf(e).from, event: e, kills: killsFor.get(e.id) ?? [] })
      } else {
        items.push({ kind: 'event', key: `e${e.id}`, t: e.t, event: e, swing: swingAt.get(`${e.type}:${Math.floor(e.t / 60)}`) ?? null })
      }
    }

    const laning = analysis?.laning
    if (laning && (cutoff === null || laning.atMinute * 60 <= cutoff)) {
      items.push({ kind: 'laning', key: 'laning', t: laning.atMinute * 60, laning })
    }
    for (const [i, sw] of (analysis?.swings ?? []).entries()) {
      if (cutoff !== null && sw.minute * 60 > cutoff) continue
      items.push({ kind: 'swing', key: `s${i}`, t: sw.minute * 60, swing: sw })
    }

    items.sort((a, b) => a.t - b.t)
    return newestFirst ? items.reverse() : items
    // heroOwners narrows the killer attribution above, and on an archived match it is the
    // ONLY input that changes: the events are static and arrive before the roster does, so
    // leaving it out meant the narrowing never ran there at all.
  }, [events, newestFirst, cutoff, analysis, heroOwners])

  const rName = radiantName ?? 'Radiant'
  const dName = direName ?? 'Dire'

  const ctx = useMemo<FeedContext>(
    () => ({
      rName,
      dName,
      radiantLogo,
      direLogo,
      heroOwners,
      goldByMinute,
      jump: (t: number) => () => setMinute(Math.floor(t / 60)),
    }),
    [rName, dName, radiantLogo, direLogo, heroOwners, goldByMinute, setMinute],
  )

  if (stream.length === 0) {
    if (cutoff === null) return null
    return (
      <p className={(embedded ? '' : 'bento-card ') + 'text-body text-text-dim'}>
        Nothing had happened yet at this point in the match.
      </p>
    )
  }

  return (
    <div className={(embedded ? '' : 'bento-card ') + 'flex flex-col gap-2'} data-testid="match-event-feed">
      <div className="flex items-baseline gap-3">
        {!embedded && <span className="text-label uppercase tracking-label text-text-dim">Match events</span>}
        {!embedded && <span className="text-label text-text-dim">{stream.length}</span>}
        {!stream.some((i) => (i.kind === 'event' || i.kind === 'fight') && i.event.source === 'opendota') && (
          <span className="ml-auto text-label text-text-dim">live · 30s resolution</span>
        )}
      </div>

      {/* Own scroll container so a long match never stretches the page. */}
      <div className="flex flex-col max-h-[460px] overflow-y-auto pr-1 scroll-slim">
        {stream.map((item) => {
          switch (item.kind) {
            case 'fight':
              return <FightBlock key={item.key} event={item.event} kills={item.kills} ctx={ctx} />
            case 'laning': {
              const l = item.laning
              const winner = l.winner === null ? null : l.winner === 0 ? rName : dName
              return (
                <Band key={item.key} label="Laning" t={item.t} tone="var(--color-accent)" ctx={ctx}>
                  {winner ? (
                    <>
                      <span style={{ color: l.winner === 0 ? 'var(--color-radiant)' : 'var(--color-dire)' }}>{winner}</span>
                      {` won the lanes by ${kfmt(Math.abs(l.goldDiff))} net worth`}
                    </>
                  ) : (
                    `Even lanes — ${kfmt(l.goldDiff)} between the teams`
                  )}
                  <span className="text-text-dim">{` · LH ${l.radiantLastHits}–${l.direLastHits}`}</span>
                </Band>
              )
            }
            case 'swing': {
              const sw = item.swing
              const who = sw.team === 0 ? rName : dName
              const colour = sw.team === 0 ? 'var(--color-radiant)' : 'var(--color-dire)'
              return (
                <Band
                  key={item.key}
                  label={sw.kind === 'lead_change' ? 'Lead change' : 'Turning point'}
                  t={item.t}
                  tone="var(--color-primary)"
                  ctx={ctx}
                >
                  <span style={{ color: colour }}>{who}</span>
                  {` pulled ahead — ${kfmt(sw.fromGold)} → ${kfmt(sw.toGold)}`}
                  <span className="text-text-dim">{` (${kfmt(Math.abs(sw.delta))})`}</span>
                </Band>
              )
            }
            default:
              return <EventRow key={item.key} event={item.event} swing={item.swing} ctx={ctx} />
          }
        })}
      </div>
    </div>
  )
}

/**
 * Memoised: the match page runs four to five pollers, and every tick re-rendered a feed
 * that can hold hundreds of rows even when none of its inputs had moved.
 */
export default memo(MatchEventFeed)
