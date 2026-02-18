import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useScrollrAuth } from '@/hooks/useScrollrAuth'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import {
  ArrowRight,
  BarChart3,
  Crown,
  Globe,
  Lock,
  Radio,
  Settings,
  TrendingUp,
  Wifi,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { IdTokenClaims } from '@logto/react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { pageVariants, sectionVariants } from '@/lib/animations'
import { streamsApi } from '@/api/client'
import { useGetToken } from '@/hooks/useGetToken'
import SubscriptionStatus from '@/components/billing/SubscriptionStatus'
import { usePageMeta } from '@/lib/usePageMeta'

export const Route = createFileRoute('/account')({
  component: AccountHub,
})

// ── Signature easing (matches homepage) ────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const

// ── Hex colors ─────────────────────────────────────────────────
const HEX = {
  primary: '#34d399',
  secondary: '#ff4757',
  info: '#00b8db',
  accent: '#a855f7',
} as const

// ── Hub card definitions ───────────────────────────────────────
interface HubCardDef {
  title: string
  desc: string
  to?: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  href?: string
  Icon: ComponentType<{
    size?: number
    strokeWidth?: number
    className?: string
  }>
  hex: string
  WatermarkIcon: ComponentType<{
    size?: number
    strokeWidth?: number
    className?: string
  }>
}

const HUB_CARDS: HubCardDef[] = [
  {
    title: 'Data Terminal',
    desc: 'Market overview & live scores',
    to: '/dashboard',
    Icon: BarChart3,
    hex: HEX.primary,
    WatermarkIcon: BarChart3,
  },
  {
    title: 'Public Profile',
    desc: 'View your public presence',
    to: '/u/$username',
    params: { username: 'me' },
    Icon: Globe,
    hex: HEX.info,
    WatermarkIcon: Globe,
  },
  {
    title: 'Security Node',
    desc: 'Manage password, MFA & linked accounts',
    href: `https://auth.myscrollr.relentnet.dev/account?${new URLSearchParams({ client_id: 'ogbulfshvf934eeli4t9u' })}`,
    Icon: Lock,
    hex: HEX.secondary,
    WatermarkIcon: Lock,
  },
  {
    title: 'Uplink',
    desc: 'Manage your subscription tier',
    to: '/uplink',
    search: { session_id: undefined },
    Icon: Crown,
    hex: HEX.accent,
    WatermarkIcon: Crown,
  },
]

function AccountHub() {
  usePageMeta({
    title: 'Account — Scrollr',
    description:
      'Manage your Scrollr account, subscription, and connected services.',
    canonicalUrl: 'https://myscrollr.com/account',
  })
  const { isAuthenticated, isLoading, getIdTokenClaims } = useScrollrAuth()
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()
  const navigate = useNavigate()
  const getToken = useGetToken()

  // ── Prevent remount/re-animation on token refresh ──────────────
  const hasLoaded = useRef(false)
  const autoRedirectTriggered = useRef(false)

  // ── Quick Stats state ──────────────────────────────────────────
  const [streamCount, setStreamCount] = useState<number | null>(null)
  const [enabledCount, setEnabledCount] = useState<number | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const data = await streamsApi.getAll(getToken)
      const all = data.streams || []
      setStreamCount(all.length)
      setEnabledCount(all.filter((s) => s.enabled).length)
    } catch {
      // Silently fail — stats are non-critical
    }
  }, [getToken])

  // ── Redirect if not authenticated (one-time) ─────────────────
  useEffect(() => {
    if (
      !isLoading &&
      !isAuthenticated &&
      !hasLoaded.current &&
      !autoRedirectTriggered.current
    ) {
      autoRedirectTriggered.current = true
      navigate({ to: '/' })
    }
  }, [isLoading, isAuthenticated, navigate])

  // ── Fetch data when authenticated ─────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims()
        .then(setUserClaims)
        .catch(() => {})
      fetchStats()
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading / auth guards ─────────────────────────────────────
  if (isLoading && !hasLoaded.current) {
    return <LoadingSpinner variant="spin" label="" />
  }

  if (!isAuthenticated && !hasLoaded.current) return null

  hasLoaded.current = true

  return (
    <motion.main
      className="min-h-screen pt-20"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Personalized Hero ── */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />
        <div className="container relative z-10">
          <motion.div className="text-center" variants={sectionVariants}>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Welcome back,{' '}
              <span className="text-gradient-primary">
                {userClaims?.name || userClaims?.username || 'User'}
              </span>
            </h1>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Your personal data streams are ready for orchestration. Sync your
              leagues, track your assets, and stay in the flow.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Hub Grid ── */}
      <section className="relative overflow-hidden">
        <div className="container py-16 lg:py-24">
          <motion.div
            className="text-center mb-12 sm:mb-16"
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Control <span className="text-gradient-primary">Center</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Navigate your account, streams, and subscription
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {HUB_CARDS.map((card, i) => (
              <HubCard key={card.title} card={card} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats & Status ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />
        <div className="container py-16 lg:py-24">
          <motion.div
            className="text-center mb-12 sm:mb-16"
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Your <span className="text-gradient-primary">Dashboard</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Subscription, streams, and system health at a glance
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* System Status Link Card */}
            <motion.div
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <Link
                to="/status"
                className="relative bg-base-200/40 border border-base-300/25 rounded-xl p-8 overflow-hidden group block h-full hover:border-base-300/50 transition-colors"
              >
                {/* Accent top line */}
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${HEX.primary} 50%, transparent)`,
                  }}
                />
                {/* Corner dot grid */}
                <div
                  className="absolute top-0 right-0 w-20 h-20 opacity-[0.04] text-base-content"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, currentColor 1px, transparent 1px)',
                    backgroundSize: '8px 8px',
                  }}
                />
                {/* Hover glow orb */}
                <div
                  className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `${HEX.primary}10` }}
                />

                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{
                      background: `${HEX.primary}15`,
                      boxShadow: `0 0 20px ${HEX.primary}15, 0 0 0 1px ${HEX.primary}20`,
                    }}
                  >
                    <Settings size={20} className="text-base-content/80" />
                  </div>
                  <h3 className="text-lg font-black tracking-tight text-base-content">
                    System Status
                  </h3>
                </div>
                <p className="text-sm text-base-content/45 mb-6 leading-relaxed">
                  Monitor infrastructure health, ingestion workers, and live
                  connection status.
                </p>
                <div className="flex items-center gap-2 text-xs font-semibold text-base-content/40 group-hover:text-base-content/70 transition-colors">
                  View Status Dashboard
                  <ArrowRight size={14} />
                </div>

                {/* Watermark */}
                <Settings
                  size={130}
                  strokeWidth={0.4}
                  className="absolute -bottom-4 -right-4 text-base-content/[0.025] pointer-events-none"
                />
              </Link>
            </motion.div>

            {/* Quick Stats Card */}
            <motion.div
              className="relative bg-base-200/40 border border-base-300/25 rounded-xl p-8 overflow-hidden group"
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
            >
              {/* Accent top line */}
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, ${HEX.secondary} 50%, transparent)`,
                }}
              />
              {/* Corner dot grid */}
              <div
                className="absolute top-0 right-0 w-20 h-20 opacity-[0.04] text-base-content"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, currentColor 1px, transparent 1px)',
                  backgroundSize: '8px 8px',
                }}
              />
              {/* Hover glow orb */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `${HEX.secondary}10` }}
              />

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{
                      background: `${HEX.secondary}15`,
                      boxShadow: `0 0 20px ${HEX.secondary}15, 0 0 0 1px ${HEX.secondary}20`,
                    }}
                  >
                    <TrendingUp size={20} className="text-base-content/80" />
                  </div>
                  <h3 className="text-lg font-black tracking-tight text-base-content">
                    Quick Stats
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-4 bg-base-200/40 border border-base-300/25 rounded-xl">
                    <div className="text-2xl font-black text-base-content font-mono tabular-nums">
                      {streamCount ?? '—'}
                    </div>
                    <div className="text-[10px] text-base-content/30 flex items-center justify-center gap-1 mt-1">
                      <Radio size={10} />
                      Streams
                    </div>
                  </div>
                  <div className="p-4 bg-base-200/40 border border-base-300/25 rounded-xl">
                    <div className="text-2xl font-black text-base-content font-mono tabular-nums">
                      {enabledCount ?? '—'}
                    </div>
                    <div className="text-[10px] text-base-content/30 flex items-center justify-center gap-1 mt-1">
                      <Wifi size={10} />
                      Active
                    </div>
                  </div>
                </div>
              </div>

              {/* Watermark */}
              <BarChart3
                size={130}
                strokeWidth={0.4}
                className="absolute -bottom-4 -right-4 text-base-content/[0.025] pointer-events-none"
              />
            </motion.div>

            {/* Subscription Status Card */}
            <motion.div
              className="relative bg-base-200/40 border border-base-300/25 rounded-xl p-8 overflow-hidden group lg:col-span-2"
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
            >
              {/* Accent top line */}
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, ${HEX.accent} 50%, transparent)`,
                }}
              />
              {/* Corner dot grid */}
              <div
                className="absolute top-0 right-0 w-20 h-20 opacity-[0.04] text-base-content"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, currentColor 1px, transparent 1px)',
                  backgroundSize: '8px 8px',
                }}
              />
              {/* Hover glow orb */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `${HEX.accent}10` }}
              />

              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: `${HEX.accent}15`,
                    boxShadow: `0 0 20px ${HEX.accent}15, 0 0 0 1px ${HEX.accent}20`,
                  }}
                >
                  <Crown size={20} className="text-base-content/80" />
                </div>
                <h3 className="text-lg font-black tracking-tight text-base-content">
                  Subscription
                </h3>
              </div>

              <SubscriptionStatus getToken={getToken} />

              <Link
                to="/uplink"
                search={{ session_id: undefined }}
                className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-base-content/40 hover:text-base-content/70 transition-colors"
              >
                View Plans <ArrowRight size={14} />
              </Link>

              {/* Watermark */}
              <Crown
                size={130}
                strokeWidth={0.4}
                className="absolute -bottom-4 -right-4 text-base-content/[0.025] pointer-events-none"
              />
            </motion.div>
          </div>
        </div>
      </section>
    </motion.main>
  )
}

// ── Hub Card ───────────────────────────────────────────────────

function HubCard({ card, index }: { card: HubCardDef; index: number }) {
  const { title, desc, to, params, search, href, Icon, hex, WatermarkIcon } =
    card

  const inner = (
    <motion.div
      className="relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 overflow-hidden group h-full flex flex-col justify-between cursor-pointer hover:border-base-300/50 transition-colors"
      style={{ opacity: 0 }}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: EASE, delay: index * 0.1 }}
      whileHover={{ y: -3, transition: { type: 'tween', duration: 0.2 } }}
    >
      {/* Accent top line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${hex} 50%, transparent)`,
        }}
      />
      {/* Corner dot grid */}
      <div
        className="absolute top-0 right-0 w-16 h-16 opacity-[0.04] text-base-content"
        style={{
          backgroundImage:
            'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
      />
      {/* Hover glow orb */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `${hex}10` }}
      />

      {/* Arrow indicator */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowRight size={16} className="text-base-content/40" />
      </div>

      <div className="space-y-5">
        {/* Icon badge */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{
            background: `${hex}15`,
            boxShadow: `0 0 20px ${hex}15, 0 0 0 1px ${hex}20`,
          }}
        >
          <Icon size={20} className="text-base-content/80" />
        </div>
        <div>
          <h3 className="text-lg font-black tracking-tight text-base-content group-hover:text-base-content/80 transition-colors">
            {title}
          </h3>
          <p className="text-xs text-base-content/40 mt-2 leading-relaxed">
            {desc}
          </p>
        </div>
      </div>

      {/* Watermark */}
      <WatermarkIcon
        size={80}
        strokeWidth={0.4}
        className="absolute -bottom-2 -right-2 text-base-content/[0.025] pointer-events-none"
      />
    </motion.div>
  )

  // External link (e.g. Logto Account Center)
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full"
      >
        {inner}
      </a>
    )
  }

  return (
    <Link
      to={to}
      params={params as any}
      search={search as any}
      className="block h-full"
    >
      {inner}
    </Link>
  )
}
