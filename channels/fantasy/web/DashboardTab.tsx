import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Ghost,
  Loader2,
  Link2,
  Plus,
  Shield,
  Unlink,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ChannelManifest, DashboardTabProps } from '@/channels/types'
import { ChannelHeader, InfoCard } from '@/channels/shared'
import { API_BASE, authenticatedFetch } from '@/api/client'

// ── Data Types (match Go MyLeaguesResponse) ─────────────────────────

interface StandingsEntry {
  team_key: string
  team_id: number
  name: string
  url: string
  team_logo: string
  manager_name: string
  rank: number | null
  wins: number
  losses: number
  ties: number
  percentage: string
  games_back: string
  points_for: string
  points_against: string
  streak_type: string
  streak_value: number
  playoff_seed: number | null
  clinched_playoffs: boolean
  waiver_priority: number | null
}

interface MatchupTeam {
  team_key: string
  team_id: number
  name: string
  team_logo: string
  manager_name: string
  points: number | null
  projected_points: number | null
}

interface Matchup {
  week: number
  week_start: string
  week_end: string
  status: string
  is_playoffs: boolean
  is_consolation: boolean
  is_tied: boolean
  winner_team_key: string | null
  teams: MatchupTeam[]
}

interface RosterPlayer {
  player_key: string
  player_id: number
  name: { full: string; first: string; last: string }
  editorial_team_abbr: string
  display_position: string
  selected_position: string
  image_url: string
  status: string | null
  status_full: string | null
  injury_note: string | null
  player_points: number | null
}

interface RosterEntry {
  team_key: string
  data: {
    team_key: string
    team_name: string
    players: RosterPlayer[]
  }
}

interface LeagueData {
  league_key: string
  name: string
  game_code: string
  season: string
  team_key: string | null
  team_name: string | null
  data: {
    num_teams: number
    is_finished: boolean
    current_week: number | null
    scoring_type: string
    [k: string]: unknown
  }
  standings: StandingsEntry[] | null
  matchups: Matchup[] | null
  rosters: RosterEntry[] | null
}

interface MyLeaguesResponse {
  leagues: LeagueData[]
}

/** Metadata returned by POST /discover */
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

const GAME_CODE_EMOJI: Record<string, string> = {
  nfl: '\uD83C\uDFC8',
  nba: '\uD83C\uDFC0',
  nhl: '\uD83C\uDFD2',
  mlb: '\u26BE',
}

const INJURY_COLORS: Record<string, string> = {
  O: '#ef4444',
  IR: '#ef4444',
  SUSP: '#ef4444',
  D: '#f97316',
  Q: '#eab308',
  P: '#eab308',
  DTD: '#f97316',
  DL: '#ef4444',
  NA: '#a3a3a3',
}

const LEAGUES_PER_PAGE = 5
const HEX = '#a855f7'

// ── Main Component ──────────────────────────────────────────────────

