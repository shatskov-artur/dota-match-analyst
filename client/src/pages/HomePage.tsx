import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { format } from 'date-fns'
import MatchBentoGrid from '../components/MatchBentoGrid'
import MatchRail from '../components/MatchRail'
import SkeletonRow from '../components/SkeletonRow'
import ErrorBanner from '../components/ErrorBanner'
import PrimaryButton from '../components/PrimaryButton'
import PageShell, { LiveCount } from '../components/PageShell'
import ScheduleList from '../components/ScheduleList'
import { useArchiveStatus, useScheduleRange } from '../hooks/useArchive'
import { useLiveGames } from '../hooks/useLiveGames'
import { useStarredLeagues } from '../hooks/useStarredLeagues'
import { IS_DEMO } from '../lib/apiFetch'
import { dayBounds, dayKey, dayMode, bucketByDay, isValidDayParam, monthBounds } from '../utils/day'
import {
  applyEntryFilters,
  applyFilters,
  enabledStatuses,
  leagueOptions,
  leagueOptionsFromEntries,
  DEFAULT_FILTERS,
  type MatchFilterState,
  type StatusFilter,
  type TierFilter,
} from '../utils/matchFilters'

const STATUS_VALUES: StatusFilter[] = ['all', 'live', 'draft', 'finished', 'upcoming']
const TIER_VALUES: TierFilter[] = ['all', 'tier1', 'tier23', 'other']

/**
 * The match list, read along one axis: which day, then which of that day's games.
 *
 * The calendar is always on screen because "when" is the first question — it used to be
 * reachable only by picking an "Upcoming" chip, which meant the page had a hidden second
 * mode that swapped its own data source. Now the day says which mode this is: today (or no
 * day at all) is the live grid, a past day is what was played, a future day is what is
 * announced.
 */
