import { createFileRoute, Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  ArrowRight,
  Chrome,
  Download,
  Eye,
  Ghost,
  MonitorSmartphone,
  Rss,
  Settings,
  TrendingUp,
  Trophy,
} from 'lucide-react'

import { usePageMeta } from '@/lib/usePageMeta'
import InstallButton from '@/components/InstallButton'

export const Route = createFileRoute('/discover')({
  component: DiscoverPage,
})

// ── Signature easing (matches homepage) ────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const

// ── Channel hex map ────────────────────────────────────────
const HEX = {
  primary: '#34d399',
  secondary: '#ff4757',
  info: '#00b8db',
  accent: '#a855f7',
} as const

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

// ── Color Maps (ticker only) ────────────────────────────────────

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

// ── How It Works Steps ──────────────────────────────────────────

interface Step {
  num: string
  Icon: typeof Download
  title: string
  description: string
  hex: string
}

const STEPS: Step[] = [
  {
    num: '01',
    Icon: Download,
    title: 'Install It',
    description:
      'One click. No account, no setup wizard, no permissions popup. It installs and it works.',
    hex: HEX.primary,
  },
  {
    num: '02',
    Icon: Eye,
    title: 'Browse Like Normal',
    description:
      "A thin ticker appears at the bottom of whatever you're doing. Stocks, scores, headlines — scrolling by quietly.",
    hex: HEX.info,
  },
  {
    num: '03',
    Icon: Settings,
    title: 'Tweak It Later',
    description:
      "Turn off what you don't care about. Add symbols you do. Create an account when you're ready for the full thing.",
    hex: HEX.secondary,
  },
]

// ── Channel Cards ───────────────────────────────────────────

interface ChannelInfo {
  Icon: typeof TrendingUp
  name: string
  label: string
  description: string
  hex: string
  example: string
}

