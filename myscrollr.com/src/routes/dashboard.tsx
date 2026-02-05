import { createFileRoute } from '@tanstack/react-router'
import {  useLogto } from '@logto/react'
import { useEffect, useState } from 'react'
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
import * as motion from 'motion/react-client'
import type {IdTokenClaims} from '@logto/react';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { isAuthenticated, isLoading, signIn, getIdTokenClaims } = useLogto()
  const [activeModule, setActiveModule] = useState<'finance' | 'sports' | 'rss' | 'fantasy'>('finance')
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then(setUserClaims)
    }
  }, [isAuthenticated, getIdTokenClaims])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div 
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="flex items-center gap-3"
        >
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-mono text-sm text-base-content/50 uppercase tracking-wider">Loading...</span>
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
          <h1 className="text-2xl font-bold tracking-[0.1em] uppercase">Sign In</h1>
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
    <div className="min-h-screen pt-28 pb-20 px-6">
      <div className="max-w-6xl mx-auto">
        
        {/* Dashboard Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
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
            <button className="p-2.5 rounded border border-base-300 hover:border-primary/30 transition-all text-base-content/50 hover:text-primary" title="Settings">
              <Settings2 size={16} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Module Navigation */}
          <aside className="lg:col-span-3 space-y-6">
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
          </aside>

          {/* Main Content Area */}
          <main className="lg:col-span-9 bg-base-200/20 border border-base-300/40 rounded-xl p-8 min-h-[500px]">
            {activeModule === 'finance' && <FinanceConfig />}
            {activeModule === 'sports' && <SportsConfig />}
            {activeModule === 'fantasy' && <FantasyConfig />}
            {activeModule === 'rss' && <RssConfig />}
          </main>
        </div>
      </div>
    </div>
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
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
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
      <span className="text-xs text-base-content/40 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
    </div>
  )
}

function FinanceConfig() {
  const assets = [
    { symbol: 'BTC', price: '67,892.34', change: '+2.47%', up: true },
    { symbol: 'ETH', price: '3,421.18', change: '+1.23%', up: true },
    { symbol: 'NVDA', price: '892.44', change: '-0.84%', up: false },
    { symbol: 'AAPL', price: '178.32', change: '+0.31%', up: true },
    { symbol: 'TSLA', price: '175.21', change: '-1.52%', up: false },
    { symbol: 'GOOGL', price: '141.80', change: '+0.67%', up: true },
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
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[9px] font-mono text-primary uppercase">Connected</span>
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
              <span className="text-sm font-bold font-mono">{asset.symbol}</span>
              {asset.up ? (
                <TrendingUp size={14} className="text-primary" />
              ) : (
                <TrendingDown size={14} className="text-secondary" />
              )}
            </div>
            <div className="text-lg font-bold font-mono">{asset.price}</div>
            <div className={`text-xs font-mono ${asset.up ? 'text-primary' : 'text-secondary'}`}>
              {asset.change}
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

function SportsConfig() {
  const games = [
    { league: 'NBA', home: 'LAL', away: 'GSW', time: 'Q4 2:34', score: '112-108', status: 'Live' },
    { league: 'NBA', home: 'BOS', away: 'NYK', time: 'Q3 7:12', score: '89-87', status: 'Live' },
    { league: 'NFL', home: 'KC', away: 'BUF', time: 'Q2 8:45', score: '14-10', status: 'Live' },
  ]

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
        <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[9px] font-mono text-primary uppercase">Connected</span>
        </span>
      </div>

      <div className="space-y-3">
        {games.map((game, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-base-200/50 border border-base-300/50 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-primary/60 uppercase">{game.league}</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-primary animate-pulse" />
                <span className="text-[9px] font-mono text-primary uppercase">{game.status}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold">{game.home}</span>
                <span className="text-xs text-base-content/40">vs</span>
                <span className="text-sm font-bold">{game.away}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold font-mono">{game.score}</div>
                <div className="text-[10px] font-mono text-primary/60">{game.time}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function FantasyConfig() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
          <Ghost size={20} className="text-primary" />
          Fantasy Leagues
        </h2>
        <p className="text-xs text-base-content/40 mt-1 uppercase tracking-wide">
          Yahoo Fantasy integration
        </p>
      </div>

      {/* Demo League */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-base-200/50 border border-base-300/50 rounded-lg p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center">
              <span className="text-lg font-bold text-secondary">Y!</span>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase">Sleeper League 2024</h3>
              <p className="text-[10px] text-base-content/40 uppercase tracking-wide">Fantasy Basketball · 12 Teams</p>
            </div>
          </div>
          <span className="px-2 py-1 rounded bg-success/10 border border-success/20">
            <span className="text-[9px] font-bold text-success uppercase">Active</span>
          </span>
        </div>

        {/* Demo Team */}
        <div className="bg-base-100/50 rounded-lg p-4 border border-base-300/30">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase">My Team</span>
            <span className="text-[10px] font-mono text-base-content/40">Rank 3rd · 8-4-0</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[
              { pos: 'PG', name: 'L. Dončić', pts: '28.5' },
              { pos: 'SG', name: 'S. Gilgeous', pts: '21.3' },
              { pos: 'SF', name: 'J. Tatum', pts: '26.8' },
              { pos: 'PF', name: 'B. Adebayo', pts: '19.5' },
              { pos: 'C', name: 'J. Embiid', pts: '32.1' },
            ].map((player, i) => (
              <div key={i} className="text-center p-2 rounded bg-base-200/50 border border-base-300/30">
                <div className="text-[9px] text-primary/60 font-mono">{player.pos}</div>
                <div className="text-xs font-bold truncate">{player.name}</div>
                <div className="text-[10px] font-mono text-base-content/50">{player.pts} PPG</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Connect Button */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        className="w-full p-4 rounded-lg border border-dashed border-base-300/50 text-base-content/40 hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center gap-2"
      >
        <Link2 size={16} />
        <span className="text-xs uppercase tracking-wide">Connect Yahoo Account</span>
      </motion.button>
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
                <span className="text-xs font-bold font-mono text-primary">RSS</span>
              </div>
              <div>
                <div className="text-sm font-bold">{feed.name}</div>
                <div className="text-[10px] text-base-content/40 font-mono">{feed.url}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                <span className="text-xs font-mono text-primary">{feed.unread}</span>
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