import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  Check,
  Clock,
  Crown,
  Gauge,
  Rocket,
  Satellite,
  Shield,
  Signal,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'

import { usePageMeta } from '@/lib/usePageMeta'
import { itemVariants, pageVariants } from '@/lib/animations'

export const Route = createFileRoute('/uplink')({
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
    label: 'Refresh Priority',
    free: 'Standard',
    uplink: 'Priority',
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
  {
    label: 'Real-time CDC',
    free: 'Full',
    uplink: 'Full',
  },
]

// ── Feature Cards ───────────────────────────────────────────────

interface Feature {
  icon: React.ReactNode
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: <Gauge size={20} />,
    title: 'Every Stream, Maxed',
    description:
      'Track every symbol, subscribe to every feed, follow every league. Your feed, fully loaded.',
  },
  {
    icon: <Zap size={20} />,
    title: 'Priority Pipeline',
    description:
      'Your data streams get priority processing. Faster refreshes, lower latency, first in queue.',
  },
  {
    icon: <Shield size={20} />,
    title: 'Early Access',
    description:
      'First to test new integrations and features before they go live. Help shape the roadmap.',
  },
  {
    icon: <Signal size={20} />,
    title: 'Extended Retention',
    description:
      'Longer data retention windows for historical lookback on trades, scores, and articles.',
  },
]

// ── Page Component ──────────────────────────────────────────────