function FantasyDashboardTab({
  channel,
  getToken,
  hex,
  connected,
  subscriptionTier,
  onToggle,
  onDelete,
}: DashboardTabProps) {
  const isUnlimited = subscriptionTier === 'uplink_unlimited'
  const isUplink = subscriptionTier === 'uplink' || isUnlimited

  // ── Core state ──────────────────────────────────────────────────
  const [leagues, setLeagues] = useState<LeagueData[]>([])
  const [yahooConnected, setYahooConnected] = useState(false)

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
        authenticatedFetch<MyLeaguesResponse>(
          '/users/me/yahoo-leagues',
          {},
          getToken,
        ).catch(() => null),
      ])

      const isConnected = statusData?.connected ?? false
      setYahooConnected(isConnected)
      setLeagues(leaguesData?.leagues ?? [])

      if (!initialLoadDone.current) {
        initialLoadDone.current = true
        if (isConnected && (leaguesData?.leagues?.length ?? 0) > 0) {
          setPhase('connected')
        } else if (isConnected) {
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
        setPhase(leagues.length > 0 ? 'connected' : 'disconnected')
        return
      }

      const discovered = result.leagues || []
      setDiscoveredLeagues(discovered)

      const alreadyImported = new Set(leagues.map((l) => l.league_key))
      const newLeagues = discovered.filter(
        (l) => !alreadyImported.has(l.league_key),
      )

      if (newLeagues.length === 0) {
        setPhase('connected')
        return
      }

      const preSelected = new Set(
        newLeagues.filter((l) => !l.is_finished).map((l) => l.league_key),
      )
      setSelectedKeys(preSelected)
      setPhase('picking')
    } catch (err: any) {
      console.error('[Fantasy] discover failed:', err)
      setDiscoverError(err?.message || 'Discovery failed')
      setPhase(leagues.length > 0 ? 'connected' : 'disconnected')
    }
  }, [getToken, leagues])

  // ── Import selected leagues ─────────────────────────────────────

  const importSelected = useCallback(async () => {
    const keys = Array.from(selectedKeys)
    if (keys.length === 0) return

    setPhase('importing')

    const statuses: Record<string, ImportStatus> = {}
    for (const key of keys) statuses[key] = 'pending'
    setImportStatuses({ ...statuses })

    for (const key of keys) {
      const league = discoveredLeagues.find((l) => l.league_key === key)
      if (!league) continue

      statuses[key] = 'importing'
      setImportStatuses({ ...statuses })

      try {
        const result = await authenticatedFetch<{
          status: string
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

        statuses[key] = result.error ? 'error' : 'done'
      } catch {
        statuses[key] = 'error'
      }

      setImportStatuses({ ...statuses })
    }

    // Refetch to get full data (standings, matchups, rosters)
    await fetchYahooData()
    setPhase('connected')
  }, [selectedKeys, discoveredLeagues, getToken, fetchYahooData])

  // ── Listen for Yahoo auth popup completion ──────────────────────

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'yahoo-auth-complete') {
        setYahooConnected(true)
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
      /* ignore */
    }
    if (!sub) return

    const popupUrl = `${API_BASE}/yahoo/start?logto_sub=${sub}`
    const popup = window.open(popupUrl, 'yahoo-auth', 'width=600,height=700')

    if (popup) {
      const checkClosed = setInterval(() => {
        if (popup.closed) clearInterval(checkClosed)
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
      setYahooConnected(false)
      setLeagues([])
      setPhase('disconnected')
      initialLoadDone.current = false
    } catch (err) {
      console.error('[Fantasy] disconnect failed:', err)
    }
  }, [getToken])

  // ── Derived Data ────────────────────────────────────────────────

  const sortedLeagues = [...leagues].sort(
    (a, b) => Number(b.season) - Number(a.season),
  )
  const activeLeagues = sortedLeagues.filter(
    (l) => !l.data?.is_finished,
  )
  const finishedLeagues = sortedLeagues.filter(
    (l) => l.data?.is_finished,
  )
  const filteredLeagues =
    filter === 'active' ? activeLeagues : finishedLeagues
  const visibleLeagues = filteredLeagues.slice(0, leagueVisibleCount)
  const hasMore = leagueVisibleCount < filteredLeagues.length
  const remaining = filteredLeagues.length - leagueVisibleCount

  const handleFilterChange = (newFilter: 'active' | 'finished') => {
    setFilter(newFilter)
    setLeagueVisibleCount(LEAGUES_PER_PAGE)
  }

  // ── Picking helpers ─────────────────────────────────────────────

  const alreadyImported = new Set(leagues.map((l) => l.league_key))
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

  // ── Stats for InfoCards ─────────────────────────────────────────

  const totalLeagues = leagues.length
  const totalActiveMatchups = activeLeagues.reduce(
    (n, l) => n + (l.matchups?.length ?? 0),
    0,
  )

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <ChannelHeader
        channel={channel}
        icon={<Ghost size={16} className="text-base-content/80" />}
        title="Fantasy"
        subtitle="Yahoo Fantasy Sports"
        connected={connected}
        subscriptionTier={subscriptionTier}
        hex={hex}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* ── InfoCards ───────────────────────────────────────────── */}
      {phase === 'connected' && leagues.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <InfoCard
            label="Leagues"
            value={String(totalLeagues)}
            hex={hex}
          />
          <InfoCard
            label="Active Matchups"
            value={String(totalActiveMatchups)}
            hex={hex}
          />
          <InfoCard
            label="Delivery"
            value={isUnlimited ? 'Real-time SSE' : isUplink ? 'Poll 30s' : 'Poll 60s'}
            hex={hex}
          />
        </div>
      )}

      {/* ── Upgrade CTA ────────────────────────────────────────── */}
      {phase === 'connected' && leagues.length > 0 && !isUnlimited && (
        <a
          href="/uplink"
          className="flex items-center gap-2 px-4 py-3 rounded-sm border transition-all group"
          style={{ background: `${hex}0D`, borderColor: `${hex}26` }}
        >
          <Zap
            size={14}
            className="text-base-content/40 group-hover:text-base-content/60 transition-colors"
          />
          <span className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest group-hover:text-base-content/70 transition-colors">
            {isUplink
              ? 'Upgrade to Unlimited for real-time fantasy delivery'
              : 'Upgrade to Uplink for faster fantasy delivery'}
          </span>
        </a>
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
              Connect your Yahoo account to see your fantasy leagues, matchup
              scores, standings, and rosters.
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
              Scanning your Yahoo Fantasy account for leagues across all
              sports. This usually takes a few seconds.
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
                setPhase(
                  leagues.length > 0 ? 'connected' : 'disconnected',
                )
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
      {phase === 'connected' && leagues.length > 0 && (
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
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                }}
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
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                }}
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
        leagues.length > 0 &&
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
        yahooConnected &&
        leagues.length === 0 && (
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
      {phase === 'connected' && yahooConnected && (
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
            <span className="text-xs uppercase tracking-wide">
              Add Leagues
            </span>
          </motion.button>
          <motion.button
            onClick={handleYahooDisconnect}
            whileHover={{ scale: 1.01 }}
            className="p-4 rounded-lg border border-dashed border-base-300/25 text-base-content/40 hover:text-error hover:border-error/30 transition-all flex items-center justify-center gap-2"
          >
            <Unlink size={16} />
            <span className="text-xs uppercase tracking-wide">
              Disconnect
            </span>
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
        selected
          ? { borderColor: `${hex}30`, background: `${hex}08` }
          : {}
      }
    >
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

      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold truncate">{league.name}</p>
        <p className="text-[10px] text-base-content/40">
          {sportLabel} &middot; {league.num_teams} Teams &middot;{' '}
          {league.season}
        </p>
      </div>

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
  league: LeagueData
  hex: string
}) {
  const [openSection, setOpenSection] = useState<
    'matchups' | 'standings' | 'roster' | null
  >(null)

  const isActive = !league.data?.is_finished
  const sportLabel =
    GAME_CODE_LABELS[league.game_code] || league.game_code || 'Fantasy'
  const sportEmoji = GAME_CODE_EMOJI[league.game_code] || ''
  const numTeams = league.data?.num_teams || 0
  const currentWeek = league.data?.current_week

  // Find user's matchup
  const userMatchup = league.matchups?.find((m) =>
    m.teams.some((t) => t.team_key === league.team_key),
  )

  // Find user's standing
  const standings = league.standings ?? []
  const userStanding = standings.find(
    (s) => s.team_key === league.team_key,
  )

  // Find user's roster
  const userRoster = league.rosters?.find(
    (r) => r.team_key === league.team_key,
  )
  const injuredPlayers =
    userRoster?.data?.players?.filter((p) => p.status) ?? []

  const toggleSection = (section: 'matchups' | 'standings' | 'roster') =>
    setOpenSection((prev) => (prev === section ? null : section))

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors relative ${
        isActive
          ? 'bg-base-200/50 border-base-300/25'
          : 'bg-base-200/20 border-base-300/20'
      }`}
    >
      {/* Accent top line */}
      {isActive && (
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${hex} 50%, transparent)`,
          }}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0 text-lg"
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
              {sportEmoji || (
                <span
                  className={`text-base font-bold ${isActive ? '' : 'text-base-content/30'}`}
                  style={isActive ? { color: hex } : undefined}
                >
                  Y!
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3
                className={`text-sm font-bold uppercase truncate ${isActive ? '' : 'text-base-content/50'}`}
              >
                {league.name}
              </h3>
              <p className="text-[10px] text-base-content/40 uppercase tracking-wide">
                {sportLabel} &middot; {numTeams} Teams
                {league.season ? ` \u00b7 ${league.season}` : ''}
                {currentWeek && isActive
                  ? ` \u00b7 Week ${currentWeek}`
                  : ''}
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
          </div>
        </div>

        {/* ── User's Matchup Score ──────────────────────────────── */}
        {userMatchup && (
          <MatchupScoreCard
            matchup={userMatchup}
            userTeamKey={league.team_key}
            hex={hex}
          />
        )}

        {/* ── Quick Stats Row ──────────────────────────────────── */}
        {league.team_key && (
          <div className="flex items-center gap-4 mt-3">
            {userStanding && (
              <span className="text-[10px] text-base-content/40">
                <span className="font-bold" style={{ color: hex }}>
                  #{userStanding.rank ?? '?'}
                </span>{' '}
                in standings &middot;{' '}
                <span className="font-mono">
                  {userStanding.wins}-{userStanding.losses}
                  {userStanding.ties > 0 ? `-${userStanding.ties}` : ''}
                </span>
                {userStanding.streak_value > 0 && (
                  <span className="ml-1">
                    ({userStanding.streak_type?.[0]?.toUpperCase()}
                    {userStanding.streak_value})
                  </span>
                )}
              </span>
            )}
            {injuredPlayers.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-warning">
                <AlertTriangle size={10} />
                {injuredPlayers.length} injured
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Section Toggles ────────────────────────────────────── */}
      <div className="px-5 pb-2">
        <div className="h-px bg-base-300/20 mb-2" />
        <div className="flex gap-1">
          {(league.matchups?.length ?? 0) > 0 && (
            <SectionToggle
              label="Matchups"
              isOpen={openSection === 'matchups'}
              onClick={() => toggleSection('matchups')}
              hex={hex}
            />
          )}
          {standings.length > 0 && (
            <SectionToggle
              label="Standings"
              isOpen={openSection === 'standings'}
              onClick={() => toggleSection('standings')}
              hex={hex}
            />
          )}
          {(league.rosters?.length ?? 0) > 0 && (
            <SectionToggle
              label="Rosters"
              isOpen={openSection === 'roster'}
              onClick={() => toggleSection('roster')}
              hex={hex}
            />
          )}
        </div>
      </div>

      {/* ── Expandable Sections ────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {openSection === 'matchups' && league.matchups && (
          <ExpandableSection key="matchups">
            <MatchupsSection
              matchups={league.matchups}
              userTeamKey={league.team_key}
              hex={hex}
            />
          </ExpandableSection>
        )}

        {openSection === 'standings' && standings.length > 0 && (
          <ExpandableSection key="standings">
            <StandingsSection
              standings={standings}
              userTeamKey={league.team_key}
              hex={hex}
            />
          </ExpandableSection>
        )}

        {openSection === 'roster' && league.rosters && (
          <ExpandableSection key="roster">
            <RosterSection
              rosters={league.rosters}
              userTeamKey={league.team_key}
              hex={hex}
            />
          </ExpandableSection>
        )}
      </AnimatePresence>

      {/* No data fallback */}
      {!userMatchup &&
        standings.length === 0 &&
        (league.rosters?.length ?? 0) === 0 && (
          <div className="px-5 pb-4">
            <div className="h-px bg-base-300/20 mb-3" />
            <p className="text-[10px] text-base-content/25 uppercase text-center">
              Data not yet available &mdash; syncing soon
            </p>
          </div>
        )}
    </div>
  )
}

// ── Section Toggle Button ───────────────────────────────────────────

function SectionToggle({
  label,
  isOpen,
  onClick,
  hex,
}: {
  label: string
  isOpen: boolean
  onClick: () => void
  hex: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest transition-all ${
        isOpen
          ? ''
          : 'text-base-content/30 hover:text-base-content/50'
      }`}
      style={
        isOpen
          ? {
              color: hex,
              background: `${hex}10`,
              borderColor: `${hex}20`,
            }
          : undefined
      }
    >
      {label}
      <motion.div
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        <ChevronDown size={10} />
      </motion.div>
    </button>
  )
}

// ── Expandable Wrapper ──────────────────────────────────────────────

function ExpandableSection({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="overflow-hidden"
    >
      <div className="px-5 pb-5">{children}</div>
    </motion.div>
  )
}

// ── Matchup Score Card (hero display for user's matchup) ────────────

function MatchupScoreCard({
  matchup,
  userTeamKey,
  hex,
}: {
  matchup: Matchup
  userTeamKey: string | null
  hex: string
}) {
  const userTeam = matchup.teams.find((t) => t.team_key === userTeamKey)
  const opponentTeam = matchup.teams.find(
    (t) => t.team_key !== userTeamKey,
  )

  if (!userTeam || !opponentTeam) return null

  const userPoints = userTeam.points ?? 0
  const opponentPoints = opponentTeam.points ?? 0
  const isWinning = userPoints > opponentPoints
  const isLosing = userPoints < opponentPoints
  const isLive = matchup.status === 'midevent'
  const isDone = matchup.status === 'postevent'

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        background: `${hex}08`,
        borderColor: `${hex}15`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-base-content/30">
          {isLive
            ? 'Live Matchup'
            : isDone
              ? `Week ${matchup.week} Final`
              : `Week ${matchup.week}`}
        </span>
        {isLive && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-error/10 border border-error/20">
            <span className="h-1 w-1 rounded-full bg-error animate-pulse" />
            <span className="text-[8px] font-bold uppercase text-error">
              Live
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* User team */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {userTeam.team_logo && (
            <img
              src={userTeam.team_logo}
              alt=""
              className="h-8 w-8 rounded object-cover shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{userTeam.name}</p>
            <p className="text-[9px] text-base-content/30 truncate">
              {userTeam.manager_name}
            </p>
          </div>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`text-lg font-bold font-mono tabular-nums ${
              isWinning ? '' : isLosing ? 'text-base-content/40' : ''
            }`}
            style={isWinning ? { color: hex } : undefined}
          >
            {userPoints.toFixed(1)}
          </span>
          <span className="text-[10px] text-base-content/20 font-bold">
            -
          </span>
          <span
            className={`text-lg font-bold font-mono tabular-nums ${
              isLosing ? '' : isWinning ? 'text-base-content/40' : ''
            }`}
            style={isLosing ? { color: '#ef4444' } : undefined}
          >
            {opponentPoints.toFixed(1)}
          </span>
        </div>

        {/* Opponent team */}
        <div className="flex items-center gap-3 min-w-0 flex-1 justify-end text-right">
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{opponentTeam.name}</p>
            <p className="text-[9px] text-base-content/30 truncate">
              {opponentTeam.manager_name}
            </p>
          </div>
          {opponentTeam.team_logo && (
            <img
              src={opponentTeam.team_logo}
              alt=""
              className="h-8 w-8 rounded object-cover shrink-0"
            />
          )}
        </div>
      </div>

      {/* Projected points */}
      {(userTeam.projected_points || opponentTeam.projected_points) &&
        !isDone && (
          <div className="flex justify-between mt-2 text-[9px] text-base-content/25 font-mono">
            <span>
              Proj: {userTeam.projected_points?.toFixed(1) ?? '---'}
            </span>
            <span>
              Proj: {opponentTeam.projected_points?.toFixed(1) ?? '---'}
            </span>
          </div>
        )}
    </div>
  )
}

// ── Matchups Section ────────────────────────────────────────────────

function MatchupsSection({
  matchups,
  userTeamKey,
  hex,
}: {
  matchups: Matchup[]
  userTeamKey: string | null
  hex: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest mb-2">
        All Matchups &middot; Week {matchups[0]?.week}
      </p>
      {matchups.map((matchup, i) => {
        const isUserMatchup = matchup.teams.some(
          (t) => t.team_key === userTeamKey,
        )
        const teamA = matchup.teams[0]
        const teamB = matchup.teams[1]

        if (!teamA || !teamB) return null

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: i * 0.03,
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
            className={`flex items-center justify-between p-2.5 rounded border ${
              isUserMatchup
                ? 'bg-base-100/80'
                : 'bg-base-100/40 border-base-300/20'
            }`}
            style={
              isUserMatchup
                ? {
                    borderColor: `${hex}25`,
                    background: `${hex}06`,
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {teamA.team_logo && (
                <img
                  src={teamA.team_logo}
                  alt=""
                  className="h-4 w-4 rounded object-cover shrink-0"
                />
              )}
              <span
                className={`text-[10px] font-bold truncate ${
                  isUserMatchup && teamA.team_key === userTeamKey
                    ? ''
                    : 'text-base-content/70'
                }`}
                style={
                  isUserMatchup && teamA.team_key === userTeamKey
                    ? { color: hex }
                    : undefined
                }
              >
                {teamA.name}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 mx-2">
              <span className="text-[10px] font-mono font-bold tabular-nums">
                {teamA.points?.toFixed(1) ?? '--'}
              </span>
              <span className="text-[9px] text-base-content/20">vs</span>
              <span className="text-[10px] font-mono font-bold tabular-nums">
                {teamB.points?.toFixed(1) ?? '--'}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <span
                className={`text-[10px] font-bold truncate ${
                  isUserMatchup && teamB.team_key === userTeamKey
                    ? ''
                    : 'text-base-content/70'
                }`}
                style={
                  isUserMatchup && teamB.team_key === userTeamKey
                    ? { color: hex }
                    : undefined
                }
              >
                {teamB.name}
              </span>
              {teamB.team_logo && (
                <img
                  src={teamB.team_logo}
                  alt=""
                  className="h-4 w-4 rounded object-cover shrink-0"
                />
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Standings Section ───────────────────────────────────────────────

function StandingsSection({
  standings,
  userTeamKey,
  hex,
}: {
  standings: StandingsEntry[]
  userTeamKey: string | null
  hex: string
}) {
  const sorted = [...standings].sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99),
  )

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest mb-2">
        Standings
      </p>
      {sorted.map((team, i) => {
        const isUser = team.team_key === userTeamKey
        return (
          <motion.div
            key={team.team_key}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: i * 0.03,
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
            className={`flex items-center justify-between p-2.5 rounded border ${
              isUser
                ? 'bg-base-100/80'
                : 'bg-base-100/40 border-base-300/20'
            }`}
            style={
              isUser
                ? {
                    borderColor: `${hex}25`,
                    background: `${hex}06`,
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-3">
              <span
                className="text-[10px] font-mono w-4 text-right"
                style={isUser ? { color: hex } : undefined}
              >
                {team.rank ?? i + 1}
              </span>
              {team.team_logo && (
                <img
                  src={team.team_logo}
                  alt=""
                  className="h-5 w-5 rounded object-cover"
                />
              )}
              <div className="min-w-0">
                <span
                  className={`text-xs font-bold truncate block max-w-[140px] ${isUser ? '' : ''}`}
                  style={isUser ? { color: hex } : undefined}
                >
                  {team.name}
                </span>
                {team.manager_name && (
                  <span className="text-[9px] text-base-content/25 block truncate max-w-[120px]">
                    {team.manager_name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {team.clinched_playoffs && (
                <Shield size={10} className="text-success" />
              )}
              <span className="text-[10px] font-mono text-base-content/40 tabular-nums">
                {team.wins}-{team.losses}
                {team.ties > 0 ? `-${team.ties}` : ''}
              </span>
              <span className="text-[10px] font-mono text-base-content/25 tabular-nums w-16 text-right">
                {team.points_for} PF
              </span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Roster Section ──────────────────────────────────────────────────

function RosterSection({
  rosters,
  userTeamKey,
}: {
  rosters: RosterEntry[]
  userTeamKey: string | null
  hex: string
}) {
  const [selectedTeam, setSelectedTeam] = useState<string>(
    userTeamKey ?? rosters[0]?.team_key ?? '',
  )

  const currentRoster = rosters.find((r) => r.team_key === selectedTeam)
  const players = currentRoster?.data?.players ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
          Roster
        </p>
        {rosters.length > 1 && (
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="text-[10px] bg-base-200/50 border border-base-300/25 rounded px-2 py-1 text-base-content/60 focus:outline-none"
          >
            {rosters.map((r) => (
              <option key={r.team_key} value={r.team_key}>
                {r.data?.team_name || r.team_key}
                {r.team_key === userTeamKey ? ' (You)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-1">
        {players.map((player) => {
          const hasInjury = !!player.status
          const injuryColor = INJURY_COLORS[player.status ?? ''] ?? '#a3a3a3'

          return (
            <div
              key={player.player_key}
              className="flex items-center justify-between py-1.5 px-2 rounded"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[9px] font-mono text-base-content/25 w-6 text-center shrink-0">
                  {player.selected_position}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold truncate max-w-[120px]">
                      {player.name.full || player.name.last}
                    </span>
                    {hasInjury && (
                      <span
                        className="text-[8px] font-bold px-1 rounded"
                        style={{
                          color: injuryColor,
                          background: `${injuryColor}15`,
                        }}
                      >
                        {player.status}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-base-content/25">
                    {player.editorial_team_abbr}
                    {player.display_position
                      ? ` - ${player.display_position}`
                      : ''}
                    {hasInjury && player.injury_note
                      ? ` \u00b7 ${player.injury_note}`
                      : ''}
                  </span>
                </div>
              </div>
              {player.player_points !== null &&
                player.player_points !== undefined && (
                  <span className="text-[10px] font-mono font-bold tabular-nums text-base-content/50 shrink-0">
                    {player.player_points.toFixed(1)}
                  </span>
                )}
            </div>
          )
        })}

        {players.length === 0 && (
          <p className="text-[10px] text-base-content/25 uppercase text-center py-3">
            No roster data available
          </p>
        )}
      </div>
    </div>
  )
}

// ── Channel Export ───────────────────────────────────────────────────

export const fantasyChannel: ChannelManifest = {
  id: 'fantasy',
  name: 'Fantasy',
  tabLabel: 'Fantasy',
  description: 'Yahoo Fantasy Sports',
  hex: HEX,
  icon: Ghost,
  DashboardTab: FantasyDashboardTab,
}
