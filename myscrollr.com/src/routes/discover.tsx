import { createFileRoute, Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  ArrowRight,
  Chrome,
  Download,
  Eye,
  Ghost,
  Layers,
  MonitorSmartphone,
  Rss,
  Settings,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'

import { usePageMeta } from '@/lib/usePageMeta'
import InstallButton from '@/components/InstallButton'

export const Route = createFileRoute('/discover')({
  component: DiscoverPage,
})

// ── Ticker Data (lite version for mockup) ───────────────────────

interface TickerChip {
  label: string
  value: string
  color: 'primary' | 'secondary' | 'info' | 'accent'
  icon?: string
}

const TICKER_CHIPS: TickerChip[] = [
  { label: 'BTC', value: '$67,241', color: 'primary', icon: '↑' },
  { label: 'LAL 118', value: 'BOS 112', color: 'secondary', icon: 'FINAL' },
  { label: 'NVDA', value: '$891.20', color: 'primary', icon: '↑' },
  { label: 'Fed holds rates steady', value: 'Reuters', color: 'info' },
  { label: 'MIA 94', value: 'GSW 88', color: 'secondary', icon: 'Q4 8:23' },
  { label: 'ETH', value: '$3,412', color: 'primary', icon: '↓' },
  { label: 'Your Team', value: '2nd Place', color: 'accent' },
  { label: 'SPY', value: '$512.08', color: 'primary', icon: '↑' },
  {
    label: 'Tech layoffs slow as AI hiring surges',
    value: 'TechCrunch',
    color: 'info',
  },
  { label: 'NYG 21', value: 'DAL 17', color: 'secondary', icon: 'HALF' },
  { label: 'AAPL', value: '$189.54', color: 'primary', icon: '↓' },
  { label: 'Matchup: W 6-4', value: 'vs Team Alpha', color: 'accent' },
]

// ── Color Maps ──────────────────────────────────────────────────

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
  accent: {
    border: 'border-accent/25',
    text: 'text-accent',
    bg: 'bg-accent/[0.06]',
    sub: 'text-accent/60',
  },
}

const accentMap = {
  primary: {
    icon: 'bg-primary/8 border-primary/15 text-primary',
    hoverBorder: 'hover:border-primary/20',
    hoverGradient: 'from-primary/[0.03]',
    accentLine: 'group-hover:via-primary/20',
    dot: 'bg-primary',
  },
  secondary: {
    icon: 'bg-secondary/8 border-secondary/15 text-secondary',
    hoverBorder: 'hover:border-secondary/20',
    hoverGradient: 'from-secondary/[0.03]',
    accentLine: 'group-hover:via-secondary/20',
    dot: 'bg-secondary',
  },
  info: {
    icon: 'bg-info/8 border-info/15 text-info',
    hoverBorder: 'hover:border-info/20',
    hoverGradient: 'from-info/[0.03]',
    accentLine: 'group-hover:via-info/20',
    dot: 'bg-info',
  },
  accent: {
    icon: 'bg-accent/8 border-accent/15 text-accent',
    hoverBorder: 'hover:border-accent/20',
    hoverGradient: 'from-accent/[0.03]',
    accentLine: 'group-hover:via-accent/20',
    dot: 'bg-accent',
  },
} as const

// ── How It Works Steps ──────────────────────────────────────────

const STEPS = [
  {
    num: '01',
    icon: <Download size={20} />,
    title: 'Install It',
    description:
      'One click. No account, no setup wizard, no permissions popup. It installs and it works.',
    accent: 'primary' as const,
  },
  {
    num: '02',
    icon: <Eye size={20} />,
    title: 'Browse Like Normal',
    description:
      'A thin ticker appears at the bottom of whatever you\'re doing. Stocks, scores, headlines — scrolling by quietly.',
    accent: 'info' as const,
  },
  {
    num: '03',
    icon: <Settings size={20} />,
    title: 'Tweak It Later',
    description:
      'Turn off what you don\'t care about. Add symbols you do. Create an account when you\'re ready for the full thing.',
    accent: 'secondary' as const,
  },
]

