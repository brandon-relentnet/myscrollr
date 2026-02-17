import { motion } from 'motion/react'

// ── Accent color map ─────────────────────────────────────────────

const accentMap = {
  secondary: {
    borderActive: 'border-secondary/25',
    shadow: '0 0 30px rgba(255,71,87,0.08), 0 0 60px rgba(255,71,87,0.04)',
    chipBg: 'bg-secondary/8',
    chipBorder: 'border-secondary/20',
    chipText: 'text-secondary',
    chipSub: 'text-secondary/60',
  },
  primary: {
    borderActive: 'border-primary/25',
    shadow: '0 0 30px rgba(191,255,0,0.08), 0 0 60px rgba(191,255,0,0.04)',
    chipBg: 'bg-primary/8',
    chipBorder: 'border-primary/20',
    chipText: 'text-primary',
    chipSub: 'text-primary/60',
  },
  info: {
    borderActive: 'border-info/25',
    shadow: '0 0 30px rgba(0,212,255,0.08), 0 0 60px rgba(0,212,255,0.04)',
    chipBg: 'bg-info/8',
    chipBorder: 'border-info/20',
    chipText: 'text-info',
    chipSub: 'text-info/60',
  },
  accent: {
    borderActive: 'border-accent/25',
    shadow: '0 0 30px rgba(168,85,247,0.08), 0 0 60px rgba(168,85,247,0.04)',
    chipBg: 'bg-accent/8',
    chipBorder: 'border-accent/20',
    chipText: 'text-accent',
    chipSub: 'text-accent/60',
  },
} as const

type Accent = keyof typeof accentMap

// ── Mockup configurations ────────────────────────────────────────

interface MockupConfig {
  word: string
  url: string
  accent: Accent
  tickerChips: { label: string; value: string }[]
}

const MOCKUPS: MockupConfig[] = [
  {
    word: 'Scores',
    url: 'espn.com/nba/scores',
    accent: 'secondary',
    tickerChips: [
      { label: 'LAL 112', value: 'BOS 108' },
      { label: 'MIA vs NYK', value: '7:30 PM' },
      { label: 'KC 24', value: 'BUF 21' },
    ],
  },
  {
    word: 'Markets',
    url: 'finance.yahoo.com/markets',
    accent: 'primary',
    tickerChips: [
      { label: 'BTC', value: '+2.47%' },
      { label: 'AAPL', value: '$198.30' },
      { label: 'ETH', value: '-1.21%' },
    ],
  },
  {
    word: 'Headlines',
    url: 'reddit.com/r/worldnews',
    accent: 'info',
    tickerChips: [
      { label: 'Fed holds rates', value: 'Reuters' },
      { label: 'AI surge', value: 'TechCrunch' },
      { label: 'Climate summit', value: 'AP' },
    ],
  },
  {
    word: 'Leagues',
    url: 'football.fantasysports.yahoo.com',
    accent: 'accent',
    tickerChips: [
      { label: 'P. Mahomes', value: '28.4 pts' },
      { label: 'J. Jefferson', value: '22.1 pts' },
      { label: 'Matchup', value: 'W 6-4' },
    ],
  },
]

// ── Stack position calculation ───────────────────────────────────

function getStackPosition(cardIndex: number, activeIndex: number) {
  const distance = (cardIndex - activeIndex + MOCKUPS.length) % MOCKUPS.length
  return {
    scale: 1 - distance * 0.04,
    x: distance * 10,
    y: distance * -10,
    opacity: distance === 0 ? 1 : Math.max(0.3, 0.75 - distance * 0.15),
    zIndex: MOCKUPS.length - distance,
  }
}

// ── Fake page content per category ───────────────────────────────

