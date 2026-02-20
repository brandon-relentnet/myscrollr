import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  animate,
} from 'motion/react'
import { AnimateNumber } from 'motion-plus/react'
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Crown,
  Gauge,
  Loader2,
  Minus,
  Rocket,
  Satellite,
  Signal,
  Sparkles,
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

// ── Price IDs (from Stripe via env vars) ───────────────────────
const UPLINK_PRICE_IDS = {
  monthly: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || '',
  quarterly: import.meta.env.VITE_STRIPE_PRICE_QUARTERLY || '',
  annual: import.meta.env.VITE_STRIPE_PRICE_ANNUAL || '',
} as const

const UNLIMITED_PRICE_IDS = {
  monthly: import.meta.env.VITE_STRIPE_PRICE_UNLIMITED_MONTHLY || '',
  quarterly: import.meta.env.VITE_STRIPE_PRICE_UNLIMITED_QUARTERLY || '',
  annual: import.meta.env.VITE_STRIPE_PRICE_UNLIMITED_ANNUAL || '',
} as const

type PlanKey = 'monthly' | 'quarterly' | 'annual'
type TierKey = 'uplink' | 'unlimited'

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
  unlimited: string
  /** Which columns are visually "upgraded" vs free */
  uplinkUp?: boolean
  unlimitedUp?: boolean
}

const COMPARISON: ComparisonRow[] = [
  {
    label: 'Data Delivery',
    free: '60s polling',
    uplink: '30s polling',
    unlimited: 'Real-time SSE',
    uplinkUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Tracked Symbols',
    free: '10 symbols',
    uplink: '25 symbols',
    unlimited: 'Unlimited',
    uplinkUp: true,
    unlimitedUp: true,
  },
  {
    label: 'RSS Feeds',
    free: '5 feeds',
    uplink: '50 feeds',
    unlimited: 'Unlimited',
    uplinkUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Custom RSS Feeds',
    free: '1 custom',
    uplink: '10 custom',
    unlimited: 'Unlimited',
    uplinkUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Sports Leagues',
    free: 'Pro only',
    uplink: 'Pro + College',
    unlimited: 'Pro + College',
    uplinkUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Fantasy Leagues',
    free: '1 league',
    uplink: '3 leagues',
    unlimited: 'Unlimited',
    uplinkUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Site Filtering',
    free: 'None',
    uplink: 'Blacklist',
    unlimited: 'Blacklist + Whitelist',
    uplinkUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Early Access',
    free: 'No',
    uplink: 'Yes',
    unlimited: 'Yes',
    uplinkUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Extended Retention',
    free: 'No',
    uplink: 'No',
    unlimited: 'Yes',
    unlimitedUp: true,
  },
  {
    label: 'Dashboard Access',
    free: 'Full',
    uplink: 'Full',
    unlimited: 'Full',
  },
]

// ── Tier Feature Showcases ──────────────────────────────────────

interface TierShowcase {
  tier: 'uplink' | 'unlimited'
  Icon: typeof Gauge
  name: string
  tagline: string
  hex: string
  delivery: string
  features: string[]
}

const TIER_SHOWCASES: TierShowcase[] = [
  {
    tier: 'uplink',
    Icon: Rocket,
    name: 'Uplink',
    tagline: 'More data, faster updates',
    hex: '#00b8db',
    delivery: '30s polling',
    features: [
      '25 tracked symbols',
      '50 RSS feeds, 10 custom',
      '3 fantasy leagues',
      'Pro + College sports',
      'Blacklist site filtering',
      'Early access to features',
    ],
  },
  {
    tier: 'unlimited',
    Icon: Crown,
    name: 'Unlimited',
    tagline: 'Everything. In real time.',
    hex: '#34d399',
    delivery: 'Real-time SSE',
    features: [
      'Unlimited tracked symbols',
      'Unlimited RSS feeds & custom',
      'Unlimited fantasy leagues',
      'Pro + College sports',
      'Blacklist + Whitelist filtering',
      'Early access to features',
      'Extended data retention',
    ],
  },
]

// ── Pricing Plans ──────────────────────────────────────────────

interface PricingPlan {
  price: number
  period: string
  perMonth: number
  savings?: string
}

