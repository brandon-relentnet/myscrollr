import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Ghost,
  Loader2,
  Link2,
  Plus,
  Unlink,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ChannelManifest, DashboardTabProps } from '@/channels/types'
import { ChannelHeader } from '@/channels/shared'
import { API_BASE, authenticatedFetch } from '@/api/client'

// ── Yahoo Data Types ──────────────────────────────────────────────

interface YahooLeagueRecord {
  league_key: string
  guid: string
  name: string
  game_code: string
  season: string
  data: any
}

interface YahooStandingsRecord {
  league_key: string
  data: any
}

interface YahooState {
  leagues: Record<string, YahooLeagueRecord>
  standings: Record<string, YahooStandingsRecord>
}

/** Metadata returned by POST /discover — not yet in the DB. */
interface DiscoveredLeague {
  league_key: string
  name: string
  game_code: string
  season: number
  num_teams: number
  is_finished: boolean
  logo_url?: string
  url?: string
}

type Phase =
  | 'disconnected'
  | 'discovering'
  | 'picking'
  | 'importing'
  | 'connected'

type ImportStatus = 'pending' | 'importing' | 'done' | 'error'

const GAME_CODE_LABELS: Record<string, string> = {
  nfl: 'Football',
  nba: 'Basketball',
  nhl: 'Hockey',
  mlb: 'Baseball',
}

const LEAGUES_PER_PAGE = 5
const HEX = '#a855f7'