function ScoresContent() {
  const games = [
    {
      away: 'LAL',
      aScore: '112',
      home: 'BOS',
      hScore: '108',
      status: 'FINAL',
    },
    {
      away: 'MIA',
      aScore: '94',
      home: 'GSW',
      hScore: '88',
      status: 'Q4 8:23',
    },
    {
      away: 'KC',
      aScore: '24',
      home: 'BUF',
      hScore: '21',
      status: 'HALF',
    },
  ]
  return (
    <div className="space-y-1.5">
      {games.map((g) => (
        <div
          key={g.away}
          className="flex items-center justify-between px-2.5 py-1.5 rounded-sm bg-base-300/8 border border-base-300/10"
        >
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-sm bg-secondary/15 shrink-0" />
            <span className="text-[9px] font-bold font-mono text-base-content/60">
              {g.away}
            </span>
            <span className="text-[10px] font-black font-mono text-base-content/80">
              {g.aScore}
            </span>
          </div>
          <span className="text-[7px] font-mono text-secondary/60 uppercase tracking-wide">
            {g.status}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black font-mono text-base-content/80">
              {g.hScore}
            </span>
            <span className="text-[9px] font-bold font-mono text-base-content/60">
              {g.home}
            </span>
            <div className="w-3.5 h-3.5 rounded-sm bg-secondary/15 shrink-0" />
          </div>
        </div>
      ))}
    </div>
  )
}

function MarketsContent() {
  const stocks = [
    { ticker: 'BTC', price: '$67,241', change: '+2.47%', up: true },
    { ticker: 'AAPL', price: '$198.30', change: '+0.84%', up: true },
    { ticker: 'ETH', price: '$3,412', change: '-1.21%', up: false },
  ]
  return (
    <div className="space-y-2">
      {/* Mini chart */}
      <div className="h-10 rounded-sm bg-base-300/5 border border-base-300/8 flex items-end px-1.5 pb-1 overflow-hidden">
        <svg
          viewBox="0 0 200 40"
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="heroChartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <path
            d="M0 35 L20 28 L40 32 L60 20 L80 24 L100 15 L120 18 L140 8 L160 12 L180 5 L200 10"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d="M0 35 L20 28 L40 32 L60 20 L80 24 L100 15 L120 18 L140 8 L160 12 L180 5 L200 10 L200 40 L0 40Z"
            fill="url(#heroChartFill)"
            opacity="0.15"
          />
        </svg>
      </div>
      {/* Stock rows */}
      {stocks.map((s) => (
        <div
          key={s.ticker}
          className="flex items-center justify-between px-2.5 py-1"
        >
          <span className="text-[9px] font-bold font-mono text-base-content/60 w-8">
            {s.ticker}
          </span>
          <span className="text-[9px] font-mono text-base-content/35">
            {s.price}
          </span>
          <span
            className={`text-[9px] font-bold font-mono ${s.up ? 'text-primary' : 'text-secondary'}`}
          >
            {s.change} {s.up ? '↑' : '↓'}
          </span>
        </div>
      ))}
    </div>
  )
}

