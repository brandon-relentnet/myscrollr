import { createFileRoute } from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ChevronDown,
  Cpu,
  Ghost,
  Link2,
  Unlink,
  Plus,
  Settings,
  Settings2,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRealtime } from '../hooks/useRealtime'
import type { Game, Trade, YahooState } from '../hooks/useRealtime'
import type { IdTokenClaims } from '@logto/react'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

const pageVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 } as const,
  },
}

function DashboardPage() {
  const { isAuthenticated, isLoading, signIn, getIdTokenClaims, getAccessToken } = useLogto()
  const { latestTrades, latestGames, yahoo, status, setInitialYahoo, clearYahoo } = useRealtime()
  const [activeModule, setActiveModule] = useState<
    'finance' | 'sports' | 'rss' | 'fantasy'
  >('finance')
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()
  const [yahooStatus, setYahooStatus] = useState<{ connected: boolean; synced: boolean }>({ connected: false, synced: false })
  const getAccessTokenRef = useRef(getAccessToken)
  getAccessTokenRef.current = getAccessToken

  const apiUrl = import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'
  const [yahooPending, setYahooPending] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Returns true if leagues were found
  const fetchYahooData = async (): Promise<boolean> => {
    try {
      const token = await getAccessTokenRef.current(apiUrl)
      const [statusRes, leaguesRes] = await Promise.all([
        fetch(`${apiUrl}/users/me/yahoo-status`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/users/me/yahoo-leagues`, { headers: { Authorization: `Bearer ${token}` } }),
      ])

      if (statusRes.ok) {
        const data = await statusRes.json()
        setYahooStatus(data)
      }

      if (leaguesRes.ok) {
        const data = await leaguesRes.json()
        const leagues: Record<string, any> = {}
        const standings: Record<string, any> = {}
        for (const league of data.leagues || []) {
          leagues[league.league_key] = league
        }
        for (const [key, val] of Object.entries(data.standings || {})) {
          standings[key] = { league_key: key, data: val }
        }
        setInitialYahoo({ leagues, standings, matchups: {} })

        if (Object.keys(leagues).length > 0) {
          setYahooPending(false)
          return true
        }
      }
    } catch {
      // Silently fail
    }
    return false
  }

  // Start polling every 5s until leagues appear, then stop
  const startSyncPolling = async () => {
    setYahooPending(true)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null

    // Immediate first check — wait for result before starting interval
    const found = await fetchYahooData()
    if (found) {
      setYahooPending(false)
      return
    }

    // Then poll every 5s, stop after 3 min or when data arrives
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
  }

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then(setUserClaims)
      fetchYahooData()
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for both postMessage (ideal) and popup close via focus (fallback)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'yahoo-auth-complete') {
        startSyncPolling()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleYahooConnect = async () => {
    const sub = userClaims?.sub || (await getIdTokenClaims())?.sub
    if (!sub) return

    const popup = window.open(
      `${apiUrl}/yahoo/start?logto_sub=${sub}`,
      'yahoo-auth',
      'width=600,height=700',
    )

    // Fallback: detect when popup closes (in case postMessage is blocked by origin mismatch)
    if (popup) {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed)
          startSyncPolling()
        }
      }, 500)
    }
  }

  const handleYahooDisconnect = async () => {
    try {
      const token = await getAccessTokenRef.current(apiUrl)
      const res = await fetch(`${apiUrl}/users/me/yahoo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setYahooStatus({ connected: false, synced: false })
        clearYahoo()
      }
    } catch {
      // Silently fail
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="flex items-center gap-3"
        >
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-mono text-sm text-base-content/50 uppercase tracking-wider">
            Loading...
          </span>
        </motion.div>
      </div>
    )
  }

  if (!isAuthenticated) {
    const handleSignIn = () => {
      signIn(`${window.location.origin}/callback`)
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-mono">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md border border-base-300 p-10 rounded-lg bg-base-200/50 space-y-6 text-center"
        >
          <ShieldCheck size={40} className="mx-auto text-primary/30" />
          <h1 className="text-2xl font-bold tracking-[0.1em] uppercase">
            Sign In
          </h1>
          <p className="text-base-content/50 uppercase text-xs leading-relaxed">
            Connect your accounts to customize your ticker streams
          </p>
          <button onClick={handleSignIn} className="btn btn-primary px-10">
            Continue
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div
      className="min-h-screen pt-28 pb-20 px-6"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="max-w-6xl mx-auto">
        {/* Dashboard Header */}
        <motion.header
          className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6"
          variants={sectionVariants}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span
                className={`h-1.5 w-1.5 rounded-full ${status === 'connected' ? 'bg-primary' : 'bg-secondary'} animate-pulse`}
              />
              <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-[0.25em]">
                Dashboard
              </span>
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tight">
              Your <span className="text-primary">Streams</span>
            </h1>
            <p className="text-xs text-base-content/40 uppercase tracking-wide">
              {userClaims?.name || userClaims?.email} · Manage your ticker data
            </p>
          </div>

          <div className="flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn btn-primary btn-sm gap-2"
            >
              <Plus size={14} />
              Add Stream
            </motion.button>
            <button
              className="p-2.5 rounded border border-base-300 hover:border-primary/30 transition-all text-base-content/50 hover:text-primary"
              title="Settings"
            >
              <Settings2 size={16} />
            </button>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Module Navigation */}
          <motion.aside
            className="lg:col-span-3 space-y-6"
            variants={sectionVariants}
          >
            <div>
              <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest mb-3 px-1">
                Active Streams
              </p>
              <nav className="flex flex-col gap-1">
                <ModuleNavButton
                  active={activeModule === 'finance'}
                  onClick={() => setActiveModule('finance')}
                  icon={<TrendingUp size={14} />}
                  label="Finance"
                  live={true}
                />
                <ModuleNavButton
                  active={activeModule === 'sports'}
                  onClick={() => setActiveModule('sports')}
                  icon={<Cpu size={14} />}
                  label="Sports"
                  live={true}
                />
                <ModuleNavButton
                  active={activeModule === 'fantasy'}
                  onClick={() => setActiveModule('fantasy')}
                  icon={<Ghost size={14} />}
                  label="Fantasy"
                  live={false}
                />
                <ModuleNavButton
                  active={activeModule === 'rss'}
                  onClick={() => setActiveModule('rss')}
                  icon={<Activity size={14} />}
                  label="RSS Feeds"
                  live={false}
                />
              </nav>
            </div>

            {/* Quick Stats */}
            <div className="bg-base-200/40 border border-base-300/50 rounded-lg p-4 space-y-4">
              <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
                Overview
              </p>
              <div className="space-y-3">
                <QuickStat label="Active Streams" value="6" />
                <QuickStat label="Data Points/min" value="~240" />
                <QuickStat label="Uptime" value="99.7%" color="text-primary" />
              </div>
            </div>
          </motion.aside>

          {/* Main Content Area */}
          <motion.main
            className="lg:col-span-9 bg-base-200/20 border border-base-300/40 rounded-xl p-8 min-h-[500px]"
            variants={sectionVariants}
          >
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {activeModule === 'finance' && (
                <FinanceConfig
                  trades={latestTrades}
                  connected={status === 'connected'}
                />
              )}
              {activeModule === 'sports' && (
                <SportsConfig
                  games={latestGames}
                  connected={status === 'connected'}
                />
              )}
              {activeModule === 'fantasy' && (
                <FantasyConfig yahoo={yahoo} yahooStatus={yahooStatus} yahooPending={yahooPending} onYahooConnect={handleYahooConnect} onYahooDisconnect={handleYahooDisconnect} />
              )}
              {activeModule === 'rss' && <RssConfig />}
            </motion.div>
          </motion.main>
        </div>
      </div>
    </motion.div>
  )
}

function ModuleNavButton({ active, onClick, icon, label, live }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between p-3.5 rounded-lg transition-all text-left group ${
        active
          ? 'bg-primary/8 border border-primary/20 text-primary'
          : 'text-base-content/40 hover:bg-base-200/60 hover:text-base-content/70 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      {live && (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[9px] font-mono text-primary/60">LIVE</span>
        </span>
      )}
    </button>
  )
}

