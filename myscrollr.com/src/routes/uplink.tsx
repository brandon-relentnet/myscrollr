import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react'
import { AnimateNumber } from 'motion-plus/react'
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react'
import {
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Crown,
  Database,
  Filter,
  Gauge,
  Layers,
  LayoutDashboard,
  Loader2,
  Minus,
  Rocket,
  Rss,
  Satellite,
  Sparkles,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'

import { usePageMeta } from '@/lib/usePageMeta'
import { useScrollrAuth } from '@/hooks/useScrollrAuth'
import { useGetToken } from '@/hooks/useGetToken'
import { billingApi } from '@/api/client'
import { FAQSection } from '@/components/landing/FAQSection'
import type { FAQItem } from '@/components/landing/FAQSection'

const CheckoutForm = lazy(() => import('@/components/billing/CheckoutForm'))

// ── Signature easing (matches homepage) ────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const

// ── Price IDs (from Stripe via env vars) ───────────────────────
const UPLINK_PRICE_IDS = {
  monthly: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || '',
  quarterly: import.meta.env.VITE_STRIPE_PRICE_QUARTERLY || '',
  annual: import.meta.env.VITE_STRIPE_PRICE_ANNUAL || '',
} as const

const PRO_PRICE_IDS = {
  monthly: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY || '',
  quarterly: import.meta.env.VITE_STRIPE_PRICE_PRO_QUARTERLY || '',
  annual: import.meta.env.VITE_STRIPE_PRICE_PRO_ANNUAL || '',
} as const

const UNLIMITED_PRICE_IDS = {
  monthly: import.meta.env.VITE_STRIPE_PRICE_UNLIMITED_MONTHLY || '',
  quarterly: import.meta.env.VITE_STRIPE_PRICE_UNLIMITED_QUARTERLY || '',
  annual: import.meta.env.VITE_STRIPE_PRICE_UNLIMITED_ANNUAL || '',
} as const

type PlanKey = 'monthly' | 'quarterly' | 'annual'
type TierKey = 'uplink' | 'pro' | 'unlimited'

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
  pro: string
  unlimited: string
  /** Which columns are visually "upgraded" vs free */
  uplinkUp?: boolean
  proUp?: boolean
  unlimitedUp?: boolean
}

const COMPARISON: ComparisonRow[] = [
  {
    label: 'Data Delivery',
    free: '60s polling',
    uplink: '30s polling',
    pro: '10s polling',
    unlimited: 'Real-time SSE',
    uplinkUp: true,
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Tracked Symbols',
    free: '5 symbols',
    uplink: '25 symbols',
    pro: '75 symbols',
    unlimited: 'Unlimited',
    uplinkUp: true,
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'RSS Feeds',
    free: '3 feeds',
    uplink: '50 feeds',
    pro: '150 feeds',
    unlimited: 'Unlimited',
    uplinkUp: true,
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Custom RSS Feeds',
    free: 'None',
    uplink: '10 custom',
    pro: '25 custom',
    unlimited: 'Unlimited',
    uplinkUp: true,
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Sports Leagues',
    free: 'Pro only',
    uplink: 'Pro + College',
    pro: 'Pro + College',
    unlimited: 'Pro + College',
    uplinkUp: true,
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Fantasy Leagues',
    free: '1 league',
    uplink: '3 leagues',
    pro: '10 leagues',
    unlimited: 'Unlimited',
    uplinkUp: true,
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Site Filtering',
    free: 'Blacklist',
    uplink: 'Blacklist',
    pro: 'Blacklist + Whitelist',
    unlimited: 'Blacklist + Whitelist',
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Feed Retention',
    free: '25 items',
    uplink: '50 items',
    pro: '200 items',
    unlimited: 'Unlimited',
    uplinkUp: true,
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Custom Alerts',
    free: 'No',
    uplink: 'No',
    pro: 'Yes',
    unlimited: 'Yes',
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Feed Profiles',
    free: 'No',
    uplink: 'No',
    pro: 'Yes',
    unlimited: 'Yes',
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Advanced Feed Controls',
    free: 'No',
    uplink: 'No',
    pro: 'Yes',
    unlimited: 'Yes',
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Priority RSS Refresh',
    free: 'No',
    uplink: 'No',
    pro: 'Yes',
    unlimited: 'Yes',
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Webhooks & Integrations',
    free: 'No',
    uplink: 'No',
    pro: 'No',
    unlimited: 'Yes',
    unlimitedUp: true,
  },
  {
    label: 'Data Export',
    free: 'No',
    uplink: 'No',
    pro: 'No',
    unlimited: 'CSV / JSON',
    unlimitedUp: true,
  },
  {
    label: 'API Access',
    free: 'No',
    uplink: 'No',
    pro: 'No',
    unlimited: 'Yes',
    unlimitedUp: true,
  },
  {
    label: 'Early Access',
    free: 'No',
    uplink: 'Yes',
    pro: 'Yes',
    unlimited: 'Yes',
    uplinkUp: true,
    proUp: true,
    unlimitedUp: true,
  },
  {
    label: 'Priority Support',
    free: 'No',
    uplink: 'No',
    pro: 'No',
    unlimited: 'Yes',
    unlimitedUp: true,
  },
  {
    label: 'Dashboard Access',
    free: 'Full',
    uplink: 'Full',
    pro: 'Full',
    unlimited: 'Full',
  },
]

// ── Tier Feature Showcases ──────────────────────────────────────

interface TierShowcase {
  tier: TierKey
  Icon: typeof Gauge
  name: string
  tagline: string
  hex: string
  delivery: string
  deliverySub: string
  features: string[]
}

const TIER_SHOWCASES: TierShowcase[] = [
  {
    tier: 'uplink',
    Icon: Rocket,
    name: 'Uplink',
    tagline: 'Your daily driver',
    hex: '#00b8db',
    delivery: '30s polling',
    deliverySub: '2x faster than free',
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
    tier: 'pro',
    Icon: Gauge,
    name: 'Pro',
    tagline: 'Your command center',
    hex: '#a78bfa',
    delivery: '10s polling',
    deliverySub: '6x faster than free',
    features: [
      '75 tracked symbols',
      '150 RSS feeds, 25 custom',
      '10 fantasy leagues',
      'Custom alerts & notifications',
      'Feed profiles & advanced controls',
      'Priority RSS refresh',
      'Blacklist + Whitelist filtering',
      '200 items retention',
    ],
  },
  {
    tier: 'unlimited',
    Icon: Crown,
    name: 'Unlimited',
    tagline: 'Everything. In real time.',
    hex: '#34d399',
    delivery: 'Real-time SSE',
    deliverySub: 'Instant — zero delay',
    features: [
      'Unlimited symbols, feeds & leagues',
      'Webhooks & integrations',
      'Data export (CSV / JSON)',
      'API access',
      'Priority support',
      'Unlimited data retention',
      'Everything in Pro, plus more',
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
    monthly: { price: 12.99, period: '/mo', perMonth: 12.99 },
    quarterly: {
      price: 31.99,
      period: '/3mo',
      perMonth: 10.66,
      savings: 'Save 18%',
    },
    annual: {
      price: 99.99,
      period: '/yr',
      perMonth: 8.33,
      savings: 'Save 36%',
    },
  },
  pro: {
    monthly: { price: 29.99, period: '/mo', perMonth: 29.99 },
    quarterly: {
      price: 74.99,
      period: '/3mo',
      perMonth: 25.0,
      savings: 'Save 17%',
    },
    annual: {
      price: 239.99,
      period: '/yr',
      perMonth: 20.0,
      savings: 'Save 33%',
    },
  },
  unlimited: {
    monthly: { price: 54.99, period: '/mo', perMonth: 54.99 },
    quarterly: {
      price: 134.99,
      period: '/3mo',
      perMonth: 45.0,
      savings: 'Save 18%',
    },
    annual: {
      price: 449.99,
      period: '/yr',
      perMonth: 37.5,
      savings: 'Save 32%',
    },
  },
}

type BillingView = PlanKey | 'lifetime'

const BILLING_LABELS: Record<BillingView, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  lifetime: 'Lifetime',
}

