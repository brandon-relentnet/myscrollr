import {
  Link,
  createFileRoute,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  Plus,
  Puzzle,
  Settings2,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { IdTokenClaims } from '@logto/react'
import type { Stream, StreamType } from '@/api/client'
import { useRealtime } from '@/hooks/useRealtime'
import { useGetToken } from '@/hooks/useGetToken'
import SettingsPanel from '@/components/SettingsPanel'
import LoadingSpinner from '@/components/LoadingSpinner'
import { pageVariants, sectionVariants } from '@/lib/animations'
import { streamsApi } from '@/api/client'
import { getIntegration, getAllIntegrations } from '@/integrations/registry'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    const tab = search.tab as string | undefined
    // Validate against registered integrations
    return {
      tab: tab && getIntegration(tab) ? tab : undefined,
    }
  },
})

function DashboardPage() {
  const { isAuthenticated, isLoading, signIn, getIdTokenClaims } = useLogto()
  const { tab } = useSearch({ from: '/dashboard' })
  const navigate = useNavigate({ from: '/dashboard' })
  const activeModule: string = tab ?? 'finance'
  const setActiveModule = useCallback(
    (next: string | ((current: string) => string)) => {
      const resolved = typeof next === 'function' ? next(activeModule) : next
      if (resolved !== activeModule) {
        navigate({ search: { tab: resolved }, replace: true })
      }
    },
    [activeModule, navigate],
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()

  // ── Streams state ────────────────────────────────────────────────
  const [streams, setStreams] = useState<Array<Stream>>([])
  const [streamsLoading, setStreamsLoading] = useState(true)
  const [addStreamOpen, setAddStreamOpen] = useState(false)

  // ── Prevent remount/re-animation on token refresh ──────────────
  const hasLoaded = useRef(false)
  const hasAnimated = useRef(false)
  const autoSignInTriggered = useRef(false)

  const getToken = useGetToken()

  // useRealtime must come after getToken is defined
  const { status, preferences } = useRealtime({ getToken })

  // ── Fetch streams ────────────────────────────────────────────────
  const fetchStreams = useCallback(async () => {
    try {
      const data = await streamsApi.getAll(getToken)
      const fetched = data.streams || []
      setStreams(fetched)
      // If the currently selected module doesn't exist in fetched streams,
      // fall back to the first available stream type
      if (fetched.length > 0) {
        setActiveModule((current) => {
          const exists = fetched.some((s) => s.stream_type === current)
          return exists ? current : fetched[0].stream_type
        })
      }
    } catch {
      // Silently fail — keep existing state
    } finally {
      setStreamsLoading(false)
    }
  }, [getToken]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleQuickStart = async () => {
    const recommended: Array<StreamType> = ['finance', 'sports', 'rss']
    const toAdd = recommended.filter(
      (t) => !streams.some((s) => s.stream_type === t),
    )
    if (toAdd.length === 0) return

    try {
      const created = await Promise.all(
        toAdd.map((t) => streamsApi.create(t, {}, getToken)),
      )
      setStreams((prev) => [...prev, ...created])
      setActiveModule(created[0].stream_type)
    } catch {
      // Partial failure — refetch to get accurate state
      fetchStreams()
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then((claims) => {
        setUserClaims(claims)
      })
      fetchStreams()
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading / auth guards ────────────────────────────────────────
  if (isLoading && !hasLoaded.current) {
    return <LoadingSpinner label="Loading..." />
  }

  if (!isAuthenticated && !hasLoaded.current) {
    if (!autoSignInTriggered.current) {
      autoSignInTriggered.current = true
      signIn(`${window.location.origin}/callback`)
    }
    return <LoadingSpinner label="Authenticating..." />
  }

  hasLoaded.current = true

  const shouldAnimate = !hasAnimated.current
  hasAnimated.current = true

  // ── Derived data ─────────────────────────────────────────────────
  const activeStream = streams.find((s) => s.stream_type === activeModule)
  const activeCount = streams.filter((s) => s.visible).length
  const existingTypes = new Set(streams.map((s) => s.stream_type))
  const allIntegrations = getAllIntegrations()
  const availableTypes = allIntegrations.filter(
    (m) => !existingTypes.has(m.id as StreamType),
  )

  // ── Look up active integration from registry ─────────────────────
  const activeIntegration = getIntegration(activeModule)

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
                    className="absolute right-0 top-full mt-2 w-56 bg-base-100 border border-base-300/60 rounded-sm shadow-xl z-50 overflow-hidden"
                  >
                    <div className="p-2">
                      <p className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1.5">
                        Available Integrations
                      </p>
                      {availableTypes.map((manifest) => {
                        const Icon = manifest.icon
                        return (
                          <button
                            key={manifest.id}
                            onClick={() =>
                              handleAddStream(manifest.id as StreamType)
                            }
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm hover:bg-primary/8 text-left transition-colors group"
                          >
                            <span className="text-base-content/40 group-hover:text-primary transition-colors">
                              <Icon size={14} />
                            </span>
                            <div>
                              <span className="text-xs font-bold uppercase tracking-wide block">
                                {manifest.tabLabel}
                              </span>
                              <span className="text-[9px] text-base-content/30">
                                {manifest.description}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2.5 rounded-sm border border-base-300 hover:border-primary/30 transition-all text-base-content/50 hover:text-primary"
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
                    const manifest = getIntegration(stream.stream_type)
                    if (!manifest) return null
                    const Icon = manifest.icon
                    return (
                      <StreamNavButton
                        key={stream.stream_type}
                        active={activeModule === stream.stream_type}
                        onClick={() => setActiveModule(stream.stream_type)}
                        icon={<Icon size={14} />}
                        label={manifest.tabLabel}
                        visible={stream.visible}
                      />
                    )
                  })
                )}
              </nav>
            </div>

            {/* Quick Stats */}
            <div className="bg-base-200/40 border border-base-300/50 rounded-sm p-4 space-y-4">
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
            className="lg:col-span-9 bg-base-200/20 border border-base-300/40 rounded-sm p-8 min-h-[500px]"
            variants={sectionVariants}
          >
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Registry-driven integration rendering */}
              {activeStream && activeIntegration && (
                <activeIntegration.DashboardTab
                  stream={activeStream}
                  getToken={getToken}
                  connected={status === 'connected'}
                  onToggle={() => handleToggleStream(activeStream)}
                  onDelete={() =>
                    handleDeleteStream(
                      activeStream.stream_type as StreamType,
                    )
                  }
                  onStreamUpdate={(updated) =>
                    setStreams((prev) =>
                      prev.map((s) =>
                        s.stream_type === updated.stream_type ? updated : s,
                      ),
                    )
                  }
                />
              )}

              {/* Empty State */}
              {!activeStream && !streamsLoading && streams.length === 0 && (
                <div className="text-center py-20 space-y-6">
                  <Activity
                    size={48}
                    className="mx-auto text-base-content/15"
                  />
                  <div className="space-y-2">
                    <p className="text-sm font-bold uppercase text-base-content/40">
                      No Streams Yet
                    </p>
                    <p className="text-xs text-base-content/25">
                      Add data sources to build your real-time feed.
                      <br />
                      Start with the recommended set or pick your own.
                    </p>
                  </div>

                  {/* Primary CTA — Quick Start */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleQuickStart}
                    className="btn btn-primary btn-sm gap-2"
                  >
                    <Zap size={14} />
                    Quick Start — Finance, Sports & RSS
                  </motion.button>

                  {/* Secondary CTAs */}
                  <div className="flex items-center justify-center gap-4 pt-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setAddStreamOpen(true)}
                      className="text-[10px] font-bold uppercase tracking-widest text-base-content/30 hover:text-base-content/50 transition-colors flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Add Stream
                    </motion.button>
                    <span className="text-base-content/10">|</span>
                    <Link
                      to="/integrations"
                      className="text-[10px] font-bold uppercase tracking-widest text-primary/40 hover:text-primary/70 transition-colors flex items-center gap-1.5"
                    >
                      <Puzzle size={12} />
                      Browse Integrations
                    </Link>
                  </div>
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
      className={`flex items-center justify-between p-3.5 rounded-sm transition-all text-left group ${
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