function QuickStat({ label, value, color = 'text-base-content/80' }: any) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-base-content/40 uppercase tracking-wide">
        {label}
      </span>
      <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
    </div>
  )
}

function FinanceConfig({
  trades,
  connected,
}: {
  trades: Array<Trade>
  connected: boolean
}) {
  const assets =
    trades.length > 0
      ? trades
      : [
          {
            symbol: 'BTC',
            price: '67,892.34',
            percentage_change: '+2.47%',
            direction: 'up',
          },
          {
            symbol: 'ETH',
            price: '3,421.18',
            percentage_change: '+1.23%',
            direction: 'up',
          },
          {
            symbol: 'NVDA',
            price: '892.44',
            percentage_change: '-0.84%',
            direction: 'down',
          },
          {
            symbol: 'AAPL',
            price: '178.32',
            percentage_change: '+0.31%',
            direction: 'up',
          },
          {
            symbol: 'TSLA',
            price: '175.21',
            percentage_change: '-1.52%',
            direction: 'down',
          },
          {
            symbol: 'GOOGL',
            price: '141.80',
            percentage_change: '+0.67%',
            direction: 'up',
          },
        ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
            <TrendingUp size={20} className="text-primary" />
            Market Data
          </h2>
          <p className="text-xs text-base-content/40 mt-1 uppercase tracking-wide">
            Real-time prices via Finnhub WebSocket
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${connected ? 'bg-primary/10 border-primary/20' : 'bg-base-300/30 border-base-300'} border`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-primary' : 'bg-base-content/30'} animate-pulse`}
            />
            <span
              className={`text-[9px] font-mono ${connected ? 'text-primary' : 'text-base-content/50'} uppercase`}
            >
              {connected ? 'Connected' : 'Connecting...'}
            </span>
          </span>
        </div>
      </div>

      {/* Asset Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {assets.map((asset) => (
          <motion.div
            key={asset.symbol}
            whileHover={{ scale: 1.02 }}
            className="bg-base-200/50 border border-base-300/50 rounded-lg p-4 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold font-mono">
                {asset.symbol.replace('BINANCE:', '')}
              </span>
              {asset.direction === 'up' ? (
                <TrendingUp size={14} className="text-primary" />
              ) : (
                <TrendingDown size={14} className="text-secondary" />
              )}
            </div>
            <div className="text-lg font-bold font-mono">
              {typeof asset.price === 'number'
                ? asset.price.toFixed(2)
                : asset.price}
            </div>
            <div
              className={`text-xs font-mono ${asset.direction === 'up' ? 'text-primary' : 'text-secondary'}`}
            >
              {typeof asset.percentage_change === 'number'
                ? (asset.percentage_change > 0 ? '+' : '') +
                  asset.percentage_change.toFixed(2) +
                  '%'
                : asset.percentage_change}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Asset Card */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        className="w-full p-4 rounded-lg border border-dashed border-base-300/50 text-base-content/30 hover:text-base-content/50 hover:border-primary/30 transition-all flex items-center justify-center gap-2"
      >
        <Plus size={16} />
        <span className="text-xs uppercase tracking-wide">Add Asset</span>
      </motion.button>
    </div>
  )
}