// ── CTA Particles ──────────────────────────────────────────────

const CTA_PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 3 + 1.5,
  delay: Math.random() * 5,
  duration: Math.random() * 6 + 8,
  color: i % 3 === 0 ? '#00b8db' : i % 3 === 1 ? '#a78bfa' : '#34d399',
}))

// ── Uplink FAQ ─────────────────────────────────────────────────

const UPLINK_FAQ: FAQItem[] = [
  {
    icon: Zap,
    question: 'What does "data delivery" mean?',
    highlight:
      'How fast new data reaches you — from 60-second polling to instant real-time streaming.',
    answer:
      'Free users get data refreshed every 60 seconds via polling. Uplink cuts that to 30 seconds. Pro pushes it to 10 seconds. Unlimited eliminates polling entirely — data arrives the instant it changes via Server-Sent Events (SSE), the same technology used by stock trading platforms.',
    accent: 'emerald',
  },
  {
    icon: BarChart3,
    question: 'How many symbols can I track?',
    highlight:
      'Free gets 5, Uplink gets 25, Pro gets 75, and Unlimited has no cap at all.',
    answer:
      'Tracked symbols are the stocks, ETFs, and crypto tickers that appear in your finance feed. Free accounts can follow up to 5 at a time. Uplink raises that to 25. Pro gives you 75 — enough for a serious portfolio. With Unlimited, there is no cap — add every ticker you care about and they all stream in real time.',
    accent: 'cyan',
  },
  {
    icon: Rss,
    question: 'How many RSS feeds can I follow?',
    highlight:
      'From 3 feeds on Free to completely unlimited on the top tier.',
    answer:
      'RSS feeds power the news channel. Free accounts can subscribe to 3 feeds from the default catalog. Uplink expands that to 50, Pro to 150, giving you broad coverage across topics. Unlimited removes the limit entirely — subscribe to as many sources as you want.',
    accent: 'amber',
  },
  {
    icon: Sparkles,
    question: 'What are custom RSS feeds?',
    highlight:
      'Add any RSS URL you want — your own blogs, niche sources, anything with a feed.',
    answer:
      'Beyond the built-in catalog, custom feeds let you paste any RSS or Atom URL. Free accounts cannot add custom feeds. Uplink gives you 10, Pro gives you 25 — enough for niche industry sources, personal blogs, or company news. Unlimited removes the cap so you can add every source you follow.',
    accent: 'orange',
  },
  {
    icon: Trophy,
    question: 'What sports leagues are included?',
    highlight:
      'Free covers pro leagues. All paid tiers add college sports.',
    answer:
      'Every tier includes live scores from the NFL, NBA, MLB, NHL, MLS, and Premier League. All paid tiers add college football (NCAAF) and college basketball (NCAAM), with scores updating at your tier\'s delivery speed.',
    accent: 'violet',
  },
  {
    icon: Crown,
    question: 'How many fantasy leagues can I connect?',
    highlight:
      'Connect 1 Yahoo league for free, 3 with Uplink, 10 with Pro, or every league with Unlimited.',
    answer:
      'Scrollr syncs with Yahoo Fantasy Sports to show your standings, matchups, and roster updates. Free accounts connect 1 league. Uplink supports up to 3. Pro gives you 10 — enough for multi-sport managers. Unlimited connects every league across every sport with no restrictions.',
    accent: 'rose',
  },
  {
    icon: Bell,
    question: 'What are custom alerts?',
    highlight:
      'Set price targets, score thresholds, and keyword triggers — Pro and Unlimited only.',
    answer:
      'Custom alerts let you define conditions that trigger notifications: a stock hitting a target price, a game entering the 4th quarter, or an RSS item matching a keyword. Alerts are evaluated in the extension background — no server round-trip needed. Available on Pro and Unlimited tiers.',
    accent: 'sky',
  },
  {
    icon: Layers,
    question: 'What are feed profiles and advanced controls?',
    highlight:
      'Save named configurations and fine-tune exactly what you see — Pro and Unlimited.',
    answer:
      'Feed profiles let you save different configurations — like "Work" showing only finance and RSS, or "Weekend" with sports and fantasy. Advanced controls add pinning, custom sort rules, and per-channel filtering within the feed. Both features are exclusive to Pro and Unlimited tiers.',
    accent: 'fuchsia',
  },
  {
    icon: Filter,
    question: 'What is site filtering?',
    highlight:
      'Control which websites show the Scrollr feed bar, from blocklists to allowlists.',
    answer:
      'Site filtering controls where the extension feed bar appears. Every tier includes blacklist filtering — hide the bar on specific sites like work tools or video players. Pro and Unlimited add whitelist mode on top, so you can restrict the bar to only the sites you choose.',
    accent: 'cyan',
  },
  {
    icon: Code2,
    question: 'What about webhooks, data export, and API access?',
    highlight:
      'Unlimited-exclusive power features for integrations and automation.',
    answer:
      'Webhooks push your alerts to Discord, Slack, or any URL. Data export lets you download tracked symbols, historical prices, and game results as CSV or JSON. API access gives you programmatic read access to your MyScrollr data for personal dashboards or automation. All three are exclusive to Unlimited.',
    accent: 'teal',
  },
  {
    icon: Database,
    question: 'How does feed retention work?',
    highlight:
      'Free keeps 25 items, Uplink 50, Pro 200, and Unlimited has no limit.',
    answer:
      'Feed retention determines how many items your feed holds at once. Free keeps the most recent 25 items. Uplink doubles that to 50. Pro gives you 200 — enough for richer context when scrolling back. Unlimited removes the cap entirely, keeping your full history for as long as you need it.',
    accent: 'amber',
  },
  {
    icon: Clock,
    question: 'What does early access include?',
    highlight:
      'All paid subscribers get new features and channels before anyone else.',
    answer:
      'Every paid tier unlocks early access to new features, channels, and UI updates before they roll out to free users. This includes beta channels, experimental feed modes, and new dashboard widgets. You get to try everything first and provide feedback that shapes the final release.',
    accent: 'orange',
  },
  {
    icon: LayoutDashboard,
    question: 'Does every tier get the full dashboard?',
    highlight:
      'Yes — the web dashboard is fully accessible on every tier, including free.',
    answer:
      'Every user gets complete access to the web dashboard at myscrollr.com. You can view all your channels, manage your watchlists, configure feeds, and adjust preferences regardless of your subscription tier. Paid tiers enhance the data flowing into the dashboard, not the dashboard itself.',
    accent: 'lime',
  },
]

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

