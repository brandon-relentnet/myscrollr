import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useScrollrAuth } from '@/hooks/useScrollrAuth'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Globe,
  Lock,
  Radio,
  Settings,
  ShieldCheck,
  TrendingUp,
  Wifi,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { IdTokenClaims } from '@logto/react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { pageVariants, sectionVariants } from '@/lib/animations'
import { streamsApi } from '@/api/client'
import { useGetToken } from '@/hooks/useGetToken'

export const Route = createFileRoute('/account')({
  component: AccountHub,
})

function AccountHub() {
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
      getIdTokenClaims().then(setUserClaims).catch(() => {})
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
      {/* Personalized Hero */}
      <section className="relative pt-24 pb-16 overflow-hidden border-b border-base-300 bg-base-200/30">
        <div className="container relative z-10">
          <motion.div className="max-w-4xl" variants={sectionVariants}>
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 bg-primary/8 text-primary text-[10px] font-bold rounded-sm border border-primary/15 uppercase tracking-[0.2em] flex items-center gap-2">
                <ShieldCheck size={14} /> session_active
              </span>
              <span className="h-px w-12 bg-base-300" />
              <span className="text-[10px] font-mono text-base-content/30 uppercase">
                Protocol: OAuth2.0
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight uppercase mb-8 leading-none">
              Welcome back,
              <br />
              <span className="text-primary">
                {userClaims?.name || userClaims?.username || 'User'}
              </span>
            </h1>

            <p className="text-sm text-base-content/40 leading-relaxed mb-10 max-w-2xl">
              Your personal data streams are ready for orchestration. Sync your
              leagues, track your assets, and stay in the flow.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Hub Grid */}
      <section className="container py-16">
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={sectionVariants}
        >
          {/* Main Terminal */}
          <HubCard
            title="Data Terminal"
            desc="Market overview & live scores"
            to="/dashboard"
            icon={<BarChart3 className="size-6" />}
            accent="primary"
          />

          {/* Public Profile */}
          <HubCard
            title="Public Profile"
            desc="View your public presence"
            to="/u/$username"
            params={{ username: 'me' }}
            icon={<Globe className="size-6" />}
            accent="info"
          />

          {/* Account Settings — opens Logto Account Center */}
          <HubCard
            title="Security Node"
            desc="Manage password, MFA & linked accounts"
            href={`https://auth.myscrollr.relentnet.dev/account?${new URLSearchParams({ client_id: 'ogbulfshvf934eeli4t9u' })}`}
            icon={<Lock className="size-6" />}
            accent="secondary"
          />
        </motion.div>

        {/* Detailed Stats / Status */}
        <motion.div
          className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8"
          variants={sectionVariants}
        >
          <Link
            to="/status"
            className="bg-base-200/50 border border-base-300/50 rounded-sm p-8 hover:border-primary/30 transition-all block group"
          >
            <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
              <Settings size={16} /> System Status
            </h3>
            <p className="text-sm text-base-content/50 mb-6">
              Monitor infrastructure health, ingestion workers, and live
              connection status.
            </p>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary/60 group-hover:text-primary transition-colors">
              View Status Dashboard
              <ArrowRight size={14} />
            </div>
          </Link>

          <div className="bg-base-200/50 border border-base-300/50 rounded-sm p-8 relative overflow-hidden group">
            <div className="relative z-10">
              <h3 className="text-sm font-bold uppercase tracking-widest text-secondary mb-6 flex items-center gap-2">
                <TrendingUp size={16} /> Quick Stats
              </h3>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-4 bg-base-300/50 rounded-sm">
                  <div className="text-2xl font-black text-base-content tabular-nums">
                    {streamCount ?? '—'}
                  </div>
                  <div className="text-[10px] uppercase font-mono opacity-40 flex items-center justify-center gap-1">
                    <Radio size={10} />
                    Streams
                  </div>
                </div>
                <div className="p-4 bg-base-300/50 rounded-sm">
                  <div className="text-2xl font-black text-base-content tabular-nums">
                    {enabledCount ?? '—'}
                  </div>
                  <div className="text-[10px] uppercase font-mono opacity-40 flex items-center justify-center gap-1">
                    <Wifi size={10} />
                    Active
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <BarChart3 size={120} />
            </div>
          </div>
        </motion.div>
      </section>
    </motion.main>
  )
}

function HubCard({
  title,
  desc,
  to,
  params,
  href,
  icon,
  accent,
  disabled = false,
}: {
  title: string
  desc: string
  to?: string
  params?: Record<string, string>
  href?: string
  icon: React.ReactNode
  accent: 'primary' | 'secondary' | 'info'
  disabled?: boolean
}) {
  const accentClasses = {
    primary: 'text-primary bg-primary/10 border-primary/20',
    secondary: 'text-secondary bg-secondary/10 border-secondary/20',
    info: 'text-info bg-info/10 border-info/20',
  }[accent]

  const content = (
    <motion.div
      whileHover={disabled ? undefined : { y: -3, transition: { type: 'tween', duration: 0.2 } }}
      className={`p-8 rounded-sm border transition-colors h-full flex flex-col justify-between group relative overflow-hidden ${disabled ? 'bg-base-200/50 border-base-300/50 opacity-50 cursor-not-allowed' : 'bg-base-200/50 border border-base-300/50 hover:border-primary/30 cursor-pointer'}`}
    >
      {!disabled && (
        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowRight size={20} className="text-primary" />
        </div>
      )}

      <div className="space-y-6">
        <div
          className={`h-10 w-10 rounded-sm flex items-center justify-center border ${accentClasses}`}
        >
          {icon}
        </div>
        <div>
          <h3
            className={`text-lg font-black uppercase tracking-tight ${disabled ? 'text-base-content/40' : 'text-base-content group-hover:text-primary transition-colors'}`}
          >
            {title}
          </h3>
          <p className="text-xs uppercase font-mono text-base-content/40 mt-2 leading-relaxed">
            {desc}
          </p>
        </div>
      </div>

      {disabled && (
        <div className="mt-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-base-content/20">
          <Lock size={10} /> Encrypted
        </div>
      )}
    </motion.div>
  )

  if (disabled) return content

  // External link (e.g. Logto Account Center)
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full"
      >
        {content}
      </a>
    )
  }

  return (
    <Link to={to} params={params as any} className="block h-full">
      {content}
    </Link>
  )
}