function SportsConfig({
  games,
  connected,
}: {
  games: Array<Game>
  connected: boolean
}) {
  const demoGames = [
    {
      league: 'NBA',
      home_team_name: 'LAL',
      away_team_name: 'GSW',
      short_detail: 'Q4 2:34',
      home_team_score: '112',
      away_team_score: '108',
      state: 'in_progress',
    },
    {
      league: 'NBA',
      home_team_name: 'BOS',
      away_team_name: 'NYK',
      short_detail: 'Q3 7:12',
      home_team_score: '89',
      away_team_score: '87',
      state: 'in_progress',
    },
    {
      league: 'NFL',
      home_team_name: 'KC',
      away_team_name: 'BUF',
      short_detail: 'Q2 8:45',
      home_team_score: '14',
      away_team_score: '10',
      state: 'in_progress',
    },
  ]

  const displayGames = games.length > 0 ? games : demoGames

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
            <Cpu size={20} className="text-primary" />
            Live Scores
          </h2>
          <p className="text-xs text-base-content/40 mt-1 uppercase tracking-wide">
            ESPN polling interval: 30s
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 px-2 py-1 rounded ${connected ? 'bg-primary/10 border-primary/20' : 'bg-base-300/30 border-base-300'} border`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-primary' : 'bg-base-content/30'} animate-pulse`}
          />
          <span
            className={`text-[9px] font-mono ${connected ? 'text-primary' : 'text-base-content/50'} uppercase`}
          >
            {connected ? 'Connected' : 'Connecting...'}
          </span>
        </span>
      </div>

      <div className="space-y-3">
        {displayGames.map((game, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-base-200/50 border border-base-300/50 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-primary/60 uppercase">
                {game.league}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-1 w-1 rounded-full ${game.state?.includes('progress') ? 'bg-primary' : 'bg-base-content/30'} animate-pulse`}
                />
                <span className="text-[9px] font-mono text-primary uppercase">
                  {game.state?.replace('in_', '') || 'Live'}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold">{game.home_team_name}</span>
                <span className="text-xs text-base-content/40">vs</span>
                <span className="text-sm font-bold">{game.away_team_name}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold font-mono">
                  {game.home_team_score}-{game.away_team_score}
                </div>
                <div className="text-[10px] font-mono text-primary/60">
                  {game.short_detail}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

const GAME_CODE_LABELS: Record<string, string> = {
  nfl: 'Football',
  nba: 'Basketball',
  nhl: 'Hockey',
  mlb: 'Baseball',
}

const LEAGUES_PER_PAGE = 5

function FantasyConfig({
  yahoo,
  yahooStatus,
  yahooPending,
  onYahooConnect,
  onYahooDisconnect,
}: {
  yahoo: YahooState
  yahooStatus: { connected: boolean; synced: boolean }
  yahooPending?: boolean
  onYahooConnect?: () => void
  onYahooDisconnect?: () => void
}) {
  const [filter, setFilter] = useState<'active' | 'finished'>('active')
  const [visibleCount, setVisibleCount] = useState(LEAGUES_PER_PAGE)

  // Build league list from DB records, merging standings data
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
  const visibleLeagues = filteredLeagues.slice(0, visibleCount)
  const hasMore = visibleCount < filteredLeagues.length
  const remaining = filteredLeagues.length - visibleCount

  // Reset visible count when filter changes
  const handleFilterChange = (newFilter: 'active' | 'finished') => {
    setFilter(newFilter)
    setVisibleCount(LEAGUES_PER_PAGE)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
            <Ghost size={20} className="text-primary" />
            Fantasy Leagues
          </h2>
          <p className="text-xs text-base-content/40 mt-1 uppercase tracking-wide">
            Yahoo Fantasy integration
          </p>
        </div>
        {yahooStatus.connected && (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20">
            <span className={`h-1.5 w-1.5 rounded-full ${yahooStatus.synced ? 'bg-primary' : 'bg-warning'} animate-pulse`} />
            <span className="text-[9px] font-mono text-primary uppercase">
              {activeLeagues.length > 0
                ? `${activeLeagues.length} Active`
                : yahooStatus.synced ? 'Connected' : 'Syncing...'}
            </span>
            {finishedLeagues.length > 0 && (
              <span className="text-[9px] font-mono text-base-content/30 uppercase ml-1">
                / {finishedLeagues.length} Past
              </span>
            )}
          </span>
        )}
      </div>

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
            onClick={onYahooConnect}
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
      {(yahooPending || (yahooStatus.connected && allLeagues.length === 0)) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12 space-y-5"
        >
          {/* Animated loader — fixed height container prevents layout shift */}
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
            <p className="text-xs text-base-content/30 max-w-xs mx-auto">
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
                <span className="font-mono text-base-content/30">{finishedLeagues.length}</span>
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
          onClick={() => setVisibleCount((prev) => prev + LEAGUES_PER_PAGE)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full p-3.5 rounded-lg bg-base-200/40 border border-base-300/40 text-base-content/40 hover:text-base-content/60 hover:border-base-300/60 transition-all flex items-center justify-center gap-2 group"
        >
          <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
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
            onClick={onYahooConnect}
            whileHover={{ scale: 1.01 }}
            className="flex-1 p-4 rounded-lg border border-dashed border-base-300/50 text-base-content/40 hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center gap-2"
          >
            <Link2 size={16} />
            <span className="text-xs uppercase tracking-wide">
              Reconnect Yahoo
            </span>
          </motion.button>
          <motion.button
            onClick={onYahooDisconnect}
            whileHover={{ scale: 1.01 }}
            className="p-4 rounded-lg border border-dashed border-base-300/50 text-base-content/40 hover:text-error hover:border-error/30 transition-all flex items-center justify-center gap-2"
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
  // Standings data is an array of team objects from the Rust ingestion
  const teams = Array.isArray(league.standings) ? league.standings : (league.standings?.teams?.team || [])
  const isActive = !league.is_finished

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${isActive ? 'bg-base-200/50 border-base-300/50' : 'bg-base-200/20 border-base-300/30'}`}
    >
      {/* League Header — clickable to toggle standings */}
      <button
        onClick={() => teams.length > 0 && setStandingsOpen((prev) => !prev)}
        className={`w-full p-5 flex items-center justify-between text-left ${teams.length > 0 ? 'cursor-pointer hover:bg-base-200/30' : 'cursor-default'} transition-colors`}
      >
        <div className="flex items-center gap-4">
          <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-secondary/10 border border-secondary/20' : 'bg-base-300/20 border border-base-300/30'}`}>
            <span className={`text-base font-bold ${isActive ? 'text-secondary' : 'text-base-content/30'}`}>Y!</span>
          </div>
          <div className="min-w-0">
            <h3 className={`text-sm font-bold uppercase truncate ${isActive ? '' : 'text-base-content/50'}`}>{league.name}</h3>
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
              <span className="text-[9px] font-bold uppercase text-success">Active</span>
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

      {/* No standings yet — shown inline, not collapsible */}
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

function RssConfig() {
  const feeds = [
    { name: 'Hacker News', url: 'news.ycombinator.com', unread: 12 },
    { name: 'TechCrunch', url: 'techcrunch.com', unread: 5 },
    { name: 'The Verge', url: 'theverge.com', unread: 8 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
          <Activity size={20} className="text-primary" />
          RSS Feeds
        </h2>
        <p className="text-xs text-base-content/40 mt-1 uppercase tracking-wide">
          Custom news streams
        </p>
      </div>

      <div className="space-y-3">
        {feeds.map((feed, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center justify-between p-4 bg-base-200/50 border border-base-300/50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold font-mono text-primary">
                  RSS
                </span>
              </div>
              <div>
                <div className="text-sm font-bold">{feed.name}</div>
                <div className="text-[10px] text-base-content/40 font-mono">
                  {feed.url}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                <span className="text-xs font-mono text-primary">
                  {feed.unread}
                </span>
              </span>
              <button className="p-1.5 rounded hover:bg-base-200 transition-colors text-base-content/30 hover:text-base-content/50">
                <Settings size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.button
        whileHover={{ scale: 1.01 }}
        className="w-full p-4 rounded-lg border border-dashed border-base-300/50 text-base-content/40 hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center gap-2"
      >
        <Plus size={16} />
        <span className="text-xs uppercase tracking-wide">Add Feed</span>
      </motion.button>
    </div>
  )
}
