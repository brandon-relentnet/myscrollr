import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Database,
  Globe,
  Radio,
  Server,
  ShieldAlert,
  Users,
  XCircle,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import { usePageMeta } from '@/lib/usePageMeta'
import { itemVariants, pageVariants } from '@/lib/animations'
import { API_BASE } from '@/api/client'

export const Route = createFileRoute('/status')({
  component: StatusPage,
})

// --- Types ---

interface HealthData {
  status: string
  database: string
  redis: string
  services: Record<string, string>
}

interface ViewerData {
  viewers: number
}

type ServiceState = 'healthy' | 'unhealthy' | 'down' | 'unknown' | 'loading'

// --- Helpers ---

const POLL_INTERVAL = 30_000

function stateToLabel(state: ServiceState): string {
  const map: Record<ServiceState, string> = {
    healthy: 'Operational',
    unhealthy: 'Degraded',
    down: 'Down',
    unknown: 'Unknown',
    loading: 'Checking...',
  }
  return map[state]
}

function overallLabel(health: HealthData | null): string {
  if (!health) return 'Checking...'
  if (health.status === 'healthy') return 'All Systems Operational'
  if (health.status === 'degraded') return 'Partial Degradation'
  return 'Major Outage'
}

function overallAccent(health: HealthData | null): string {
  if (!health) return 'text-base-content/40'
  if (health.status === 'healthy') return 'text-success'
  if (health.status === 'degraded') return 'text-warning'
  return 'text-error'
}

// --- Component ---

function StatusPage() {
  usePageMeta({
    title: 'System Status — Scrollr',
    description:
      'Live system status for the Scrollr platform. Monitor infrastructure, ingestion workers, and API health.',
  })

  const [health, setHealth] = useState<HealthData | null>(null)
  const [viewers, setViewers] = useState<number | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const [healthRes, viewerRes] = await Promise.allSettled([
        fetch(`${API_BASE}/health`),
        fetch(`${API_BASE}/events/count`),
      ])

      if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
        const data: HealthData = await healthRes.value.json()
        setHealth(data)
        setFetchError(false)
      } else {
        setFetchError(true)
      }

      if (viewerRes.status === 'fulfilled' && viewerRes.value.ok) {
        const data: ViewerData = await viewerRes.value.json()
        setViewers(data.viewers)
      }

      setLastChecked(new Date())
    } catch {
      setFetchError(true)
      setLastChecked(new Date())
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    intervalRef.current = setInterval(fetchHealth, POLL_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchHealth])

  // Derive service states
  const dbState: ServiceState = !health
    ? 'loading'
    : health.database === 'healthy'
      ? 'healthy'
      : 'unhealthy'
  const redisState: ServiceState = !health
    ? 'loading'
    : health.redis === 'healthy'
      ? 'healthy'
      : 'unhealthy'
  const financeState: ServiceState = !health
    ? 'loading'
    : ((health.services.finance || 'unknown') as ServiceState)
  const sportsState: ServiceState = !health
    ? 'loading'
    : ((health.services.sports || 'unknown') as ServiceState)
  const yahooState: ServiceState = !health
    ? 'loading'
    : ((health.services.yahoo || 'unknown') as ServiceState)

  return (
    <motion.div
      className="min-h-screen pt-20"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero */}
      <section className="relative pt-24 pb-16 overflow-hidden border-b border-base-300 bg-base-200/30">
        <div className="container relative z-10">
          <motion.div className="max-w-4xl" variants={itemVariants}>
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-md border border-primary/20 uppercase tracking-[0.2em] flex items-center gap-2">
                <Radio size={14} /> live_monitor
              </span>
              <span className="h-px w-12 bg-base-300" />
              <span className="text-[10px] font-mono text-base-content/30 uppercase">
                Auto-refresh: {POLL_INTERVAL / 1000}s
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight uppercase mb-6 leading-none">
              System
              <br />
              <span className={overallAccent(health)}>Status</span>
            </h1>

            <div className="flex items-center gap-4">
              <OverallBadge health={health} fetchError={fetchError} />
              {lastChecked && (
                <span className="text-[10px] font-mono text-base-content/30 flex items-center gap-1.5">
                  <Clock size={10} />
                  Last checked:{' '}
                  {lastChecked.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Status Grid */}
      <section className="container py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Infrastructure */}
          <motion.div
            className="bg-base-200 border border-base-300 rounded-xl p-8"
            variants={itemVariants}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-8 flex items-center gap-2">
              <Database size={16} /> Infrastructure
            </h2>
            <div className="space-y-4">
              <ServiceRow
                name="PostgreSQL"
                description="Primary data store + CDC source"
                state={dbState}
              />
              <ServiceRow
                name="Redis"
                description="Cache, Pub/Sub, token storage"
                state={redisState}
              />
            </div>
          </motion.div>

          {/* Ingestion Workers */}
          <motion.div
            className="bg-base-200 border border-base-300 rounded-xl p-8"
            variants={itemVariants}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-8 flex items-center gap-2">
              <Server size={16} /> Ingestion Workers
            </h2>
            <div className="space-y-4">
              <ServiceRow
                name="Finance Service"
                description="Finnhub WebSocket — real-time market data"
                state={financeState}
                port={3001}
              />
              <ServiceRow
                name="Sports Service"
                description="ESPN API — scores polling every 1 min"
                state={sportsState}
                port={3002}
              />
              <ServiceRow
                name="Yahoo Service"
                description="Yahoo Fantasy — active user sync"
                state={yahooState}
                port={3003}
              />
            </div>
          </motion.div>
        </div>

        {/* Metrics Strip */}
        <motion.div
          className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4"
          variants={itemVariants}
        >
          <MetricCard
            icon={<Users size={18} />}
            label="SSE Viewers"
            value={viewers !== null ? String(viewers) : '--'}
            sublabel="Active connections"
          />
          <MetricCard
            icon={<Zap size={18} />}
            label="API Status"
            value={fetchError ? 'Unreachable' : 'Online'}
            sublabel={fetchError ? 'Cannot reach API' : 'Accepting requests'}
            error={fetchError}
          />
          <MetricCard
            icon={<Activity size={18} />}
            label="Overall"
            value={
              !health
                ? 'Checking'
                : health.status === 'healthy'
                  ? 'Healthy'
                  : 'Degraded'
            }
            sublabel={overallLabel(health)}
            error={health !== null && health.status !== 'healthy'}
          />
        </motion.div>

        {/* Links */}
        <motion.div
          className="mt-12 flex flex-wrap gap-4"
          variants={itemVariants}
        >
          <ExternalLink
            href={`${API_BASE}/swagger/index.html`}
            label="API Documentation"
          />
          <ExternalLink href={`${API_BASE}/health`} label="Health JSON" />
          <ExternalLink href={`${API_BASE}/`} label="API Root" />
        </motion.div>
      </section>
    </motion.div>
  )
}

