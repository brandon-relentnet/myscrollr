import { motion } from 'motion/react'
import { Link } from '@tanstack/react-router'
import { TrendingUp, Trophy, Rss, Ghost, ArrowRight } from 'lucide-react'

// ── Ticker Data ──────────────────────────────────────────────────

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

// ── Integration Cards ────────────────────────────────────────────

interface IntegrationCard {
  icon: React.ReactNode
  name: string
  label: string
  description: string
  color: string
  dotColor: string
  example: string
}

const INTEGRATIONS: IntegrationCard[] = [
  {
    icon: <TrendingUp size={18} />,
    name: 'Finance',
    label: 'Real-time market data',
    description:
      '50 tracked symbols across stocks and crypto. Live prices, percentage changes, and directional indicators pushed the instant they update.',
    color: 'text-primary',
    dotColor: 'bg-primary',
    example: 'BTC $67.2K ↑2.4%',
  },
  {
    icon: <Trophy size={18} />,
    name: 'Sports',
    label: 'Live scores & schedules',
    description:
      'NFL, NBA, NHL, MLB, and college sports from ESPN. Game states, matchups, and scores updating every minute.',
    color: 'text-secondary',
    dotColor: 'bg-secondary',
    example: 'LAL 118 - BOS 112',
  },
  {
    icon: <Rss size={18} />,
    name: 'RSS Feeds',
    label: 'Custom news streams',
    description:
      '100+ curated feeds across 8 categories. Subscribe to the sources you care about and get articles as they publish.',
    color: 'text-info',
    dotColor: 'bg-info',
    example: 'Fed holds rates steady...',
  },
  {
    icon: <Ghost size={18} />,
    name: 'Yahoo Fantasy',
    label: 'Fantasy sports leagues',
    description:
      'Connect your Yahoo account for league standings, rosters, weekly matchups, and live scoring across all your leagues.',
    color: 'text-accent',
    dotColor: 'bg-accent',
    example: 'Your Team: 2nd Place',
  },
]

// ── Color map for ticker chips ───────────────────────────────────

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

// ── Animated Ticker Bar ──────────────────────────────────────────

