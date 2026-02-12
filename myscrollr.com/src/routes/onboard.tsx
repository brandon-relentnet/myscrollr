import { createFileRoute, Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
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
  Sparkles,
  TrendingUp,
  Trophy,
  UserPlus,
  Zap,
} from 'lucide-react'

import { usePageMeta } from '@/lib/usePageMeta'

export const Route = createFileRoute('/onboard')({
  component: OnboardPage,
})

// ── Ticker chips for the hero preview ───────────────────────────

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

// ── Step Data ───────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    icon: <Eye size={20} />,
    title: 'The Feed Bar',
    description:
      'A thin ticker pinned to the bottom of your browser. Scores, prices, and headlines scroll by while you browse — always visible, never in the way.',
    accent: 'primary' as const,
  },
  {
    icon: <Layers size={20} />,
    title: 'Streams',
    description:
      'Each data source is a "stream." Finance and sports are on right now. Toggle them on or off — the feed bar shows whatever you enable.',
    accent: 'info' as const,
  },
  {
    icon: <Sliders size={20} />,
    title: 'Your Controls',
    description:
      'Click the Scrollr icon in your toolbar to toggle the feed bar, switch streams, or reposition it. You are in full control.',
    accent: 'secondary' as const,
  },
]

const WITHOUT_ACCOUNT = [
  {
    icon: <TrendingUp size={16} />,
    label: 'Live market prices',
    description: '50 tracked symbols — stocks and crypto updating in real time',
  },
  {
    icon: <Trophy size={16} />,
    label: 'Live sports scores',
    description: 'NFL, NBA, NHL, MLB and college sports from ESPN',
  },
  {
    icon: <Monitor size={16} />,
    label: 'Full feed bar controls',
    description: 'Toggle, reposition, resize — make it yours',
  },
]

const WITH_ACCOUNT = [
  {
    icon: <Rss size={16} />,
    title: 'RSS News Feeds',
    description:
      '100+ curated feeds across 8 categories — tech, finance, world news, and more. Pick the sources you actually read.',
  },
  {
    icon: <Sliders size={16} />,
    title: 'Personalized Streams',
    description:
      'Choose exactly which symbols, leagues, feeds, and fantasy teams appear in your ticker.',
  },
  {
    icon: <Globe size={16} />,
    title: 'Sync Across Browsers',
    description:
      'Your config and preferences travel with your account. Log in anywhere, pick up where you left off.',
  },
  {
    icon: <Settings size={16} />,
    title: 'Dashboard Access',
    description:
      'Full web dashboard to manage streams, browse feed catalogs, connect Yahoo Fantasy, and monitor your setup.',
  },
  {
    icon: <Shield size={16} />,
    title: 'Site Filtering',
    description:
      'Control which websites show the feed bar. Keep it focused where you want it.',
  },
]

// ── Accent Maps ─────────────────────────────────────────────────

const accentMap = {
  primary: {
    icon: 'bg-primary/8 border-primary/15 text-primary',
    dot: 'bg-primary',
  },
  info: {
    icon: 'bg-info/8 border-info/15 text-info',
    dot: 'bg-info',
  },
  secondary: {
    icon: 'bg-secondary/8 border-secondary/15 text-secondary',
    dot: 'bg-secondary',
  },
} as const

// ── Hero Ticker Preview ─────────────────────────────────────────

