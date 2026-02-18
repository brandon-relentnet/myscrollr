import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  Gauge,
  Loader2,
  Minus,
  Rocket,
  Satellite,
  Shield,
  Signal,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react'

import { usePageMeta } from '@/lib/usePageMeta'
import { useScrollrAuth } from '@/hooks/useScrollrAuth'
import { useGetToken } from '@/hooks/useGetToken'
import { billingApi } from '@/api/client'

const CheckoutForm = lazy(() => import('@/components/billing/CheckoutForm'))

// ── Price IDs (from Stripe) ────────────────────────────────────
const PRICE_IDS = {
  monthly: 'price_1T0AvUC2uHc0J8jttIKY5r6t',
  quarterly: 'price_1T0AvXC2uHc0J8jthRuaI9s4',
  annual: 'price_1T0AvbC2uHc0J8jtZKPVzdd9',
} as const

type PlanKey = keyof typeof PRICE_IDS

export const Route = createFileRoute('/uplink')({
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: (search.session_id as string) || undefined,
  }),
  component: UplinkPage,
})

// ── Comparison Data ─────────────────────────────────────────────

interface ComparisonRow {
  label: string
  free: string
  uplink: string
  upgraded?: boolean
}

const COMPARISON: ComparisonRow[] = [
  {
    label: 'Data Delivery',
    free: '30s polling',
    uplink: 'Real-time',
    upgraded: true,
  },
  {
    label: 'Tracked Symbols',
    free: '10 symbols',
    uplink: 'Unlimited',
    upgraded: true,
  },
  {
    label: 'RSS Feeds',
    free: '15 feeds',
    uplink: 'Unlimited',
    upgraded: true,
  },
  {
    label: 'Custom RSS Feeds',
    free: '3 custom',
    uplink: 'Unlimited',
    upgraded: true,
  },
  {
    label: 'Sports Leagues',
    free: 'Pro leagues',
    uplink: 'Pro + College',
    upgraded: true,
  },
  {
    label: 'Fantasy Leagues',
    free: '1 league',
    uplink: 'Unlimited',
    upgraded: true,
  },
  {
    label: 'Site Filter Mode',
    free: 'Blacklist',
    uplink: 'Blacklist + Whitelist',
    upgraded: true,
  },
  {
    label: 'Dashboard Access',
    free: 'Full',
    uplink: 'Full',
  },
]

// ── Feature Cards ───────────────────────────────────────────────

interface Feature {
  icon: React.ReactNode
  title: string
  description: string
  accent: string
}

const FEATURES: Feature[] = [
  {
    icon: <Gauge size={20} />,
    title: 'Every Stream, Maxed',
    description:
      'Track every symbol, subscribe to every feed, follow every league. Your feed, fully loaded.',
    accent: 'from-primary/20 to-primary/0',
  },
  {
    icon: <Zap size={20} />,
    title: 'Real-time Pipeline',
    description:
      'Instant data delivery via CDC push. No polling, no delays — your feed updates the moment the data changes.',
    accent: 'from-info/20 to-info/0',
  },
  {
    icon: <Shield size={20} />,
    title: 'Early Access',
    description:
      'First to test new integrations and features before they go live. Help shape the roadmap.',
    accent: 'from-accent/20 to-accent/0',
  },
  {
    icon: <Signal size={20} />,
    title: 'Extended Retention',
    description:
      'Longer data retention windows for historical lookback on trades, scores, and articles.',
    accent: 'from-secondary/20 to-secondary/0',
  },
]

// ── Terminal Lines ──────────────────────────────────────────────

const TERMINAL_LINES = [
  { prompt: true, text: 'scrollr uplink --status' },
  { label: 'SIGNAL', value: 'LOCKED', valueClass: 'text-primary' },
  { label: 'TIER', value: 'UPLINK', valueClass: 'text-primary' },
  { label: 'STATUS', value: 'ACTIVE', valueClass: 'text-success' },
  { label: 'MONTHLY', value: '$8.99/mo', valueClass: 'text-base-content/50' },
  {
    label: 'QUARTERLY',
    value: '$21.99/3mo',
    valueClass: 'text-base-content/50',
  },
  { label: 'ANNUAL', value: '$69.99/yr', valueClass: 'text-primary/60' },
  {
    label: 'LIFETIME',
    value: '$549 (128 slots)',
    valueClass: 'text-warning/60',
  },
  { label: 'FREE_TIER', value: 'ALWAYS_FREE', valueClass: 'text-success/70' },
  { prompt: true, text: 'scrollr uplink subscribe --plan annual' },
  {
    label: '→',
    value: 'Checkout session created. Redirecting...',
    valueClass: 'text-primary/50',
  },
]