const PRICING: Record<TierKey, Record<PlanKey, PricingPlan>> = {
  uplink: {
    monthly: { price: 8.99, period: '/mo', perMonth: 8.99 },
    quarterly: {
      price: 21.99,
      period: '/3mo',
      perMonth: 7.33,
      savings: 'Save 18%',
    },
    annual: {
      price: 69.99,
      period: '/yr',
      perMonth: 5.83,
      savings: 'Save 35%',
    },
  },
  unlimited: {
    monthly: { price: 24.99, period: '/mo', perMonth: 24.99 },
    quarterly: {
      price: 59.99,
      period: '/3mo',
      perMonth: 20.0,
      savings: 'Save 20%',
    },
    annual: {
      price: 199.99,
      period: '/yr',
      perMonth: 16.67,
      savings: 'Save 33%',
    },
  },
}

const BILLING_LABELS: Record<PlanKey, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
}

// ── Terminal Lines ──────────────────────────────────────────────

const TERMINAL_LINES = [
  { prompt: true, text: 'scrollr uplink --status' },
  { label: 'SIGNAL', value: 'LOCKED', valueClass: 'text-primary' },
  { label: 'TIER', value: 'UPLINK_UNLIMITED', valueClass: 'text-primary' },
  { label: 'DELIVERY', value: 'REAL-TIME SSE', valueClass: 'text-success' },
  { label: 'STATUS', value: 'ACTIVE', valueClass: 'text-success' },
  { label: 'UPLINK', value: '$8.99/mo  $21.99/3mo  $69.99/yr', valueClass: 'text-base-content/50' },
  { label: 'UNLIMITED', value: '$24.99/mo  $59.99/3mo  $199.99/yr', valueClass: 'text-primary/60' },
  {
    label: 'LIFETIME',
    value: '$549 (128 slots, Uplink tier)',
    valueClass: 'text-warning/60',
  },
  { label: 'FREE_TIER', value: 'ALWAYS_FREE', valueClass: 'text-success/70' },
  { prompt: true, text: 'scrollr uplink subscribe --tier unlimited --plan annual' },
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
      'Total coverage for power users. Scrollr Uplink gives you unlimited tracking, real-time data delivery, and early access to new channels.',
    canonicalUrl: 'https://myscrollr.com/uplink',
  })

  const { isAuthenticated, signIn } = useScrollrAuth()
  const getToken = useGetToken()
  const navigate = useNavigate()
  const { session_id } = Route.useSearch()

  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null)
  const [selectedTier, setSelectedTier] = useState<TierKey>('uplink')
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [checkingSession, setCheckingSession] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<PlanKey>('annual')

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

  const handleSelectPlan = (plan: PlanKey, tier: TierKey = 'uplink') => {
    if (!isAuthenticated) {
      signIn(window.location.origin + '/uplink')
      return
    }
    setSelectedPlan(plan)
    setSelectedTier(tier)
    setShowCheckout(true)
  }

  const handleCloseCheckout = () => {
    setShowCheckout(false)
    setSelectedPlan(null)
    setSelectedTier('uplink')
  }

  const getSelectedPriceId = (): string => {
    if (!selectedPlan) return ''
    return selectedTier === 'unlimited'
      ? UNLIMITED_PRICE_IDS[selectedPlan]
      : UPLINK_PRICE_IDS[selectedPlan]
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
            priceId={getSelectedPriceId()}
            isUnlimited={selectedTier === 'unlimited'}
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
                Scrollr is free and open source. Uplink tiers are for power
                users who want more — expanded limits, faster delivery, and
                real-time data via SSE.
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
                  From $5.83/mo &middot; Unlimited from $16.67/mo
                </span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />
      </section>

      {/* ================================================================
          PRICING — TOGGLE + 4 COLUMNS
          ================================================================ */}
      <section className="relative overflow-hidden">
        <div className="container">
          {/* Section header */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-10 sm:mb-14"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Pick Your <span className="text-gradient-primary">Plan</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Flexible billing — pick what works for you
            </p>
          </motion.div>

          {/* Billing period toggle */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
            className="flex items-center justify-center mb-10"
          >
            <div className="relative inline-flex items-center gap-1 p-1 rounded-xl bg-base-200/60 border border-base-300/30 backdrop-blur-sm">
              {(['monthly', 'quarterly', 'annual'] as const).map(
                (period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setBillingPeriod(period)}
                    className={`relative z-10 px-5 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors duration-200 ${
                      billingPeriod === period
                        ? 'text-primary-content'
                        : 'text-base-content/35 hover:text-base-content/55'
                    }`}
                  >
                    {billingPeriod === period && (
                      <motion.div
                        layoutId="billing-toggle"
                        className="absolute inset-0 rounded-lg bg-primary"
                        transition={{
                          type: 'spring',
                          bounce: 0.15,
                          duration: 0.5,
                        }}
                      />
                    )}
                    <span className="relative z-10">
                      {BILLING_LABELS[period]}
                    </span>
                    {period === 'annual' && (
                      <span
                        className={`relative z-10 ml-1.5 text-[8px] ${billingPeriod === period ? 'text-primary-content/70' : 'text-primary/50'}`}
                      >
                        Best
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          </motion.div>

          {/* 4-column pricing grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {/* ─── FREE ─── */}
            <motion.div
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: EASE }}
              className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/40 to-transparent" />
              <Signal
                size={90}
                strokeWidth={0.4}
                className="absolute -bottom-4 -right-4 text-base-content/[0.02] pointer-events-none"
              />
              <div className="relative z-10">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="h-9 w-9 rounded-lg bg-base-300/30 border border-base-300/40 flex items-center justify-center text-base-content/40">
                    <Signal size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-base-content">
                      Free
                    </h3>
                    <p className="text-[9px] text-base-content/25">
                      Always free
                    </p>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-black text-base-content tracking-tight">
                    $0
                  </span>
                  <span className="text-xs font-mono text-base-content/25">
                    / forever
                  </span>
                </div>
                <p className="text-[10px] text-base-content/20 mb-6">
                  No credit card required
                </p>

                <div className="space-y-2.5 mb-6">
                  <PricingFeature>60s polling delivery</PricingFeature>
                  <PricingFeature>10 tracked symbols</PricingFeature>
                  <PricingFeature>5 RSS feeds, 1 custom</PricingFeature>
                  <PricingFeature>1 fantasy league</PricingFeature>
                  <PricingFeature>Pro sports only</PricingFeature>
                  <PricingFeature>Full dashboard access</PricingFeature>
                </div>

                <Link
                  to="/dashboard"
                  className="block w-full py-2.5 text-center text-[10px] font-semibold border border-base-content/15 text-base-content/40 rounded-lg hover:border-base-content/25 hover:text-base-content/60 transition-colors"
                >
                  Get Started Free
                </Link>
              </div>
            </motion.div>

            {/* ─── UPLINK ─── */}
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
              aria-label={`Select Uplink ${BILLING_LABELS[billingPeriod]} plan`}
              onClick={() => handleSelectPlan(billingPeriod, 'uplink')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectPlan(billingPeriod, 'uplink')
                }
              }}
              className="group relative bg-base-200/40 border border-info/15 rounded-xl p-6 hover:border-info/30 transition-colors overflow-hidden cursor-pointer"
            >
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, #00b8db 50%, transparent)',
                }}
              />
              <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-info/[0.06]" />
              <Rocket
                size={90}
                strokeWidth={0.4}
                className="absolute -bottom-4 -right-4 text-base-content/[0.02] pointer-events-none"
              />
              <div className="relative z-10">
                <div className="flex items-center gap-2.5 mb-5">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center"
                    style={{
                      background: '#00b8db15',
                      boxShadow:
                        '0 0 20px #00b8db15, 0 0 0 1px #00b8db20',
                    }}
                  >
                    <Rocket size={16} className="text-base-content/80" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-base-content">
                      Uplink
                    </h3>
                    <p className="text-[9px] text-info/50">
                      30s polling &middot; expanded limits
                    </p>
                  </div>
                </div>

                {/* Price — per-digit slot animation */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-black text-base-content tracking-tight font-mono tabular-nums">
                      $
                      <AnimateNumber
                        transition={{
                          y: { type: 'spring', bounce: 0.15, duration: 0.45 },
                          opacity: { duration: 0.15 },
                        }}
                      >
                        {PRICING.uplink[billingPeriod].price}
                      </AnimateNumber>
                    </span>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={PRICING.uplink[billingPeriod].period}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-xs font-mono text-base-content/25"
                      >
                        {PRICING.uplink[billingPeriod].period}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-base-content/25 tabular-nums">
                      ~$
                      <AnimateNumber
                        transition={{
                          y: { type: 'spring', bounce: 0.15, duration: 0.45 },
                          opacity: { duration: 0.15 },
                        }}
                      >
                        {PRICING.uplink[billingPeriod].perMonth}
                      </AnimateNumber>
                      /mo
                    </span>
                    <AnimatePresence mode="wait">
                      {PRICING.uplink[billingPeriod].savings && (
                        <motion.span
                          key={PRICING.uplink[billingPeriod].savings}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.2, ease: EASE }}
                          className="text-[8px] font-bold text-info/60 bg-info/8 px-1.5 py-0.5 rounded"
                        >
                          {PRICING.uplink[billingPeriod].savings}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-2.5 mb-6">
                  <PricingFeature>30s polling delivery</PricingFeature>
                  <PricingFeature>25 symbols, 50 RSS feeds</PricingFeature>
                  <PricingFeature>10 custom RSS feeds</PricingFeature>
                  <PricingFeature>3 fantasy leagues</PricingFeature>
                  <PricingFeature>Pro + College sports</PricingFeature>
                  <PricingFeature>Early access</PricingFeature>
                </div>

                <div className="w-full py-2.5 text-center text-[10px] font-semibold border border-info/20 text-info/60 rounded-lg group-hover:border-info/40 group-hover:text-info/80 transition-colors">
                  Get Uplink
                </div>
              </div>
            </motion.div>

            {/* ─── UNLIMITED — THE ONE ─── */}
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
              aria-label={`Select Unlimited ${BILLING_LABELS[billingPeriod]} plan`}
              onClick={() =>
                handleSelectPlan(billingPeriod, 'unlimited')
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectPlan(billingPeriod, 'unlimited')
                }
              }}
              className="group relative rounded-xl overflow-hidden cursor-pointer"
            >
              {/* Pulsing border glow */}
              <motion.div
                className="absolute -inset-px rounded-xl bg-gradient-to-b from-primary/30 via-primary/10 to-primary/5"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <div className="relative bg-base-200/80 backdrop-blur-sm p-6 border border-primary/20 rounded-xl">
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, #34d399 50%, transparent)',
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] to-transparent pointer-events-none rounded-xl" />
                <Crown
                  size={90}
                  strokeWidth={0.4}
                  className="absolute -bottom-4 -right-4 text-base-content/[0.02] pointer-events-none"
                />

                {/* "Popular" badge */}
                <div className="absolute top-0 right-0">
                  <div className="bg-primary text-primary-content text-[7px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-bl-lg">
                    Most Popular
                  </div>
                </div>

                <div className="relative z-10">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center"
                      style={{
                        background: '#34d39915',
                        boxShadow:
                          '0 0 20px #34d39915, 0 0 0 1px #34d39920',
                      }}
                    >
                      <Crown
                        size={16}
                        className="text-base-content/80"
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-base-content">
                        Unlimited
                      </h3>
                      <p className="text-[9px] text-primary/50">
                        Real-time SSE &middot; no limits
                      </p>
                    </div>
                  </div>

                  {/* Price — per-digit slot animation */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-3xl font-black text-base-content tracking-tight font-mono tabular-nums">
                        $
                        <AnimateNumber
                          transition={{
                            y: { type: 'spring', bounce: 0.15, duration: 0.45 },
                            opacity: { duration: 0.15 },
                          }}
                        >
                          {PRICING.unlimited[billingPeriod].price}
                        </AnimateNumber>
                      </span>
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={PRICING.unlimited[billingPeriod].period}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="text-xs font-mono text-base-content/25"
                        >
                          {PRICING.unlimited[billingPeriod].period}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-primary/40 tabular-nums">
                        ~$
                        <AnimateNumber
                          transition={{
                            y: { type: 'spring', bounce: 0.15, duration: 0.45 },
                            opacity: { duration: 0.15 },
                          }}
                        >
                          {PRICING.unlimited[billingPeriod].perMonth}
                        </AnimateNumber>
                        /mo
                      </span>
                      <AnimatePresence mode="wait">
                        {PRICING.unlimited[billingPeriod].savings && (
                          <motion.span
                            key={PRICING.unlimited[billingPeriod].savings}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.2, ease: EASE }}
                            className="text-[8px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded"
                          >
                            {PRICING.unlimited[billingPeriod].savings}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="space-y-2.5 mb-6">
                    <PricingFeature highlight>
                      Real-time SSE delivery
                    </PricingFeature>
                    <PricingFeature highlight>
                      Unlimited symbols & RSS
                    </PricingFeature>
                    <PricingFeature highlight>
                      Unlimited fantasy leagues
                    </PricingFeature>
                    <PricingFeature highlight>
                      Blacklist + Whitelist filtering
                    </PricingFeature>
                    <PricingFeature highlight>
                      Extended data retention
                    </PricingFeature>
                    <PricingFeature highlight>
                      Early access to features
                    </PricingFeature>
                  </div>

                  <div className="w-full py-2.5 text-center text-[10px] font-semibold bg-primary/10 border border-primary/30 text-primary rounded-lg group-hover:bg-primary/20 group-hover:border-primary/50 transition-colors">
                    Get Unlimited
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ─── LIFETIME — The First Byte ─── */}
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
                className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 hover:border-warning/20 transition-colors overflow-hidden cursor-pointer h-full"
              >
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, #f59e0b 50%, transparent)',
                  }}
                />
                <Sparkles
                  size={90}
                  strokeWidth={0.4}
                  className="absolute -bottom-4 -right-4 text-base-content/[0.02] pointer-events-none"
                />
                <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-warning/[0.06]" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center"
                      style={{
                        background: '#f59e0b15',
                        boxShadow:
                          '0 0 20px #f59e0b15, 0 0 0 1px #f59e0b20',
                      }}
                    >
                      <Sparkles
                        size={16}
                        className="text-base-content/80"
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-base-content">
                        Lifetime
                      </h3>
                      <p className="text-[9px] text-warning/50">
                        The First Byte &middot; Uplink tier
                      </p>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-black text-base-content tracking-tight">
                      $549
                    </span>
                    <span className="text-xs font-mono text-base-content/25">
                      / forever
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-warning/40 mb-4">
                    128 slots &middot; 50% off Unlimited
                  </p>

                  {/* Slot progress */}
                  <div className="mb-5 p-3 rounded-xl bg-base-100/60 border border-base-300/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] text-base-content/25 uppercase tracking-wide">
                        Slots
                      </span>
                      <span className="text-[9px] font-mono text-warning/50">
                        <AnimatedNumber target={128} duration={2} />{' '}
                        / 128
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

                  <div className="space-y-2.5 mb-6">
                    <PricingFeature>Permanent Uplink access</PricingFeature>
                    <PricingFeature>
                      50% off Unlimited upgrade
                    </PricingFeature>
                    <PricingFeature>Founding member status</PricingFeature>
                    <PricingFeature>
                      Early access to features
                    </PricingFeature>
                  </div>

                  <div className="w-full py-2.5 text-center text-[10px] font-semibold border border-warning/20 text-warning/60 rounded-lg group-hover:border-warning/40 group-hover:text-warning/80 transition-colors flex items-center justify-center gap-1.5">
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
          COMPARISON TABLE
          ================================================================ */}
      <section className="relative overflow-hidden">
        <div className="container">
          {/* Section header */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Compare <span className="text-gradient-primary">Tiers</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Free is forever. Uplink and Unlimited unlock more.
            </p>
          </motion.div>

          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="relative rounded-2xl border border-base-300/40 bg-base-100/60 backdrop-blur-md"
          >
            {/* ── Unlimited column full-column smoke ──
                 Grid is 1.4fr+1fr+1fr+1fr = 4.4fr.
                 Unlimited column = rightmost 1/4.4 ≈ 22.7% of table.
                 Smoke fills the full column and bleeds at edges. */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
              {/* Base wash — fills exact column bounds, breathing opacity */}
              <motion.div
                className="absolute inset-y-0 right-0 w-[22.7%]"
                style={{
                  background:
                    'linear-gradient(180deg, #34d39906 0%, #34d39914 25%, #34d39918 50%, #34d39914 75%, #34d39906 100%)',
                }}
                animate={{ opacity: [0.5, 0.85, 0.5] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Volumetric haze — wider than column, heavy blur, creates depth */}
              <motion.div
                className="absolute inset-y-[-8%] right-[-2%] w-[30%] blur-3xl"
                style={{
                  background:
                    'radial-gradient(ellipse 80% 45% at 60% 50%, #34d39920 0%, #34d39908 50%, transparent 80%)',
                }}
                animate={{
                  scaleX: [1, 1.08, 1],
                  scaleY: [1, 1.04, 1],
                  opacity: [0.5, 0.9, 0.5],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Left edge glow — vertical strip along column's left border */}
              <motion.div
                className="absolute inset-y-[5%] right-[20%] w-[6%] blur-2xl"
                style={{
                  background:
                    'linear-gradient(180deg, transparent 5%, #34d39918 25%, #34d39922 50%, #34d39918 75%, transparent 95%)',
                }}
                animate={{
                  opacity: [0.3, 0.7, 0.3],
                  x: [0, -8, 0],
                }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Rising plume — bottom to mid, drifts upward within column */}
              <motion.div
                className="absolute bottom-[-5%] right-[2%] w-[20%] h-[60%] rounded-full blur-2xl"
                style={{
                  background:
                    'radial-gradient(ellipse 70% 60% at center bottom, #34d39925 0%, #34d39910 40%, transparent 75%)',
                }}
                animate={{
                  y: [0, -60, 0],
                  scaleX: [1, 1.3, 1],
                  opacity: [0.35, 0.8, 0.35],
                }}
                transition={{
                  duration: 7,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Descending plume — top to mid, fills upper column */}
              <motion.div
                className="absolute top-[-5%] right-[4%] w-[18%] h-[55%] rounded-full blur-2xl"
                style={{
                  background:
                    'radial-gradient(ellipse 65% 55% at center top, #34d39920 0%, #34d39908 45%, transparent 70%)',
                }}
                animate={{
                  y: [0, 40, 0],
                  scaleX: [1, 1.2, 1],
                  opacity: [0.25, 0.6, 0.25],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: 1.5,
                }}
              />

              {/* Mid-column turbulence — slow shape-shifting blob */}
              <motion.div
                className="absolute top-[20%] right-[1%] w-[22%] h-[60%] rounded-full blur-3xl"
                style={{
                  background:
                    'radial-gradient(ellipse 75% 50%, #34d39918 0%, transparent 65%)',
                }}
                animate={{
                  scaleX: [1, 1.25, 0.9, 1],
                  scaleY: [1, 0.9, 1.15, 1],
                  x: [0, -15, 10, 0],
                  opacity: [0.35, 0.65, 0.45, 0.35],
                }}
                transition={{
                  duration: 10,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Left drift tendril — leaks from column into Uplink territory */}
              <motion.div
                className="absolute top-[15%] right-[14%] w-[25%] h-[40%] rounded-full blur-3xl"
                style={{
                  background:
                    'radial-gradient(ellipse 70% 45%, #34d39910 0%, transparent 65%)',
                }}
                animate={{
                  x: [0, -80, 0],
                  y: [0, 20, 0],
                  opacity: [0.06, 0.3, 0.06],
                }}
                transition={{
                  duration: 11,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Bright accent particle — upper column */}
              <motion.div
                className="absolute top-[25%] right-[7%] w-[60px] h-[60px] rounded-full blur-xl"
                style={{
                  background:
                    'radial-gradient(circle, #34d39938 0%, transparent 70%)',
                }}
                animate={{
                  y: [0, -20, 15, 0],
                  x: [0, -10, 5, 0],
                  opacity: [0, 0.7, 0.3, 0],
                }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Bright accent particle — lower column */}
              <motion.div
                className="absolute top-[65%] right-[14%] w-[50px] h-[50px] rounded-full blur-lg"
                style={{
                  background:
                    'radial-gradient(circle, #34d39930 0%, transparent 70%)',
                }}
                animate={{
                  y: [0, -15, 10, 0],
                  x: [0, 8, -12, 0],
                  opacity: [0, 0.5, 0.6, 0],
                }}
                transition={{
                  duration: 7,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: 2,
                }}
              />

              {/* Bright accent particle — mid column */}
              <motion.div
                className="absolute top-[45%] right-[4%] w-[40px] h-[40px] rounded-full blur-lg"
                style={{
                  background:
                    'radial-gradient(circle, #34d39940 0%, transparent 70%)',
                }}
                animate={{
                  y: [0, -25, 0],
                  opacity: [0, 0.5, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: 3,
                }}
              />

              {/* Top spill — smoke bleeds above the table */}
              <motion.div
                className="absolute -top-24 right-0 w-[28%] h-[200px] rounded-full blur-3xl"
                style={{
                  background:
                    'radial-gradient(ellipse 70% 60% at 55% 80%, #34d39918 0%, transparent 70%)',
                }}
                animate={{
                  scaleX: [1, 1.2, 1],
                  opacity: [0.2, 0.5, 0.2],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Bottom spill — smoke bleeds below the table */}
              <motion.div
                className="absolute -bottom-20 right-0 w-[28%] h-[180px] rounded-full blur-3xl"
                style={{
                  background:
                    'radial-gradient(ellipse 70% 60% at 55% 20%, #34d39915 0%, transparent 70%)',
                }}
                animate={{
                  scaleX: [1.1, 1, 1.1],
                  opacity: [0.15, 0.45, 0.15],
                }}
                transition={{
                  duration: 9,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </div>

            {/* Dot grid overlay */}
            <div
              className="absolute inset-0 opacity-[0.02] pointer-events-none rounded-2xl overflow-hidden"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, var(--grid-dot-primary) 1px, transparent 0)`,
                backgroundSize: '20px 20px',
              }}
            />

            {/* Watermark */}
            <TrendingUp
              size={160}
              strokeWidth={0.3}
              className="absolute -bottom-8 -right-8 text-base-content/[0.02] pointer-events-none"
            />

            {/* Table Header */}
            <div className="relative grid grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-base-300/40">
              <div className="p-5 pl-6">
                <span className="text-[9px] text-base-content/25 uppercase tracking-wider font-medium">
                  Feature
                </span>
              </div>
              <div className="p-5 text-center border-l border-base-300/20">
                <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/35">
                  Free
                </span>
              </div>
              <div className="p-5 text-center border-l border-info/15 bg-info/[0.03]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-info flex items-center justify-center gap-1.5">
                  <Rocket size={11} /> Uplink
                </span>
              </div>
              <div className="relative p-5 text-center border-l border-primary/15 bg-primary/[0.04] rounded-tr-2xl">
                {/* Popular badge — absolute within header cell */}
                <motion.div
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full"
                  initial={{ opacity: 0, y: 4 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5, duration: 0.4, ease: EASE }}
                >
                  <span className="bg-primary text-primary-content text-[7px] font-bold uppercase tracking-wider px-3 py-1 rounded-t-md block">
                    Popular
                  </span>
                </motion.div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center justify-center gap-1.5">
                  <Crown size={11} /> Unlimited
                </span>
              </div>
            </div>

            {/* Table Rows */}
            {COMPARISON.map((row, i) => (
              <motion.div
                key={row.label}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.05,
                  duration: 0.4,
                  ease: EASE,
                }}
                className={`grid grid-cols-[1.4fr_1fr_1fr_1fr] ${i < COMPARISON.length - 1 ? 'border-b border-base-300/20' : ''} group hover:bg-base-200/40 transition-colors duration-200`}
              >
                <div className="p-4 pl-6 flex items-center">
                  <span className="text-xs text-base-content/55 font-medium">
                    {row.label}
                  </span>
                </div>
                <div className="p-4 flex items-center justify-center border-l border-base-300/20">
                  <span className="text-[11px] font-mono text-base-content/25">
                    {row.free}
                  </span>
                </div>
                <div className="p-4 flex items-center justify-center border-l border-info/10 bg-info/[0.015]">
                  {row.uplinkUp ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold font-mono text-info/80">
                      <Check size={11} className="text-info shrink-0" />
                      {row.uplink}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-base-content/25">
                      <Minus size={9} className="text-base-content/15 shrink-0" />
                      {row.uplink}
                    </span>
                  )}
                </div>
                <div className="p-4 flex items-center justify-center border-l border-primary/10 bg-primary/[0.025] relative">
                  {/* Ethereal row glow for unlimited upgrades */}
                  {row.unlimitedUp && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent 0%, #34d39906 30%, #34d39910 70%, #34d39908 100%)',
                      }}
                      animate={{
                        opacity: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 3 + i * 0.3,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  )}
                  {row.unlimitedUp ? (
                    <span className="relative inline-flex items-center gap-1.5 text-[11px] font-bold font-mono text-primary">
                      <motion.span
                        className="shrink-0"
                        whileInView={{ scale: [0, 1.2, 1] }}
                        viewport={{ once: true }}
                        transition={{
                          delay: 0.3 + i * 0.05,
                          duration: 0.4,
                          ease: EASE,
                        }}
                      >
                        <Check size={11} className="text-primary" />
                      </motion.span>
                      {row.unlimited}
                    </span>
                  ) : (
                    <span className="relative inline-flex items-center gap-1.5 text-[11px] font-mono text-base-content/25">
                      <Minus size={9} className="text-base-content/15 shrink-0" />
                      {row.unlimited}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Table Footer */}
            <div className="border-t border-base-300/30 bg-base-200/30 px-6 py-4 flex items-center justify-between">
              <span className="text-[9px] text-base-content/20">
                Per-account &middot; Free tier always included &middot; Upgrade
                anytime
              </span>
              <motion.span
                className="text-[9px] text-primary/40 font-mono"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                signal:locked
              </motion.span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          WHAT YOU GET — TIER SHOWCASES
          ================================================================ */}
      <section className="relative overflow-hidden">
        {/* Tinted background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

        <div className="container relative z-10">
          {/* Section header */}
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
              Two tiers, one mission: total coverage
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {TIER_SHOWCASES.map((tier, tierIdx) => (
              <motion.div
                key={tier.tier}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: tierIdx * 0.15,
                  duration: 0.6,
                  ease: EASE,
                }}
                className={`group relative rounded-2xl overflow-hidden ${
                  tier.tier === 'unlimited'
                    ? 'border border-primary/20'
                    : 'border border-base-300/30'
                }`}
              >
                {/* Animated border glow for Unlimited */}
                {tier.tier === 'unlimited' && (
                  <motion.div
                    className="absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/25 via-primary/8 to-primary/3 -z-10"
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                )}

                <div
                  className={`relative p-7 md:p-8 ${
                    tier.tier === 'unlimited'
                      ? 'bg-base-200/80 backdrop-blur-sm'
                      : 'bg-base-200/40'
                  }`}
                >
                  {/* Top accent line */}
                  <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${tier.hex} 50%, transparent)`,
                    }}
                  />

                  {/* Corner dot grid */}
                  <div
                    className="absolute top-0 right-0 w-32 h-32 opacity-[0.03] text-base-content"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle, currentColor 1px, transparent 1px)',
                      backgroundSize: '8px 8px',
                    }}
                  />

                  {/* Ambient glow */}
                  <motion.div
                    className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none blur-3xl"
                    style={{ background: `${tier.hex}08` }}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 6,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: tierIdx * 2,
                    }}
                  />

                  {/* Watermark */}
                  <tier.Icon
                    size={120}
                    strokeWidth={0.3}
                    className="absolute -bottom-6 -right-6 text-base-content/[0.02] pointer-events-none"
                  />

                  {/* "Recommended" badge for Unlimited */}
                  {tier.tier === 'unlimited' && (
                    <div className="absolute top-0 right-0">
                      <div className="bg-primary text-primary-content text-[7px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-bl-lg">
                        Recommended
                      </div>
                    </div>
                  )}

                  <div className="relative z-10">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{
                          background: `${tier.hex}15`,
                          boxShadow: `0 0 24px ${tier.hex}15, 0 0 0 1px ${tier.hex}20`,
                        }}
                      >
                        <tier.Icon size={18} className="text-base-content/80" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-base-content">
                          {tier.name}
                        </h3>
                        <p className="text-[10px] text-base-content/35">
                          {tier.tagline}
                        </p>
                      </div>
                    </div>

                    {/* Delivery highlight */}
                    <div
                      className="mb-6 p-3.5 rounded-xl border"
                      style={{
                        background: `${tier.hex}06`,
                        borderColor: `${tier.hex}15`,
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <Zap
                          size={14}
                          style={{ color: tier.hex }}
                          className="shrink-0"
                        />
                        <div>
                          <span
                            className="text-xs font-bold"
                            style={{ color: tier.hex }}
                          >
                            {tier.delivery}
                          </span>
                          <span className="text-[10px] text-base-content/30 ml-2">
                            {tier.tier === 'uplink'
                              ? '2x faster than free'
                              : 'Instant — zero delay'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Feature list */}
                    <div className="space-y-3">
                      {tier.features.map((feature, i) => (
                        <motion.div
                          key={feature}
                          style={{ opacity: 0 }}
                          initial={{ opacity: 0, x: -8 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{
                            delay: 0.2 + tierIdx * 0.1 + i * 0.05,
                            duration: 0.35,
                            ease: EASE,
                          }}
                          className="flex items-center gap-2.5"
                        >
                          <Check
                            size={12}
                            className="shrink-0"
                            style={{ color: tier.hex }}
                          />
                          <span className="text-xs text-base-content/55">
                            {feature}
                          </span>
                        </motion.div>
                      ))}
                    </div>

                    {/* CTA */}
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectPlan('annual', tier.tier)
                      }
                      className={`mt-7 w-full py-2.5 text-center text-[10px] font-semibold rounded-lg transition-colors ${
                        tier.tier === 'unlimited'
                          ? 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50'
                          : 'border border-info/20 text-info/60 hover:border-info/40 hover:text-info/80'
                      }`}
                    >
                      {tier.tier === 'unlimited'
                        ? 'Get Unlimited — from $16.67/mo'
                        : 'Get Uplink — from $5.83/mo'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
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
                  Uplink tiers are for those who want more
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
                unlocks expanded limits and faster polling. Unlimited adds
                real-time SSE and total coverage across every channel.
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
                  onClick={() => handleSelectPlan('annual', 'unlimited')}
                  className="btn btn-pulse gap-2"
                >
                  <Crown size={12} /> Get Unlimited — $16.67/mo
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPlan('annual', 'uplink')}
                  className="btn btn-outline btn-sm gap-2"
                >
                  <Rocket size={12} /> Uplink — $5.83/mo
                </button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