// ── Integration Cards ───────────────────────────────────────────

interface IntegrationInfo {
  icon: React.ReactNode
  name: string
  label: string
  description: string
  accent: 'primary' | 'secondary' | 'info' | 'accent'
  example: string
}

const INTEGRATIONS: IntegrationInfo[] = [
  {
    icon: <TrendingUp size={18} />,
    name: 'Finance',
    label: 'Market data',
    description:
      'You\'re reading an article and Bitcoin just moved 4%. You see it immediately — no app switching, no new tab.',
    accent: 'primary',
    example: 'BTC $67.2K ↑2.4%',
  },
  {
    icon: <Trophy size={18} />,
    name: 'Sports',
    label: 'Live scores',
    description:
      'The Lakers are playing while you\'re on Reddit. The score just updates in the corner. You never left the page.',
    accent: 'secondary',
    example: 'LAL 118 - BOS 112',
  },
  {
    icon: <Rss size={18} />,
    name: 'RSS Feeds',
    label: 'News streams',
    description:
      'Headlines from 100+ sources scroll by while you work. You catch the big stories without doomscrolling Twitter.',
    accent: 'info',
    example: 'Fed holds rates steady...',
  },
  {
    icon: <Ghost size={18} />,
    name: 'Yahoo Fantasy',
    label: 'Fantasy leagues',
    description:
      'Your matchup score updates while you\'re doing literally anything else. No more refreshing the Yahoo app.',
    accent: 'accent',
    example: 'Your Team: 2nd Place',
  },
]

// ── Ticker Bar ──────────────────────────────────────────────────

