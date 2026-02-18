import { createFileRoute, Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import type { ComponentType } from 'react'
import {
  ArrowRight,
  Eye,
  Globe,
  Layers,
  LogIn,
  Monitor,
  Rss,
  Settings,
  Shield,
  Sliders,
  TrendingUp,
  Trophy,
  UserPlus,
} from 'lucide-react'

import { usePageMeta } from '@/lib/usePageMeta'

export const Route = createFileRoute('/onboard')({
  component: OnboardPage,
})

// ── Signature easing (matches homepage) ────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const

// ── Integration hex map ────────────────────────────────────────
const HEX = {
  primary: '#34d399',
  secondary: '#ff4757',
  info: '#00b8db',
  accent: '#a855f7',
  success: '#22c55e',
} as const

// ── Ticker chips for the hero preview ──────────────────────────

interface TickerChip {
  label: string
  value: string
  color: 'primary' | 'secondary' | 'info'
  icon?: string
}

const HERO_TICKER: TickerChip[] = [
  { label: 'BTC', value: '$67,241', color: 'primary', icon: '↑' },
  { label: 'LAL 118', value: 'BOS 112', color: 'secondary', icon: 'FINAL' },
  { label: 'NVDA', value: '$891.20', color: 'primary', icon: '↑' },
  { label: 'Fed holds rates steady', value: 'Reuters', color: 'info' },
  { label: 'MIA 94', value: 'GSW 88', color: 'secondary', icon: 'Q4' },
  { label: 'ETH', value: '$3,412', color: 'primary', icon: '↓' },
  { label: 'SPY', value: '$512.08', color: 'primary', icon: '↑' },
  { label: 'NYG 21', value: 'DAL 17', color: 'secondary', icon: 'HALF' },
]

const chipColorMap = {
  primary: {
    border: 'border-primary/25',
    text: 'text-primary',
    bg: 'bg-primary/[0.06]',
    sub: 'text-primary/60',
  },
  secondary: {
    border: 'border-secondary/25',
    text: 'text-secondary',
    bg: 'bg-secondary/[0.06]',
    sub: 'text-secondary/60',
  },
  info: {
    border: 'border-info/25',
    text: 'text-info',
    bg: 'bg-info/[0.06]',
    sub: 'text-info/60',
  },
}

// ── How It Works Steps ─────────────────────────────────────────

interface HowStep {
  Icon: ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
  hex: string
  Watermark: ComponentType<{
    size?: number
    strokeWidth?: number
    className?: string
  }>
}

const HOW_IT_WORKS: HowStep[] = [
  {
    Icon: Eye,
    title: 'The Feed Bar',
    description:
      'A thin ticker pinned to the bottom of your browser. Scores, prices, and headlines scroll by while you browse — always visible, never in the way.',
    hex: HEX.primary,
    Watermark: Eye,
  },
  {
    Icon: Layers,
    title: 'Streams',
    description:
      'Each data source is a "stream." Finance and sports are on right now. Toggle them on or off — the feed bar shows whatever you enable.',
    hex: HEX.info,
    Watermark: Layers,
  },
  {
    Icon: Sliders,
    title: 'Your Controls',
    description:
      'Click the Scrollr icon in your toolbar to toggle the feed bar, switch streams, or reposition it. You are in full control.',
    hex: HEX.secondary,
    Watermark: Sliders,
  },
]

// ── Without Account ────────────────────────────────────────────

interface FreeFeature {
  Icon: ComponentType<{ size?: number; className?: string }>
  label: string
  description: string
  hex: string
}

const WITHOUT_ACCOUNT: FreeFeature[] = [
  {
    Icon: TrendingUp,
    label: 'Live market prices',
    description: '50 tracked symbols — stocks and crypto updating in real time',
    hex: HEX.primary,
  },
  {
    Icon: Trophy,
    label: 'Live sports scores',
    description: 'NFL, NBA, NHL, MLB and college sports from ESPN',
    hex: HEX.secondary,
  },
  {
    Icon: Monitor,
    label: 'Full feed bar controls',
    description: 'Toggle, reposition, resize — make it yours',
    hex: HEX.info,
  },
]

// ── With Account ───────────────────────────────────────────────

interface AccountFeature {
  Icon: ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
  hex: string
  Watermark: ComponentType<{
    size?: number
    strokeWidth?: number
    className?: string
  }>
}

const WITH_ACCOUNT: AccountFeature[] = [
  {
    Icon: Rss,
    title: 'RSS News Feeds',
    description:
      '100+ curated feeds across 8 categories — tech, finance, world news, and more. Pick the sources you actually read.',
    hex: HEX.info,
    Watermark: Rss,
  },
  {
    Icon: Sliders,
    title: 'Personalized Streams',
    description:
      'Choose exactly which symbols, leagues, feeds, and fantasy teams appear in your ticker.',
    hex: HEX.accent,
    Watermark: Sliders,
  },
  {
    Icon: Globe,
    title: 'Sync Across Browsers',
    description:
      'Your config and preferences travel with your account. Log in anywhere, pick up where you left off.',
    hex: HEX.primary,
    Watermark: Globe,
  },
  {
    Icon: Settings,
    title: 'Dashboard Access',
    description:
      'Full web dashboard to manage streams, browse feed catalogs, connect Yahoo Fantasy, and monitor your setup.',
    hex: HEX.secondary,
    Watermark: Settings,
  },
  {
    Icon: Shield,
    title: 'Site Filtering',
    description:
      'Control which websites show the feed bar. Keep it focused where you want it.',
    hex: HEX.info,
    Watermark: Shield,
  },
]

// ── Hero Ticker Preview ────────────────────────────────────────

function HeroTicker() {
  const allChips = [...HERO_TICKER, ...HERO_TICKER]
  return (
    <div className="group/ticker relative overflow-hidden rounded-xl border border-base-300/25 bg-base-100/80">
      <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-base-100/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-base-100/80 to-transparent z-10 pointer-events-none" />
      <div className="flex items-center gap-3 py-2.5 px-4 animate-ticker-scroll group-hover/ticker:[animation-play-state:paused]">
        {allChips.map((chip, i) => {
          const colors = chipColorMap[chip.color]
          return (
            <div
              key={`${chip.label}-${i}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colors.border} ${colors.bg} shrink-0`}
            >
              <span
                className={`text-[11px] font-bold font-mono ${colors.text} whitespace-nowrap`}
              >
                {chip.label}
              </span>
              <span
                className={`text-[10px] font-mono ${colors.sub} whitespace-nowrap`}
              >
                {chip.value}
              </span>
              {chip.icon && (
                <span
                  className={`text-[9px] font-bold font-mono ${colors.text} opacity-70 whitespace-nowrap`}
                >
                  {chip.icon}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page Component ─────────────────────────────────────────────

function OnboardPage() {
  usePageMeta({
    title: 'Welcome to Scrollr',
    description:
      'You just installed Scrollr. Here is what you have right now and how to get the most out of it.',
    canonicalUrl: 'https://myscrollr.com/onboard',
  })

  return (
    <div className="min-h-screen pt-20">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-20 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, var(--grid-dot-primary) 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
          <motion.div
            className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, var(--glow-primary-subtle) 0%, transparent 70%)',
            }}
            whileInView={{ scale: [1, 1.08, 1], opacity: [0.5, 0.9, 0.5] }}
            viewport={{ once: false, margin: '200px' }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, var(--glow-primary-subtle) 0%, transparent 70%)',
            }}
            whileInView={{ scale: [1, 1.06, 1], opacity: [0.3, 0.6, 0.3] }}
            viewport={{ once: false, margin: '200px' }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 1,
            }}
          />
        </div>

        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        <div className="container relative z-10 !py-0 text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="flex items-center justify-center gap-3 mb-8"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-success/8 text-success text-[10px] font-bold rounded-lg border border-success/15 uppercase tracking-wide">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
              </span>
              Extension Active
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight leading-[0.95] mb-6"
          >
            You're <span className="text-gradient-primary">Live</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
            className="text-base text-base-content/45 max-w-lg mx-auto leading-relaxed mb-10"
          >
            Your feed bar is running right now. Scores, stock prices, and
            headlines are scrolling at the bottom of every tab you open.
          </motion.p>

          {/* Live ticker preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5, ease: EASE }}
            className="max-w-3xl mx-auto"
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              <span className="text-[10px] text-base-content/30">
                This is what your feed bar looks like
              </span>
            </div>
            <HeroTicker />
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

        <div className="container relative z-10">
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              How It <span className="text-gradient-primary">Works</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Three concepts — that's all you need
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={step.title}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.6,
                  ease: EASE,
                }}
                className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 overflow-hidden hover:border-base-300/50 transition-colors"
              >
                {/* Accent top line */}
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${step.hex} 50%, transparent)`,
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

                {/* Ambient glow orb on hover */}
                <div
                  className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `${step.hex}10` }}
                />

                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-5">
                    <span className="text-xs text-base-content/15 font-black font-mono">
                      0{i + 1}
                    </span>
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{
                        background: `${step.hex}15`,
                        boxShadow: `0 0 20px ${step.hex}15, 0 0 0 1px ${step.hex}20`,
                      }}
                    >
                      <step.Icon size={20} className="text-base-content/80" />
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-base-content mb-2">
                    {step.title}
                  </h3>
                  <p className="text-xs text-base-content/40 leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Watermark icon */}
                <step.Watermark
                  size={100}
                  strokeWidth={0.4}
                  className="absolute -bottom-3 -right-3 text-base-content/[0.025] pointer-events-none"
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT YOU HAVE NOW ─────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="container">
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Ready <span className="text-gradient-primary">Right Now</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              No account needed — these are already running
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {WITHOUT_ACCOUNT.map((item, i) => (
              <motion.div
                key={item.label}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.6,
                  ease: EASE,
                }}
                className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 overflow-hidden hover:border-base-300/50 transition-colors text-center"
              >
                {/* Accent top line */}
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${item.hex} 50%, transparent)`,
                  }}
                />

                <div className="relative z-10">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4"
                    style={{
                      background: `${item.hex}15`,
                      boxShadow: `0 0 20px ${item.hex}15, 0 0 0 1px ${item.hex}20`,
                    }}
                  >
                    <item.Icon size={20} className="text-base-content/80" />
                  </div>
                  <p className="text-xs font-bold text-base-content mb-1">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-base-content/40 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY CREATE AN ACCOUNT ─────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

        <div className="container relative z-10">
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Unlock <span className="text-gradient-primary">More</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Create a free account and the whole platform opens up
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {WITH_ACCOUNT.map((item, i) => (
              <motion.div
                key={item.title}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.6,
                  ease: EASE,
                }}
                className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 overflow-hidden hover:border-base-300/50 transition-colors"
              >
                {/* Accent top line */}
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${item.hex} 50%, transparent)`,
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

                {/* Ambient glow orb on hover */}
                <div
                  className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `${item.hex}10` }}
                />

                <div className="relative z-10 flex items-start gap-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: `${item.hex}15`,
                      boxShadow: `0 0 20px ${item.hex}15, 0 0 0 1px ${item.hex}20`,
                    }}
                  >
                    <item.Icon size={20} className="text-base-content/80" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-base-content mb-1">
                      {item.title}
                    </p>
                    <p className="text-xs text-base-content/40 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Watermark icon */}
                <item.Watermark
                  size={100}
                  strokeWidth={0.4}
                  className="absolute -bottom-3 -right-3 text-base-content/[0.025] pointer-events-none"
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
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

            {/* Accent top line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${HEX.primary} 50%, transparent)`,
              }}
            />

            <div className="relative z-10 p-10 md:p-16 text-center max-w-2xl mx-auto">
              <motion.div
                style={{ opacity: 0 }}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: EASE }}
                className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-lg bg-primary/8 border border-primary/15"
              >
                <LogIn size={12} className="text-primary" />
                <span className="text-[10px] uppercase tracking-wide text-primary font-bold">
                  Free Forever
                </span>
              </motion.div>

              <motion.h2
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1, duration: 0.6, ease: EASE }}
                className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-5 leading-[0.95]"
              >
                Create Your{' '}
                <span className="text-gradient-primary">Free Account</span>
              </motion.h2>

              <motion.p
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.6, ease: EASE }}
                className="text-sm text-base-content/45 leading-relaxed mb-8 max-w-md mx-auto"
              >
                Unlock RSS feeds, personalize your streams, sync across devices,
                and access the full dashboard. Takes 30 seconds.
              </motion.p>

              <motion.div
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.6, ease: EASE }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <Link to="/dashboard" className="btn btn-pulse btn-lg">
                  <UserPlus size={16} />
                  Sign Up Free
                  <ArrowRight size={14} />
                </Link>
                <Link to="/discover" className="btn btn-outline btn-sm">
                  Learn more about Scrollr
                  <ArrowRight size={12} />
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
