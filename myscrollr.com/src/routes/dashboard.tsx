import {
  Link,
  createFileRoute,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { useScrollrAuth } from '@/hooks/useScrollrAuth'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Plus, Puzzle, Settings2, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { IdTokenClaims } from '@logto/react'
import type { Channel, ChannelType } from '@/api/client'
import { useRealtime } from '@/hooks/useRealtime'
import { useGetToken } from '@/hooks/useGetToken'
import SettingsPanel from '@/components/SettingsPanel'
import LoadingSpinner from '@/components/LoadingSpinner'
import { pageVariants, sectionVariants } from '@/lib/animations'
import { channelsApi, getPreferences } from '@/api/client'
import { getChannel, getAllChannels } from '@/channels/registry'
import { usePageMeta } from '@/lib/usePageMeta'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    const tab = search.tab as string | undefined
    // Validate against registered channels
    return {
      tab: tab && getChannel(tab) ? tab : undefined,
    }
  },
})

function DashboardPage() {
  usePageMeta({
    title: 'Dashboard — Scrollr',
    description:
      'Your Scrollr dashboard — manage channels and live data feeds.',
    canonicalUrl: 'https://myscrollr.com/dashboard',
  })
  const { isAuthenticated, isLoading, signIn, getIdTokenClaims } =
    useScrollrAuth()
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

  // ── Tier state ───────────────────────────────────────────────────
  const [subscriptionTier, setSubscriptionTier] = useState<string>('free')

  // ── Channels state ───────────────────────────────────────────────
  const [channels, setChannels] = useState<Array<Channel>>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [addChannelOpen, setAddChannelOpen] = useState(false)

  // Close dropdown on Escape
  useEffect(() => {
    if (!addChannelOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setAddChannelOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [addChannelOpen])

  // ── Prevent remount/re-animation on token refresh ──────────────
  const hasLoaded = useRef(false)
  const hasAnimated = useRef(false)
  const autoSignInTriggered = useRef(false)

  const getToken = useGetToken()

  // useRealtime must come after getToken is defined
  const { status, preferences } = useRealtime({ getToken })

  // Sync tier from SSE preference updates
  useEffect(() => {
    if (preferences?.subscription_tier) {
      setSubscriptionTier(preferences.subscription_tier)
    }
  }, [preferences?.subscription_tier])

  // ── Fetch channels ───────────────────────────────────────────────
  const fetchChannels = useCallback(async () => {
    try {
      const data = await channelsApi.getAll(getToken)
      const fetched = data.channels || []
      setChannels(fetched)
      // If the currently selected module doesn't exist in fetched channels,
      // fall back to the first available channel type
      if (fetched.length > 0) {
        setActiveModule((current) => {
          const exists = fetched.some((s) => s.channel_type === current)
          return exists ? current : fetched[0].channel_type
        })
      }
    } catch {
      // Silently fail — keep existing state
    } finally {
      setChannelsLoading(false)
    }
  }, [getToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleChannel = async (channel: Channel) => {
    const next = !channel.visible
    // Optimistic update — both enabled and visible stay in sync
    setChannels((prev) =>
      prev.map((s) =>
        s.channel_type === channel.channel_type
          ? { ...s, enabled: next, visible: next }
          : s,
      ),
    )
    try {
      await channelsApi.update(
        channel.channel_type,
        { enabled: next, visible: next },
        getToken,
      )
    } catch {
      // Revert
      setChannels((prev) =>
        prev.map((s) =>
          s.channel_type === channel.channel_type
            ? { ...s, enabled: channel.enabled, visible: channel.visible }
            : s,
        ),
      )
    }
  }

  const handleAddChannel = async (channelType: ChannelType) => {
    try {
      const newChannel = await channelsApi.create(channelType, {}, getToken)
      setChannels((prev) => [...prev, newChannel])
      setActiveModule(channelType)
      setAddChannelOpen(false)
    } catch {
      // Could show an error toast
    }
  }

  const handleDeleteChannel = async (channelType: ChannelType) => {
    const prev = channels
    setChannels((s) => s.filter((st) => st.channel_type !== channelType))
    try {
      await channelsApi.delete(channelType, getToken)
      // Switch to first remaining channel
      const remaining = prev.filter((s) => s.channel_type !== channelType)
      if (remaining.length > 0) {
        setActiveModule(remaining[0].channel_type)
      }
    } catch {
      setChannels(prev)
    }
  }

  const handleQuickStart = async () => {
    const recommended: Array<ChannelType> = ['finance', 'sports', 'rss']
    const toAdd = recommended.filter(
      (t) => !channels.some((s) => s.channel_type === t),
    )
    if (toAdd.length === 0) return

    try {
      const created = await Promise.all(
        toAdd.map((t) => channelsApi.create(t, {}, getToken)),
      )
      setChannels((prev) => [...prev, ...created])
      setActiveModule(created[0].channel_type)
    } catch {
      // Partial failure — refetch to get accurate state
      fetchChannels()
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then((claims) => {
        setUserClaims(claims)
      })
      fetchChannels()
      // Fetch preferences to get subscription tier (synced from JWT roles on backend)
      getPreferences(getToken)
        .then((prefs) => {
          if (prefs.subscription_tier) {
            setSubscriptionTier(prefs.subscription_tier)
          }
        })
        .catch(() => {
          // Silently fail — tier defaults to 'free'
        })
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto sign-in (side effect, must be in useEffect) ─────────────
  useEffect(() => {
    if (
      !isLoading &&
      !isAuthenticated &&
      !hasLoaded.current &&
      !autoSignInTriggered.current
    ) {
      autoSignInTriggered.current = true
      signIn(`${window.location.origin}/callback`)
    }
  }, [isLoading, isAuthenticated, signIn])

  // ── Loading / auth guards ────────────────────────────────────────
  if (isLoading && !hasLoaded.current) {
    return <LoadingSpinner label="Loading..." />
  }

  if (!isAuthenticated && !hasLoaded.current) {
    return <LoadingSpinner label="Authenticating..." />
  }

  hasLoaded.current = true

  const shouldAnimate = !hasAnimated.current
  hasAnimated.current = true

  // ── Derived data ─────────────────────────────────────────────────
  const activeChannel = channels.find((s) => s.channel_type === activeModule)
  const activeCount = channels.filter((s) => s.visible).length
  const existingTypes = new Set(channels.map((s) => s.channel_type))
  const allChannels = getAllChannels()
  const availableTypes = allChannels.filter(
    (m) => !existingTypes.has(m.id as ChannelType),
  )

  // ── Look up active channel from registry ─────────────────────────
  const activeChannelManifest = getChannel(activeModule)

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
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{
                  background: status === 'connected' ? '#34d399' : '#ff4757',
                }}
              />
              <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
                Dashboard
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight">
              Your <span className="text-primary">Channels</span>
            </h1>
            <p className="text-xs text-base-content/40">
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
                    ? setAddChannelOpen(!addChannelOpen)
                    : undefined
                }
                disabled={availableTypes.length === 0}
                aria-expanded={addChannelOpen}
                aria-haspopup="true"
                className="btn btn-primary btn-sm gap-2 disabled:opacity-30"
              >
                <Plus size={14} />
                Add Channel
              </motion.button>

              {/* Add Channel Dropdown */}
              <AnimatePresence>
                {addChannelOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 30,
                    }}
                    className="absolute right-0 top-full mt-2 w-56 bg-base-100 border border-base-300/25 rounded-lg shadow-xl z-50 overflow-hidden"
                  >
                    <div className="p-2">
                      <p className="text-[9px] font-semibold text-base-content/30 uppercase tracking-wide px-2 py-1.5">
                        Available Channels
                      </p>
                      {availableTypes.map((manifest) => {
                        const Icon = manifest.icon
                        return (
                          <button
                            key={manifest.id}
                            onClick={() =>
                              handleAddChannel(manifest.id as ChannelType)
                            }
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group"
                            style={
                              {
                                '--hover-bg': `${manifest.hex}10`,
                              } as React.CSSProperties
                            }
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = `${manifest.hex}10`)
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = '')
                            }
                          >
                            <span
                              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                              style={{
                                background: `${manifest.hex}15`,
                              }}
                            >
                              <Icon
                                size={14}
                                className="text-base-content/80"
                              />
                            </span>
                            <div>
                              <span className="text-xs font-semibold block">
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
              className="p-2.5 rounded-lg border border-base-300/25 hover:border-primary/30 transition-colors text-base-content/50 hover:text-primary"
              aria-label="Open extension settings"
            >
              <Settings2 size={16} />
            </button>
          </div>
        </motion.header>

        {/* Close dropdown on outside click */}
        {addChannelOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAddChannelOpen(false)}
            aria-hidden="true"
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar */}
          <motion.aside
            className="lg:col-span-3 space-y-6"
            variants={sectionVariants}
          >
            <div>
              <p className="text-[10px] font-semibold text-base-content/30 uppercase tracking-wide mb-3 px-1">
                Active Channels
              </p>
              <nav className="flex flex-col gap-1">
                {channelsLoading ? (
                  <div className="p-4 text-center">
                    <motion.span
                      animate={{ opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-[10px] text-base-content/30"
                    >
                      Loading...
                    </motion.span>
                  </div>
                ) : (
                  channels.map((ch) => {
                    const manifest = getChannel(ch.channel_type)
                    if (!manifest) return null
                    const Icon = manifest.icon
                    return (
                      <ChannelNavButton
                        key={ch.channel_type}
                        active={activeModule === ch.channel_type}
                        onClick={() => setActiveModule(ch.channel_type)}
                        icon={<Icon size={14} />}
                        label={manifest.tabLabel}
                        visible={ch.visible}
                        hex={manifest.hex}
                      />
                    )
                  })
                )}
              </nav>
            </div>

            {/* Quick Stats */}
            <div className="bg-base-200/40 border border-base-300/25 rounded-xl p-4 space-y-4">
              <p className="text-[10px] font-semibold text-base-content/30 uppercase tracking-wide">
                Overview
              </p>
              <div className="space-y-3">
                <QuickStat
                  label="Total Channels"
                  value={String(channels.length)}
                />
                <QuickStat
                  label="Active"
                  value={String(activeCount)}
                  color={
                    activeCount > 0 ? 'text-primary' : 'text-base-content/80'
                  }
                />
                <QuickStat
                  label="Delivery"
                  value={
                    subscriptionTier === 'uplink'
                      ? status === 'connected'
                        ? 'Live'
                        : 'Offline'
                      : 'Polling'
                  }
                  color={
                    subscriptionTier === 'uplink'
                      ? status === 'connected'
                        ? 'text-primary'
                        : 'text-base-content/40'
                      : 'text-info'
                  }
                />
              </div>
            </div>
          </motion.aside>

          {/* Main Content Area */}
          <motion.main
            className="lg:col-span-9 bg-base-200/20 border border-base-300/25 rounded-xl p-8 min-h-[500px]"
            variants={sectionVariants}
          >
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Registry-driven channel rendering */}
              {activeChannel && activeChannelManifest && (
                <activeChannelManifest.DashboardTab
                  channel={activeChannel}
                  getToken={getToken}
                  connected={status === 'connected'}
                  subscriptionTier={subscriptionTier}
                  hex={activeChannelManifest.hex}
                  onToggle={() => handleToggleChannel(activeChannel)}
                  onDelete={() =>
                    handleDeleteChannel(
                      activeChannel.channel_type as ChannelType,
                    )
                  }
                  onChannelUpdate={(updated) =>
                    setChannels((prev) =>
                      prev.map((s) =>
                        s.channel_type === updated.channel_type ? updated : s,
                      ),
                    )
                  }
                />
              )}

              {/* Empty State */}
              {!activeChannel && !channelsLoading && channels.length === 0 && (
                <div className="text-center py-20 space-y-6">
                  <Activity
                    size={48}
                    className="mx-auto text-base-content/15"
                  />
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-base-content/40">
                      No Channels Yet
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
                      onClick={() => setAddChannelOpen(true)}
                      className="text-[10px] font-semibold uppercase tracking-wide text-base-content/30 hover:text-base-content/50 transition-colors flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Add Channel
                    </motion.button>
                    <span className="text-base-content/10">|</span>
                    <Link
                      to="/channels"
                      className="text-[10px] font-semibold uppercase tracking-wide text-primary/40 hover:text-primary/70 transition-colors flex items-center gap-1.5"
                    >
                      <Puzzle size={12} />
                      Browse Channels
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

function ChannelNavButton({
  active,
  onClick,
  icon,
  label,
  visible,
  hex,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  visible: boolean
  hex: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between p-3.5 rounded-lg transition-colors text-left group border ${
        active
          ? ''
          : 'text-base-content/40 hover:bg-base-200/60 hover:text-base-content/70 border-transparent'
      }`}
      style={
        active
          ? {
              background: `${hex}10`,
              borderColor: `${hex}20`,
              color: hex,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      {visible ? (
        <span
          className="h-1.5 w-1.5 rounded-full animate-pulse"
          style={{ background: hex }}
        />
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
      <span className="text-xs text-base-content/40">{label}</span>
      <span className={`text-sm font-semibold font-mono ${color}`}>
        {value}
      </span>
    </div>
  )
}