function TickerBar() {
  const allChips = [...TICKER_CHIPS, ...TICKER_CHIPS]
  return (
    <div className="group/ticker relative overflow-hidden bg-base-100/95 border-t border-base-300/40">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-base-100/95 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-base-100/95 to-transparent z-10 pointer-events-none" />
      <div className="flex items-center gap-3 py-2.5 px-4 animate-ticker-scroll group-hover/ticker:[animation-play-state:paused]">
        {allChips.map((chip, i) => {
          const colors = chipColorMap[chip.color]
          return (
            <div
              key={`${chip.label}-${i}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border ${colors.border} ${colors.bg} shrink-0`}
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

// ── Browser Mockup ──────────────────────────────────────────────

function BrowserMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      <div className="absolute inset-0 bg-primary/[0.03] rounded-2xl blur-3xl pointer-events-none" />

      <div className="relative rounded-xl border border-base-300/60 overflow-hidden shadow-lg shadow-black/20 bg-base-200/60 backdrop-blur-sm">
        {/* Browser chrome */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-base-300/40 bg-base-200/80">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-error/30" />
            <div className="w-2.5 h-2.5 rounded-full bg-warning/30" />
            <div className="w-2.5 h-2.5 rounded-full bg-success/30" />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-base-100/60 border border-base-300/30 max-w-xs w-full">
              <div className="w-3 h-3 rounded-full bg-success/30 shrink-0" />
              <span className="text-[10px] font-mono text-base-content/25 truncate">
                any-website.com
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/8 border border-primary/15">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            <span className="text-[9px] font-bold text-primary uppercase tracking-wide">
              Scrollr
            </span>
          </div>
        </div>

        {/* Page content placeholder */}
        <div className="px-8 py-10 space-y-4 min-h-[180px] bg-base-100/40">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-base-300/20 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-2.5 bg-base-300/15 rounded w-3/4" />
                <div className="h-2 bg-base-300/10 rounded w-1/2" />
              </div>
            </div>
            <div className="h-28 bg-base-300/8 rounded border border-base-300/10" />
            <div className="space-y-2">
              <div className="h-2 bg-base-300/12 rounded w-full" />
              <div className="h-2 bg-base-300/10 rounded w-5/6" />
              <div className="h-2 bg-base-300/8 rounded w-2/3" />
            </div>
          </div>
        </div>

        {/* Ticker */}
        <TickerBar />
      </div>

      {/* Label */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5 }}
        className="flex items-center justify-center gap-4 mt-5"
      >
        <span className="h-px w-8 bg-base-300/30" />
        <span className="text-[10px] text-base-content/20">
          The feed bar — always there, never in the way
        </span>
        <span className="h-px w-8 bg-base-300/30" />
      </motion.div>
    </motion.div>
  )
}

// ── Page Component ──────────────────────────────────────────────

function DiscoverPage() {
  usePageMeta({
    title: 'Discover Scrollr',
    description:
      'A browser extension that pins live market data, sports scores, news, and fantasy stats to the bottom of every tab.',
  })

  return (
    <div className="min-h-screen pt-20">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-20 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(52, 211, 153, 0.5) 1px, transparent 0)`,
              backgroundSize: '32px 32px',
            }}
          />
          <motion.div
            className="absolute top-[-15%] right-[10%] w-[700px] h-[700px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(52, 211, 153, 0.04) 0%, transparent 70%)',
            }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-[-20%] left-[5%] w-[500px] h-[500px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(52, 211, 153, 0.03) 0%, transparent 70%)',
            }}
            animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        <div className="container relative z-10 !py-0">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-4 mb-8"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/8 text-primary text-[10px] font-bold rounded-lg border border-primary/15 uppercase tracking-wide">
              <MonitorSmartphone size={12} />
              Browser Extension
            </span>
            <span className="h-px w-12 bg-gradient-to-r from-base-300 to-transparent" />
            <span className="text-[10px] text-base-content/25">
              Chrome &middot; Firefox
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.7,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.85] mb-8 max-w-5xl"
          >
            Stop{' '}
            <span className="text-primary">Tab-Hopping</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.3,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="text-base text-base-content/40 max-w-xl leading-relaxed mb-10"
          >
            Stocks, scores, news, and fantasy stats — scrolling at the bottom
            of every tab. You see everything without leaving what you're doing.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.45,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex flex-wrap items-center gap-4"
          >
            <InstallButton className="!rounded-lg !bg-primary !text-base-100 !border-primary hover:!bg-primary/90 !font-semibold" />
            <span className="text-[10px] text-base-content/20">
              Free &middot; No account required
            </span>
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />
      </section>

      {/* ── VISUAL EXPLAINER (Browser Mockup) ────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-12"
          >
            <h2 className="text-sm font-semibold text-primary mb-2 flex items-center justify-center gap-2">
              <Eye size={16} /> What It Looks Like
            </h2>
            <p className="text-[10px] text-base-content/30">
              This is what it looks like on every page you visit
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <BrowserMockup />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
              <Zap size={16} /> How It Works
            </h2>
            <p className="text-[10px] text-base-content/30">
              Seriously, this takes 30 seconds
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.08,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="group bg-base-200/50 border border-base-300/50 rounded-xl p-6 hover:border-base-300 transition-colors relative overflow-hidden"
              >
                <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-transparent group-hover:via-primary/20 to-transparent transition-all duration-500" />

                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-5">
                    <span className="text-[10px] text-base-content/15 font-black">
                      {step.num}
                    </span>
                    <div
                      className={`h-10 w-10 rounded-lg border flex items-center justify-center ${accentMap[step.accent].icon}`}
                    >
                      {step.icon}
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-base-content mb-2">
                    {step.title}
                  </h3>
                  <p className="text-xs text-base-content/30 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PEOPLE USE SCROLLR TO ────────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
              <Layers size={16} /> People Use Scrollr To
            </h2>
            <p className="text-[10px] text-base-content/30">
              Real scenarios, not feature lists
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-16">
            {[
              'Watch the Lakers score while browsing Reddit',
              'See Bitcoin move while reading the news',
              'Catch breaking headlines without opening Twitter',
              'Check their fantasy matchup during a work call',
              'Track NVDA while shopping on Amazon',
              'Know when their team is winning without refreshing ESPN',
            ].map((scenario, i) => (
              <motion.div
                key={scenario}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.05,
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex items-center gap-3 px-4 py-3 bg-base-200/30 border border-base-300/30 rounded-xl"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                <span className="text-xs text-base-content/40 leading-snug">
                  {scenario}
                </span>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8"
          >
            <h3 className="text-xs font-semibold text-base-content/30 flex items-center gap-2">
              Four streams, one ticker
            </h3>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {INTEGRATIONS.map((integration, i) => {
              const colors = accentMap[integration.accent]
              return (
                <motion.div
                  key={integration.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: 0.1 + i * 0.08,
                    duration: 0.5,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  whileHover={{
                    y: -3,
                    transition: { type: 'tween', duration: 0.2 },
                  }}
                  className={`group relative bg-base-200/50 border border-base-300/50 rounded-xl p-6 ${colors.hoverBorder} transition-colors overflow-hidden`}
                >
                  {/* Hover gradient */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-24 bg-gradient-to-b ${colors.hoverGradient} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
                  />
                  <div
                    className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-transparent ${colors.accentLine} to-transparent transition-all duration-500`}
                  />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-5">
                      <div
                        className={`h-10 w-10 rounded-lg border flex items-center justify-center ${colors.icon}`}
                      >
                        {integration.icon}
                      </div>
                      <span
                        className={`w-2 h-2 rounded-full ${colors.dot} opacity-60`}
                      />
                    </div>

                    <h3 className="text-sm font-semibold text-base-content mb-1">
                      {integration.name}
                    </h3>
                    <p
                      className={`text-[10px] uppercase tracking-wide ${colors.icon.split(' ').pop()} opacity-60 mb-3`}
                    >
                      {integration.label}
                    </p>
                    <p className="text-sm text-base-content/30 leading-relaxed mb-5">
                      {integration.description}
                    </p>

                    <div className="pt-4 border-t border-base-300/30">
                      <span className="text-[10px] text-base-content/20">
                        In your feed:
                      </span>
                      <span
                        className={`block mt-1.5 text-xs font-bold font-mono ${colors.icon.split(' ').pop()} opacity-70`}
                      >
                        {integration.example}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── INSTALL CTA ──────────────────────────────────────── */}
      <section className="relative">
        <div className="container pb-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-xl bg-base-200/40 border border-base-300/50 backdrop-blur-sm"
          >
            <div className="absolute inset-0 pointer-events-none">
              <motion.div
                className="absolute top-0 left-[30%] w-[500px] h-[500px] rounded-full"
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

            <div className="relative z-10 p-10 md:p-16 text-center max-w-2xl mx-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-lg bg-primary/8 border border-primary/15"
              >
                <Chrome size={12} className="text-primary" />
                <span className="text-[10px] uppercase tracking-wide text-primary">
                  Available Now
                </span>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="text-3xl sm:text-4xl font-black tracking-tight mb-5 leading-[0.95]"
              >
                Start{' '}
                <span className="text-primary">Scrolling</span>
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="text-sm text-base-content/35 leading-relaxed mb-8 max-w-md mx-auto"
              >
                Free, no account, no setup. Install it and your feed bar is
                live on every tab in about 10 seconds.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <InstallButton className="!rounded-lg !bg-primary !text-base-100 !border-primary hover:!bg-primary/90 !font-semibold" />
                <Link
                  to="/onboard"
                  className="inline-flex items-center gap-2 text-[10px] font-semibold text-base-content/30 hover:text-base-content/50 transition-colors"
                >
                  Already installed?
                  <ArrowRight size={10} />
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