const CHANNELS: ChannelInfo[] = [
  {
    Icon: TrendingUp,
    name: 'Finance',
    label: 'Market data',
    description:
      "You're reading an article and Bitcoin just moved 4%. You see it immediately — no app switching, no new tab.",
    hex: HEX.primary,
    example: 'BTC $67.2K ↑2.4%',
  },
  {
    Icon: Trophy,
    name: 'Sports',
    label: 'Live scores',
    description:
      "The Lakers are playing while you're on Reddit. The score just updates in the corner. You never left the page.",
    hex: HEX.secondary,
    example: 'LAL 118 - BOS 112',
  },
  {
    Icon: Rss,
    name: 'RSS Feeds',
    label: 'News streams',
    description:
      'Headlines from 100+ sources scroll by while you work. You catch the big stories without doomscrolling Twitter.',
    hex: HEX.info,
    example: 'Fed holds rates steady...',
  },
  {
    Icon: Ghost,
    name: 'Yahoo Fantasy',
    label: 'Fantasy leagues',
    description:
      "Your matchup score updates while you're doing literally anything else. No more refreshing the Yahoo app.",
    hex: HEX.accent,
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
      style={{ opacity: 0 }}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: EASE }}
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
        style={{ opacity: 0 }}
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
    canonicalUrl: 'https://myscrollr.com/discover',
  })

  return (
    <div className="min-h-screen pt-20">
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
            className="absolute top-[-15%] right-[10%] w-[700px] h-[700px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, var(--glow-primary-subtle) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1, 1.08, 1],
              opacity: [0.4, 0.7, 0.4],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Secondary glow */}
          <motion.div
            className="absolute bottom-[-20%] left-[5%] w-[500px] h-[500px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, var(--glow-info-subtle) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1.08, 1, 1.08],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
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
              <MonitorSmartphone size={12} />
              Browser Extension
            </span>
            <span className="h-px w-16 bg-gradient-to-r from-base-300 to-transparent" />
            <span className="text-[10px] text-base-content/25">
              Chrome &middot; Firefox
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
              Stop
              <br />
              <span className="text-gradient-primary">Tab-Hopping</span>
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
                Stocks, scores, news, and fantasy stats — scrolling at the
                bottom of every tab. You see everything without leaving what
                you're doing.
              </p>
            </motion.div>

            {/* CTA row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5, ease: EASE }}
              className="flex flex-wrap items-center gap-5"
            >
              <InstallButton className="btn-lg" />
              <div className="flex items-center gap-3">
                <span className="h-px w-6 bg-base-300/50" />
                <span className="text-[10px] font-mono text-base-content/20">
                  Free &middot; No account required
                </span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />
      </section>

      {/* ================================================================
          VISUAL EXPLAINER (Browser Mockup)
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
              What It <span className="text-gradient-primary">Looks Like</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              This is what it looks like on every page you visit
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <BrowserMockup />
          </div>
        </div>
      </section>

      {/* ================================================================
          HOW IT WORKS
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
              How It <span className="text-gradient-primary">Works</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Seriously, this takes 30 seconds
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.title}
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

                {/* Watermark icon */}
                <step.Icon
                  size={80}
                  strokeWidth={0.4}
                  className="absolute -bottom-3 -right-3 text-base-content/[0.025] pointer-events-none"
                />

                {/* Ambient glow on hover */}
                <div
                  className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `${step.hex}10` }}
                />

                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-5">
                    <span className="text-[10px] text-base-content/15 font-black">
                      {step.num}
                    </span>
                    {/* Icon badge — DESIGN.md pattern */}
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
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          CHANNELS
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
              People Use <span className="text-gradient-primary">Scrollr</span>{' '}
              To
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
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
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.4, ease: EASE }}
                className="flex items-center gap-3 px-4 py-3 bg-base-200/30 border border-base-300/25 rounded-xl"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                <span className="text-xs text-base-content/40 leading-snug">
                  {scenario}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Sub-header */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h3 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[0.95] mb-4">
              Four Channels,{' '}
              <span className="text-gradient-primary">One Ticker</span>
            </h3>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CHANNELS.map((channel, i) => (
              <motion.div
                key={channel.name}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.5,
                  ease: EASE,
                }}
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
                    background: `linear-gradient(90deg, transparent, ${channel.hex} 50%, transparent)`,
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
                <channel.Icon
                  size={80}
                  strokeWidth={0.4}
                  className="absolute -bottom-3 -right-3 text-base-content/[0.025] pointer-events-none"
                />

                {/* Ambient glow on hover */}
                <div
                  className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `${channel.hex}10` }}
                />

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    {/* Icon badge — DESIGN.md pattern */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{
                        background: `${channel.hex}15`,
                        boxShadow: `0 0 20px ${channel.hex}15, 0 0 0 1px ${channel.hex}20`,
                      }}
                    >
                      <channel.Icon
                        size={20}
                        className="text-base-content/80"
                      />
                    </div>
                    <span
                      className="w-2 h-2 rounded-full opacity-60"
                      style={{ background: channel.hex }}
                    />
                  </div>

                  <h3 className="text-sm font-bold text-base-content mb-1">
                    {channel.name}
                  </h3>
                  <p
                    className="text-[10px] uppercase tracking-wide mb-3 opacity-60"
                    style={{ color: channel.hex }}
                  >
                    {channel.label}
                  </p>
                  <p className="text-xs text-base-content/40 leading-relaxed mb-5">
                    {channel.description}
                  </p>

                  <div className="pt-4 border-t border-base-300/30">
                    <span className="text-[10px] text-base-content/20">
                      In your feed:
                    </span>
                    <span
                      className="block mt-1.5 text-xs font-bold font-mono opacity-70"
                      style={{ color: channel.hex }}
                    >
                      {channel.example}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          INSTALL CTA
          ================================================================ */}
      <section className="relative overflow-hidden">
        {/* Tinted background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

        <div className="container relative z-10 pb-8">
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
                background: `linear-gradient(90deg, transparent, ${HEX.primary} 50%, transparent)`,
              }}
            />

            {/* Background layers */}
            <div className="absolute inset-0 pointer-events-none">
              <motion.div
                className="absolute top-0 left-[30%] w-[500px] h-[500px] rounded-full"
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

            {/* Watermark icon */}
            <MonitorSmartphone
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
                <Chrome size={12} className="text-primary" />
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
                Start <span className="text-gradient-primary">Scrolling</span>
              </motion.h2>

              <motion.p
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.6, ease: EASE }}
                className="text-sm text-base-content/35 leading-relaxed mb-10 max-w-lg mx-auto"
              >
                Free, no account, no setup. Install it and your feed bar is live
                on every tab in about 10 seconds.
              </motion.p>

              <motion.div
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.6, ease: EASE }}
                className="flex flex-wrap items-center justify-center gap-4"
              >
                <InstallButton />
                <Link to="/onboard" className="btn btn-outline btn-sm gap-2">
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
