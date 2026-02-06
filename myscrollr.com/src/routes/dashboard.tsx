import { createFileRoute } from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  Cpu,
  Ghost,
  Link2,
  Plus,
  Settings,
  Settings2,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { motion } from 'motion/react'
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
  const { latestTrades, latestGames, yahoo, status, setInitialYahoo } = useRealtime()
  const [activeModule, setActiveModule] = useState<
    'finance' | 'sports' | 'rss' | 'fantasy'
  >('finance')
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()
  const [yahooStatus, setYahooStatus] = useState<{ connected: boolean; synced: boolean }>({ connected: false, synced: false })
  const getAccessTokenRef = useRef(getAccessToken)
  getAccessTokenRef.current = getAccessToken

  const apiUrl = import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'

  const fetchYahooData = async () => {
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
        // Seed the yahoo state from DB data
        const leagues: Record<string, any> = {}
        const standings: Record<string, any> = {}
        for (const league of data.leagues || []) {
          leagues[league.league_key] = league
        }
        for (const [key, val] of Object.entries(data.standings || {})) {
          standings[key] = { league_key: key, data: val }
        }
        setInitialYahoo({ leagues, standings, matchups: {} })
      }
    } catch {
      // Silently fail
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then(setUserClaims)
      fetchYahooData()
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'yahoo-auth-complete') {
        // Wait for Go API goroutine to write user to DB, then check status
        setTimeout(() => checkYahooStatus(), 2000)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleYahooConnect = async () => {
    if (!userClaims?.sub) {
      // If no sub, refresh claims
      const claims = await getIdTokenClaims()
      if (claims?.sub) {
        window.open(
          `${import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'}/yahoo/start?logto_sub=${claims.sub}`,
          'yahoo-auth',
          'width=600,height=700',
        )
      }
    } else {
      window.open(
        `${import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'}/yahoo/start?logto_sub=${userClaims.sub}`,
        'yahoo-auth',
        'width=600,height=700',
      )
    }
  };

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
                <FantasyConfig yahoo={yahoo} yahooStatus={yahooStatus} onYahooConnect={handleYahooConnect} />
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

function FantasyConfig({
  yahoo,
  yahooStatus,
  onYahooConnect,
}: {
  yahoo: YahooState
  yahooStatus: { connected: boolean; synced: boolean }
  onYahooConnect?: () => void
}) {
  // Build league list from DB records, merging standings data
  const allLeagues = Object.values(yahoo.leagues).map((league) => {
    const standings = yahoo.standings[league.league_key]
    return {
      league_key: league.league_key,
      name: league.name,
      game_code: league.game_code,
      season: league.season,
      num_teams: league.data?.num_teams || 0,
      standings: standings?.data,
    }
  })

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
              {allLeagues.length > 0
                ? `${allLeagues.length} League${allLeagues.length !== 1 ? 's' : ''}`
                : yahooStatus.synced ? 'Connected' : 'Syncing...'}
            </span>
          </span>
        )}
      </div>

      {/* Not Connected */}
      {!yahooStatus.connected && (
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

      {/* Connected but waiting for sync */}
      {yahooStatus.connected && allLeagues.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12 space-y-4"
        >
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Ghost size={48} className="mx-auto text-primary/40" />
          </motion.div>
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase text-primary/70">
              Yahoo Connected
            </p>
            <p className="text-xs text-base-content/30 max-w-xs mx-auto">
              {yahooStatus.synced
                ? 'Your account is synced. League data will appear here shortly.'
                : 'Syncing your fantasy data. This may take a couple of minutes.'}
            </p>
          </div>
        </motion.div>
      )}

      {/* League Cards */}
      {allLeagues.map((league) => (
        <LeagueCard key={league.league_key} league={league} />
      ))}

      {/* Connect More */}
      {allLeagues.length > 0 && (
        <motion.button
          onClick={onYahooConnect}
          whileHover={{ scale: 1.01 }}
          className="w-full p-4 rounded-lg border border-dashed border-base-300/50 text-base-content/40 hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center gap-2"
        >
          <Link2 size={16} />
          <span className="text-xs uppercase tracking-wide">
            Reconnect Yahoo Account
          </span>
        </motion.button>
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
    standings?: any
  }
}) {
  const sportLabel =
    GAME_CODE_LABELS[league.game_code || ''] || league.game_code || 'Fantasy'
  // Standings data is an array of team objects from the Rust ingestion
  const teams = Array.isArray(league.standings) ? league.standings : (league.standings?.teams?.team || [])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-base-200/50 border border-base-300/50 rounded-lg p-6"
    >
      {/* League Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center">
            <span className="text-lg font-bold text-secondary">Y!</span>
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase">{league.name}</h3>
            <p className="text-[10px] text-base-content/40 uppercase tracking-wide">
              {sportLabel} · {league.num_teams} Teams
              {league.season ? ` · ${league.season}` : ''}
            </p>
          </div>
        </div>
        <span className="px-2 py-1 rounded bg-success/10 border border-success/20">
          <span className="text-[9px] font-bold text-success uppercase">
            Active
          </span>
        </span>
      </div>

      {/* Standings */}
      {teams.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest mb-2">
            Standings
          </p>
          {teams.slice(0, 8).map((team: any, i: number) => {
            const record = team.team_standings?.outcome_totals
            const logo = team.team_logos?.team_logo?.[0]?.url
            return (
              <div
                key={team.team_key || i}
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
              </div>
            )
          })}
          {teams.length > 8 && (
            <p className="text-[10px] text-base-content/30 text-center pt-1">
              +{teams.length - 8} more teams
            </p>
          )}
        </div>
      )}

      {/* No standings yet */}
      {teams.length === 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-base-content/30 uppercase">
            Standings data not yet available
          </p>
        </div>
      )}
    </motion.div>
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