function HeroTicker() {
  const allChips = [...HERO_TICKER, ...HERO_TICKER]
  return (
    <div className="group/ticker relative overflow-hidden rounded-sm border border-base-300/40 bg-base-100/80">
      <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-base-100/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-base-100/80 to-transparent z-10 pointer-events-none" />
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

// ── Page Component ──────────────────────────────────────────────

function OnboardPage() {
  usePageMeta({
    title: 'Welcome to Scrollr',
    description:
      'You just installed Scrollr. Here is what you have right now and how to get the most out of it.',
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
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(191, 255, 0, 0.4) 1px, transparent 0)`,
              backgroundSize: '28px 28px',
            }}
          />
          <motion.div
            className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(191, 255, 0, 0.06) 0%, transparent 70%)',
            }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(191, 255, 0, 0.04) 0%, transparent 70%)',
            }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
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
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-success/8 text-success text-[10px] font-bold rounded-sm border border-success/15 uppercase tracking-[0.2em]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
              </span>
              Extension Active
            </span>
            <span className="h-px w-12 bg-gradient-to-r from-base-300 to-transparent" />
            <span className="text-[10px] font-mono text-base-content/25 uppercase tracking-wider">
              welcome aboard
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
            className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight uppercase leading-[0.85] mb-6 max-w-4xl"
          >
            You're{' '}
            <span className="text-primary">Live</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.3,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="text-base md:text-lg text-base-content/45 max-w-lg leading-relaxed mb-10"
          >
            Your feed bar is running right now. Scores, stock prices, and
            headlines are scrolling at the bottom of every tab you open.
          </motion.p>

          {/* Live ticker preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.7,
              delay: 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="max-w-3xl"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              <span className="text-[10px] font-mono text-base-content/30 uppercase tracking-wider">
                This is what your feed bar looks like
              </span>
            </div>
            <HeroTicker />
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />
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
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
              <Zap size={16} /> How It Works
            </h2>
            <p className="text-[10px] font-mono text-base-content/30">
              Three concepts — that's all you need
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {HOW_IT_WORKS.map((step, i) => (
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
                className="group bg-base-200/50 border border-base-300/50 rounded-sm p-6 hover:border-base-300 transition-colors relative overflow-hidden"
              >
                <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-transparent group-hover:via-primary/20 to-transparent transition-all duration-500" />

                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-5">
                    <span className="text-[10px] font-mono text-base-content/15 font-black">
                      0{i + 1}
                    </span>
                    <div
                      className={`h-10 w-10 rounded-sm border flex items-center justify-center ${accentMap[step.accent].icon}`}
                    >
                      {step.icon}
                    </div>
                  </div>

                  <h3 className="text-sm font-bold uppercase tracking-wider text-base-content mb-2">
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

      {/* ── WHAT YOU HAVE NOW ─────────────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
              <Sparkles size={16} /> Ready Right Now
            </h2>
            <p className="text-[10px] font-mono text-base-content/30">
              No account needed — these are already running
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {WITHOUT_ACCOUNT.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.06,
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="group flex items-start gap-3 p-5 bg-base-200/40 border border-base-300/40 rounded-sm hover:border-success/20 transition-colors"
              >
                <div className="h-9 w-9 rounded-sm bg-success/8 border border-success/15 flex items-center justify-center text-success shrink-0 mt-0.5 group-hover:border-success/30 transition-colors">
                  {item.icon}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-base-content mb-1">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-base-content/30 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY CREATE AN ACCOUNT ─────────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
              <UserPlus size={16} /> Unlock More
            </h2>
            <p className="text-[10px] font-mono text-base-content/30">
              Create a free account and the whole platform opens up
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {WITH_ACCOUNT.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.06,
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="group flex items-start gap-4 p-5 bg-base-200/40 border border-base-300/40 rounded-sm hover:border-primary/15 transition-colors"
              >
                <div className="h-9 w-9 rounded-sm bg-primary/8 border border-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5 group-hover:border-primary/30 transition-colors">
                  {item.icon}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-base-content mb-1">
                    {item.title}
                  </p>
                  <p className="text-xs text-base-content/30 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="relative">
        <div className="container pb-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-sm bg-base-200/40 border border-base-300/50 backdrop-blur-sm"
          >
            <div className="absolute inset-0 pointer-events-none">
              <motion.div
                className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(191, 255, 0, 0.05) 0%, transparent 70%)',
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
                className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-sm bg-primary/8 border border-primary/15"
              >
                <LogIn size={12} className="text-primary" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-primary">
                  Free Forever
                </span>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="text-3xl sm:text-4xl font-black tracking-tight uppercase mb-5 leading-[0.95]"
              >
                Create Your{' '}
                <span className="text-primary">Free Account</span>
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="text-sm text-base-content/35 leading-relaxed mb-8 font-mono max-w-md mx-auto"
              >
                Unlock RSS feeds, personalize your streams, sync across devices,
                and access the full dashboard. Takes 30 seconds.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <Link
                  to="/dashboard"
                  className="group inline-flex items-center gap-2.5 px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] border border-primary/30 text-primary bg-primary/5 rounded-sm hover:bg-primary/10 transition-colors"
                >
                  <UserPlus size={14} />
                  Sign Up Free
                  <ArrowRight
                    size={12}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </Link>
                <Link
                  to="/discover"
                  className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-base-content/30 hover:text-base-content/50 transition-colors"
                >
                  Learn more about Scrollr
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