// --- Sub-components ---

function OverallBadge({
  health,
  fetchError,
}: {
  health: HealthData | null
  fetchError: boolean
}) {
  if (fetchError) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-error/10 border border-error/20">
        <XCircle size={16} className="text-error" />
        <span className="text-xs font-bold uppercase tracking-wider text-error">
          API Unreachable
        </span>
      </div>
    )
  }

  if (!health) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-base-300 border border-base-300">
        <div className="h-3 w-3 rounded-full bg-base-content/20 animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-wider text-base-content/40">
          Checking systems...
        </span>
      </div>
    )
  }

  const isHealthy = health.status === 'healthy'

  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-2 rounded-lg border ${
        isHealthy
          ? 'bg-success/10 border-success/20'
          : 'bg-warning/10 border-warning/20'
      }`}
    >
      {isHealthy ? (
        <CheckCircle2 size={16} className="text-success" />
      ) : (
        <ShieldAlert size={16} className="text-warning" />
      )}
      <span
        className={`text-xs font-bold uppercase tracking-wider ${isHealthy ? 'text-success' : 'text-warning'}`}
      >
        {overallLabel(health)}
      </span>
    </div>
  )
}

function ServiceRow({
  name,
  description,
  state,
  port,
}: {
  name: string
  description: string
  state: ServiceState
  port?: number
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-base-300/50 rounded-lg group hover:bg-base-300/80 transition-colors">
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-base-content">{name}</span>
          {port && (
            <span className="text-[9px] font-mono text-base-content/20 bg-base-200 px-1.5 py-0.5 rounded">
              :{port}
            </span>
          )}
        </div>
        <p className="text-[10px] font-mono text-base-content/30 mt-0.5 truncate">
          {description}
        </p>
      </div>
      <StatusIndicator state={state} />
    </div>
  )
}

function StatusIndicator({ state }: { state: ServiceState }) {
  const config: Record<
    ServiceState,
    { dot: string; text: string; ping?: boolean }
  > = {
    healthy: { dot: 'bg-success', text: 'text-success', ping: true },
    unhealthy: { dot: 'bg-warning', text: 'text-warning' },
    down: { dot: 'bg-error', text: 'text-error' },
    unknown: { dot: 'bg-base-content/20', text: 'text-base-content/30' },
    loading: { dot: 'bg-base-content/20', text: 'text-base-content/30' },
  }

  const { dot, text, ping } = config[state]

  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <span className="relative flex h-2 w-2">
        {ping && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-50 ${dot}`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${dot} ${state === 'loading' ? 'animate-pulse' : ''}`}
        />
      </span>
      <span
        className={`text-[10px] font-bold uppercase tracking-wider ${text}`}
      >
        {stateToLabel(state)}
      </span>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  sublabel,
  error = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sublabel: string
  error?: boolean
}) {
  return (
    <div className="bg-base-200 border border-base-300 rounded-xl p-6 flex items-start gap-4">
      <div
        className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border ${
          error
            ? 'bg-warning/10 border-warning/20 text-warning'
            : 'bg-primary/10 border-primary/20 text-primary'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-widest text-base-content/30 mb-1">
          {label}
        </p>
        <p
          className={`text-lg font-black uppercase tracking-tight ${error ? 'text-warning' : 'text-base-content'}`}
        >
          {value}
        </p>
        <p className="text-[10px] font-mono text-base-content/20 mt-0.5">
          {sublabel}
        </p>
      </div>
    </div>
  )
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-base-200 border border-base-300 text-sm text-base-content/50 hover:text-primary hover:border-primary/30 transition-colors cursor-pointer"
    >
      <Globe size={14} />
      {label}
      <ArrowUpRight size={12} className="opacity-50" />
    </motion.a>
  )
}
