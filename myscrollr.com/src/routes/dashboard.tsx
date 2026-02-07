import { createFileRoute } from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  Ghost,
  Link2,
  Plus,
  Rss,
  Settings2,
  Trash2,
  TrendingUp,
  Unlink,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRealtime } from '../hooks/useRealtime'
import type { YahooState } from '../hooks/useRealtime'
import type { IdTokenClaims } from '@logto/react'
import SettingsPanel from '../components/SettingsPanel'
import { streamsApi, rssApi } from '../api/client'
import type { Stream, StreamType, TrackedFeed } from '../api/client'

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

const STREAM_META: Record<
  StreamType,
  { label: string; icon: React.ReactNode; desc: string }
> = {
  finance: {
    label: 'Finance',
    icon: <TrendingUp size={14} />,
    desc: 'Real-time market data via Finnhub',
  },
  sports: {
    label: 'Sports',
    icon: <Cpu size={14} />,
    desc: 'Live scores via ESPN',
  },
  fantasy: {
    label: 'Fantasy',
    icon: <Ghost size={14} />,
    desc: 'Yahoo Fantasy integration',
  },
  rss: {
    label: 'RSS Feeds',
    icon: <Rss size={14} />,
    desc: 'Custom news streams',
  },
}

function DashboardPage() {
  const {
    isAuthenticated,
    isLoading,
    signIn,
    getIdTokenClaims,
    getAccessToken,
  } = useLogto()
  const {
    yahoo,
    status,
    preferences,
    setInitialYahoo,
    clearYahoo,
    setUserSub,
  } = useRealtime()
  const [activeModule, setActiveModule] = useState<StreamType>('finance')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()
  const [yahooStatus, setYahooStatus] = useState<{
    connected: boolean
    synced: boolean
  }>({ connected: false, synced: false })
  const getAccessTokenRef = useRef(getAccessToken)
  getAccessTokenRef.current = getAccessToken

  const apiUrl =
    import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'
  const [yahooPending, setYahooPending] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Streams state ────────────────────────────────────────────────
  const [streams, setStreams] = useState<Stream[]>([])
  const [streamsLoading, setStreamsLoading] = useState(true)
  const [addStreamOpen, setAddStreamOpen] = useState(false)

  // ── Prevent remount/re-animation on token refresh ──────────────
  const hasLoaded = useRef(false)
  const hasAnimated = useRef(false)
  const autoSignInTriggered = useRef(false)

  // Token cache to avoid calling getAccessToken() (which triggers
  // Logto's setIsLoading) on every settings change.
  const tokenCacheRef = useRef<{ token: string; expiry: number } | null>(null)

  const getToken = useCallback(
    async (): Promise<string | null> => {
      const cached = tokenCacheRef.current
      if (cached && cached.expiry - Date.now() > 60_000) {
        return cached.token
      }

      const token = await getAccessToken(apiUrl)
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]!))
          if (payload.exp) {
            tokenCacheRef.current = {
              token,
              expiry: payload.exp * 1000,
            }
          }
        } catch {
          // If decoding fails, don't cache
        }
      }

      return token ?? null
    },
    [getAccessToken, apiUrl],
  )

  // ── Fetch streams ────────────────────────────────────────────────
  const fetchStreams = useCallback(async () => {
    try {
      const data = await streamsApi.getAll(getToken)
      setStreams(data.streams || [])
    } catch {
      // Silently fail — keep existing state
    } finally {
      setStreamsLoading(false)
    }
  }, [getToken])

  const handleToggleStream = async (stream: Stream) => {
    const next = !stream.visible
    // Optimistic update — both enabled and visible stay in sync
    setStreams((prev) =>
      prev.map((s) =>
        s.stream_type === stream.stream_type
          ? { ...s, enabled: next, visible: next }
          : s,
      ),
    )
    try {
      await streamsApi.update(
        stream.stream_type,
        { enabled: next, visible: next },
        getToken,
      )
    } catch {
      // Revert
      setStreams((prev) =>
        prev.map((s) =>
          s.stream_type === stream.stream_type
            ? { ...s, enabled: stream.enabled, visible: stream.visible }
            : s,
        ),
      )
    }
  }

  const handleAddStream = async (streamType: StreamType) => {
    try {
      const newStream = await streamsApi.create(streamType, {}, getToken)
      setStreams((prev) => [...prev, newStream])
      setActiveModule(streamType)
      setAddStreamOpen(false)
    } catch {
      // Could show an error toast
    }
  }

  const handleDeleteStream = async (streamType: StreamType) => {
    const prev = streams
    setStreams((s) => s.filter((st) => st.stream_type !== streamType))
    try {
      await streamsApi.delete(streamType, getToken)
      // Switch to first remaining stream
      const remaining = prev.filter((s) => s.stream_type !== streamType)
      if (remaining.length > 0) {
        setActiveModule(remaining[0].stream_type)
      }
    } catch {
      setStreams(prev)
    }
  }

  // Returns true if leagues were found
  const fetchYahooData = async (): Promise<boolean> => {
    try {
      const token = await getAccessTokenRef.current(apiUrl)
      const [statusRes, leaguesRes] = await Promise.all([
        fetch(`${apiUrl}/users/me/yahoo-status`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/users/me/yahoo-leagues`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
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
  }

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then((claims) => {
        setUserClaims(claims)
        if (claims?.sub) setUserSub(claims.sub)
      })
      fetchYahooData()
      fetchStreams()
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for Yahoo auth popup completion
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

  // ── Loading / auth guards ────────────────────────────────────────
  if (isLoading && !hasLoaded.current) {
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

  if (!isAuthenticated && !hasLoaded.current) {
    if (!autoSignInTriggered.current) {
      autoSignInTriggered.current = true
      signIn(`${window.location.origin}/callback`)
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="flex items-center gap-3"
        >
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-mono text-sm text-base-content/50 uppercase tracking-wider">
            Authenticating...
          </span>
        </motion.div>
      </div>
    )
  }

  hasLoaded.current = true

  const shouldAnimate = !hasAnimated.current
  hasAnimated.current = true

  // ── Derived data ─────────────────────────────────────────────────
  const activeStream = streams.find((s) => s.stream_type === activeModule)
  const activeCount = streams.filter((s) => s.visible).length
  const existingTypes = new Set(streams.map((s) => s.stream_type))
  const availableTypes = (
    Object.keys(STREAM_META) as StreamType[]
  ).filter((t) => !existingTypes.has(t))

  return (
    <motion.div
      className="min-h-screen pt-28 pb-20 px-6"
      variants={pageVariants}
      initial={shouldAnimate ? 'hidden' : false}
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
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() =>
                  availableTypes.length > 0
                    ? setAddStreamOpen(!addStreamOpen)
                    : undefined
                }
                disabled={availableTypes.length === 0}
                className="btn btn-primary btn-sm gap-2 disabled:opacity-30"
              >
                <Plus size={14} />
                Add Stream
              </motion.button>

              {/* Add Stream Dropdown */}
              <AnimatePresence>
                {addStreamOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 30,
                    }}
                    className="absolute right-0 top-full mt-2 w-56 bg-base-100 border border-base-300/60 rounded-lg shadow-xl z-50 overflow-hidden"
                  >
                    <div className="p-2">
                      <p className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1.5">
                        Available Integrations
                      </p>
                      {availableTypes.map((type) => (
                        <button
                          key={type}
                          onClick={() => handleAddStream(type)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-primary/8 text-left transition-colors group"
                        >
                          <span className="text-base-content/40 group-hover:text-primary transition-colors">
                            {STREAM_META[type].icon}
                          </span>
                          <div>
                            <span className="text-xs font-bold uppercase tracking-wide block">
                              {STREAM_META[type].label}
                            </span>
                            <span className="text-[9px] text-base-content/30">
                              {STREAM_META[type].desc}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2.5 rounded border border-base-300 hover:border-primary/30 transition-all text-base-content/50 hover:text-primary"
              title="Settings"
            >
              <Settings2 size={16} />
            </button>
          </div>
        </motion.header>

        {/* Close dropdown on outside click */}
        {addStreamOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAddStreamOpen(false)}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar */}
          <motion.aside
            className="lg:col-span-3 space-y-6"
            variants={sectionVariants}
          >
            <div>
              <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest mb-3 px-1">
                Active Streams
              </p>
              <nav className="flex flex-col gap-1">
                {streamsLoading ? (
                  <div className="p-4 text-center">
                    <motion.span
                      animate={{ opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-[10px] font-mono text-base-content/30 uppercase"
                    >
                      Loading...
                    </motion.span>
                  </div>
                ) : (
                  streams.map((stream) => {
                    const meta = STREAM_META[stream.stream_type]
                    if (!meta) return null
                    return (
                      <StreamNavButton
                        key={stream.stream_type}
                        active={activeModule === stream.stream_type}
                        onClick={() => setActiveModule(stream.stream_type)}
                        icon={meta.icon}
                        label={meta.label}
                        visible={stream.visible}
                      />
                    )
                  })
                )}
              </nav>
            </div>

            {/* Quick Stats */}
            <div className="bg-base-200/40 border border-base-300/50 rounded-lg p-4 space-y-4">
              <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
                Overview
              </p>
              <div className="space-y-3">
                <QuickStat
                  label="Total Streams"
                  value={String(streams.length)}
                />
                <QuickStat
                  label="Active"
                  value={String(activeCount)}
                  color={
                    activeCount > 0 ? 'text-primary' : 'text-base-content/80'
                  }
                />
                <QuickStat
                  label="Connection"
                  value={status === 'connected' ? 'Live' : 'Offline'}
                  color={
                    status === 'connected'
                      ? 'text-primary'
                      : 'text-base-content/40'
                  }
                />
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
              {activeStream && activeModule === 'finance' && (
                <FinanceStreamConfig
                  stream={activeStream}
                  connected={status === 'connected'}
                  onToggle={() => handleToggleStream(activeStream)}
                  onDelete={() => handleDeleteStream('finance')}
                />
              )}
              {activeStream && activeModule === 'sports' && (
                <SportsStreamConfig
                  stream={activeStream}
                  connected={status === 'connected'}
                  onToggle={() => handleToggleStream(activeStream)}
                  onDelete={() => handleDeleteStream('sports')}
                />
              )}
              {activeStream && activeModule === 'fantasy' && (
                <FantasyStreamConfig
                  stream={activeStream}
                  yahoo={yahoo}
                  yahooStatus={yahooStatus}
                  yahooPending={yahooPending}
                  onYahooConnect={handleYahooConnect}
                  onYahooDisconnect={handleYahooDisconnect}
                  onToggle={() => handleToggleStream(activeStream)}
                  onDelete={() => handleDeleteStream('fantasy')}
                />
              )}
              {activeStream && activeModule === 'rss' && (
                <RssStreamConfig
                  stream={activeStream}
                  getToken={getToken}
                  onToggle={() => handleToggleStream(activeStream)}
                  onDelete={() => handleDeleteStream('rss')}
                  onStreamUpdate={(updated) =>
                    setStreams((prev) =>
                      prev.map((s) =>
                        s.stream_type === updated.stream_type ? updated : s,
                      ),
                    )
                  }
                />
              )}
              {!activeStream && !streamsLoading && (
                <div className="text-center py-20 space-y-4">
                  <Activity
                    size={48}
                    className="mx-auto text-base-content/15"
                  />
                  <p className="text-sm font-bold uppercase text-base-content/40">
                    No Streams Yet
                  </p>
                  <p className="text-xs text-base-content/25 max-w-xs mx-auto">
                    Add a stream to start receiving real-time data on your
                    ticker.
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setAddStreamOpen(true)}
                    className="btn btn-primary btn-sm gap-2 mt-2"
                  >
                    <Plus size={14} />
                    Add Stream
                  </motion.button>
                </div>
              )}
            </motion.div>
          </motion.main>
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        getToken={getToken}
        serverPreferences={preferences}
      />
    </motion.div>
  )
}

// ── Sidebar Navigation ─────────────────────────────────────────────

function StreamNavButton({
  active,
  onClick,
  icon,
  label,
  visible,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  visible: boolean
}) {
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
      {visible ? (
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-base-content/20" />
      )}
    </button>
  )
}

function QuickStat({
  label,
  value,
  color = 'text-base-content/80',
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-base-content/40 uppercase tracking-wide">
        {label}
      </span>
      <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
    </div>
  )
}

// ── Shared Stream Header ───────────────────────────────────────────

function StreamHeader({
  stream,
  icon,
  title,
  subtitle,
  connected,
  onToggle,
  onDelete,
}: {
  stream: Stream
  icon: React.ReactNode
  title: string
  subtitle: string
  connected?: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const active = stream.visible

  return (
    <div className="space-y-5 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
            {icon}
            {title}
          </h2>
          <p className="text-xs text-base-content/40 mt-1 uppercase tracking-wide">
            {subtitle}
          </p>
        </div>
        {connected !== undefined && (
          <span
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${connected ? 'bg-primary/10 border-primary/20' : 'bg-base-300/30 border-base-300'} border`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-primary' : 'bg-base-content/30'} animate-pulse`}
            />
            <span
              className={`text-[9px] font-mono ${connected ? 'text-primary' : 'text-base-content/50'} uppercase`}
            >
              {connected ? 'Connected' : 'Offline'}
            </span>
          </span>
        )}
      </div>

      {/* Toggle + Delete */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onToggle}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
            active
              ? 'bg-primary/8 border-primary/20 text-primary'
              : 'bg-base-200/40 border-base-300/40 text-base-content/40'
          }`}
        >
          {active ? <Eye size={12} /> : <EyeOff size={12} />}
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {active ? 'On Ticker' : 'Off'}
          </span>
          <ToggleSwitch active={active} />
        </button>

        <div className="ml-auto">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-base-content/40 uppercase">
                Remove?
              </span>
              <button
                onClick={() => {
                  onDelete()
                  setConfirmDelete(false)
                }}
                className="px-3 py-2 rounded-lg border border-error/30 text-error text-[10px] font-bold uppercase tracking-widest hover:bg-error/10 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="p-2 rounded-lg border border-base-300/40 text-base-content/30 hover:text-base-content/50 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2.5 rounded-lg border border-base-300/40 text-base-content/20 hover:text-error hover:border-error/30 transition-colors"
              title="Remove stream"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ToggleSwitch({ active }: { active: boolean }) {
  return (
    <span
      className={`block h-4 w-7 rounded-full relative transition-colors ml-1 ${
        active ? 'bg-primary' : 'bg-base-300'
      }`}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white"
        animate={{ x: active ? 12 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </span>
  )
}

// ── Finance Stream Config ──────────────────────────────────────────

function FinanceStreamConfig({
  stream,
  connected,
  onToggle,
  onDelete,
}: {
  stream: Stream
  connected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-6">
      <StreamHeader
        stream={stream}
        icon={<TrendingUp size={20} className="text-primary" />}
        title="Finance Stream"
        subtitle="Real-time market data via Finnhub WebSocket"
        connected={connected}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="Data Source" value="Finnhub" />
        <InfoCard label="Tracked Symbols" value="50" />
        <InfoCard label="Update Frequency" value="Real-time" />
      </div>

      <div className="bg-base-200/30 border border-base-300/30 rounded-lg p-5 space-y-3">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
          About This Stream
        </p>
        <p className="text-xs text-base-content/50 leading-relaxed">
          Tracks 45 stocks and 5 cryptocurrencies (via Binance) in real-time
          using Finnhub's WebSocket API. Price updates, percentage changes, and
          trend direction are delivered to your ticker as they happen.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {['AAPL', 'TSLA', 'NVDA', 'GOOGL', 'AMZN', 'BTC', 'ETH'].map(
            (sym) => (
              <span
                key={sym}
                className="px-2 py-1 rounded bg-base-300/30 border border-base-300/40 text-[10px] font-mono text-base-content/40"
              >
                {sym}
              </span>
            ),
          )}
          <span className="px-2 py-1 text-[10px] font-mono text-base-content/25">
            +43 more
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Sports Stream Config ───────────────────────────────────────────

function SportsStreamConfig({
  stream,
  connected,
  onToggle,
  onDelete,
}: {
  stream: Stream
  connected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const leagues = ['NFL', 'NBA', 'NHL', 'MLB']

  return (
    <div className="space-y-6">
      <StreamHeader
        stream={stream}
        icon={<Cpu size={20} className="text-primary" />}
        title="Sports Stream"
        subtitle="Live scores via ESPN polling"
        connected={connected}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="Data Source" value="ESPN" />
        <InfoCard label="Leagues" value={String(leagues.length)} />
        <InfoCard label="Poll Interval" value="5 min" />
      </div>

      <div className="bg-base-200/30 border border-base-300/30 rounded-lg p-5 space-y-3">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
          Tracked Leagues
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {leagues.map((league) => (
            <div
              key={league}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-base-200/50 border border-base-300/40"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wide">
                {league}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-base-content/40 leading-relaxed pt-2">
          Scores are polled from ESPN every 5 minutes. Active, upcoming, and
          recently completed games are delivered to your ticker.
        </p>
      </div>
    </div>
  )
}

// ── Fantasy Stream Config ──────────────────────────────────────────

const GAME_CODE_LABELS: Record<string, string> = {
  nfl: 'Football',
  nba: 'Basketball',
  nhl: 'Hockey',
  mlb: 'Baseball',
}

const LEAGUES_PER_PAGE = 5

function FantasyStreamConfig({
  stream,
  yahoo,
  yahooStatus,
  yahooPending,
  onYahooConnect,
  onYahooDisconnect,
  onToggle,
  onDelete,
}: {
  stream: Stream
  yahoo: YahooState
  yahooStatus: { connected: boolean; synced: boolean }
  yahooPending?: boolean
  onYahooConnect?: () => void
  onYahooDisconnect?: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [filter, setFilter] = useState<'active' | 'finished'>('active')
  const [leagueVisibleCount, setLeagueVisibleCount] = useState(LEAGUES_PER_PAGE)

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
            <span className="text-xs uppercase tracking-wide">Disconnect</span>
          </motion.button>
        </div>
      )}
    </div>
  )
}

// ── League Card (reused from before) ───────────────────────────────

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
    : (league.standings?.teams?.team || [])
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

// ── RSS Stream Config ──────────────────────────────────────────────

function RssStreamConfig({
  stream,
  getToken,
  onToggle,
  onDelete,
  onStreamUpdate,
}: {
  stream: Stream
  getToken: () => Promise<string | null>
  onToggle: () => void
  onDelete: () => void
  onStreamUpdate: (updated: Stream) => void
}) {
  const [newFeedName, setNewFeedName] = useState('')
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [catalog, setCatalog] = useState<TrackedFeed[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('All')
  const [saving, setSaving] = useState(false)

  const feeds = Array.isArray((stream.config as any)?.feeds)
    ? ((stream.config as any).feeds as Array<{ name: string; url: string }>)
    : []

  const feedUrlSet = new Set(feeds.map((f) => f.url))

  // Fetch catalog on mount
  useEffect(() => {
    rssApi
      .getCatalog()
      .then(setCatalog)
      .catch(() => {})
      .finally(() => setCatalogLoading(false))
  }, [])

  const categories = [
    'All',
    ...Array.from(new Set(catalog.map((f) => f.category))),
  ]
  const filteredCatalog =
    activeCategory === 'All'
      ? catalog
      : catalog.filter((f) => f.category === activeCategory)

  const updateFeeds = async (
    nextFeeds: Array<{ name: string; url: string }>,
  ) => {
    setSaving(true)
    try {
      const updated = await streamsApi.update(
        'rss',
        { config: { feeds: nextFeeds } },
        getToken,
      )
      onStreamUpdate(updated)
    } catch {
      // Could show error
    } finally {
      setSaving(false)
    }
  }

  const addFeed = () => {
    const name = newFeedName.trim()
    const url = newFeedUrl.trim()
    if (!name || !url) return
    if (feedUrlSet.has(url)) return
    updateFeeds([...feeds, { name, url }])
    setNewFeedName('')
    setNewFeedUrl('')
  }

  const addCatalogFeed = (feed: TrackedFeed) => {
    if (feedUrlSet.has(feed.url)) return
    updateFeeds([...feeds, { name: feed.name, url: feed.url }])
  }

  const removeFeed = (idx: number) => {
    const next = [...feeds]
    next.splice(idx, 1)
    updateFeeds(next)
  }

  return (
    <div className="space-y-6">
      <StreamHeader
        stream={stream}
        icon={<Rss size={20} className="text-primary" />}
        title="RSS Stream"
        subtitle="Custom news feeds on your ticker"
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="Your Feeds" value={String(feeds.length)} />
        <InfoCard label="Catalog Size" value={String(catalog.length)} />
        <InfoCard label="Poll Interval" value="5 min" />
      </div>

      {/* Current Feeds */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest px-1">
          Your Feeds ({feeds.length} active)
        </p>
        {feeds.map((feed, i) => (
          <motion.div
            key={feed.url}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center justify-between p-3.5 bg-base-200/50 border border-base-300/50 rounded-lg"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Rss size={12} className="text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">{feed.name}</div>
                <div className="text-[10px] text-base-content/30 font-mono truncate max-w-[280px]">
                  {feed.url}
                </div>
              </div>
            </div>
            <button
              onClick={() => removeFeed(i)}
              disabled={saving}
              className="p-2 rounded hover:bg-error/10 text-base-content/20 hover:text-error transition-colors shrink-0 disabled:opacity-30"
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        ))}
        {feeds.length === 0 && (
          <div className="text-center py-6">
            <Rss size={28} className="mx-auto text-base-content/15 mb-2" />
            <p className="text-[10px] text-base-content/25 uppercase tracking-wide">
              No feeds yet — browse the catalog or add a custom feed
            </p>
          </div>
        )}
      </div>

      {/* Add Custom Feed Form */}
      <div className="bg-base-200/30 border border-base-300/30 rounded-lg p-4 space-y-3">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
          Add Custom Feed
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newFeedName}
            onChange={(e) => setNewFeedName(e.target.value)}
            placeholder="Feed name"
            className="flex-1 px-3 py-2 rounded bg-base-200/50 border border-base-300/40 text-xs font-mono text-base-content/60 placeholder:text-base-content/20 focus:outline-none focus:border-primary/30 transition-colors"
          />
          <input
            type="url"
            value={newFeedUrl}
            onChange={(e) => setNewFeedUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addFeed()
            }}
            placeholder="https://example.com/feed.xml"
            className="flex-[2] px-3 py-2 rounded bg-base-200/50 border border-base-300/40 text-xs font-mono text-base-content/60 placeholder:text-base-content/20 focus:outline-none focus:border-primary/30 transition-colors"
          />
          <button
            onClick={addFeed}
            disabled={saving || !newFeedName.trim() || !newFeedUrl.trim()}
            className="px-4 py-2 rounded border border-base-300/40 text-base-content/30 hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-2 disabled:opacity-30"
          >
            <Plus size={14} />
            <span className="text-xs uppercase tracking-wide">Add</span>
          </button>
        </div>
      </div>

      {/* Feed Catalog Browser */}
      <div className="space-y-4">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest px-1">
          Browse Feed Catalog
        </p>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-base-200/60 border border-base-300/40">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`relative px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
                activeCategory === cat
                  ? 'text-primary'
                  : 'text-base-content/30 hover:text-base-content/50'
              }`}
            >
              {activeCategory === cat && (
                <motion.div
                  layoutId="rss-category-bg"
                  className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-md"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">{cat}</span>
            </button>
          ))}
        </div>

        {/* Catalog Grid */}
        {catalogLoading ? (
          <div className="text-center py-8">
            <motion.span
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-[10px] font-mono text-base-content/30 uppercase"
            >
              Loading catalog...
            </motion.span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredCatalog.map((feed) => {
              const isAdded = feedUrlSet.has(feed.url)
              return (
                <motion.div
                  key={feed.url}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isAdded
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-base-200/30 border-base-300/40 hover:border-base-300/60'
                  }`}
                >
                  <div className="min-w-0 mr-2">
                    <div className="text-xs font-bold truncate">
                      {feed.name}
                    </div>
                    <div className="text-[9px] text-base-content/30 uppercase tracking-wide">
                      {feed.category}
                    </div>
                  </div>
                  {isAdded ? (
                    <span className="text-[9px] font-bold text-primary uppercase tracking-widest shrink-0 px-2 py-1 rounded bg-primary/10">
                      Added
                    </span>
                  ) : (
                    <button
                      onClick={() => addCatalogFeed(feed)}
                      disabled={saving}
                      className="text-[9px] font-bold text-base-content/40 uppercase tracking-widest shrink-0 px-2 py-1 rounded border border-base-300/40 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-30"
                    >
                      + Add
                    </button>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {!catalogLoading && filteredCatalog.length === 0 && (
          <p className="text-center text-[10px] text-base-content/25 uppercase tracking-wide py-4">
            No feeds in this category
          </p>
        )}
      </div>
    </div>
  )
}

// ── Info Card ──────────────────────────────────────────────────────

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-base-200/40 border border-base-300/40 rounded-lg p-4">
      <p className="text-[10px] text-base-content/30 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-sm font-bold font-mono">{value}</p>
    </div>
  )
}