// ── Animated Counter ────────────────────────────────────────────

function AnimatedNumber({
  target,
  duration = 1.5,
}: {
  target: number
  duration?: number
}) {
  const count = useMotionValue(0)
  const rounded = useTransform(count, (v) => Math.floor(v))
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const controls = animate(count, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    })
    const unsub = rounded.on('change', (v) => setDisplay(v))
    return () => {
      controls.stop()
      unsub()
    }
  }, [target, duration, count, rounded])

  return <span>{display}</span>
}

// ── Signal Bars ─────────────────────────────────────────────────

function SignalBars() {
  return (
    <div className="flex items-end gap-[3px]" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-primary origin-bottom"
          style={{ height: 4 + i * 4 }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{
            delay: 0.8 + i * 0.12,
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}
    </div>
  )
}

// ── Terminal With Typing Effect ─────────────────────────────────

function TerminalBlock() {
  const [visibleLines, setVisibleLines] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasStarted = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted.current) {
          hasStarted.current = true
          let i = 0
          const interval = setInterval(() => {
            i++
            setVisibleLines(i)
            if (i >= TERMINAL_LINES.length + 1) clearInterval(interval)
          }, 180)
        }
      },
      { threshold: 0.3 },
    )
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl border border-base-300/60 bg-base-100/80 backdrop-blur-sm"
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Terminal chrome */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-base-300/40 bg-base-200/60">
        <span className="w-2.5 h-2.5 rounded-full bg-error/40" />
        <span className="w-2.5 h-2.5 rounded-full bg-warning/40" />
        <span className="w-2.5 h-2.5 rounded-full bg-success/40" />
        <span className="ml-3 text-[9px] font-mono text-base-content/20">
          uplink_status.sh
        </span>
      </div>

      <div className="p-6 md:p-8 font-mono text-sm space-y-2">
        {TERMINAL_LINES.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={i < visibleLines ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {'prompt' in line && line.prompt ? (
              <div className="flex items-center gap-2 mt-2 first:mt-0">
                <span className="text-primary/40 select-none">$</span>
                <span className="text-base-content/60">{line.text}</span>
              </div>
            ) : (
              <div className="pl-5 text-xs">
                <span className="text-primary/60">
                  {'label' in line ? line.label : ''}
                </span>{' '}
                <span
                  className={
                    'valueClass' in line ? (line.valueClass ?? '') : ''
                  }
                >
                  {'value' in line ? line.value : ''}
                </span>
              </div>
            )}
          </motion.div>
        ))}

        {/* Blinking cursor */}
        {visibleLines > TERMINAL_LINES.length && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 mt-2"
          >
            <span className="text-primary/40 select-none">$</span>
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="w-2 h-4 bg-primary/40 inline-block"
            />
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ── Page Component ──────────────────────────────────────────────

function UplinkPage() {
  usePageMeta({
    title: 'Uplink — Scrollr',
    description:
      'Total coverage for power users. Scrollr Uplink gives you unlimited tracking, real-time data delivery, and early access to new integrations.',
  })

  const { isAuthenticated, signIn } = useScrollrAuth()
  const getToken = useGetToken()
  const navigate = useNavigate()
  const { session_id } = Route.useSearch()

  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [checkingSession, setCheckingSession] = useState(false)

  // Handle return from Stripe checkout via ?session_id=
  useEffect(() => {
    if (!session_id) return
    setCheckingSession(true)
    billingApi
      .getCheckoutReturn(session_id, getToken)
      .then((res) => {
        if (res.status === 'complete') {
          setCheckoutSuccess(true)
        }
      })
      .catch(() => {
        // Session check failed — not critical, user can check account
      })
      .finally(() => {
        setCheckingSession(false)
        // Clean the URL
        navigate({ to: '/uplink', search: { session_id: undefined }, replace: true })
      })
  }, [session_id, getToken, navigate])

  const handleSelectPlan = (plan: PlanKey) => {
    if (!isAuthenticated) {
      signIn(window.location.origin + '/uplink')
      return
    }
    setSelectedPlan(plan)
    setShowCheckout(true)
  }

  const handleCloseCheckout = () => {
    setShowCheckout(false)
    setSelectedPlan(null)
  }

  return (
    <div className="min-h-screen pt-20">
      {/* ── Checkout Modal ──────────────────────────────────── */}
      {showCheckout && selectedPlan && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          }
        >
          <CheckoutForm
            priceId={PRICE_IDS[selectedPlan]}
            getToken={getToken}
            onClose={handleCloseCheckout}
          />
        </Suspense>
      )}

      {/* ── Checkout Success Banner ─────────────────────────── */}
      {checkoutSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-40 px-6 py-4 bg-success/10 border border-success/30 rounded-lg backdrop-blur-sm flex items-center gap-3"
        >
          <CheckCircle2 size={18} className="text-success" />
          <div>
            <p className="text-xs font-bold text-success">
              Uplink Activated
            </p>
            <p className="text-[10px] text-base-content/40">
              Your subscription is active. Welcome to total coverage.
            </p>
          </div>
          <button
            onClick={() => setCheckoutSuccess(false)}
            className="ml-4 text-base-content/30 hover:text-base-content/60 transition-colors text-xs"
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* ── Session Checking Indicator ──────────────────────── */}
      {checkingSession && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 px-6 py-3 bg-base-200/90 border border-base-content/10 rounded-lg backdrop-blur-sm flex items-center gap-3">
          <Loader2 size={14} className="animate-spin text-primary" />
          <span className="text-[10px] text-base-content/40">
            Confirming payment...
          </span>
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-28 overflow-hidden">
        {/* Layered background system */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Fine dot matrix */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(52, 211, 153, 0.5) 1px, transparent 0)`,
              backgroundSize: '24px 24px',
            }}
          />

          {/* Primary orbital glow */}
          <motion.div
            className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(52, 211, 153, 0.06) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1, 1.08, 1],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Secondary glow */}
          <motion.div
            className="absolute bottom-[-30%] left-[-10%] w-[600px] h-[600px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(0, 212, 255, 0.04) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1.08, 1, 1.08],
              opacity: [0.4, 0.7, 0.4],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Scan line */}
          <motion.div
            className="absolute w-full h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent"
            initial={{ y: -100 }}
            animate={{ y: ['-10%', '110%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        {/* Top border accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        <div className="container relative z-10 !py-0">
          {/* Badge row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-4 mb-10"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/8 text-primary text-[10px] font-bold rounded-lg border border-primary/15 uppercase tracking-wide">
              <Satellite size={12} />
              uplink
            </span>
            <span className="h-px w-16 bg-gradient-to-r from-base-300 to-transparent" />
            <span className="text-[10px] text-base-content/25 flex items-center gap-3">
              power tier
              <SignalBars />
            </span>
          </motion.div>

          {/* Headline */}
          <div className="max-w-5xl">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                delay: 0.15,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tight leading-[0.85] mb-8"
            >
              Total
              <br />
              <span className="relative inline-block">
                <span className="text-primary">Coverage</span>
                {/* Underline accent */}
                <motion.span
                  className="absolute -bottom-2 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-primary/60 to-transparent origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{
                    duration: 0.8,
                    delay: 0.8,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.35,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="flex items-start gap-3 mb-12 max-w-xl"
            >
              <span className="text-primary/30 font-mono text-sm mt-0.5 select-none shrink-0">
                $
              </span>
              <p className="text-base text-base-content/40 leading-relaxed">
                Scrollr is free and open source. Uplink is for power users who
                want more — every symbol, every feed, every league, and
                real-time data delivery.
              </p>
            </motion.div>

            {/* CTA row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="flex flex-wrap items-center gap-5"
            >
              <div className="relative group">
                <motion.div
                  className="absolute -inset-1 bg-primary/15 rounded-lg blur-lg"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleSelectPlan('annual')}
                  className="relative inline-flex items-center gap-2.5 px-7 py-3.5 text-[11px] font-semibold border border-primary/30 text-primary bg-primary/5 rounded-lg hover:bg-primary/10 hover:border-primary/50 transition-colors backdrop-blur-sm cursor-pointer"
                >
                  <Rocket size={14} />
                  Get Uplink
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="h-px w-6 bg-base-300/50" />
                <span className="text-[10px] font-mono text-base-content/20">
                  Starting at $5.83/mo
                </span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />
      </section>

      {/* ── COMPARISON TABLE ─────────────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
              <TrendingUp size={16} /> Free vs Uplink
            </h2>
            <p className="text-[10px] text-base-content/30">
              Everything in Free, plus full bandwidth
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-xl border border-base-300/60 bg-base-200/40 backdrop-blur-sm"
          >
            {/* Table Header */}
            <div className="grid grid-cols-3 border-b border-base-300/60 bg-base-200/60">
              <div className="p-4 pl-6">
                <span className="text-[9px] text-base-content/30 uppercase tracking-wide">
                  Feature
                </span>
              </div>
              <div className="p-4 text-center border-l border-base-300/30">
                <span className="text-[10px] font-bold uppercase tracking-wide text-base-content/40">
                  Free
                </span>
              </div>
              <div className="p-4 text-center border-l border-primary/10 bg-primary/[0.03]">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary flex items-center justify-center gap-1.5">
                  <Crown size={12} /> Uplink
                </span>
              </div>
            </div>

            {/* Table Rows */}
            {COMPARISON.map((row, i) => (
              <motion.div
                key={row.label}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04, duration: 0.4, ease: 'easeOut' }}
                className={`grid grid-cols-3 ${i < COMPARISON.length - 1 ? 'border-b border-base-300/30' : ''} group hover:bg-base-200/30 transition-colors`}
              >
                <div className="p-4 pl-6 flex items-center">
                  <span className="text-xs text-base-content/60 font-medium">
                    {row.label}
                  </span>
                </div>
                <div className="p-4 flex items-center justify-center border-l border-base-300/30">
                  <span className="text-xs font-mono text-base-content/30">
                    {row.free}
                  </span>
                </div>
                <div className="p-4 flex items-center justify-center border-l border-primary/10 bg-primary/[0.02]">
                  {row.upgraded ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold font-mono text-primary/90">
                      <Check size={12} className="text-primary" />
                      {row.uplink}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-base-content/30">
                      <Minus size={10} className="text-base-content/20" />
                      {row.uplink}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Table Footer */}
            <div className="border-t border-base-300/40 bg-base-200/40 p-4 text-center">
              <span className="text-[9px] text-base-content/20">
                Per-account &middot; Free tier always included &middot; Upgrade
                anytime
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURE GRID ─────────────────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
              <Zap size={16} /> What You Get
            </h2>
            <p className="text-[10px] text-base-content/30">
              The full power-user experience
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.08,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                whileHover={{
                  y: -3,
                  transition: { type: 'tween', duration: 0.2 },
                }}
                className="group bg-base-200/50 border border-base-300/50 rounded-xl p-6 hover:border-primary/20 transition-colors relative overflow-hidden"
              >
                {/* Gradient accent on hover */}
                <div
                  className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b ${feature.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
                />

                {/* Top accent line */}
                <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary/0 group-hover:via-primary/20 to-transparent transition-all duration-500" />

                <div className="relative z-10">
                  <div className="h-10 w-10 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center text-primary mb-5 group-hover:border-primary/30 transition-colors">
                    {feature.icon}
                  </div>

                  <h3 className="text-sm font-bold text-base-content mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-base-content/30 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
              <Crown size={16} /> Pricing
            </h2>
            <p className="text-[10px] text-base-content/30">
              Flexible billing — pick what works for you
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {/* ─── Monthly ─── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{
                y: -3,
                transition: { type: 'tween', duration: 0.2 },
              }}
              onClick={() => handleSelectPlan('monthly')}
              className="group bg-base-200/40 border border-base-300/50 rounded-xl p-6 hover:border-base-300 transition-colors relative overflow-hidden cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-base-content/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div className="h-9 w-9 rounded-lg bg-base-300/50 border border-base-300/50 flex items-center justify-center text-base-content/40">
                    <Clock size={18} />
                  </div>
                  <span className="text-[9px] text-base-content/25 uppercase tracking-wide">
                    Flexible
                  </span>
                </div>

                <h3 className="text-sm font-bold text-base-content mb-1">
                  Monthly
                </h3>
                <p className="text-[10px] text-base-content/25 mb-4">
                  Cancel anytime
                </p>

                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-3xl font-black text-base-content tracking-tight">
                    $8.99
                  </span>
                  <span className="text-xs font-mono text-base-content/25">
                    / month
                  </span>
                </div>
                <p className="text-[10px] text-base-content/20 mb-5">
                  No commitment
                </p>

                <div className="space-y-2.5">
                  <PricingFeature>Full Uplink access</PricingFeature>
                  <PricingFeature>Real-time data delivery</PricingFeature>
                  <PricingFeature>All integrations maxed</PricingFeature>
                </div>

                <button
                  type="button"
                  className="mt-5 w-full py-2.5 text-[10px] font-semibold border border-base-content/15 text-base-content/50 rounded-lg hover:border-base-content/30 hover:text-base-content/70 transition-colors"
                >
                  Select Monthly
                </button>
              </div>
            </motion.div>

            {/* ─── Quarterly ─── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.06,
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={{
                y: -3,
                transition: { type: 'tween', duration: 0.2 },
              }}
              onClick={() => handleSelectPlan('quarterly')}
              className="group bg-base-200/40 border border-base-300/50 rounded-xl p-6 hover:border-info/20 transition-colors relative overflow-hidden cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-info/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div className="h-9 w-9 rounded-lg bg-info/8 border border-info/15 flex items-center justify-center text-info/70">
                    <Rocket size={18} />
                  </div>
                  <span className="text-[9px] text-info/50 uppercase tracking-wide">
                    Save 18%
                  </span>
                </div>

                <h3 className="text-sm font-bold text-base-content mb-1">
                  Quarterly
                </h3>
                <p className="text-[10px] text-base-content/25 mb-4">
                  3-month access
                </p>

                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-3xl font-black text-base-content tracking-tight">
                    $21.99
                  </span>
                  <span className="text-xs font-mono text-base-content/25">
                    / 3 months
                  </span>
                </div>
                <p className="text-[10px] font-mono text-base-content/20 mb-5">
                  ~$7.33/mo
                </p>

                <div className="space-y-2.5">
                  <PricingFeature>Full Uplink access</PricingFeature>
                  <PricingFeature>Real-time data delivery</PricingFeature>
                  <PricingFeature>All integrations maxed</PricingFeature>
                </div>

                <button
                  type="button"
                  className="mt-5 w-full py-2.5 text-[10px] font-semibold border border-info/20 text-info/60 rounded-lg hover:border-info/40 hover:text-info/80 transition-colors"
                >
                  Select Quarterly
                </button>
              </div>
            </motion.div>

            {/* ─── Annual — THE ONE ─── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.12,
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={{
                y: -4,
                transition: { type: 'tween', duration: 0.2 },
              }}
              onClick={() => handleSelectPlan('annual')}
              className="group relative rounded-xl overflow-hidden cursor-pointer"
            >
              {/* Outer glow */}
              <motion.div
                className="absolute -inset-px rounded-xl bg-gradient-to-b from-primary/30 via-primary/10 to-primary/5"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              <div className="relative bg-base-200/80 backdrop-blur-sm p-6 border border-primary/20 rounded-xl">
                {/* Ambient gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] to-transparent pointer-events-none" />

                {/* Best value badge */}
                <div className="absolute top-0 right-0">
                  <div className="bg-primary text-primary-content text-[8px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-bl-lg">
                    Best Value
                  </div>
                </div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <Star size={18} />
                    </div>
                    <span className="text-[9px] text-primary/60 uppercase tracking-wide">
                      Save 35%
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-base-content mb-1">
                    Annual
                  </h3>
                  <p className="text-[10px] text-primary/40 mb-4">
                    12-month access
                  </p>

                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-3xl font-black text-base-content tracking-tight">
                      $69.99
                    </span>
                    <span className="text-xs font-mono text-base-content/25">
                      / year
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-primary/40 mb-5">
                    ~$5.83/mo
                  </p>

                  <div className="space-y-2.5">
                    <PricingFeature highlight>
                      Real-time data delivery
                    </PricingFeature>
                    <PricingFeature highlight>
                      All integrations maxed
                    </PricingFeature>
                    <PricingFeature highlight>
                      Early access to features
                    </PricingFeature>
                    <PricingFeature highlight>Priority support</PricingFeature>
                  </div>

                  <button
                    type="button"
                    className="mt-5 w-full py-2.5 text-[10px] font-semibold bg-primary/10 border border-primary/30 text-primary rounded-lg hover:bg-primary/20 hover:border-primary/50 transition-colors"
                  >
                    Get Annual — Best Value
                  </button>
                </div>
              </div>
            </motion.div>

            {/* ─── Lifetime — The First Byte ─── */}
            <Link to="/uplink/lifetime" search={{ session_id: undefined }} className="block">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: 0.18,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                whileHover={{
                  y: -3,
                  transition: { type: 'tween', duration: 0.2 },
                }}
                className="group bg-base-200/40 border border-base-300/50 rounded-xl p-6 hover:border-warning/20 transition-colors relative overflow-hidden cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-warning/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    <div className="h-9 w-9 rounded-lg bg-warning/8 border border-warning/15 flex items-center justify-center text-warning/70">
                      <Sparkles size={18} />
                    </div>
                    <span className="text-[9px] text-warning/50 uppercase tracking-wide">
                      Limited
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-base-content mb-1">
                    Lifetime
                  </h3>
                  <p className="text-[10px] text-warning/40 mb-4">
                    The First Byte
                  </p>

                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-3xl font-black text-base-content tracking-tight">
                      $549
                    </span>
                    <span className="text-xs font-mono text-base-content/25">
                      / forever
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-warning/40 mb-3">
                    Only 128 available — 0x00 to 0x7F
                  </p>

                  {/* Slot counter */}
                  <div className="mb-5 p-3 rounded-xl bg-base-100/60 border border-base-300/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] text-base-content/25 uppercase tracking-wide">
                        Slots
                      </span>
                      <span className="text-[9px] font-mono text-warning/50">
                        <AnimatedNumber target={128} duration={2} /> / 128
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-base-300/50 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-warning/60 to-primary/60 origin-left"
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={{
                          duration: 1.5,
                          delay: 0.3,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <PricingFeature>Everything in Annual</PricingFeature>
                    <PricingFeature>Permanent access</PricingFeature>
                    <PricingFeature>Founding member status</PricingFeature>
                  </div>

                  <button
                    type="button"
                    className="mt-5 w-full py-2.5 text-[10px] font-semibold border border-warning/20 text-warning/60 rounded-lg hover:border-warning/40 hover:text-warning/80 transition-colors"
                  >
                    View Lifetime →
                  </button>
                </div>
              </motion.div>
            </Link>
          </div>

          {/* Pricing footer */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-8 text-center"
          >
            <p className="text-[9px] text-base-content/20">
              All plans include the full free tier &middot; Cancel anytime
              &middot; Payments via Stripe
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── TERMINAL BLOCK ───────────────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <TerminalBlock />
          </motion.div>
        </div>
      </section>

      {/* ── BOTTOM CTA ──────────────────────────────────────── */}
      <section className="relative">
        <div className="container pb-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-xl bg-base-200/40 border border-base-300/50 backdrop-blur-sm"
          >
            {/* Background layers */}
            <div className="absolute inset-0 pointer-events-none">
              <motion.div
                className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(52, 211, 153, 0.05) 0%, transparent 70%)',
                }}
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <div
                className="absolute inset-0 opacity-[0.015]"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px)
                  `,
                  backgroundSize: '40px 40px',
                }}
              />
            </div>

            <div className="relative z-10 p-10 md:p-16 lg:p-20 text-center max-w-3xl mx-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-lg bg-primary/8 border border-primary/15"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                <span className="text-[10px] uppercase tracking-wide text-primary">
                  Available Now
                </span>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: 0.1,
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-6 leading-[0.95]"
              >
                Scrollr is <span className="text-primary">free forever</span>
                <br />
                <span className="text-base-content/60">
                  Uplink is for those who want more
                </span>
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: 0.2,
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="text-sm text-base-content/35 leading-relaxed mb-10 max-w-lg mx-auto"
              >
                The core platform stays open source and always free. Uplink
                unlocks real-time delivery and total coverage across every
                integration.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: 0.3,
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex flex-wrap items-center justify-center gap-4"
              >
                <button
                  type="button"
                  onClick={() => handleSelectPlan('annual')}
                  className="inline-flex items-center gap-2 px-6 py-3 text-[10px] font-semibold text-primary border border-primary/30 rounded-lg bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <Rocket size={12} /> Get Uplink — $5.83/mo
                </button>
                <span className="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-base-content/25 border border-base-300/30 rounded-lg">
                  <ChevronRight size={12} /> Free tier always included
                </span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

// ── Pricing Feature Line ──────────────────────────────────────────

function PricingFeature({
  children,
  highlight,
}: {
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Check
        size={12}
        className={
          highlight ? 'text-primary shrink-0' : 'text-base-content/20 shrink-0'
        }
      />
      <span
        className={`text-xs ${highlight ? 'text-base-content/60' : 'text-base-content/35'}`}
      >
        {children}
      </span>
    </div>
  )
}