export default function HomePage() {
  const { isLoading, isError, grouped, lastUpdatedLabel, data } = useLiveGames()
  // Ladder games the BFF withheld — see LiveGamesResponse.hidden. Shown as a quiet line so a
  // short list reads as deliberate rather than as a quiet evening.
  const hiddenCount = data?.hidden ?? 0
  const [params, setParams] = useSearchParams()

  /**
   * Day, status and leagues live in the URL so a view can be linked and survives a reload.
   *
   * Every write goes through this one patch, over a COPY of the current params. Writing a
   * fresh object was how touching a status chip silently dropped the selected day.
   */
  const patchParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  /*
   * A day the page cannot read is treated as no day at all, exactly like the status and
   * tier params below. `?day=abc` used to reach `format()` on an Invalid Date, which
   * date-fns v4 answers with a thrown RangeError — one junk character in a shared link
   * blanked the entire match list.
   */
  const rawDay = params.get('day')
  const day = isValidDayParam(rawDay) ? rawDay : null
  const urlStatus = params.get('show') as StatusFilter | null
  const status = urlStatus && STATUS_VALUES.includes(urlStatus) ? urlStatus : DEFAULT_FILTERS.status
  const urlTier = params.get('tier') as TierFilter | null
  const tier = urlTier && TIER_VALUES.includes(urlTier) ? urlTier : DEFAULT_FILTERS.tier
  /*
   * Keyed on the raw parameter rather than on the params object, which is a fresh instance
   * after every write — so the array below survives a status chip being touched.
   */
  const leagueParam = params.get('league') ?? ''
  const leagueIds = useMemo(
    () =>
      leagueParam
        .split(',')
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    [leagueParam],
  )
  // Search stays local: it changes on every keystroke and a history entry per letter is
  // not a view anybody wants to return to.
  const [search, setSearch] = useState('')
  /*
   * Memoised because it is the dependency of the filtering and sorting below. Rebuilt every
   * render, it made those memos permanently cold: the whole live list was refiltered and
   * resorted on every 30-second poll AND on every keystroke in the search box.
   */
  const filters: MatchFilterState = useMemo(
    () => ({ status, tier, leagueIds, search }),
    [status, tier, leagueIds, search],
  )

  const mode = dayMode(day)
  const setFilters = (next: MatchFilterState) => {
    setSearch(next.search)
    patchParams({
      show: next.status === 'all' ? null : next.status,
      tier: next.tier === 'all' ? null : next.tier,
      league: next.leagueIds.length > 0 ? next.leagueIds.join(',') : null,
    })
  }

  // The month on screen, which is what the calendar's dots are fetched for. Selecting a
  // day opens its month; paging afterwards moves the dots without moving the selection.
  const [anchor, setAnchor] = useState(() => (day ? new Date(`${day}T12:00:00`) : new Date()))
  const setDay = (next: string | null) => {
    if (next) setAnchor(new Date(`${next}T12:00:00`))
    patchParams({ day: next })
  }

  /*
   * Two windows over the same endpoint: a month for the dots, a single day for the list.
   * A month is cheap to draw and expensive to send, and the day is the only part actually
   * rendered as rows — asking for both at once would either truncate the month or ship a
   * month of series to render twelve of them.
   */
  const monthRange = useMemo(() => monthBounds(anchor), [anchor])
  const monthQuery = useScheduleRange(monthRange.from, monthRange.to)
  const dayRange = useMemo(() => dayBounds(day ?? dayKey(new Date())), [day])
  const dayQuery = useScheduleRange(dayRange.from, dayRange.to)

  const days = useMemo(
    () => bucketByDay(monthQuery.data?.schedule ?? [], (e) => e.time),
    [monthQuery.data],
  )
  const dayEntries = useMemo(() => dayQuery.data?.schedule ?? [], [dayQuery.data])
  const visibleEntries = useMemo(() => applyEntryFilters(dayEntries, filters), [dayEntries, filters])

  // Flatten all leagues into one list (league_name carried through for the card label + filter).
  const allMatches = useMemo(
    () =>
      grouped.flatMap(g =>
        g.matches.map(m => ({ ...m, league_name: m.league_name || g.leagueName })),
      ),
    [grouped],
  )

  const archive = useArchiveStatus()
  const trackedLeagueIds = useMemo(() => archive.data?.trackedLeagueIds ?? [], [archive.data])
  const { starred, toggle: toggleStar, isStarred } = useStarredLeagues()
  const visible = useMemo(
    () => applyFilters(allMatches, filters, trackedLeagueIds, starred),
    [allMatches, filters, trackedLeagueIds, starred],
  )

  const isNow = mode === 'now'
  // Total live matches across all leagues — drives the header live indicator (pre-filter).
  const liveCount = allMatches.length
  const hasData = allMatches.length > 0
  // Under "upcoming" the reader has asked for what is still to come, and the live grid is
  // by definition not that.
  const showGrid = isNow && filters.status !== 'upcoming'
  /*
   * Today's own rows, split around now. Without these, today showed strictly less than
   * yesterday did — the live grid and nothing else, while the archive already held every
   * series that had been played since midnight.
   */
  const laterToday = useMemo(() => visibleEntries.filter((e) => e.status === 'upcoming'), [visibleEntries])
  const earlierToday = useMemo(() => visibleEntries.filter((e) => e.status === 'finished'), [visibleEntries])

  const leagues = useMemo(
    () => (isNow ? leagueOptions(allMatches) : leagueOptionsFromEntries(dayEntries)),
    [isNow, allMatches, dayEntries],
  )

  return (
    <PageShell
      title={isNow ? 'Live matches' : format(new Date(`${day}T12:00:00`), 'EEEE d MMMM')}
      status={
        <>
          <LiveCount count={liveCount} />
          {lastUpdatedLabel && <span className="text-text-dim text-label">{lastUpdatedLabel}</span>}
        </>
      }
    >
      <div className="grid grid-cols-1 stack:grid-cols-[268px_minmax(0,1fr)] gap-6 items-start">
        <MatchRail
          filters={filters}
          onChange={setFilters}
          enabled={enabledStatuses(mode)}
          leagues={leagues}
          isStarred={isStarred}
          onToggleStar={toggleStar}
          // The archive does not exist in the demo build, so a calendar there would be a
          // permanently empty month rather than a control.
          calendar={
            IS_DEMO
              ? undefined
              : { days, selected: day, onSelect: setDay, anchor, onAnchorChange: setAnchor }
          }
          resultCount={isNow ? visible.length : visibleEntries.length}
          totalCount={isNow ? allMatches.length : dayEntries.length}
        />

        <div className="min-w-0 flex flex-col gap-10">
          {/* The archive feeds BOTH the calendar dots and every schedule list on this page.
              When it cannot be reached the dots simply disappear and the lists go quiet,
              which reads as "a quiet week" rather than "the archive is down". Said once,
              at the top, because it explains the whole right-hand column at a glance. */}
          {!IS_DEMO && (monthQuery.isError || dayQuery.isError) && (
            <div
              className="p-4 border rounded-md text-body-lg"
              style={{
                background: 'var(--color-dire-soft)',
                // Border stays --color-danger (non-text, 3:1); the copy needs 4.5:1.
                borderColor: 'var(--color-danger)',
                color: 'var(--color-danger-text)',
              }}
            >
              <p className="font-bold">Couldn't reach the match archive.</p>
              <p className="mt-1">
                Calendar dots and the schedule below are incomplete — this is not a statement that
                nothing was played. Live matches above are unaffected.
              </p>
            </div>
          )}

          {/* Loading state: bento skeleton tiles matching the final grid (no layout jump) */}
          {showGrid && isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4
                            sm:[grid-auto-rows:minmax(150px,auto)] lg:[grid-auto-rows:minmax(160px,auto)]">
              <div className="flex sm:col-span-2 lg:col-span-2 lg:row-span-2">
                <SkeletonRow featured />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {/* Error state: blocking banner only on first-load failure (no stale data). */}
          {showGrid && isError && !isLoading && !hasData && <ErrorBanner />}

          {/* Empty state: fetch succeeded but no live games at all */}
          {showGrid && !isLoading && !isError && !hasData && (
            <div className="py-16 text-center">
              <h2 className="text-text text-heading font-bold">No live matches right now</h2>
              <p className="mt-2 text-text-muted text-body-lg">
                Pro tournament games appear here as they go live. This page refreshes every 30 seconds.
              </p>
              {hiddenCount > 0 && (
                <p className="mt-2 text-text-dim text-body">
                  {hiddenCount} ladder {hiddenCount === 1 ? "game is" : "games are"} live but not shown — neither side has a team name.
                </p>
              )}
            </div>
          )}

          {showGrid && !isLoading && hasData && (
            visible.length > 0 ? (
              <>
                <MatchBentoGrid matches={visible} trackedLeagueIds={trackedLeagueIds} />
                {hiddenCount > 0 && (
                  <p className="mt-4 text-center text-text-dim text-body">
                    {hiddenCount} more ladder {hiddenCount === 1 ? "game" : "games"} hidden — neither side has a team name.
                  </p>
                )}
              </>
            ) : (
              <div className="py-16 text-center">
                <h2 className="text-text text-heading font-bold">No matches match your filters</h2>
                <p className="mt-2 text-text-muted text-body-lg">
                  Try clearing the search or switching the status filter.
                </p>
                <PrimaryButton className="mt-5" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Reset filters
                </PrimaryButton>
              </div>
            )
          )}

          {/* Today also answers "what is still to come" and "what has already been played"
              — the same rows the calendar dots today with, under the live grid rather than
              replacing it. */}
          {isNow && !IS_DEMO && !isLoading && (
            <>
              <ScheduleList
                entries={laterToday}
                title="Later today"
                error={dayQuery.isError}
                emptyNote={
                  dayQuery.isError
                    ? 'Could not load today’s schedule from the archive.'
                    : filters.status === 'upcoming'
                      ? 'Nothing else is scheduled today. Pick a day in the calendar to see what is announced.'
                      : undefined
                }
              />
              <ScheduleList entries={earlierToday} title="Earlier today" />
            </>
          )}

          {/* A past or future day is the archive's answer, not the live feed's. */}
          {!isNow && (
            <ScheduleList
              entries={visibleEntries}
              error={dayQuery.isError}
              emptyNote={
                /* The failure branch comes FIRST and says so. Without it a day the archive
                   could not be asked about was reported as a day on which nothing happened —
                   the two states rendered identically, so a stopped Postgres looked exactly
                   like a quiet Tuesday. */
                dayQuery.isError
                  ? 'Could not reach the archive, so this day could not be loaded — this is not a statement that nothing was played. Check that the archive is running and reload.'
                  : dayQuery.isLoading
                    ? 'Loading…'
                    : dayEntries.length > 0
                      ? 'Nothing on this day matches your filters.'
                      : mode === 'past'
                        ? 'Nothing recorded on this day.'
                        : 'Nothing announced for this day yet. Only tournaments that publish a bracket to Valve have a schedule — community leagues run continuously and never announce fixtures, so they appear on the day they are played.'
              }
            />
          )}
        </div>
      </div>
    </PageShell>
  )
}