function TickerBar() {
  // Duplicate chips for seamless loop
  const allChips = [...TICKER_CHIPS, ...TICKER_CHIPS]

  return (
    <div className="relative overflow-hidden bg-base-100/95 border-t border-base-300/40">
      {/* Left/Right fade masks */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-base-100/95 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-base-100/95 to-transparent z-10 pointer-events-none" />

      {/* Scrolling track */}
      <div className="flex items-center gap-3 py-2.5 px-4 animate-ticker-scroll">
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

// ── Browser Mockup ───────────────────────────────────────────────

function BrowserMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      {/* Ambient glow behind mockup */}
      <div className="absolute -inset-8 bg-primary/[0.03] rounded-2xl blur-3xl pointer-events-none" />

      <div className="relative rounded-sm border border-base-300/60 overflow-hidden shadow-2xl shadow-black/30 bg-base-200/60 backdrop-blur-sm">
        {/* Browser chrome */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-base-300/40 bg-base-200/80">
          {/* Traffic lights */}
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-error/30" />
            <div className="w-2.5 h-2.5 rounded-full bg-warning/30" />
            <div className="w-2.5 h-2.5 rounded-full bg-success/30" />
          </div>

          {/* URL bar */}
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-sm bg-base-100/60 border border-base-300/30 max-w-xs w-full">
              <div className="w-3 h-3 rounded-full bg-success/30 shrink-0" />
              <span className="text-[10px] font-mono text-base-content/25 truncate">
                reddit.com/r/nba
              </span>
            </div>
          </div>

          {/* Scrollr badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-primary/8 border border-primary/15">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            <span className="text-[9px] font-bold font-mono text-primary uppercase tracking-wider">
              Scrollr
            </span>
          </div>
        </div>

        {/* Page content (placeholder) */}
        <div className="px-8 py-10 space-y-4 min-h-[200px] bg-base-100/40">
          {/* Fake content lines */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-base-300/20 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-2.5 bg-base-300/15 rounded w-3/4" />
                <div className="h-2 bg-base-300/10 rounded w-1/2" />
              </div>
            </div>
            <div className="h-32 bg-base-300/8 rounded border border-base-300/10" />
            <div className="space-y-2">
              <div className="h-2 bg-base-300/12 rounded w-full" />
              <div className="h-2 bg-base-300/10 rounded w-5/6" />
              <div className="h-2 bg-base-300/8 rounded w-2/3" />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <div className="w-6 h-6 rounded-full bg-base-300/15 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-2 bg-base-300/12 rounded w-2/3" />
                <div className="h-1.5 bg-base-300/8 rounded w-1/3" />
              </div>
            </div>
          </div>
        </div>

        {/* THE TICKER — the star of the show */}
        <TickerBar />
      </div>

      {/* Label below mockup */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5 }}
        className="flex items-center justify-center gap-4 mt-5"
      >
        <span className="h-px w-8 bg-base-300/30" />
        <span className="text-[10px] font-mono text-base-content/20 uppercase tracking-wider">
          Your scrollbar feed, always visible
        </span>
        <span className="h-px w-8 bg-base-300/30" />
      </motion.div>
    </motion.div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export function StreamsShowcase() {
  return (
    <section id="streams" className="relative py-24 lg:py-32">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent opacity-50 pointer-events-none" />

      <div className="container relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-14 text-center flex flex-col items-center"
        >
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/8 text-primary text-[10px] font-bold rounded-sm border border-primary/15 tracking-wider">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              Live Streams
            </span>
          </div>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-5">
            See It <span className="text-gradient-primary">In Action</span>
          </h2>
          <p className="text-sm text-base-content/40 max-w-xl mx-auto leading-relaxed">
            Four live integrations power your feed. Real-time data from finance,
            sports, news, and fantasy — all in one scrolling ticker.
          </p>
        </motion.div>

        {/* Browser Mockup */}
        <div className="max-w-4xl mx-auto mb-20">
          <BrowserMockup />
        </div>

        {/* Integration Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {INTEGRATIONS.map((integration, i) => (
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
              className="group relative bg-base-200/50 border border-base-300/50 rounded-sm p-6 hover:border-primary/20 transition-colors overflow-hidden"
            >
              {/* Hover gradient */}
              <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              {/* Top accent */}
              <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary/0 group-hover:via-primary/20 to-transparent transition-all duration-500" />

              <div className="relative z-10">
                {/* Icon + color dot */}
                <div className="flex items-center justify-between mb-5">
                  <div
                    className={`h-10 w-10 rounded-sm bg-base-300/30 border border-base-300/40 flex items-center justify-center ${integration.color}`}
                  >
                    {integration.icon}
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full ${integration.dotColor} opacity-60`}
                  />
                </div>

                {/* Content */}
                <h3 className="text-sm font-bold tracking-wide text-base-content mb-1">
                  {integration.name}
                </h3>
                <p
                  className={`text-[10px] font-mono uppercase tracking-wider ${integration.color} opacity-60 mb-3`}
                >
                  {integration.label}
                </p>
                <p className="text-sm text-base-content/30 leading-relaxed mb-5">
                  {integration.description}
                </p>

                {/* Example chip */}
                <div className="pt-4 border-t border-base-300/30">
                  <span className="text-[10px] font-mono text-base-content/20 uppercase tracking-wider">
                    In your feed:
                  </span>
                  <span
                    className={`block mt-1.5 text-xs font-bold font-mono ${integration.color} opacity-70`}
                  >
                    {integration.example}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Link to integrations page */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-6 mt-10"
        >
          <Link
            to="/integrations"
            className="group inline-flex items-center gap-2 text-sm font-bold tracking-wide text-base-content/40 hover:text-primary transition-colors"
          >
            Browse All Integrations
            <ArrowRight
              size={14}
              className="group-hover:translate-x-1 transition-transform"
            />
          </Link>
          <span className="h-4 w-px bg-base-300/30" />
          <span className="text-[10px] font-mono text-base-content/20 uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success/40" />4 live
            &middot; 6 coming soon
          </span>
        </motion.div>
      </div>
    </section>
  )
}