function UplinkPage() {
  usePageMeta({
    title: 'Uplink — Scrollr',
    description:
      'Total coverage for power users. Scrollr Uplink gives you unlimited tracking, priority data, and early access to new integrations.',
  })

  return (
    <motion.div
      className="min-h-screen pt-20"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-20 overflow-hidden border-b border-base-300 bg-base-200/30">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(191, 255, 0, 0.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(191, 255, 0, 0.4) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          }}
        />

        {/* Glow effects */}
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-primary/3 rounded-full blur-[100px] pointer-events-none" />

        {/* Scan line */}
        <motion.div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <motion.div
            className="absolute w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"
            animate={{ y: [-100, 800] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>

        <div className="container relative z-10">
          <motion.div className="max-w-4xl" variants={itemVariants}>
            {/* Badge */}
            <div className="flex items-center gap-3 mb-8">
              <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-md border border-primary/20 uppercase tracking-[0.2em] flex items-center gap-2">
                <Satellite size={14} /> uplink
              </span>
              <span className="h-px w-12 bg-base-300" />
              <span className="text-[10px] font-mono text-base-content/30 uppercase">
                power tier &middot; coming soon
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight uppercase mb-6 leading-[0.9]">
              Total
              <br />
              <span className="text-primary">Coverage</span>
            </h1>

            {/* Subtitle — terminal style */}
            <div className="flex items-start gap-3 mb-10 max-w-lg">
              <span className="text-primary/40 font-mono text-sm mt-0.5 select-none shrink-0">
                $
              </span>
              <p className="text-sm text-base-content/40 font-mono leading-relaxed">
                Scrollr is free and open source. Uplink is for power users who
                want more — every symbol, every feed, every league, and priority
                data delivery.
              </p>
            </div>

            {/* CTA */}
            <div className="flex flex-wrap items-center gap-4">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="relative group"
              >
                <div className="absolute -inset-1 bg-primary/20 rounded-sm blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                <button
                  type="button"
                  disabled
                  className="relative inline-flex items-center gap-2 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.2em] border border-primary/40 text-primary bg-primary/5 rounded-sm cursor-not-allowed"
                >
                  <Rocket size={14} />
                  Coming Soon
                </button>
              </motion.div>

              <span className="text-[9px] font-mono text-base-content/20 uppercase tracking-wider">
                Starting at $7.99 / quarter
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ─────────────────────────────────── */}
      <section className="container py-20">
        <motion.div variants={itemVariants} className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
            <TrendingUp size={16} /> Free vs Uplink
          </h2>
          <p className="text-[10px] font-mono text-base-content/30">
            What the free tier includes vs what Uplink adds
          </p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="relative overflow-hidden rounded-xl border border-base-300 bg-base-200/50"
        >
          {/* Table Header */}
          <div className="grid grid-cols-3 border-b border-base-300 bg-base-200/80">
            <div className="p-4 pl-6">
              <span className="text-[9px] font-mono text-base-content/30 uppercase tracking-widest">
                Feature
              </span>
            </div>
            <div className="p-4 text-center border-l border-base-300/50">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-base-content/50">
                Free
              </span>
            </div>
            <div className="p-4 text-center border-l border-primary/10 bg-primary/[0.03]">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary flex items-center justify-center gap-1.5">
                <Crown size={12} /> Uplink
              </span>
            </div>
          </div>

          {/* Table Rows */}
          {COMPARISON.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-3 ${i < COMPARISON.length - 1 ? 'border-b border-base-300/50' : ''} group hover:bg-base-200/30 transition-colors`}
            >
              <div className="p-4 pl-6 flex items-center">
                <span className="text-xs text-base-content/60 font-medium">
                  {row.label}
                </span>
              </div>
              <div className="p-4 flex items-center justify-center border-l border-base-300/50">
                <span className="text-xs font-mono text-base-content/40">
                  {row.free}
                </span>
              </div>
              <div className="p-4 flex items-center justify-center border-l border-primary/10 bg-primary/[0.02]">
                {row.upgraded ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold font-mono text-primary/80">
                    <Check size={12} className="text-primary" />
                    {row.uplink}
                  </span>
                ) : (
                  <span className="text-xs font-mono text-base-content/40">
                    {row.uplink}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Table Footer */}
          <div className="border-t border-base-300 bg-base-200/80 p-4 text-center">
            <span className="text-[9px] font-mono text-base-content/20 uppercase tracking-wider">
              Per-account &middot; Free tier is always included &middot; Upgrade
              anytime
            </span>
          </div>
        </motion.div>
      </section>

      {/* ── FEATURE GRID ─────────────────────────────────────── */}
      <section className="container pb-20">
        <motion.div variants={itemVariants} className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
            <Zap size={16} /> What You Get
          </h2>
          <p className="text-[10px] font-mono text-base-content/30">
            The full power-user experience
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              whileHover={{ y: -2 }}
              className="group bg-base-200 border border-base-300 rounded-xl p-6 hover:border-primary/20 transition-all relative overflow-hidden"
            >
              {/* Hover glow */}
              <div className="absolute inset-0 bg-primary/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

              <div className="relative z-10">
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                  {feature.icon}
                </div>

                <h3 className="text-sm font-bold uppercase tracking-wider text-base-content mb-1">
                  {feature.title}
                </h3>
                <p className="text-xs text-base-content/30 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────── */}
      <section className="container pb-20">
        <motion.div variants={itemVariants} className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
            <Crown size={16} /> Pricing
          </h2>
          <p className="text-[10px] font-mono text-base-content/30">
            Three tiers, no monthly billing — commit to what works for you
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Quarterly */}
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -2 }}
            className="group bg-base-200 border border-base-300 rounded-xl p-6 hover:border-primary/20 transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-primary/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Clock size={20} />
                </div>
                <span className="text-[9px] font-mono text-base-content/30 uppercase tracking-widest">
                  Entry
                </span>
              </div>

              <h3 className="text-sm font-bold uppercase tracking-wider text-base-content mb-1">
                Quarterly
              </h3>
              <p className="text-[10px] font-mono text-primary/50 uppercase tracking-wider mb-4">
                3-month access
              </p>

              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-black text-base-content tracking-tight">
                  $7.99
                </span>
                <span className="text-xs font-mono text-base-content/30">
                  / 3 months
                </span>
              </div>
              <p className="text-[10px] font-mono text-base-content/20 mb-5">
                ~$2.66/mo
              </p>

              <div className="space-y-2">
                <PricingFeature>Full Uplink access</PricingFeature>
                <PricingFeature>All integrations maxed</PricingFeature>
                <PricingFeature>Priority data pipeline</PricingFeature>
              </div>
            </div>
          </motion.div>

          {/* Annual — highlighted */}
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -2 }}
            className="group bg-base-200 border-2 border-primary/30 rounded-xl p-6 hover:border-primary/50 transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-primary/[0.03] pointer-events-none" />

            {/* Best value badge */}
            <div className="absolute top-0 right-0">
              <div className="bg-primary text-base-200 text-[8px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-bl-lg">
                Best Value
              </div>
            </div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Star size={20} />
                </div>
                <span className="text-[9px] font-mono text-primary/50 uppercase tracking-widest">
                  Save 22%
                </span>
              </div>

              <h3 className="text-sm font-bold uppercase tracking-wider text-base-content mb-1">
                Annual
              </h3>
              <p className="text-[10px] font-mono text-primary/50 uppercase tracking-wider mb-4">
                12-month access
              </p>

              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-black text-base-content tracking-tight">
                  $24.99
                </span>
                <span className="text-xs font-mono text-base-content/30">
                  / year
                </span>
              </div>
              <p className="text-[10px] font-mono text-base-content/20 mb-5">
                ~$2.08/mo
              </p>

              <div className="space-y-2">
                <PricingFeature>Full Uplink access</PricingFeature>
                <PricingFeature>All integrations maxed</PricingFeature>
                <PricingFeature>Priority data pipeline</PricingFeature>
                <PricingFeature>Early access to new features</PricingFeature>
              </div>
            </div>
          </motion.div>

          {/* Lifetime */}
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -2 }}
            className="group bg-base-200 border border-base-300 rounded-xl p-6 hover:border-primary/20 transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-primary/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Sparkles size={20} />
                </div>
                <span className="text-[9px] font-mono text-warning/60 uppercase tracking-widest">
                  Limited
                </span>
              </div>

              <h3 className="text-sm font-bold uppercase tracking-wider text-base-content mb-1">
                Lifetime
              </h3>
              <p className="text-[10px] font-mono text-primary/50 uppercase tracking-wider mb-4">
                The First Byte
              </p>

              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-black text-base-content tracking-tight">
                  $199
                </span>
                <span className="text-xs font-mono text-base-content/30">
                  / forever
                </span>
              </div>
              <p className="text-[10px] font-mono text-warning/50 mb-5">
                Only 256 available — 0x00 to 0xFF
              </p>

              <div className="space-y-2">
                <PricingFeature>Everything in Annual</PricingFeature>
                <PricingFeature>Permanent Uplink access</PricingFeature>
                <PricingFeature>Founding member status</PricingFeature>
                <PricingFeature>Shape the roadmap</PricingFeature>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Pricing footer */}
        <motion.div
          variants={itemVariants}
          className="mt-6 text-center"
        >
          <p className="text-[9px] font-mono text-base-content/20 uppercase tracking-wider">
            All plans include the full free tier &middot; Cancel anytime
            &middot; Payments via Stripe
          </p>
        </motion.div>
      </section>

      {/* ── TERMINAL BLOCK — Uplink Status ───────────────────── */}
      <section className="container pb-20">
        <motion.div
          variants={itemVariants}
          className="relative overflow-hidden rounded-xl border border-base-300 bg-base-200/60"
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
          <div className="flex items-center gap-2 px-5 py-3 border-b border-base-300/50 bg-base-200/80">
            <span className="w-2.5 h-2.5 rounded-full bg-error/40" />
            <span className="w-2.5 h-2.5 rounded-full bg-warning/40" />
            <span className="w-2.5 h-2.5 rounded-full bg-success/40" />
            <span className="ml-3 text-[9px] font-mono text-base-content/20 uppercase tracking-widest">
              uplink_status.sh
            </span>
          </div>

          <div className="p-6 md:p-8 font-mono text-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-primary/40 select-none">$</span>
              <span className="text-base-content/60">
                scrollr uplink status
              </span>
            </div>
            <div className="pl-5 space-y-1.5 text-base-content/30 text-xs">
              <p>
                <span className="text-primary/60">STATUS</span>{' '}
                <span className="text-warning">IN_DEVELOPMENT</span>
              </p>
              <p>
                <span className="text-primary/60">ETA</span>{' '}
                <span className="text-base-content/40">Q3 2026</span>
              </p>
              <p>
                <span className="text-primary/60">QUARTERLY</span>{' '}
                <span className="text-base-content/40">$7.99/3mo</span>
              </p>
              <p>
                <span className="text-primary/60">ANNUAL</span>{' '}
                <span className="text-base-content/40">$24.99/yr</span>
              </p>
              <p>
                <span className="text-primary/60">LIFETIME</span>{' '}
                <span className="text-base-content/40">
                  $199 (256 slots)
                </span>
              </p>
              <p>
                <span className="text-primary/60">FREE_TIER</span>{' '}
                <span className="text-success/60">ALWAYS_FREE</span>
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <span className="text-primary/40 select-none">$</span>
              <span className="text-base-content/60">
                scrollr uplink subscribe --notify
              </span>
            </div>
            <div className="pl-5 text-base-content/30 text-xs">
              <p>
                <span className="text-primary/60">→</span> Notifications not
                available yet. Check back soon.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-primary/40 select-none">$</span>
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="w-2 h-4 bg-primary/40 inline-block"
              />
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── BOTTOM CTA ──────────────────────────────────────── */}
      <section className="container pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-sm bg-base-200/60 border border-base-300 p-8 md:p-12 lg:p-16"
        >
          {/* Glow */}
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[250px] h-[250px] bg-primary/3 rounded-full blur-[60px] pointer-events-none" />

          <div
            className="absolute inset-0 opacity-[0.02] pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />

          <div className="relative z-10 text-center max-w-2xl mx-auto">
            <motion.span
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-primary/10 border border-primary/20"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              <span className="text-xs font-mono uppercase tracking-widest text-primary">
                In Development
              </span>
            </motion.span>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase mb-5 leading-tight"
            >
              Scrollr is <span className="text-primary">free forever</span>
              <br />
              Uplink is for those who want more
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-base text-base-content/40 leading-relaxed mb-8 font-mono"
            >
              The core platform stays open source with full real-time data.
              Uplink gives power users total coverage across every integration.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap items-center justify-center gap-4"
            >
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary/50 border border-primary/15 rounded-sm bg-primary/5">
                <Zap size={12} /> Starting at $7.99
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-base-content/30 border border-base-300/50 rounded-sm">
                <Trophy size={12} /> Free tier always included
              </span>
            </motion.div>
          </div>
        </motion.div>
      </section>
    </motion.div>
  )
}

// ── Pricing Feature Line ──────────────────────────────────────────

function PricingFeature({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Check size={12} className="text-primary/60 shrink-0" />
      <span className="text-xs text-base-content/40">{children}</span>
    </div>
  )
}