// ── Bottom CTA (full-section, matches homepage quality) ──────────

function BottomCTA({
  handleSelectPlan,
}: {
  handleSelectPlan: (period: PlanKey, tier: TierKey) => void
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const isInView = useInView(sectionRef, { amount: 0.15 })

  // Mouse parallax for ambient orb
  const mouseX = useMotionValue(0.5)
  const mouseY = useMotionValue(0.5)
  const orbX = useTransform(mouseX, [0, 1], [-30, 30])
  const orbY = useTransform(mouseY, [0, 1], [-30, 30])
  const smoothOrbX = useSpring(orbX, { stiffness: 50, damping: 30 })
  const smoothOrbY = useSpring(orbY, { stiffness: 50, damping: 30 })

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect()
      mouseX.set((e.clientX - rect.left) / rect.width)
      mouseY.set((e.clientY - rect.top) / rect.height)
    },
    [mouseX, mouseY],
  )

  return (
    <section
      ref={sectionRef}
      className="relative overflow-clip py-32 lg:py-44"
      onMouseMove={handleMouseMove}
    >
      {/* ── Background layers ─────────────────────────────────────── */}

      {/* Dark gradient base */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-100 via-base-200/80 to-base-100 pointer-events-none" />

      {/* Mouse-following ambient orb */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: 600,
          height: 600,
          left: '50%',
          top: '50%',
          x: smoothOrbX,
          y: smoothOrbY,
          translateX: '-50%',
          translateY: '-50%',
          background:
            'radial-gradient(circle, rgba(52,211,153,0.08) 0%, rgba(0,184,219,0.04) 40%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Convergence beams — green (Unlimited) + cyan (Uplink) */}
      <div className="absolute inset-0 pointer-events-none">
        {[
          { angle: 35, color: '#34d399', delay: 0.3 },
          { angle: 145, color: '#00b8db', delay: 0.45 },
          { angle: 215, color: '#34d399', delay: 0.6 },
          { angle: 325, color: '#00b8db', delay: 0.75 },
        ].map((beam) => (
          <motion.div
            key={beam.angle}
            className="absolute left-1/2 top-1/2 pointer-events-none"
            style={{
              width: '200%',
              height: 2,
              transformOrigin: 'left center',
              rotate: beam.angle,
              x: '-50%',
              y: '-50%',
              background: `linear-gradient(90deg, transparent 0%, ${beam.color}00 20%, ${beam.color}40 50%, ${beam.color}00 80%, transparent 100%)`,
              opacity: 0,
            }}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={
              isInView
                ? { opacity: [0, 0.6, 0.3], scaleX: [0, 1, 1] }
                : {}
            }
            transition={{ delay: beam.delay, duration: 2, ease: EASE }}
          />
        ))}
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {CTA_PARTICLES.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              opacity: 0,
            }}
            animate={
              isInView
                ? { y: [0, -80, -160], opacity: [0, 0.5, 0] }
                : {}
            }
            transition={{
              delay: p.delay,
              duration: p.duration,
              ease: 'easeInOut',
              repeat: Infinity,
            }}
          />
        ))}
      </div>

      {/* Pulse rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 pointer-events-none"
          style={{ width: 280, height: 280, opacity: 0 }}
          animate={
            isInView
              ? { scale: [0.8, 2.5], opacity: [0.4, 0] }
              : {}
          }
          transition={{
            delay: 1.2 + i,
            duration: 3,
            ease: 'easeOut',
            repeat: Infinity,
            repeatDelay: 1,
          }}
        />
      ))}

      {/* ── Content ───────────────────────────────────────────────── */}
      <div
        className="relative mx-auto px-5 sm:px-6 lg:px-8"
        style={{ maxWidth: 1400 }}
      >
        <div className="flex flex-col items-center text-center">
          {/* Pill badge */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              Available Now
            </span>
          </motion.div>

          {/* Main headline */}
          <motion.h2
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ delay: 0.1, duration: 0.6, ease: EASE }}
            className="mt-8 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight leading-none"
          >
            <span className="block">Upgrade Your</span>
            <span className="block mt-2 text-gradient-primary">Signal.</span>
          </motion.h2>

          {/* Sub-copy */}
          <motion.span
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.25, duration: 0.5, ease: EASE }}
            className="block mt-6 text-lg sm:text-xl text-base-content/50 max-w-lg leading-relaxed"
          >
            The core is free forever. Uplink, Pro, and Unlimited are for
            those who want more data, faster delivery, and zero limits.
          </motion.span>

          {/* CTA buttons with central glow */}
          <motion.div
            className="relative mt-10"
            style={{ opacity: 0 }}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6, ease: EASE }}
          >
            {/* Central glow behind buttons */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
              style={{
                width: 240,
                height: 240,
                background:
                  'radial-gradient(circle, rgba(52,211,153,0.15) 0%, transparent 70%)',
                filter: 'blur(30px)',
              }}
            />

            <div className="relative z-10 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => handleSelectPlan('annual', 'unlimited')}
                className="btn btn-pulse gap-2 text-base px-8 py-5 shadow-2xl"
              >
                <Crown size={14} /> Get Unlimited — $37.50/mo
              </button>
              <button
                type="button"
                onClick={() => handleSelectPlan('annual', 'pro')}
                className="btn btn-outline gap-2 px-6 py-4"
              >
                <Gauge size={14} /> Pro — $20.00/mo
              </button>
            </div>
          </motion.div>

          {/* Trust signals */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, duration: 0.5, ease: EASE }}
            className="mt-6 flex items-center gap-4 text-xs text-base-content/30"
          >
            {[
              'Cancel anytime',
              'No contracts',
              'Instant activation',
              'Secure checkout',
            ].map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                {item}
              </span>
            ))}
          </motion.div>

          {/* Bottom links */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.75, duration: 0.5, ease: EASE }}
            className="mt-14 flex items-center gap-6"
          >
            <Link
              to="/uplink/lifetime"
              search={{ session_id: undefined }}
              className="inline-flex items-center gap-2 text-sm text-base-content/40 hover:text-warning transition-colors duration-200"
            >
              <Sparkles className="size-4" aria-hidden />
              Lifetime Access
            </Link>
            <span className="w-px h-4 bg-base-content/10" />
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-base-content/40 hover:text-primary transition-colors duration-200"
            >
              <Satellite className="size-4" aria-hidden />
              Try Free First
            </Link>
          </motion.div>
        </div>
      </div>

      {/* ── Bottom horizon glow ───────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none">
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, transparent, var(--color-primary), var(--color-info), var(--color-primary), transparent)',
            opacity: 0,
          }}
          animate={isInView ? { opacity: [0, 0.4, 0.2] } : {}}
          transition={{ delay: 1.5, duration: 2 }}
        />
        <motion.div
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: '60%',
            height: 120,
            background:
              'radial-gradient(ellipse at bottom, rgba(52,211,153,0.08) 0%, transparent 70%)',
            opacity: 0,
          }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.8, duration: 1.5 }}
        />
      </div>
    </section>
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
  const [billingView, setBillingView] = useState<BillingView>('monthly')
  const isLifetime = billingView === 'lifetime'
  const billingPeriod: PlanKey = isLifetime ? 'annual' : billingView

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
    if (selectedTier === 'unlimited') return UNLIMITED_PRICE_IDS[selectedPlan]
    if (selectedTier === 'pro') return PRO_PRICE_IDS[selectedPlan]
    return UPLINK_PRICE_IDS[selectedPlan]
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

          {/* Two-column: text left, tier cards right */}
          <div className="flex items-center gap-6">
            {/* Left — headline + CTA */}
            <div className="flex-1 min-w-0">
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
                  Scrollr is free and open source. Three paid tiers for power
                  users who want more — expanded limits, faster delivery,
                  custom alerts, and real-time data via SSE.
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
                  onClick={() => handleSelectPlan('annual', 'pro')}
                  className="btn btn-pulse btn-lg gap-2.5"
                >
                  <Gauge size={14} />
                  Get Pro
                </button>

                <div className="flex items-center gap-3">
                  <span className="h-px w-6 bg-base-300/50" />
                  <span className="text-[10px] font-mono text-base-content/20">
                    From $8.33/mo &middot; Unlimited from $37.50/mo
                  </span>
                </div>
              </motion.div>
            </div>

            {/* Right — concentric signal rings (hidden on mobile) */}
            <div className="hidden lg:flex items-center justify-center w-[380px] shrink-0">
              <div className="relative w-[340px] h-[340px]">
                {/* ── Outer ring: Unlimited (green glow) ── */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.9, duration: 1, ease: EASE }}
                >
                  {/* Glow layer */}
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                      boxShadow:
                        '0 0 40px #34d39920, 0 0 80px #34d39910, inset 0 0 40px #34d39908',
                    }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      border: '1.5px solid #34d39930',
                      background:
                        'radial-gradient(circle, transparent 60%, #34d39908 100%)',
                    }}
                  />
                  {/* Label */}
                  <motion.div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.6, duration: 0.5, ease: EASE }}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-widest text-primary/70 bg-base-100/80 backdrop-blur-sm px-3 py-1 rounded-full border border-primary/15">
                      Unlimited
                    </span>
                  </motion.div>
                </motion.div>

                {/* ── Pro ring (violet) ── */}
                <motion.div
                  className="absolute inset-[45px] rounded-full"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.7, duration: 0.95, ease: EASE }}
                >
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      border: '1.5px solid #a78bfa25',
                      background:
                        'radial-gradient(circle, transparent 55%, #a78bfa06 100%)',
                    }}
                  />
                  {/* Label */}
                  <motion.div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.4, duration: 0.5, ease: EASE }}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#a78bfa]/60 bg-base-100/80 backdrop-blur-sm px-3 py-1 rounded-full border border-[#a78bfa]/15">
                      Pro
                    </span>
                  </motion.div>
                </motion.div>

                {/* ── Uplink ring (cyan) ── */}
                <motion.div
                  className="absolute inset-[85px] rounded-full"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.9, ease: EASE }}
                >
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      border: '1.5px solid #00b8db25',
                      background:
                        'radial-gradient(circle, transparent 55%, #00b8db06 100%)',
                    }}
                  />
                  {/* Label */}
                  <motion.div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2, duration: 0.5, ease: EASE }}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-widest text-info/50 bg-base-100/80 backdrop-blur-sm px-3 py-1 rounded-full border border-info/10">
                      Uplink
                    </span>
                  </motion.div>
                </motion.div>

                {/* ── Inner ring: Free (muted) ── */}
                <motion.div
                  className="absolute inset-[120px] rounded-full"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.8, ease: EASE }}
                >
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  />
                  {/* Label */}
                  <motion.div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.0, duration: 0.5, ease: EASE }}
                  >
                    <span className="text-[8px] font-bold uppercase tracking-widest text-base-content/25 bg-base-100/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-base-300/15">
                      Free
                    </span>
                  </motion.div>
                </motion.div>

                {/* ── Center: Satellite icon ── */}
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.7, ease: EASE }}
                >
                  <div className="relative">
                    {/* Icon glow */}
                    <div
                      className="absolute inset-0 rounded-full blur-xl"
                      style={{
                        background:
                          'radial-gradient(circle, #34d39925 0%, transparent 70%)',
                        width: 80,
                        height: 80,
                        left: -16,
                        top: -16,
                      }}
                    />
                    <div
                      className="relative w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{
                        background: '#34d39910',
                        boxShadow:
                          '0 0 24px #34d39915, 0 0 0 1px #34d39920',
                      }}
                    >
                      <Satellite
                        size={22}
                        className="text-primary/70"
                      />
                    </div>
                  </div>
                </motion.div>

                {/* ── Radiating pulse (perpetual) ── */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full border border-primary/10 pointer-events-none"
                    animate={{ scale: [0.35, 1.15], opacity: [0.6, 0] }}
                    transition={{
                      delay: 1.5 + i * 1.2,
                      duration: 3,
                      ease: 'easeOut',
                      repeat: Infinity,
                      repeatDelay: 1.6,
                    }}
                  />
                ))}

                {/* ── Floating data dots ── */}
                {[
                  { angle: 30, radius: 45, color: '#34d399', size: 3, delay: 2 },
                  { angle: 150, radius: 70, color: '#00b8db', size: 2.5, delay: 2.8 },
                  { angle: 250, radius: 55, color: '#34d399', size: 2, delay: 3.5 },
                  { angle: 80, radius: 85, color: '#00b8db', size: 3, delay: 2.4 },
                  { angle: 200, radius: 40, color: '#34d399', size: 2.5, delay: 3.2 },
                  { angle: 320, radius: 75, color: '#00b8db', size: 2, delay: 2.6 },
                ].map((dot) => (
                  <motion.div
                    key={`${dot.angle}-${dot.radius}`}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: dot.size,
                      height: dot.size,
                      backgroundColor: dot.color,
                      left: '50%',
                      top: '50%',
                      marginLeft: -dot.size / 2,
                      marginTop: -dot.size / 2,
                    }}
                    animate={{
                      x: [
                        Math.cos((dot.angle * Math.PI) / 180) * (dot.radius * 0.6),
                        Math.cos((dot.angle * Math.PI) / 180) * (dot.radius * 1.8),
                      ],
                      y: [
                        Math.sin((dot.angle * Math.PI) / 180) * (dot.radius * 0.6),
                        Math.sin((dot.angle * Math.PI) / 180) * (dot.radius * 1.8),
                      ],
                      opacity: [0, 0.8, 0],
                    }}
                    transition={{
                      delay: dot.delay,
                      duration: 4,
                      ease: 'easeInOut',
                      repeat: Infinity,
                      repeatDelay: 2,
                    }}
                  />
                ))}
              </div>
            </div>
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
              {(['monthly', 'quarterly', 'annual', 'lifetime'] as const).map(
                (period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setBillingView(period)}
                    className={`relative z-10 px-5 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors duration-200 ${
                      billingView === period
                        ? period === 'lifetime'
                          ? 'text-base-100'
                          : 'text-primary-content'
                        : period === 'lifetime'
                          ? 'text-warning/40 hover:text-warning/60'
                          : 'text-base-content/35 hover:text-base-content/55'
                    }`}
                  >
                    {billingView === period && (
                      <motion.div
                        layoutId="billing-toggle"
                        className={`absolute inset-0 rounded-lg ${period === 'lifetime' ? 'bg-warning' : 'bg-primary'}`}
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
                        className={`relative z-10 ml-1.5 text-[8px] ${billingView === period ? 'text-primary-content/70' : 'text-primary/50'}`}
                      >
                        Best
                      </span>
                    )}
                    {period === 'lifetime' && (
                      <span
                        className={`relative z-10 ml-1.5 text-[8px] ${billingView === period ? 'text-base-100/70' : 'text-warning/40'}`}
                      >
                        Limited
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          </motion.div>

          {/* Pricing cards — AnimatePresence swaps between tiers and Lifetime */}
          <AnimatePresence mode="wait">
          {isLifetime ? (
            /* ═══════════════════════════════════════════════════════════════
               LIFETIME REVEAL — Epic single card with aura
               ═══════════════════════════════════════════════════════════════ */
            <motion.div
              key="lifetime-reveal"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ duration: 0.55, ease: EASE }}
              className="flex justify-center py-4"
            >
              <div className="relative w-full" style={{ maxWidth: 560 }}>
                {/* ── Expanding aura rings ── */}
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border pointer-events-none"
                    style={{
                      width: 300 + i * 100,
                      height: 300 + i * 100,
                      borderColor: `rgba(245, 158, 11, ${0.12 - i * 0.025})`,
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: [0.6, 1.1, 1],
                      opacity: [0, 0.8, 0.3],
                    }}
                    transition={{
                      delay: 0.2 + i * 0.12,
                      duration: 1.2,
                      ease: EASE,
                    }}
                  />
                ))}

                {/* ── Perpetual pulse rings ── */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={`pulse-${i}`}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-warning/15 pointer-events-none"
                    style={{ width: 400, height: 400 }}
                    animate={{ scale: [0.7, 1.8], opacity: [0.5, 0] }}
                    transition={{
                      delay: 1 + i * 1.3,
                      duration: 3,
                      ease: 'easeOut',
                      repeat: Infinity,
                      repeatDelay: 1.5,
                    }}
                  />
                ))}

                {/* ── Ambient orb ── */}
                <motion.div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    width: 500,
                    height: 500,
                    background:
                      'radial-gradient(circle, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0.03) 40%, transparent 70%)',
                    filter: 'blur(40px)',
                  }}
                  animate={{
                    scale: [1, 1.15, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />

                {/* ── Floating particles ── */}
                {Array.from({ length: 14 }, (_, i) => ({
                  id: i,
                  x: 20 + Math.random() * 60,
                  y: 10 + Math.random() * 80,
                  size: Math.random() * 2.5 + 1.5,
                  delay: 0.5 + Math.random() * 3,
                  duration: Math.random() * 5 + 6,
                })).map((p) => (
                  <motion.div
                    key={p.id}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      width: p.size,
                      height: p.size,
                      backgroundColor: '#f59e0b',
                    }}
                    animate={{ y: [0, -60, -120], opacity: [0, 0.6, 0] }}
                    transition={{
                      delay: p.delay,
                      duration: p.duration,
                      ease: 'easeInOut',
                      repeat: Infinity,
                    }}
                  />
                ))}

                {/* ── The Card ── */}
                <motion.div
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.15, duration: 0.6, ease: EASE }}
                  className="relative rounded-2xl overflow-hidden"
                >
                  {/* Pulsing border glow */}
                  <motion.div
                    className="absolute -inset-px rounded-2xl bg-gradient-to-b from-warning/30 via-warning/10 to-warning/5"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />

                  <div className="relative border border-warning/25 rounded-2xl p-8 sm:p-10">
                    {/* Background */}
                    <div className="absolute inset-0 bg-base-200/70 rounded-2xl pointer-events-none" />

                    {/* Top accent */}
                    <div
                      className="absolute top-0 left-0 right-0 h-px"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent, #f59e0b 50%, transparent)',
                      }}
                    />

                    {/* ── Amber smoke ── */}
                    <div
                      className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
                      style={{ zIndex: 1 }}
                    >
                      <motion.div
                        className="absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(135deg, #f59e0b12 0%, #f59e0b20 40%, #f59e0b12 60%, #f59e0b1a 100%)',
                        }}
                        animate={{ opacity: [0.4, 0.8, 0.4] }}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      <motion.div
                        className="absolute bottom-[-10%] left-[10%] w-[80%] h-[55%] rounded-full blur-3xl"
                        style={{
                          background:
                            'radial-gradient(ellipse 70% 60% at center bottom, #f59e0b30 0%, transparent 70%)',
                        }}
                        animate={{
                          y: [0, -30, 0],
                          scaleX: [1, 1.25, 1],
                          opacity: [0.3, 0.7, 0.3],
                        }}
                        transition={{
                          duration: 7,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      <motion.div
                        className="absolute top-[-8%] right-[5%] w-[70%] h-[50%] rounded-full blur-3xl"
                        style={{
                          background:
                            'radial-gradient(ellipse 65% 55% at center top, #f59e0b25 0%, transparent 65%)',
                        }}
                        animate={{
                          y: [0, 20, 0],
                          scaleX: [1, 1.15, 1],
                          opacity: [0.25, 0.6, 0.25],
                        }}
                        transition={{
                          duration: 8,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: 1.5,
                        }}
                      />
                      <motion.div
                        className="absolute top-[30%] left-[15%] w-[45px] h-[45px] rounded-full blur-xl"
                        style={{
                          background:
                            'radial-gradient(circle, #f59e0b45 0%, transparent 70%)',
                        }}
                        animate={{
                          y: [0, -15, 10, 0],
                          opacity: [0, 0.7, 0.3, 0],
                        }}
                        transition={{
                          duration: 5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      <motion.div
                        className="absolute top-[60%] right-[12%] w-[40px] h-[40px] rounded-full blur-lg"
                        style={{
                          background:
                            'radial-gradient(circle, #f59e0b40 0%, transparent 70%)',
                        }}
                        animate={{
                          y: [0, -10, 0],
                          opacity: [0, 0.5, 0],
                        }}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: 2.5,
                        }}
                      />
                    </div>

                    {/* Watermark */}
                    <Sparkles
                      size={140}
                      strokeWidth={0.3}
                      className="absolute -bottom-8 -right-8 text-base-content/[0.02] pointer-events-none"
                    />

                    {/* ── Content ── */}
                    <div className="relative z-10">
                      {/* Header */}
                      <div className="text-center mb-8">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{
                            delay: 0.3,
                            type: 'spring',
                            bounce: 0.35,
                            duration: 0.6,
                          }}
                          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
                          style={{
                            background: '#f59e0b15',
                            boxShadow:
                              '0 0 40px #f59e0b20, 0 0 0 1px #f59e0b25',
                          }}
                        >
                          <Sparkles
                            size={28}
                            className="text-warning"
                          />
                        </motion.div>

                        <h3 className="text-2xl font-black text-base-content mb-1">
                          The First Byte
                        </h3>
                        <p className="text-xs text-warning/50 font-medium">
                          Lifetime Uplink &middot; Founding Member
                        </p>
                      </div>

                      {/* Price */}
                      <div className="text-center mb-6">
                        <div className="flex items-baseline justify-center gap-2 mb-1">
                          <span className="text-5xl font-black text-base-content tracking-tight">
                            $749
                          </span>
                          <span className="text-sm text-base-content/25">
                            one-time
                          </span>
                        </div>
                        <p className="text-[10px] text-warning/40">
                          Permanent Uplink access &middot; No renewals
                        </p>
                      </div>

                      {/* Slot progress */}
                      <div className="mb-8 p-4 rounded-xl bg-base-100/60 border border-base-300/30">
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-[9px] text-base-content/25 uppercase tracking-wide">
                            Founding Member Slots
                          </span>
                          <span className="text-[10px] font-mono text-warning/60 font-bold">
                            128 total &middot; 0x00 — 0x7F
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-base-300/50 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-warning/70 via-warning to-primary/60 origin-left"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{
                              duration: 2,
                              delay: 0.5,
                              ease: EASE,
                            }}
                          />
                        </div>
                      </div>

                      {/* Features — 2 columns */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-8">
                        {[
                          'Permanent Uplink-tier access',
                          '50% off Unlimited upgrade',
                          '30s polling delivery',
                          'Founding member badge',
                          '25 symbols, 50 RSS feeds',
                          'Priority support',
                          'Pro + College sports',
                          'Early access to features',
                        ].map((feature) => (
                          <div
                            key={feature}
                            className="flex items-center gap-2"
                          >
                            <Check
                              size={12}
                              className="text-warning shrink-0"
                            />
                            <span className="text-[11px] text-base-content/55">
                              {feature}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Unlimited callout */}
                      <div className="relative mb-8 p-3.5 rounded-xl border border-primary/15 overflow-hidden"
                        style={{ background: 'rgba(52, 211, 153, 0.04)' }}
                      >
                        <div className="relative z-10">
                          <p className="text-[10px] text-primary/70 font-semibold mb-1">
                            Want real-time SSE?
                          </p>
                          <p className="text-[10px] text-base-content/35 leading-relaxed">
                            Lifetime members get 50% off any Unlimited
                            subscription. Add real-time delivery, webhooks,
                            API access, and unlimited limits starting at
                            $27.50/mo.
                          </p>
                        </div>
                      </div>

                      {/* CTA */}
                      <Link
                        to="/uplink/lifetime"
                        search={{ session_id: undefined }}
                        className="block w-full py-3.5 text-center text-xs font-bold bg-warning/10 border border-warning/30 text-warning rounded-xl hover:bg-warning/20 hover:border-warning/50 transition-colors"
                      >
                        Claim Your Slot
                      </Link>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            /* ═══════════════════════════════════════════════════════════════
               TIER CARDS — Uplink / Pro / Unlimited
               ═══════════════════════════════════════════════════════════════ */
            <motion.div
              key="tier-cards"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {/* ─── UPLINK ─── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
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
                      30s polling &middot; daily driver
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
                    <div className="flex items-center gap-2 h-5">
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

            {/* ─── PRO — COMMAND CENTER ─── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.09, duration: 0.5, ease: EASE }}
              whileHover={{
                y: -3,
                transition: { type: 'tween', duration: 0.2 },
              }}
              role="button"
              tabIndex={0}
              aria-label={`Select Pro ${BILLING_LABELS[billingPeriod]} plan`}
              onClick={() => handleSelectPlan(billingPeriod, 'pro')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectPlan(billingPeriod, 'pro')
                }
              }}
              className="group relative bg-base-200/40 border border-[#a78bfa]/15 rounded-xl p-6 hover:border-[#a78bfa]/30 transition-colors overflow-hidden cursor-pointer"
            >
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, #a78bfa 50%, transparent)',
                }}
              />
              <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#a78bfa]/[0.06]" />
              <Gauge
                size={90}
                strokeWidth={0.4}
                className="absolute -bottom-4 -right-4 text-base-content/[0.02] pointer-events-none"
              />
              <div className="relative z-10">
                <div className="flex items-center gap-2.5 mb-5">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center"
                    style={{
                      background: '#a78bfa15',
                      boxShadow:
                        '0 0 20px #a78bfa15, 0 0 0 1px #a78bfa20',
                    }}
                  >
                    <Gauge size={16} className="text-base-content/80" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-base-content">
                      Pro
                    </h3>
                    <p className="text-[9px] text-[#a78bfa]/50">
                      10s polling &middot; command center
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
                        {PRICING.pro[billingPeriod].price}
                      </AnimateNumber>
                    </span>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={PRICING.pro[billingPeriod].period}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-xs font-mono text-base-content/25"
                      >
                        {PRICING.pro[billingPeriod].period}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                    <div className="flex items-center gap-2 h-5">
                    <span className="text-[10px] font-mono text-base-content/25 tabular-nums">
                      ~$
                      <AnimateNumber
                        transition={{
                          y: { type: 'spring', bounce: 0.15, duration: 0.45 },
                          opacity: { duration: 0.15 },
                        }}
                      >
                        {PRICING.pro[billingPeriod].perMonth}
                      </AnimateNumber>
                      /mo
                    </span>
                    <AnimatePresence mode="wait">
                      {PRICING.pro[billingPeriod].savings && (
                        <motion.span
                          key={PRICING.pro[billingPeriod].savings}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.2, ease: EASE }}
                          className="text-[8px] font-bold text-[#a78bfa]/60 bg-[#a78bfa]/8 px-1.5 py-0.5 rounded"
                        >
                          {PRICING.pro[billingPeriod].savings}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-2.5 mb-6">
                  <PricingFeature highlight>10s polling delivery</PricingFeature>
                  <PricingFeature highlight>75 symbols, 150 RSS feeds</PricingFeature>
                  <PricingFeature highlight>Custom alerts & notifications</PricingFeature>
                  <PricingFeature highlight>Feed profiles & controls</PricingFeature>
                  <PricingFeature highlight>Priority RSS refresh</PricingFeature>
                  <PricingFeature highlight>10 fantasy leagues</PricingFeature>
                </div>

                <div className="w-full py-2.5 text-center text-[10px] font-semibold border border-[#a78bfa]/20 text-[#a78bfa]/60 rounded-lg group-hover:border-[#a78bfa]/40 group-hover:text-[#a78bfa]/80 transition-colors">
                  Get Pro
                </div>
              </div>
            </motion.div>

            {/* ─── UNLIMITED — THE ONE ─── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
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
              <div className="relative p-6 border border-primary/20 rounded-xl">
                {/* Background layer — below smoke. No backdrop-blur: it causes a
                     compositing snap when the parent's whileInView opacity animation
                     completes and the WAAPI layer is torn down. */}
                <div className="absolute inset-0 bg-base-200/60 rounded-xl pointer-events-none" />
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
                <div className="absolute top-0 right-0" style={{ zIndex: 20 }}>
                  <div className="bg-primary text-primary-content text-[7px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-bl-lg">
                    Most Popular
                  </div>
                </div>

                {/* ── Ethereal smoke — above background, below content ── */}
                <div
                  className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden"
                  style={{ zIndex: 1 }}
                >
                  {/* Base haze — fills card */}
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(ellipse 90% 60% at 50% 40%, #34d39928 0%, transparent 70%)',
                    }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{
                      duration: 5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />

                  {/* Rising plume */}
                  <motion.div
                    className="absolute bottom-[-10%] left-[15%] w-[75%] h-[55%] rounded-full blur-2xl"
                    style={{
                      background:
                        'radial-gradient(ellipse 70% 60% at center bottom, #34d39938 0%, transparent 70%)',
                    }}
                    animate={{
                      y: [0, -30, 0],
                      scaleX: [1, 1.25, 1],
                      opacity: [0.4, 0.8, 0.4],
                    }}
                    transition={{
                      duration: 7,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />

                  {/* Descending plume */}
                  <motion.div
                    className="absolute top-[-8%] right-[10%] w-[65%] h-[50%] rounded-full blur-2xl"
                    style={{
                      background:
                        'radial-gradient(ellipse 65% 55% at center top, #34d39930 0%, transparent 65%)',
                    }}
                    animate={{
                      y: [0, 25, 0],
                      scaleX: [1, 1.15, 1],
                      opacity: [0.35, 0.7, 0.35],
                    }}
                    transition={{
                      duration: 8,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: 1.5,
                    }}
                  />

                  {/* Mid-card turbulence */}
                  <motion.div
                    className="absolute top-[25%] left-[5%] w-[90%] h-[50%] rounded-full blur-3xl"
                    style={{
                      background:
                        'radial-gradient(ellipse 75% 50%, #34d39922 0%, transparent 60%)',
                    }}
                    animate={{
                      scaleX: [1, 1.2, 0.9, 1],
                      scaleY: [1, 0.9, 1.1, 1],
                      opacity: [0.4, 0.7, 0.5, 0.4],
                    }}
                    transition={{
                      duration: 10,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />

                  {/* Accent particle */}
                  <motion.div
                    className="absolute top-[30%] right-[15%] w-[50px] h-[50px] rounded-full blur-lg"
                    style={{
                      background:
                        'radial-gradient(circle, #34d39950 0%, transparent 70%)',
                    }}
                    animate={{
                      y: [0, -15, 10, 0],
                      x: [0, -8, 5, 0],
                      opacity: [0, 0.7, 0.35, 0],
                    }}
                    transition={{
                      duration: 5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />

                  {/* Second accent particle */}
                  <motion.div
                    className="absolute top-[65%] left-[20%] w-[40px] h-[40px] rounded-full blur-lg"
                    style={{
                      background:
                        'radial-gradient(circle, #34d39945 0%, transparent 70%)',
                    }}
                    animate={{
                      y: [0, -10, 0],
                      opacity: [0, 0.6, 0],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: 2.5,
                    }}
                  />
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
                    <div className="flex items-center gap-2 h-5">
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
                      Unlimited everything
                    </PricingFeature>
                    <PricingFeature highlight>
                      Webhooks & integrations
                    </PricingFeature>
                    <PricingFeature highlight>
                      Data export & API access
                    </PricingFeature>
                    <PricingFeature highlight>
                      Priority support
                    </PricingFeature>
                    <PricingFeature highlight>
                      Everything in Pro, plus more
                    </PricingFeature>
                  </div>

                  <div className="w-full py-2.5 text-center text-[10px] font-semibold bg-primary/10 border border-primary/30 text-primary rounded-lg group-hover:bg-primary/20 group-hover:border-primary/50 transition-colors">
                    Get Unlimited
                  </div>
                </div>
              </div>
            </motion.div>

          </div>
            </motion.div>
          )}
          </AnimatePresence>

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
              Free tier always included &middot; Cancel anytime
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
              Free is forever. Three tiers unlock more.
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
                 Grid is 1.4fr+1fr+1fr+1fr+1fr = 5.4fr.
                 Unlimited column = rightmost 1/5.4 ≈ 18.5% of table.
                 Smoke fills the full column and bleeds at edges. */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
              {/* Base wash — fills exact column bounds, breathing opacity */}
              <motion.div
                className="absolute inset-y-0 right-0 w-[18.5%]"
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
                className="absolute inset-y-[-8%] right-[-2%] w-[26%] blur-3xl"
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
                className="absolute inset-y-[5%] right-[16%] w-[5%] blur-2xl"
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
                className="absolute bottom-[-5%] right-[1%] w-[17%] h-[60%] rounded-full blur-2xl"
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
                className="absolute top-[-5%] right-[2%] w-[16%] h-[55%] rounded-full blur-2xl"
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
                className="absolute top-[20%] right-[0%] w-[19%] h-[60%] rounded-full blur-3xl"
                style={{
                  background:
                    'radial-gradient(ellipse 75% 50%, #34d39918 0%, transparent 65%)',
                }}
                animate={{
                  scaleX: [1, 1.25, 0.9, 1],
                  scaleY: [1, 0.9, 1.15, 1],
                  x: [0, -10, 6, 0],
                  opacity: [0.35, 0.65, 0.45, 0.35],
                }}
                transition={{
                  duration: 10,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Left drift tendril — leaks from column into Pro territory */}
              <motion.div
                className="absolute top-[15%] right-[12%] w-[20%] h-[40%] rounded-full blur-3xl"
                style={{
                  background:
                    'radial-gradient(ellipse 70% 45%, #34d39910 0%, transparent 65%)',
                }}
                animate={{
                  x: [0, -60, 0],
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
                className="absolute top-[25%] right-[5%] w-[50px] h-[50px] rounded-full blur-xl"
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
                className="absolute top-[65%] right-[10%] w-[40px] h-[40px] rounded-full blur-lg"
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

              {/* Top spill — smoke bleeds above the table */}
              <motion.div
                className="absolute -top-24 right-0 w-[24%] h-[200px] rounded-full blur-3xl"
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
                className="absolute -bottom-20 right-0 w-[24%] h-[180px] rounded-full blur-3xl"
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
            <div className="relative grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] border-b border-base-300/40">
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
              <div className="p-5 text-center border-l border-[#a78bfa]/15 bg-[#a78bfa]/[0.03]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a78bfa] flex items-center justify-center gap-1.5">
                  <Gauge size={11} /> Pro
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
                className={`grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] ${i < COMPARISON.length - 1 ? 'border-b border-base-300/20' : ''} group hover:bg-base-200/40 transition-colors duration-200`}
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
                <div className="p-4 flex items-center justify-center border-l border-[#a78bfa]/10 bg-[#a78bfa]/[0.015]">
                  {row.proUp ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold font-mono text-[#a78bfa]/80">
                      <Check size={11} className="text-[#a78bfa] shrink-0" />
                      {row.pro}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-base-content/25">
                      <Minus size={9} className="text-base-content/15 shrink-0" />
                      {row.pro}
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
              Three tiers, one mission: total coverage
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
                    : tier.tier === 'pro'
                      ? 'border border-[#a78bfa]/20'
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
                  className={`relative p-7 md:p-8 h-full flex flex-col ${
                    tier.tier === 'unlimited' ? '' : 'bg-base-200/40'
                  }`}
                >
                  {/* Background layer — separate for Unlimited so smoke sits above it */}
                  {tier.tier === 'unlimited' && (
                    <div className="absolute inset-0 bg-base-200/60 rounded-2xl pointer-events-none" />
                  )}

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
                    <div className="absolute top-0 right-0" style={{ zIndex: 20 }}>
                      <div className="bg-primary text-primary-content text-[7px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-bl-lg">
                        Recommended
                      </div>
                    </div>
                  )}

                   {/* ── Ethereal smoke (Unlimited only) — above background, below content ── */}
                  {tier.tier === 'unlimited' && (
                    <div
                      className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
                      style={{ zIndex: 1 }}
                    >
                      {/* Base wash */}
                      <motion.div
                        className="absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(135deg, #34d39915 0%, #34d39928 40%, #34d39915 60%, #34d39925 100%)',
                        }}
                        animate={{ opacity: [0.5, 0.9, 0.5] }}
                        transition={{
                          duration: 4.5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />

                      {/* Left bloom */}
                      <motion.div
                        className="absolute top-[10%] left-[-5%] w-[55%] h-[60%] rounded-full blur-3xl"
                        style={{
                          background:
                            'radial-gradient(ellipse 75% 60%, #34d39930 0%, transparent 70%)',
                        }}
                        animate={{
                          x: [0, 15, 0],
                          scaleY: [1, 1.15, 1],
                          opacity: [0.4, 0.75, 0.4],
                        }}
                        transition={{
                          duration: 7,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />

                      {/* Right bloom */}
                      <motion.div
                        className="absolute bottom-[5%] right-[-3%] w-[50%] h-[55%] rounded-full blur-3xl"
                        style={{
                          background:
                            'radial-gradient(ellipse 70% 55%, #34d39928 0%, transparent 65%)',
                        }}
                        animate={{
                          x: [0, -12, 0],
                          y: [0, -20, 0],
                          opacity: [0.35, 0.7, 0.35],
                        }}
                        transition={{
                          duration: 8,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: 1,
                        }}
                      />

                      {/* Center turbulence */}
                      <motion.div
                        className="absolute top-[30%] left-[20%] w-[60%] h-[45%] rounded-full blur-3xl"
                        style={{
                          background:
                            'radial-gradient(ellipse 70% 50%, #34d39922 0%, transparent 60%)',
                        }}
                        animate={{
                          scaleX: [1, 1.2, 0.9, 1],
                          scaleY: [1, 0.9, 1.15, 1],
                          opacity: [0.3, 0.65, 0.45, 0.3],
                        }}
                        transition={{
                          duration: 10,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />

                      {/* Rising tendril */}
                      <motion.div
                        className="absolute bottom-[-8%] left-[30%] w-[45%] h-[50%] rounded-full blur-2xl"
                        style={{
                          background:
                            'radial-gradient(ellipse 65% 60% at center bottom, #34d39935 0%, transparent 70%)',
                        }}
                        animate={{
                          y: [0, -40, 0],
                          scaleX: [1, 1.3, 1],
                          opacity: [0.35, 0.75, 0.35],
                        }}
                        transition={{
                          duration: 7,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: 2,
                        }}
                      />

                      {/* Accent particles */}
                      <motion.div
                        className="absolute top-[22%] right-[18%] w-[55px] h-[55px] rounded-full blur-xl"
                        style={{
                          background:
                            'radial-gradient(circle, #34d39950 0%, transparent 70%)',
                        }}
                        animate={{
                          y: [0, -15, 10, 0],
                          opacity: [0, 0.7, 0.35, 0],
                        }}
                        transition={{
                          duration: 5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      <motion.div
                        className="absolute top-[60%] left-[12%] w-[45px] h-[45px] rounded-full blur-lg"
                        style={{
                          background:
                            'radial-gradient(circle, #34d39945 0%, transparent 70%)',
                        }}
                        animate={{
                          y: [0, -12, 0],
                          opacity: [0, 0.6, 0],
                        }}
                        transition={{
                          duration: 4.5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: 3,
                        }}
                      />
                    </div>
                  )}

                  <div className="relative z-10 flex flex-col flex-1">
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
                            {tier.deliverySub}
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

                    {/* CTA — mt-auto pushes to bottom, pt-7 guarantees min gap */}
                    <div className="mt-auto pt-7">
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectPlan('annual', tier.tier)
                        }
                        className={`w-full py-2.5 text-center text-[10px] font-semibold rounded-lg transition-colors ${
                          tier.tier === 'unlimited'
                            ? 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50'
                            : tier.tier === 'pro'
                              ? 'border border-[#a78bfa]/20 text-[#a78bfa]/60 hover:border-[#a78bfa]/40 hover:text-[#a78bfa]/80'
                              : 'border border-info/20 text-info/60 hover:border-info/40 hover:text-info/80'
                        }`}
                      >
                        {tier.tier === 'unlimited'
                          ? 'Get Unlimited — from $37.50/mo'
                          : tier.tier === 'pro'
                            ? 'Get Pro — from $20.00/mo'
                            : 'Get Uplink — from $8.33/mo'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          FAQ — TIER BREAKDOWN
          ================================================================ */}
      <FAQSection
        items={UPLINK_FAQ}
        title="Tiers"
        titleHighlight="Explained"
        subtitle="Everything in the comparison table, broken down."
      />

      {/* ================================================================
          BOTTOM CTA
          ================================================================ */}
      <BottomCTA handleSelectPlan={handleSelectPlan} />
    </div>
  )
}
