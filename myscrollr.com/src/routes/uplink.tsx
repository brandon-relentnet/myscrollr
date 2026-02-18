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

// ── Signature easing (matches homepage) ────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const

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
  Icon: typeof Gauge
  title: string
  description: string
  hex: string
}

const FEATURES: Feature[] = [
  {
    Icon: Gauge,
    title: 'Every Stream, Maxed',
    description:
      'Track every symbol, subscribe to every feed, follow every league. Your feed, fully loaded.',
    hex: '#34d399',
  },
  {
    Icon: Zap,
    title: 'Real-time Pipeline',
    description:
      'Instant data delivery via CDC push. No polling, no delays — your feed updates the moment the data changes.',
    hex: '#00b8db',
  },
  {
    Icon: Shield,
    title: 'Early Access',
    description:
      'First to test new integrations and features before they go live. Help shape the roadmap.',
    hex: '#a855f7',
  },
  {
    Icon: Signal,
    title: 'Extended Retention',
    description:
      'Longer data retention windows for historical lookback on trades, scores, and articles.',
    hex: '#ff4757',
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
    label: '\u2192',
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
            ease: EASE,
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
            linear-gradient(var(--grid-line-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-line-color) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Watermark */}
      <Satellite
        size={120}
        strokeWidth={0.4}
        className="absolute -bottom-6 -right-6 text-base-content/[0.025] pointer-events-none"
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

// ── Page Component ──────────────────────────────────────────────

function UplinkPage() {
  usePageMeta({
    title: 'Uplink \u2014 Scrollr',
    description:
      'Total coverage for power users. Scrollr Uplink gives you unlimited tracking, real-time data delivery, and early access to new integrations.',
    canonicalUrl: 'https://myscrollr.com/uplink',
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
        navigate({
          to: '/uplink',
          search: { session_id: undefined },
          replace: true,
        })
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
            <p className="text-xs font-bold text-success">Uplink Activated</p>
            <p className="text-[10px] text-base-content/40">
              Your subscription is active. Welcome to total coverage.
            </p>
          </div>
          <button
            onClick={() => setCheckoutSuccess(false)}
            className="ml-4 text-base-content/30 hover:text-base-content/60 transition-colors text-xs"
          >
            \u2715
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

      {/* ================================================================
          HERO
          ================================================================ */}
      <section className="relative pt-32 pb-28 overflow-hidden">
        {/* Layered background system */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Fine dot matrix */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, var(--grid-dot-primary) 1px, transparent 0)`,
              backgroundSize: '24px 24px',
            }}
          />

          {/* Primary orbital glow */}
          <motion.div
            className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, var(--glow-primary-subtle) 0%, transparent 70%)',
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
                'radial-gradient(circle, var(--glow-info-subtle) 0%, transparent 70%)',
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
            transition={{ duration: 0.6, ease: EASE }}
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
              transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
              className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tight leading-[0.85] mb-8"
            >
              Total
              <br />
              <span className="relative inline-block">
                <span className="text-gradient-primary">Coverage</span>
                {/* Underline accent */}
                <motion.span
                  className="absolute -bottom-2 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-primary/60 to-transparent origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: 0.8, ease: EASE }}
                />
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35, ease: EASE }}
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
              transition={{ duration: 0.6, delay: 0.5, ease: EASE }}
              className="flex flex-wrap items-center gap-5"
            >
              <button
                type="button"
                onClick={() => handleSelectPlan('annual')}
                className="btn btn-pulse btn-lg gap-2.5"
              >
                <Rocket size={14} />
                Get Uplink
              </button>

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

      {/* ================================================================
          COMPARISON TABLE
          ================================================================ */}
      <section className="relative overflow-hidden">
        <div className="container">
          {/* Section header — homepage pattern */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Free vs <span className="text-gradient-primary">Uplink</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Everything in Free, plus full bandwidth
            </p>
          </motion.div>

          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="relative overflow-hidden rounded-xl border border-base-300/60 bg-base-200/40 backdrop-blur-sm"
          >
            {/* Top accent line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, #34d399 50%, transparent)',
              }}
            />

            {/* Watermark */}
            <TrendingUp
              size={140}
              strokeWidth={0.4}
              className="absolute -bottom-6 -right-6 text-base-content/[0.025] pointer-events-none"
            />

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
                style={{ opacity: 0 }}
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

      {/* ================================================================
          FEATURE GRID
          ================================================================ */}
      <section className="relative overflow-hidden">
        {/* Tinted background for visual separation */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

        <div className="container relative z-10">
          {/* Section header — homepage pattern */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              What You <span className="text-gradient-primary">Get</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              The full power-user experience
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5, ease: EASE }}
                whileHover={{
                  y: -3,
                  transition: { type: 'tween', duration: 0.2 },
                }}
                className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 hover:border-base-300/50 transition-colors overflow-hidden"
              >
                {/* Top accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${feature.hex} 50%, transparent)`,
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

                {/* Watermark icon */}
                <feature.Icon
                  size={80}
                  strokeWidth={0.4}
                  className="absolute -bottom-3 -right-3 text-base-content/[0.025] pointer-events-none"
                />

                {/* Ambient glow on hover */}
                <div
                  className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `${feature.hex}10` }}
                />

                <div className="relative z-10">
                  {/* Icon badge — DESIGN.md pattern */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                    style={{
                      background: `${feature.hex}15`,
                      boxShadow: `0 0 20px ${feature.hex}15, 0 0 0 1px ${feature.hex}20`,
                    }}
                  >
                    <feature.Icon size={20} className="text-base-content/80" />
                  </div>

                  <h3 className="text-sm font-bold text-base-content mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-base-content/40 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          PRICING
          ================================================================ */}
      <section className="relative overflow-hidden">
        <div className="container">
          {/* Section header — homepage pattern */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Pick Your <span className="text-gradient-primary">Plan</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Flexible billing — pick what works for you
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {/* ─── Monthly ─── */}
            <motion.div
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: EASE }}
              whileHover={{
                y: -3,
                transition: { type: 'tween', duration: 0.2 },
              }}
              role="button"
              tabIndex={0}
              aria-label="Select Monthly plan — $8.99 per month"
              onClick={() => handleSelectPlan('monthly')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectPlan('monthly')
                }
              }}
              className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 hover:border-base-300/50 transition-colors overflow-hidden cursor-pointer"
            >
              {/* Accent top line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />

              {/* Corner dot grid */}
              <div
                className="absolute top-0 right-0 w-16 h-16 opacity-[0.04] text-base-content"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, currentColor 1px, transparent 1px)',
                  backgroundSize: '8px 8px',
                }}
              />

              {/* Watermark */}
              <Clock
                size={100}
                strokeWidth={0.4}
                className="absolute -bottom-4 -right-4 text-base-content/[0.025] pointer-events-none"
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div className="h-9 w-9 rounded-lg bg-base-300/30 border border-base-300/40 flex items-center justify-center text-base-content/40">
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

                <div className="mt-5 w-full py-2.5 text-center text-[10px] font-semibold border border-base-content/15 text-base-content/50 rounded-lg group-hover:border-base-content/30 group-hover:text-base-content/70 transition-colors">
                  Select Monthly
                </div>
              </div>
            </motion.div>

            {/* ─── Quarterly ─── */}
            <motion.div
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.06, duration: 0.5, ease: EASE }}
              whileHover={{
                y: -3,
                transition: { type: 'tween', duration: 0.2 },
              }}
              role="button"
              tabIndex={0}
              aria-label="Select Quarterly plan — $21.99 per 3 months"
              onClick={() => handleSelectPlan('quarterly')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectPlan('quarterly')
                }
              }}
              className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 hover:border-base-300/50 transition-colors overflow-hidden cursor-pointer"
            >
              {/* Accent top line */}
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, #00b8db 50%, transparent)',
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

              {/* Watermark */}
              <Rocket
                size={100}
                strokeWidth={0.4}
                className="absolute -bottom-4 -right-4 text-base-content/[0.025] pointer-events-none"
              />

              {/* Ambient glow on hover */}
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-info/[0.06]" />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center"
                    style={{
                      background: '#00b8db15',
                      boxShadow: '0 0 20px #00b8db15, 0 0 0 1px #00b8db20',
                    }}
                  >
                    <Rocket size={18} className="text-base-content/80" />
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

                <div className="mt-5 w-full py-2.5 text-center text-[10px] font-semibold border border-info/20 text-info/60 rounded-lg group-hover:border-info/40 group-hover:text-info/80 transition-colors">
                  Select Quarterly
                </div>
              </div>
            </motion.div>

            {/* ─── Annual — THE ONE ─── */}
            <motion.div
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.12, duration: 0.5, ease: EASE }}
              whileHover={{
                y: -4,
                transition: { type: 'tween', duration: 0.2 },
              }}
              role="button"
              tabIndex={0}
              aria-label="Select Annual plan — $69.99 per year, best value"
              onClick={() => handleSelectPlan('annual')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectPlan('annual')
                }
              }}
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
                {/* Top accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, #34d399 50%, transparent)',
                  }}
                />

                {/* Ambient gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] to-transparent pointer-events-none rounded-xl" />

                {/* Corner dot grid */}
                <div
                  className="absolute top-0 right-0 w-20 h-20 opacity-[0.04] text-base-content"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, currentColor 1px, transparent 1px)',
                    backgroundSize: '8px 8px',
                  }}
                />

                {/* Watermark */}
                <Star
                  size={100}
                  strokeWidth={0.4}
                  className="absolute -bottom-4 -right-4 text-base-content/[0.025] pointer-events-none"
                />

                {/* Best value badge */}
                <div className="absolute top-0 right-0">
                  <div className="bg-primary text-primary-content text-[8px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-bl-lg">
                    Best Value
                  </div>
                </div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center"
                      style={{
                        background: '#34d39915',
                        boxShadow: '0 0 20px #34d39915, 0 0 0 1px #34d39920',
                      }}
                    >
                      <Star size={18} className="text-base-content/80" />
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

                  <div className="mt-5 w-full py-2.5 text-center text-[10px] font-semibold bg-primary/10 border border-primary/30 text-primary rounded-lg group-hover:bg-primary/20 group-hover:border-primary/50 transition-colors">
                    Get Annual — Best Value
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ─── Lifetime — The First Byte ─── */}
            <Link
              to="/uplink/lifetime"
              search={{ session_id: undefined }}
              className="block"
            >
              <motion.div
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.18, duration: 0.5, ease: EASE }}
                whileHover={{
                  y: -3,
                  transition: { type: 'tween', duration: 0.2 },
                }}
                className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 hover:border-warning/20 transition-colors overflow-hidden cursor-pointer"
              >
                {/* Accent top line */}
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, #f59e0b 50%, transparent)',
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

                {/* Watermark */}
                <Sparkles
                  size={100}
                  strokeWidth={0.4}
                  className="absolute -bottom-4 -right-4 text-base-content/[0.025] pointer-events-none"
                />

                {/* Ambient glow on hover */}
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-warning/[0.06]" />

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center"
                      style={{
                        background: '#f59e0b15',
                        boxShadow: '0 0 20px #f59e0b15, 0 0 0 1px #f59e0b20',
                      }}
                    >
                      <Sparkles size={18} className="text-base-content/80" />
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
                          ease: EASE,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <PricingFeature>Everything in Annual</PricingFeature>
                    <PricingFeature>Permanent access</PricingFeature>
                    <PricingFeature>Founding member status</PricingFeature>
                  </div>

                  <div className="mt-5 w-full py-2.5 text-center text-[10px] font-semibold border border-warning/20 text-warning/60 rounded-lg group-hover:border-warning/40 group-hover:text-warning/80 transition-colors flex items-center justify-center gap-1.5">
                    View Lifetime
                    <ChevronRight size={12} />
                  </div>
                </div>
              </motion.div>
            </Link>
          </div>

          {/* Pricing footer */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-8 text-center"
          >
            <p className="text-[9px] text-base-content/20">
              All plans include the full free tier &middot; Cancel anytime
              &middot; Payments via Stripe
            </p>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          TERMINAL BLOCK
          ================================================================ */}
      <section className="relative overflow-hidden">
        {/* Tinted background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

        <div className="container relative z-10">
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <TerminalBlock />
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          BOTTOM CTA
          ================================================================ */}
      <section className="relative overflow-hidden">
        <div className="container pb-8">
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="relative overflow-hidden rounded-2xl bg-base-200/40 border border-base-300/25 backdrop-blur-sm"
          >
            {/* Top accent line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, #34d399 50%, transparent)',
              }}
            />

            {/* Background layers */}
            <div className="absolute inset-0 pointer-events-none">
              <motion.div
                className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, var(--glow-primary-subtle) 0%, transparent 70%)',
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
                    linear-gradient(var(--grid-line-color) 1px, transparent 1px),
                    linear-gradient(90deg, var(--grid-line-color) 1px, transparent 1px)
                  `,
                  backgroundSize: '40px 40px',
                }}
              />
            </div>

            {/* Watermark */}
            <Satellite
              size={160}
              strokeWidth={0.4}
              className="absolute -bottom-8 -right-8 text-base-content/[0.025] pointer-events-none"
            />

            <div className="relative z-10 p-10 md:p-16 lg:p-20 text-center max-w-3xl mx-auto">
              <motion.div
                style={{ opacity: 0 }}
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
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1, duration: 0.6, ease: EASE }}
                className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-6 leading-[0.95]"
              >
                Scrollr is{' '}
                <span className="text-gradient-primary">free forever</span>
                <br />
                <span className="text-base-content/60">
                  Uplink is for those who want more
                </span>
              </motion.h2>

              <motion.p
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.6, ease: EASE }}
                className="text-sm text-base-content/35 leading-relaxed mb-10 max-w-lg mx-auto"
              >
                The core platform stays open source and always free. Uplink
                unlocks real-time delivery and total coverage across every
                integration.
              </motion.p>

              <motion.div
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.6, ease: EASE }}
                className="flex flex-wrap items-center justify-center gap-4"
              >
                <button
                  type="button"
                  onClick={() => handleSelectPlan('annual')}
                  className="btn btn-pulse gap-2"
                >
                  <Rocket size={12} /> Get Uplink — $5.83/mo
                </button>
                <span className="btn btn-outline btn-sm gap-2">
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
