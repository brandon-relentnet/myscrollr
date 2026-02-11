import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Ghost,
  Link2,
  Unlink,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { IntegrationManifest, DashboardTabProps } from '@/integrations/types'
import { StreamHeader } from '@/integrations/shared'
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

const GAME_CODE_LABELS: Record<string, string> = {
  nfl: 'Football',
  nba: 'Basketball',
  nhl: 'Hockey',
  mlb: 'Baseball',
}

const LEAGUES_PER_PAGE = 5

function FantasyDashboardTab({
  stream,
  getToken,
  onToggle,
  onDelete,
}: DashboardTabProps) {
  // ── Yahoo State (self-contained) ────────────────────────────────
  const [yahoo, setYahoo] = useState<YahooState>({ leagues: {}, standings: {} })
  const [yahooStatus, setYahooStatus] = useState<{
    connected: boolean
    synced: boolean
  }>({ connected: false, synced: false })
  const [yahooPending, setYahooPending] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [filter, setFilter] = useState<'active' | 'finished'>('active')
  const [leagueVisibleCount, setLeagueVisibleCount] = useState(LEAGUES_PER_PAGE)

  // ── Fetch Yahoo Data ────────────────────────────────────────────

  const fetchYahooData = useCallback(async (): Promise<boolean> => {
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

      if (leaguesData) {
        const leagues: Record<string, YahooLeagueRecord> = {}
        const standings: Record<string, YahooStandingsRecord> = {}
        for (const league of leaguesData.leagues || []) {
          leagues[league.league_key] = league
        }
        for (const [key, val] of Object.entries(leaguesData.standings || {})) {
          standings[key] = { league_key: key, data: val }
        }
        setYahoo({ leagues, standings })

        if (Object.keys(leagues).length > 0) {
          setYahooPending(false)
          return true
        }
      }
    } catch {
      // Silently fail
    }
    return false
  }, [getToken])

  // ── Sync Polling ────────────────────────────────────────────────

  const startSyncPolling = useCallback(async () => {
    setYahooPending(true)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null

    const found = await fetchYahooData()
    if (found) {
      setYahooPending(false)
      return
    }

    let elapsed = 0
    pollRef.current = setInterval(async () => {
      elapsed += 5000
      const found = await fetchYahooData()
      if (found || elapsed >= 180000) {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = null
        setYahooPending(false)
      }
    }, 5000)
  }, [fetchYahooData])

  // ── Initial Fetch + Cleanup ─────────────────────────────────────

  useEffect(() => {
    fetchYahooData()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchYahooData])

  // ── Listen for Yahoo auth popup completion ──────────────────────

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'yahoo-auth-complete') {
        startSyncPolling()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [startSyncPolling])

  // ── Yahoo Connect / Disconnect ──────────────────────────────────

  const handleYahooConnect = useCallback(async () => {
    const token = await getToken()
    if (!token) return

    // Decode JWT to get the sub claim for the OAuth start URL
    let sub: string | undefined
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      sub = payload.sub
    } catch {
      // Fallback: try without sub (server may reject)
    }
    if (!sub) return

    const popup = window.open(
      `${API_BASE}/yahoo/start?logto_sub=${sub}`,
      'yahoo-auth',
      'width=600,height=700',
    )

    if (popup) {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed)
          startSyncPolling()
        }
      }, 500)
    }
  }, [getToken, startSyncPolling])

  const handleYahooDisconnect = useCallback(async () => {
    try {
      await authenticatedFetch(
        '/users/me/yahoo',
        { method: 'DELETE' },
        getToken,
      )
      setYahooStatus({ connected: false, synced: false })
      setYahoo({ leagues: {}, standings: {} })
    } catch {
      // Silently fail
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

  return (
    <div className="space-y-6">
      <StreamHeader
        stream={stream}
        icon={<Ghost size={20} className="text-primary" />}
        title="Fantasy Stream"
        subtitle="Yahoo Fantasy integration"
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Yahoo Connection Status */}
      {yahooStatus.connected && (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20">
            <span
              className={`h-1.5 w-1.5 rounded-full ${yahooStatus.synced ? 'bg-primary' : 'bg-warning'} animate-pulse`}
            />
            <span className="text-[9px] font-mono text-primary uppercase">
              {activeLeagues.length > 0
                ? `${activeLeagues.length} Active`
                : yahooStatus.synced
                  ? 'Connected'
                  : 'Syncing...'}
            </span>
            {finishedLeagues.length > 0 && (
              <span className="text-[9px] font-mono text-base-content/30 uppercase ml-1">
                / {finishedLeagues.length} Past
              </span>
            )}
          </span>
        </div>
      )}

      {/* Not Connected */}
      {!yahooStatus.connected && !yahooPending && (
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
          <motion.button
            onClick={handleYahooConnect}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 btn btn-primary btn-sm"
          >
            <Link2 size={14} />
            Connect Yahoo Account
          </motion.button>
        </motion.div>
      )}

      {/* Syncing / Waiting state */}
      {(yahooPending ||
        (yahooStatus.connected && allLeagues.length === 0)) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12 space-y-5"
        >
          <div className="flex items-center justify-center gap-1.5 h-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 rounded-full bg-primary origin-center"
                style={{ height: 8 }}
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
            <p className="text-sm font-bold uppercase text-primary/70">
              {yahooStatus.connected ? 'Syncing Leagues' : 'Connecting Yahoo'}
            </p>
            <p className="text-xs text-base-content/30 max-w-xs mx-auto text-center">
              {yahooStatus.synced
                ? 'Your account is synced. League data will appear here shortly.'
                : 'Fetching your fantasy data from Yahoo. This usually takes under two minutes.'}
            </p>
            <motion.div
              className="flex items-center justify-center gap-2 pt-2"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="h-1 w-1 rounded-full bg-primary/40" />
              <span className="text-[9px] font-mono text-primary/40 uppercase tracking-widest">
                Checking every 5s
              </span>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Filter Toggle */}
      {allLeagues.length > 0 && (
        <div className="flex items-center gap-1 p-1 rounded-lg bg-base-200/60 border border-base-300/40 w-fit">
          <button
            onClick={() => handleFilterChange('active')}
            className={`relative px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
              filter === 'active'
                ? 'text-primary'
                : 'text-base-content/30 hover:text-base-content/50'
            }`}
          >
            {filter === 'active' && (
              <motion.div
                layoutId="fantasy-filter-bg"
                className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-md"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
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
                className="absolute inset-0 bg-base-300/30 border border-base-300/40 rounded-md"
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

      {/* League Cards */}
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
            <LeagueCard league={league} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Empty filter state */}
      {allLeagues.length > 0 && filteredLeagues.length === 0 && (
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

      {/* Load More */}
      {hasMore && (
        <motion.button
          onClick={() =>
            setLeagueVisibleCount((prev) => prev + LEAGUES_PER_PAGE)
          }
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full p-3.5 rounded-lg bg-base-200/40 border border-base-300/40 text-base-content/40 hover:text-base-content/60 hover:border-base-300/60 transition-all flex items-center justify-center gap-2 group"
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

      {/* Account Actions */}
      {yahooStatus.connected && (
        <div className="flex gap-3">
          <motion.button
            onClick={handleYahooConnect}
            whileHover={{ scale: 1.01 }}
            className="flex-1 p-4 rounded-lg border border-dashed border-base-300/50 text-base-content/40 hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center gap-2"
          >
            <Link2 size={16} />
            <span className="text-xs uppercase tracking-wide">
              Reconnect Yahoo
            </span>
          </motion.button>
          <motion.button
            onClick={handleYahooDisconnect}
            whileHover={{ scale: 1.01 }}
            className="p-4 rounded-lg border border-dashed border-base-300/50 text-base-content/40 hover:text-error hover:border-error/30 transition-all flex items-center justify-center gap-2"
          >
            <Unlink size={16} />
            <span className="text-xs uppercase tracking-wide">Disconnect</span>
          </motion.button>
        </div>
      )}
    </div>
  )
}

// ── League Card ─────────────────────────────────────────────────────

function LeagueCard({
  league,
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
      className={`border rounded-lg overflow-hidden transition-colors ${isActive ? 'bg-base-200/50 border-base-300/50' : 'bg-base-200/20 border-base-300/30'}`}
    >
      <button
        onClick={() => teams.length > 0 && setStandingsOpen((prev) => !prev)}
        className={`w-full p-5 flex items-center justify-between text-left ${teams.length > 0 ? 'cursor-pointer hover:bg-base-200/30' : 'cursor-default'} transition-colors`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-secondary/10 border border-secondary/20' : 'bg-base-300/20 border border-base-300/30'}`}
          >
            <span
              className={`text-base font-bold ${isActive ? 'text-secondary' : 'text-base-content/30'}`}
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
              {sportLabel} · {league.num_teams} Teams
              {league.season ? ` · ${league.season}` : ''}
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
              <div className="h-px bg-base-300/30 mb-3" />
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
                    className="flex items-center justify-between p-2.5 rounded bg-base-100/50 border border-base-300/30"
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
                          ? ` · ${team.team_standings.points_for} PF`
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

export const fantasyIntegration: IntegrationManifest = {
  id: 'fantasy',
  name: 'Fantasy',
  tabLabel: 'Fantasy',
  description: 'Yahoo Fantasy integration',
  icon: Ghost,
  DashboardTab: FantasyDashboardTab,
}