function HeadlinesContent() {
  const posts = [
    {
      votes: '14.2k',
      title: 'Fed announces rate hold at 5.25%, signals possible cuts in Q3',
      source: 'reuters.com',
    },
    {
      votes: '8.7k',
      title: 'AI breakthrough: New model achieves human-level reasoning in...',
      source: 'techcrunch.com',
    },
    {
      votes: '5.1k',
      title: 'Climate summit reaches historic agreement on carbon targets',
      source: 'apnews.com',
    },
  ]
  return (
    <div className="space-y-1.5">
      {posts.map((p) => (
        <div
          key={p.votes}
          className="flex items-start gap-2.5 px-2.5 py-1.5 rounded-sm bg-base-300/5 border border-base-300/8"
        >
          <div className="flex flex-col items-center shrink-0 pt-0.5">
            <span className="text-info/40 text-[7px] leading-none">▲</span>
            <span className="text-[8px] font-bold font-mono text-info/50">
              {p.votes}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-medium text-base-content/60 leading-snug line-clamp-2">
              {p.title}
            </p>
            <span className="text-[7px] font-mono text-base-content/20 block mt-0.5">
              {p.source}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function LeaguesContent() {
  const players = [
    { pos: 'QB', name: 'P. Mahomes', pts: '28.4' },
    { pos: 'WR', name: 'J. Jefferson', pts: '22.1' },
    { pos: 'RB', name: 'D. Henry', pts: '18.7' },
  ]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-sm bg-accent/5 border border-accent/10">
        <span className="text-[8px] font-bold font-mono text-accent/60 uppercase tracking-wide">
          Your Team
        </span>
        <span className="text-[8px] font-bold font-mono text-accent/80">
          2nd Place · 6-4
        </span>
      </div>
      {players.map((p) => (
        <div
          key={p.name}
          className="flex items-center justify-between px-2.5 py-1.5"
        >
          <div className="flex items-center gap-2">
            <span className="text-[7px] font-bold font-mono text-accent/30 w-4">
              {p.pos}
            </span>
            <span className="text-[9px] font-medium text-base-content/60">
              {p.name}
            </span>
          </div>
          <span className="text-[9px] font-bold font-mono text-accent/70">
            {p.pts}
          </span>
        </div>
      ))}
    </div>
  )
}

const CONTENT_RENDERERS: Record<string, React.FC> = {
  Scores: ScoresContent,
  Markets: MarketsContent,
  Headlines: HeadlinesContent,
  Leagues: LeaguesContent,
}

// ── Main Component ───────────────────────────────────────────────

interface HeroBrowserStackProps {
  activeIndex: number
}

export function HeroBrowserStack({ activeIndex }: HeroBrowserStackProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="relative w-72 sm:w-80 lg:w-[420px] aspect-[4/3]"
    >
      {/* Ambient glow behind the stack */}
      <div className="absolute -inset-8 bg-primary/[0.04] rounded-3xl blur-3xl pointer-events-none" />

      {MOCKUPS.map((mockup, i) => {
        const { scale, x, y, opacity, zIndex } = getStackPosition(
          i,
          activeIndex,
        )
        const colors = accentMap[mockup.accent]
        const isFront =
          (i - activeIndex + MOCKUPS.length) % MOCKUPS.length === 0
        const ContentComponent = CONTENT_RENDERERS[mockup.word]

        return (
          <motion.div
            key={mockup.word}
            animate={{ scale, x, y, opacity }}
            style={{
              zIndex,
              boxShadow: isFront ? colors.shadow : undefined,
            }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            className={`absolute inset-0 rounded-sm overflow-hidden flex flex-col border ${
              isFront ? colors.borderActive : 'border-base-300/40'
            } bg-base-200/80 backdrop-blur-sm`}
          >
            {/* ── Browser chrome ── */}
            <div className="shrink-0 flex items-center gap-2.5 px-3 py-2 border-b border-base-300/30 bg-base-200/90">
              {/* Traffic lights */}
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-error/25" />
                <div className="w-2 h-2 rounded-full bg-warning/25" />
                <div className="w-2 h-2 rounded-full bg-success/25" />
              </div>

              {/* URL bar */}
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-base-100/50 border border-base-300/20 w-full max-w-[200px]">
                  <div className="w-2.5 h-2.5 rounded-full bg-success/25 shrink-0" />
                  <span className="text-[8px] font-mono text-base-content/20 truncate">
                    {mockup.url}
                  </span>
                </div>
              </div>

              {/* Scrollr badge */}
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-primary/6 border border-primary/12">
                <span className="relative flex h-1 w-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1 w-1 bg-primary" />
                </span>
                <span className="text-[7px] font-bold font-mono text-primary uppercase tracking-wider">
                  Scrollr
                </span>
              </div>
            </div>

            {/* ── Page content ── */}
            <div className="flex-1 min-h-0 px-3 py-2.5 bg-base-100/30 overflow-hidden">
              {ContentComponent && <ContentComponent />}
            </div>

            {/* ── Mini ticker bar ── */}
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border-t border-base-300/25 bg-base-100/50 overflow-hidden">
              {mockup.tickerChips.map((chip) => (
                <div
                  key={chip.label}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border ${colors.chipBorder} ${colors.chipBg} shrink-0`}
                >
                  <span
                    className={`text-[7px] font-bold font-mono ${colors.chipText} whitespace-nowrap`}
                  >
                    {chip.label}
                  </span>
                  <span
                    className={`text-[6px] font-mono ${colors.chipSub} whitespace-nowrap`}
                  >
                    {chip.value}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