function FantasyDashboardTab({
  channel,
  getToken,
  hex,
  onToggle,
  onDelete,
}: DashboardTabProps) {
  // ── Core state ──────────────────────────────────────────────────
  const [yahoo, setYahoo] = useState<YahooState>({
    leagues: {},
    standings: {},
  })
  const [yahooStatus, setYahooStatus] = useState<{
    connected: boolean
    synced: boolean
  }>({ connected: false, synced: false })

  const [phase, setPhase] = useState<Phase>('disconnected')
  const [discoveredLeagues, setDiscoveredLeagues] = useState<
    DiscoveredLeague[]
  >([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [importStatuses, setImportStatuses] = useState<
    Record<string, ImportStatus>
  >({})
  const [discoverError, setDiscoverError] = useState<string | null>(null)

  const [filter, setFilter] = useState<'active' | 'finished'>('active')
  const [leagueVisibleCount, setLeagueVisibleCount] =
    useState(LEAGUES_PER_PAGE)

  // Track if initial load is done
  const initialLoadDone = useRef(false)

  // ── Fetch existing Yahoo Data ───────────────────────────────────

  const fetchYahooData = useCallback(async () => {
    try {
      const [statusData, leaguesData] = await Promise.all([
        authenticatedFetch<{ connected: boolean; synced: boolean }>(
          '/users/me/yahoo-status',
          {},
          getToken,
        ).catch(() => null),
        authenticatedFetch<{
          leagues?: Array<any>
          standings?: Record<string, any>
        }>('/users/me/yahoo-leagues', {}, getToken).catch(() => null),
      ])

      if (statusData) {
        setYahooStatus(statusData)
      }

      const leagues: Record<string, YahooLeagueRecord> = {}
      const standings: Record<string, YahooStandingsRecord> = {}
      if (leaguesData) {
        for (const league of leaguesData.leagues || []) {
          leagues[league.league_key] = league
        }
        for (const [key, val] of Object.entries(
          leaguesData.standings || {},
        )) {
          standings[key] = { league_key: key, data: val }
        }
      }
      setYahoo({ leagues, standings })

      // Determine initial phase
      if (!initialLoadDone.current) {
        initialLoadDone.current = true
        if (statusData?.connected && Object.keys(leagues).length > 0) {
          setPhase('connected')
        } else if (statusData?.connected) {
          // Connected but no leagues imported yet — go to discover
          setPhase('connected')
        } else {
          setPhase('disconnected')
        }
      }
    } catch (err) {
      console.error('[Fantasy] fetchYahooData error:', err)
      if (!initialLoadDone.current) {
        initialLoadDone.current = true
        setPhase('disconnected')
      }
    }
  }, [getToken])

  // ── Initial Fetch ───────────────────────────────────────────────

  useEffect(() => {
    fetchYahooData()
  }, [fetchYahooData])

  // ── League Discovery ────────────────────────────────────────────

  const startDiscovery = useCallback(async () => {
    setPhase('discovering')
    setDiscoverError(null)
    setDiscoveredLeagues([])

    try {
      const result = await authenticatedFetch<{
        leagues: DiscoveredLeague[]
        error?: string
      }>(
        '/users/me/yahoo-leagues/discover',
        { method: 'POST' },
        getToken,
      )

      if (result.error) {
        setDiscoverError(result.error)
        setPhase(
          Object.keys(yahoo.leagues).length > 0 ? 'connected' : 'disconnected',
        )
        return
      }

      const leagues = result.leagues || []
      setDiscoveredLeagues(leagues)

      // Filter out already-imported leagues
      const alreadyImported = new Set(Object.keys(yahoo.leagues))
      const newLeagues = leagues.filter(
        (l) => !alreadyImported.has(l.league_key),
      )

      if (newLeagues.length === 0) {
        // All leagues already imported
        setPhase('connected')
        return
      }

      // Pre-select active leagues
      const preSelected = new Set(
        newLeagues.filter((l) => !l.is_finished).map((l) => l.league_key),
      )
      setSelectedKeys(preSelected)
      setPhase('picking')
    } catch (err: any) {
      console.error('[Fantasy] discover failed:', err)
      setDiscoverError(err?.message || 'Discovery failed')
      setPhase(
        Object.keys(yahoo.leagues).length > 0 ? 'connected' : 'disconnected',
      )
    }
  }, [getToken, yahoo.leagues])

  // ── Import selected leagues one at a time ───────────────────────

  const importSelected = useCallback(async () => {
    const keys = Array.from(selectedKeys)
    if (keys.length === 0) return

    setPhase('importing')

    // Build initial status map
    const statuses: Record<string, ImportStatus> = {}
    for (const key of keys) {
      statuses[key] = 'pending'
    }
    setImportStatuses({ ...statuses })

    for (const key of keys) {
      const league = discoveredLeagues.find((l) => l.league_key === key)
      if (!league) continue

      // Mark as importing
      statuses[key] = 'importing'
      setImportStatuses({ ...statuses })

      try {
        const result = await authenticatedFetch<{
          status: string
          league: any
          standings: any
          error?: string
        }>(
          '/users/me/yahoo-leagues/import',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              league_key: league.league_key,
              game_code: league.game_code,
              season: league.season,
            }),
          },
          getToken,
        )

        if (result.error) {
          console.error(`[Fantasy] import failed for ${key}:`, result.error)
          statuses[key] = 'error'
        } else {
          statuses[key] = 'done'

          // Add to local state immediately so the card appears
          if (result.league) {
            setYahoo((prev) => {
              const newLeagues = { ...prev.leagues }
              const newStandings = { ...prev.standings }

              newLeagues[key] = {
                league_key: key,
                guid: '',
                name: result.league.name,
                game_code: result.league.game_code,
                season: String(result.league.season),
                data: result.league,
              }

              if (result.standings) {
                newStandings[key] = {
                  league_key: key,
                  data: result.standings,
                }
              }

              return { leagues: newLeagues, standings: newStandings }
            })
          }
        }
      } catch (err) {
        console.error(`[Fantasy] import error for ${key}:`, err)
        statuses[key] = 'error'
      }

      setImportStatuses({ ...statuses })
    }

    // All done — switch to connected
    setPhase('connected')
    // Refresh data to get full picture from DB
    await fetchYahooData()
  }, [selectedKeys, discoveredLeagues, getToken, fetchYahooData])

  // ── Listen for Yahoo auth popup completion ──────────────────────

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'yahoo-auth-complete') {
        console.log('[Fantasy] Yahoo auth complete — starting discovery')
        setYahooStatus({ connected: true, synced: false })
        startDiscovery()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [startDiscovery])

  // ── Yahoo Connect / Disconnect ──────────────────────────────────

  const handleYahooConnect = useCallback(async () => {
    const token = await getToken()
    if (!token) return

    let sub: string | undefined
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      sub = payload.sub
    } catch {
      // ignore
    }
    if (!sub) return

    const popupUrl = `${API_BASE}/yahoo/start?logto_sub=${sub}`
    const popup = window.open(popupUrl, 'yahoo-auth', 'width=600,height=700')

    if (popup) {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed)
          // postMessage handler will trigger discovery
        }
      }, 500)
    }
  }, [getToken])

  const handleYahooDisconnect = useCallback(async () => {
    try {
      await authenticatedFetch(
        '/users/me/yahoo',
        { method: 'DELETE' },
        getToken,
      )
      setYahooStatus({ connected: false, synced: false })
      setYahoo({ leagues: {}, standings: {} })
      setPhase('disconnected')
      initialLoadDone.current = false
    } catch (err) {
      console.error('[Fantasy] disconnect failed:', err)
    }
  }, [getToken])

  // ── Derived Data ────────────────────────────────────────────────

  const allLeagues = Object.values(yahoo.leagues)
    .map((league) => {
      const standings = yahoo.standings[league.league_key]
      return {
        league_key: league.league_key,
        name: league.name,
        game_code: league.game_code,
        season: league.season,
        num_teams: league.data?.num_teams || 0,
        is_finished: league.data?.is_finished ?? true,
        standings: standings?.data,
      }
    })
    .sort((a, b) => Number(b.season) - Number(a.season))

  const activeLeagues = allLeagues.filter((l) => !l.is_finished)
  const finishedLeagues = allLeagues.filter((l) => l.is_finished)
  const filteredLeagues = filter === 'active' ? activeLeagues : finishedLeagues
  const visibleLeagues = filteredLeagues.slice(0, leagueVisibleCount)
  const hasMore = leagueVisibleCount < filteredLeagues.length
  const remaining = filteredLeagues.length - leagueVisibleCount

  const handleFilterChange = (newFilter: 'active' | 'finished') => {
    setFilter(newFilter)
    setLeagueVisibleCount(LEAGUES_PER_PAGE)
  }

  // ── Picking helpers ─────────────────────────────────────────────

  const alreadyImported = new Set(Object.keys(yahoo.leagues))
  const pickableLeagues = discoveredLeagues.filter(
    (l) => !alreadyImported.has(l.league_key),
  )
  const pickableActive = pickableLeagues.filter((l) => !l.is_finished)
  const pickableFinished = pickableLeagues.filter((l) => l.is_finished)

  const toggleLeague = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () =>
    setSelectedKeys(new Set(pickableLeagues.map((l) => l.league_key)))
  const deselectAll = () => setSelectedKeys(new Set())

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <ChannelHeader
        channel={channel}
        icon={<Ghost size={16} className="text-base-content/80" />}
        title="Fantasy Channel"
        subtitle="Yahoo Fantasy channel"
        hex={hex}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Yahoo Connection Status (connected + has leagues) */}
      {phase === 'connected' && allLeagues.length > 0 && (
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 px-2 py-1 rounded border"
            style={{
              background: `${hex}10`,
              borderColor: `${hex}20`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full animate-pulse"
              style={{ background: hex }}
            />
            <span
              className="text-[9px] font-mono uppercase"
              style={{ color: hex }}
            >
              {activeLeagues.length > 0
                ? `${activeLeagues.length} Active`
                : 'Connected'}
            </span>
            {finishedLeagues.length > 0 && (
              <span className="text-[9px] font-mono text-base-content/30 uppercase ml-1">
                / {finishedLeagues.length} Past
              </span>
            )}
          </span>
        </div>
      )}

      {/* ── DISCONNECTED ─────────────────────────────────────────── */}
      {phase === 'disconnected' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12 space-y-4"
        >
          <Ghost size={48} className="mx-auto text-base-content/20" />
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase text-base-content/50">
              No Fantasy Data
            </p>
            <p className="text-xs text-base-content/30 max-w-xs mx-auto">
              Connect your Yahoo account to see your fantasy leagues, standings,
              and rosters in real time.
            </p>
          </div>
          {discoverError && (
            <p className="text-xs text-error max-w-xs mx-auto">
              {discoverError}
            </p>
          )}
          <motion.button
            onClick={handleYahooConnect}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 btn btn-sm"
            style={{
              background: hex,
              borderColor: hex,
              color: '#fff',
            }}
          >
            <Link2 size={14} />
            Connect Yahoo Account
          </motion.button>
        </motion.div>
      )}

      {/* ── DISCOVERING ──────────────────────────────────────────── */}
      {phase === 'discovering' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12 space-y-5"
        >
          <div className="flex items-center justify-center gap-1.5 h-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 rounded-full origin-center"
                style={{ height: 8, background: hex }}
                animate={{
                  scaleY: [1, 3, 1],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.12,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
          <div className="space-y-2">
            <p
              className="text-sm font-bold uppercase"
              style={{ color: `${hex}B3` }}
            >
              Discovering Leagues
            </p>
            <p className="text-xs text-base-content/30 max-w-xs mx-auto text-center">
              Scanning your Yahoo Fantasy account for leagues across all sports.
              This usually takes a few seconds.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── PICKING ──────────────────────────────────────────────── */}
      {phase === 'picking' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase text-base-content/50 tracking-wide">
              Select leagues to import ({pickableLeagues.length} found)
            </p>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-[10px] uppercase tracking-wide text-base-content/40 hover:text-base-content/60 transition-colors"
              >
                Select All
              </button>
              <span className="text-base-content/20">|</span>
              <button
                onClick={deselectAll}
                className="text-[10px] uppercase tracking-wide text-base-content/40 hover:text-base-content/60 transition-colors"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Active leagues */}
          {pickableActive.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-success/80 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                Active Leagues
              </p>
              {pickableActive.map((league) => (
                <LeaguePickerRow
                  key={league.league_key}
                  league={league}
                  selected={selectedKeys.has(league.league_key)}
                  onToggle={() => toggleLeague(league.league_key)}
                  hex={hex}
                />
              ))}
            </div>
          )}

          {/* Finished leagues */}
          {pickableFinished.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-base-content/30">
                Past Leagues
              </p>
              {pickableFinished.map((league) => (
                <LeaguePickerRow
                  key={league.league_key}
                  league={league}
                  selected={selectedKeys.has(league.league_key)}
                  onToggle={() => toggleLeague(league.league_key)}
                  hex={hex}
                />
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <motion.button
              onClick={importSelected}
              disabled={selectedKeys.size === 0}
              whileHover={{ scale: selectedKeys.size > 0 ? 1.02 : 1 }}
              whileTap={{ scale: selectedKeys.size > 0 ? 0.98 : 1 }}
              className="flex-1 btn btn-sm disabled:opacity-30"
              style={{
                background: selectedKeys.size > 0 ? hex : undefined,
                borderColor: selectedKeys.size > 0 ? hex : undefined,
                color: selectedKeys.size > 0 ? '#fff' : undefined,
              }}
            >
              Import Selected ({selectedKeys.size})
            </motion.button>
            <button
              onClick={() =>
                setPhase(allLeagues.length > 0 ? 'connected' : 'disconnected')
              }
              className="btn btn-sm btn-ghost text-base-content/40"
            >
              Skip
            </button>
          </div>
        </motion.div>
      )}

      {/* ── IMPORTING ────────────────────────────────────────────── */}
      {phase === 'importing' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <p className="text-xs font-bold uppercase text-base-content/50 tracking-wide">
            Importing Leagues
          </p>
          {Array.from(selectedKeys).map((key) => {
            const league = discoveredLeagues.find(
              (l) => l.league_key === key,
            )
            const status = importStatuses[key] || 'pending'
            const sportLabel =
              GAME_CODE_LABELS[league?.game_code || ''] ||
              league?.game_code ||
              'Fantasy'

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 rounded-lg border border-base-300/25 bg-base-200/30"
              >
                {/* Status icon */}
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  {status === 'done' && (
                    <Check size={14} className="text-success" />
                  )}
                  {status === 'importing' && (
                    <Loader2
                      size={14}
                      className="animate-spin"
                      style={{ color: hex }}
                    />
                  )}
                  {status === 'pending' && (
                    <span className="h-2 w-2 rounded-full bg-base-content/15" />
                  )}
                  {status === 'error' && (
                    <span className="text-error text-xs font-bold">!</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">
                    {league?.name || key}
                  </p>
                  <p className="text-[10px] text-base-content/40">
                    {sportLabel} &middot; {league?.season}
                  </p>
                </div>

                <span
                  className="text-[9px] font-mono uppercase"
                  style={{
                    color:
                      status === 'done'
                        ? '#22c55e'
                        : status === 'importing'
                          ? hex
                          : status === 'error'
                            ? '#ef4444'
                            : 'oklch(var(--bc) / 0.2)',
                  }}
                >
                  {status}
                </span>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* ── CONNECTED — Filter Toggle ────────────────────────────── */}
      {phase === 'connected' && allLeagues.length > 0 && (
        <div className="flex items-center gap-1 p-1 rounded-lg bg-base-200/60 border border-base-300/25 w-fit">
          <button
            onClick={() => handleFilterChange('active')}
            className={`relative px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
              filter === 'active'
                ? ''
                : 'text-base-content/30 hover:text-base-content/50'
            }`}
            style={filter === 'active' ? { color: hex } : undefined}
          >
            {filter === 'active' && (
              <motion.div
                layoutId="fantasy-filter-bg"
                className="absolute inset-0 rounded-md border"
                style={{
                  background: `${hex}10`,
                  borderColor: `${hex}33`,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ background: '#22c55e' }}
              />
              Active
              {activeLeagues.length > 0 && (
                <span className="font-mono">{activeLeagues.length}</span>
              )}
            </span>
          </button>
          <button
            onClick={() => handleFilterChange('finished')}
            className={`relative px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
              filter === 'finished'
                ? 'text-base-content/60'
                : 'text-base-content/30 hover:text-base-content/50'
            }`}
          >
            {filter === 'finished' && (
              <motion.div
                layoutId="fantasy-filter-bg"
                className="absolute inset-0 bg-base-300/30 border border-base-300/25 rounded-md"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              Past
              {finishedLeagues.length > 0 && (
                <span className="font-mono text-base-content/30">
                  {finishedLeagues.length}
                </span>
              )}
            </span>
          </button>
        </div>
      )}

      {/* ── CONNECTED — League Cards ─────────────────────────────── */}
      {phase === 'connected' && (
        <AnimatePresence mode="popLayout">
          {visibleLeagues.map((league, i) => (
            <motion.div
              key={league.league_key}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 30,
                delay: i < LEAGUES_PER_PAGE ? i * 0.05 : 0,
              }}
              layout
            >
              <LeagueCard league={league} hex={hex} />
            </motion.div>
          ))}
        </AnimatePresence>
      )}

      {/* Empty filter state */}
      {phase === 'connected' &&
        allLeagues.length > 0 &&
        filteredLeagues.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <p className="text-xs text-base-content/30 uppercase tracking-wide">
              {filter === 'active'
                ? 'No active leagues right now'
                : 'No past leagues found'}
            </p>
          </motion.div>
        )}

      {/* Connected but no leagues at all */}
      {phase === 'connected' &&
        yahooStatus.connected &&
        allLeagues.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-8 space-y-3"
          >
            <p className="text-xs text-base-content/40 uppercase">
              Yahoo account connected &mdash; no leagues imported yet
            </p>
            <motion.button
              onClick={startDiscovery}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 btn btn-sm"
              style={{
                background: hex,
                borderColor: hex,
                color: '#fff',
              }}
            >
              <Plus size={14} />
              Import Leagues
            </motion.button>
          </motion.div>
        )}

      {/* Load More */}
      {phase === 'connected' && hasMore && (
        <motion.button
          onClick={() =>
            setLeagueVisibleCount((prev) => prev + LEAGUES_PER_PAGE)
          }
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full p-3.5 rounded-lg bg-base-200/40 border border-base-300/25 text-base-content/40 hover:text-base-content/60 hover:border-base-300/40 transition-all flex items-center justify-center gap-2 group"
        >
          <ChevronDown
            size={14}
            className="group-hover:translate-y-0.5 transition-transform"
          />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Show {Math.min(remaining, LEAGUES_PER_PAGE)} more
          </span>
          <span className="text-[10px] font-mono text-base-content/20">
            ({remaining} remaining)
          </span>
        </motion.button>
      )}

      {/* ── Account Actions ──────────────────────────────────────── */}
      {phase === 'connected' && yahooStatus.connected && (
        <div className="flex gap-3">
          <motion.button
            onClick={startDiscovery}
            whileHover={{ scale: 1.01 }}
            className="flex-1 p-4 rounded-lg border border-dashed border-base-300/25 text-base-content/40 transition-all flex items-center justify-center gap-2"
            onMouseEnter={(e) => {
              e.currentTarget.style.color = hex
              e.currentTarget.style.borderColor = `${hex}4D`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = ''
              e.currentTarget.style.borderColor = ''
            }}
          >
            <Plus size={16} />
            <span className="text-xs uppercase tracking-wide">Add Leagues</span>
          </motion.button>
          <motion.button
            onClick={handleYahooDisconnect}
            whileHover={{ scale: 1.01 }}
            className="p-4 rounded-lg border border-dashed border-base-300/25 text-base-content/40 hover:text-error hover:border-error/30 transition-all flex items-center justify-center gap-2"
          >
            <Unlink size={16} />
            <span className="text-xs uppercase tracking-wide">Disconnect</span>
          </motion.button>
        </div>
      )}
    </div>
  )
}

// ── League Picker Row ───────────────────────────────────────────────

function LeaguePickerRow({
  league,
  selected,
  onToggle,
  hex,
}: {
  league: DiscoveredLeague
  selected: boolean
  onToggle: () => void
  hex: string
}) {
  const sportLabel =
    GAME_CODE_LABELS[league.game_code] || league.game_code || 'Fantasy'

  return (
    <motion.button
      onClick={onToggle}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
        selected
          ? 'bg-base-200/60 border-base-300/40'
          : 'bg-base-200/20 border-base-300/15 opacity-60'
      }`}
      style={
        selected ? { borderColor: `${hex}30`, background: `${hex}08` } : {}
      }
    >
      {/* Checkbox */}
      <div
        className="h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all"
        style={
          selected
            ? { background: hex, borderColor: hex }
            : { borderColor: 'oklch(var(--bc) / 0.15)' }
        }
      >
        {selected && <Check size={10} className="text-white" />}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold truncate">{league.name}</p>
        <p className="text-[10px] text-base-content/40">
          {sportLabel} &middot; {league.num_teams} Teams &middot;{' '}
          {league.season}
        </p>
      </div>

      {/* Active/Finished badge */}
      {!league.is_finished ? (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/10 border border-success/20">
          <span className="h-1 w-1 rounded-full bg-success animate-pulse" />
          <span className="text-[8px] font-bold uppercase text-success">
            Active
          </span>
        </span>
      ) : (
        <span className="text-[9px] font-mono text-base-content/25">
          {league.season}
        </span>
      )}
    </motion.button>
  )
}

// ── League Card ─────────────────────────────────────────────────────

function LeagueCard({
  league,
  hex,
}: {
  league: {
    league_key: string
    name: string
    game_code?: string
    num_teams: number
    season?: string
    is_finished?: boolean
    standings?: any
  }
  hex: string
}) {
  const [standingsOpen, setStandingsOpen] = useState(false)
  const sportLabel =
    GAME_CODE_LABELS[league.game_code || ''] || league.game_code || 'Fantasy'
  const teams = Array.isArray(league.standings)
    ? league.standings
    : league.standings?.teams?.team || []
  const isActive = !league.is_finished

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${isActive ? 'bg-base-200/50 border-base-300/25' : 'bg-base-200/20 border-base-300/20'}`}
    >
      <button
        onClick={() => teams.length > 0 && setStandingsOpen((prev) => !prev)}
        className={`w-full p-5 flex items-center justify-between text-left ${teams.length > 0 ? 'cursor-pointer hover:bg-base-200/30' : 'cursor-default'} transition-colors`}
      >
        <div className="flex items-center gap-4">
          {/* Icon badge */}
          <div
            className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0"
            style={
              isActive
                ? {
                    background: `${hex}15`,
                    boxShadow: `0 0 0 1px ${hex}20`,
                  }
                : {
                    background: 'oklch(var(--b3) / 0.2)',
                    boxShadow: '0 0 0 1px oklch(var(--b3) / 0.3)',
                  }
            }
          >
            <span
              className={`text-base font-bold ${isActive ? '' : 'text-base-content/30'}`}
              style={isActive ? { color: hex } : undefined}
            >
              Y!
            </span>
          </div>
          <div className="min-w-0">
            <h3
              className={`text-sm font-bold uppercase truncate ${isActive ? '' : 'text-base-content/50'}`}
            >
              {league.name}
            </h3>
            <p className="text-[10px] text-base-content/40 uppercase tracking-wide">
              {sportLabel} &middot; {league.num_teams} Teams
              {league.season ? ` \u00b7 ${league.season}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isActive ? (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-success/10 border border-success/20">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[9px] font-bold uppercase text-success">
                Active
              </span>
            </span>
          ) : (
            <span className="text-[9px] font-mono text-base-content/25 uppercase">
              {league.season}
            </span>
          )}
          {teams.length > 0 && (
            <motion.div
              animate={{ rotate: standingsOpen ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <ChevronDown size={14} className="text-base-content/30" />
            </motion.div>
          )}
        </div>
      </button>

      {/* Collapsible Standings */}
      <AnimatePresence initial={false}>
        {standingsOpen && teams.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-1.5">
              <div className="h-px bg-base-300/25 mb-3" />
              <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest mb-2">
                Standings
              </p>
              {teams.map((team: any, i: number) => {
                const record = team.team_standings?.outcome_totals
                const logo = team.team_logos?.team_logo?.[0]?.url
                return (
                  <motion.div
                    key={team.team_key || i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: i * 0.03,
                      type: 'spring',
                      stiffness: 400,
                      damping: 30,
                    }}
                    className="flex items-center justify-between p-2.5 rounded bg-base-100/50 border border-base-300/25"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-base-content/30 w-4 text-right">
                        {i + 1}
                      </span>
                      {logo && (
                        <img
                          src={logo}
                          alt=""
                          className="h-5 w-5 rounded object-cover"
                        />
                      )}
                      <span className="text-xs font-bold truncate max-w-[160px]">
                        {team.name}
                      </span>
                    </div>
                    {record && (
                      <span className="text-[10px] font-mono text-base-content/40">
                        {record.wins}-{record.losses}
                        {record.ties > 0 ? `-${record.ties}` : ''}
                        {team.team_standings?.points_for
                          ? ` \u00b7 ${team.team_standings.points_for} PF`
                          : ''}
                      </span>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {teams.length === 0 && (
        <div className="px-5 pb-4">
          <div className="h-px bg-base-300/20 mb-3" />
          <p className="text-[10px] text-base-content/25 uppercase text-center">
            Standings not yet available
          </p>
        </div>
      )}
    </div>
  )
}

export const fantasyChannel: ChannelManifest = {
  id: 'fantasy',
  name: 'Fantasy',
  tabLabel: 'Fantasy',
  description: 'Yahoo Fantasy channel',
  hex: HEX,
  icon: Ghost,
  DashboardTab: FantasyDashboardTab,
}
