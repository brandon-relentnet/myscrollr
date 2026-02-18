import { easeIn, mix, motion, progress, wrap } from 'motion/react'

// ── Accent color map (ticker / integration colors) ───────────────

const accentMap = {
  secondary: {
    borderActive: 'border-secondary/25',
    shadow: '0 0 30px rgba(255,71,87,0.08), 0 0 60px rgba(255,71,87,0.04)',
    chipBg: 'bg-secondary/8',
    chipBorder: 'border-secondary/20',
    chipText: 'text-secondary',
    chipSub: 'text-secondary/60',
    tickerBorder: 'border-t-secondary/40',
  },
  primary: {
    borderActive: 'border-primary/25',
    shadow: '0 0 30px rgba(52,211,153,0.08), 0 0 60px rgba(52,211,153,0.04)',
    chipBg: 'bg-primary/8',
    chipBorder: 'border-primary/20',
    chipText: 'text-primary',
    chipSub: 'text-primary/60',
    tickerBorder: 'border-t-primary/40',
  },
  info: {
    borderActive: 'border-info/25',
    shadow: '0 0 30px rgba(0,212,255,0.08), 0 0 60px rgba(0,212,255,0.04)',
    chipBg: 'bg-info/8',
    chipBorder: 'border-info/20',
    chipText: 'text-info',
    chipSub: 'text-info/60',
    tickerBorder: 'border-t-info/40',
  },
  accent: {
    borderActive: 'border-accent/25',
    shadow: '0 0 30px rgba(168,85,247,0.08), 0 0 60px rgba(168,85,247,0.04)',
    chipBg: 'bg-accent/8',
    chipBorder: 'border-accent/20',
    chipText: 'text-accent',
    chipSub: 'text-accent/60',
    tickerBorder: 'border-t-accent/40',
  },
} as const

type Accent = keyof typeof accentMap

// ── Mockup configurations ────────────────────────────────────────

interface MockupConfig {
  word: string
  url: string
  tabTitle: string
  tabIconBg: string
  tabIconDot: string
  accent: Accent
  tickerChips: { label: string; value: string }[]
}

const MOCKUPS: MockupConfig[] = [
  {
    word: 'Scores',
    url: 'youtube.com/watch?v=dQw4w9W',
    tabTitle: 'lofi hip hop radio ☕ - YouTube',
    tabIconBg: 'bg-secondary/15',
    tabIconDot: 'bg-secondary',
    accent: 'secondary',
    tickerChips: [
      { label: 'LAL 112', value: 'BOS 108' },
      { label: 'MIA vs NYK', value: '7:30 PM' },
      { label: 'KC 24', value: 'BUF 21' },
    ],
  },
  {
    word: 'Markets',
    url: 'github.com/acme/app/pull/412',
    tabTitle: 'fix: auth token · PR #412',
    tabIconBg: 'bg-base-content/8',
    tabIconDot: 'bg-base-content/50',
    accent: 'primary',
    tickerChips: [
      { label: 'BTC', value: '+2.47%' },
      { label: 'AAPL', value: '$198.30' },
      { label: 'ETH', value: '-1.21%' },
    ],
  },
  {
    word: 'Headlines',
    url: 'docs.google.com/document/d/1xQ...',
    tabTitle: 'Q4 Planning Notes - Google Docs',
    tabIconBg: 'bg-info/15',
    tabIconDot: 'bg-info',
    accent: 'info',
    tickerChips: [
      { label: 'Fed holds rates', value: 'Reuters' },
      { label: 'AI surge', value: 'TechCrunch' },
      { label: 'Climate summit', value: 'AP' },
    ],
  },
  {
    word: 'Leagues',
    url: 'x.com/home',
    tabTitle: 'Home / X',
    tabIconBg: 'bg-base-content/8',
    tabIconDot: 'bg-base-content/50',
    accent: 'accent',
    tickerChips: [
      { label: 'P. Mahomes', value: '28.4 pts' },
      { label: 'J. Jefferson', value: '22.1 pts' },
      { label: 'Matchup', value: 'W 6-4' },
    ],
  },
]

// ── Constants ────────────────────────────────────────────────────

const TOTAL = MOCKUPS.length
const MAX_ROTATE = 3
const CASCADE_X = -25
const CASCADE_Y = -20

// ── Fake page content — each is an unrelated site ────────────────
// The ticker shows integration data (scores, markets, etc.)
// while the PAGE shows a totally different website — proving
// that Scrollr works on any tab.

function YouTubePageContent() {
  return (
    <div className="space-y-2">
      {/* Video player */}
      <div className="h-16 rounded-sm bg-base-300/30 flex items-center justify-center relative overflow-hidden">
        {/* Fake video gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-base-content/4 to-base-content/8" />
        {/* Play button */}
        <div className="relative w-8 h-5.5 rounded bg-secondary/90 flex items-center justify-center">
          <span className="text-white text-[8px] ml-0.5">▶</span>
        </div>
        {/* Timestamp */}
        <span className="absolute bottom-1 right-1.5 text-[7px] font-mono bg-base-content/60 text-white px-1 rounded-sm">
          2:34:17
        </span>
      </div>
      {/* Title + channel */}
      <div className="px-0.5">
        <p className="text-[11px] font-semibold text-base-content/65 leading-snug">
          lofi hip hop radio ☕ beats to relax/study to
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <div className="w-3.5 h-3.5 rounded-full bg-base-300/30 shrink-0" />
          <span className="text-[9px] text-base-content/30">
            Lofi Girl · 42M views
          </span>
        </div>
      </div>
      {/* Top comment — the hint */}
      <div className="flex items-start gap-2 px-0.5 pt-1.5 border-t border-base-300/10">
        <div className="w-4 h-4 rounded-full bg-base-300/20 shrink-0 mt-0.5" />
        <div>
          <span className="text-[8px] font-medium text-base-content/35">
            @chillvibes42
          </span>
          <p className="text-[9px] text-base-content/30 leading-snug">
            finally watching this without checking ESPN every 5 min 😌🏀
          </p>
        </div>
      </div>
    </div>
  )
}

function GitHubPageContent() {
  return (
    <div className="space-y-2">
      {/* PR header */}
      <div className="flex items-center gap-2">
        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          Open
        </span>
        <span className="text-[11px] font-semibold text-base-content/60 truncate">
          fix: auth token refresh flow
        </span>
      </div>
      <div className="text-[8px] text-base-content/25">
        acme/app #412 · opened 2h ago · 3 files changed
      </div>
      {/* Diff — the hint is the deleted TODO */}
      <div className="rounded-sm border border-base-300/10 overflow-hidden font-mono text-[9px] leading-relaxed">
        <div className="bg-secondary/5 px-2 py-1 text-secondary/50 border-b border-base-300/6">
          <span className="text-secondary/30 select-none mr-1">−</span>
          {'// TODO: stop alt-tabbing to check AAPL'}
        </div>
        <div className="bg-primary/5 px-2 py-1 text-primary/50 border-b border-base-300/6">
          <span className="text-primary/30 select-none mr-1">+</span>
          {'const token = await refreshAuth()'}
        </div>
        <div className="bg-primary/5 px-2 py-1 text-primary/50">
          <span className="text-primary/30 select-none mr-1">+</span>
          {'// no need — prices live in toolbar 📈'}
        </div>
      </div>
      {/* Merge button */}
      <div className="flex justify-end pt-0.5">
        <div className="text-[9px] px-3 py-1 rounded-md bg-primary/80 text-white font-medium">
          Merge pull request
        </div>
      </div>
    </div>
  )
}

function DocsPageContent() {
  return (
    <div className="space-y-2">
      {/* Mini toolbar */}
      <div className="flex items-center gap-2.5 px-2 py-1 rounded-sm bg-base-300/8 border border-base-300/8">
        <span className="text-[10px] font-bold text-base-content/25">B</span>
        <span className="text-[10px] italic text-base-content/25">I</span>
        <span className="text-[10px] underline text-base-content/25">U</span>
        <span className="text-base-content/10">|</span>
        <span className="text-[10px] text-base-content/20">≡</span>
        <span className="text-[10px] text-base-content/20">⋮≡</span>
      </div>
      {/* Document content */}
      <div className="px-1">
        <p className="text-[13px] font-bold text-base-content/55 mb-2">
          Q4 Planning Notes
        </p>
        <div className="space-y-1.5 text-[10px] text-base-content/35 leading-relaxed">
          <p>• Review product launch timeline</p>
          <p>• Finalize Q1 budget allocation</p>
          {/* The hint — natural meeting note */}
          <p>• No more tab-switching for news — feed is live below ↓</p>
          <p className="text-base-content/15">• Assign design review owners</p>
        </div>
      </div>
      {/* Cursor blink */}
      <div className="px-1">
        <span className="inline-block w-0.5 h-3.5 bg-info/40 animate-pulse" />
      </div>
    </div>
  )
}

function XPageContent() {
  const tweets = [
    {
      handle: '@devjordan',
      time: '24m',
      text: 'just mass-deployed to prod on a Friday. pray for me 🫡',
      likes: '2.4k',
      retweets: '891',
    },
    {
      handle: '@ballerSZN',
      time: '12m',
      // The hint — natural sports-fan tweet
      text: 'Mahomes is going OFF and I don\u2019t even have to leave this timeline to check 🏆🔥',
      likes: '892',
      retweets: '214',
    },
    {
      handle: '@designr_',
      time: '1h',
      text: 'new portfolio just dropped. roast me.',
      likes: '1.2k',
      retweets: '445',
    },
  ]
  return (
    <div className="space-y-0">
      {tweets.map((t) => (
        <div
          key={t.handle}
          className="flex items-start gap-2 px-3 py-2 border-b border-base-300/10"
        >
          <div className="w-5 h-5 rounded-full bg-base-300/25 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-base-content/50">
                {t.handle}
              </span>
              <span className="text-[8px] text-base-content/20">
                · {t.time}
              </span>
            </div>
            <p className="text-[10px] text-base-content/45 leading-snug mt-0.5">
              {t.text}
            </p>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-[8px] text-base-content/20">
                ♡ {t.likes}
              </span>
              <span className="text-[8px] text-base-content/20">
                ↻ {t.retweets}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const CONTENT_RENDERERS: Record<string, React.FC> = {
  Scores: YouTubePageContent,
  Markets: GitHubPageContent,
  Headlines: DocsPageContent,
  Leagues: XPageContent,
}

// ── Main Component ───────────────────────────────────────────────

interface HeroBrowserStackProps {
  activeIndex: number
  onSelect?: (index: number) => void
}

export function HeroBrowserStack({
  activeIndex,
  onSelect,
}: HeroBrowserStackProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="relative w-[360px] sm:w-[480px] lg:w-[440px] xl:w-[580px] 2xl:w-[720px] aspect-[4/3]"
    >
      {/* Ambient glow behind the stack */}
      <div className="absolute -inset-8 bg-primary/[0.04] rounded-3xl blur-3xl pointer-events-none" />

      {MOCKUPS.map((mockup, i) => {
        const zIndex = TOTAL - wrap(TOTAL, 0, i - activeIndex + 1)
        const stackProgress = progress(0, TOTAL - 1, zIndex)
        const scale = mix(0.85, 1, easeIn(stackProgress))
        const opacity = progress(TOTAL * 0.1, TOTAL * 0.7, zIndex)
        const baseRotate = mix(-MAX_ROTATE, MAX_ROTATE, Math.sin(i))
        const distFromFront = TOTAL - zIndex
        const x = distFromFront * CASCADE_X
        const y = distFromFront * CASCADE_Y

        const colors = accentMap[mockup.accent]
        const isFront = zIndex === TOTAL
        const ContentComponent = CONTENT_RENDERERS[mockup.word]

        return (
          <motion.div
            key={mockup.word}
            animate={{ scale, opacity, x, y }}
            style={{
              zIndex,
              rotate: baseRotate,
              boxShadow: isFront ? colors.shadow : undefined,
            }}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 35,
            }}
            onClick={() => onSelect?.(i)}
            className={`absolute inset-0 rounded-xl overflow-hidden flex flex-col border cursor-pointer ${
              isFront ? colors.borderActive : 'border-base-300/40'
            } bg-base-200/80 backdrop-blur-sm`}
          >
            {/* ── Tab strip ── */}
            <div className="shrink-0 flex items-end gap-0 px-2 pt-2 bg-base-200/95 border-b border-base-300/20">
              {/* Active tab — uses the PAGE's brand color, not the ticker accent */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg bg-base-100/80 border border-b-0 border-base-300/15 max-w-[200px]">
                <div
                  className={`w-3 h-3 rounded-sm ${mockup.tabIconBg} flex items-center justify-center shrink-0`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${mockup.tabIconDot}`}
                  />
                </div>
                <span className="text-[10px] text-base-content/50 truncate">
                  {mockup.tabTitle}
                </span>
                <span className="text-[9px] text-base-content/20 ml-auto shrink-0">
                  ×
                </span>
              </div>
              {/* New tab button */}
              <div className="flex items-center justify-center w-6 h-6 mb-0.5 ml-1 rounded-sm text-base-content/20">
                <span className="text-[11px] leading-none">+</span>
              </div>
            </div>

            {/* ── Toolbar ── */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-base-200/90">
              {/* Nav buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-base-content/15 w-4 text-center">
                  ←
                </span>
                <span className="text-[10px] text-base-content/15 w-4 text-center">
                  →
                </span>
                <span className="text-[10px] text-base-content/15 w-4 text-center">
                  ↻
                </span>
              </div>

              {/* URL bar */}
              <div className="flex-1 flex items-center gap-2 px-2.5 py-1 rounded-full bg-base-100/50 border border-base-300/15">
                <div className="w-2.5 h-2.5 rounded-full bg-success/25 shrink-0" />
                <span className="text-[10px] font-mono text-base-content/25 truncate">
                  {mockup.url}
                </span>
              </div>

              {/* Scrollr extension icon — always primary/green */}
              <div className="flex items-center justify-center w-6 h-6 rounded-sm bg-primary/8 shrink-0">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
              </div>
            </div>

            {/* ── Page content (unrelated to ticker — that's the point) ── */}
            <div className="flex-1 min-h-0 px-4 py-3 bg-base-100/30 overflow-hidden">
              {ContentComponent && <ContentComponent />}
            </div>

            {/* ── Scrollr ticker bar (the extension overlay) ── */}
            <div
              className={`shrink-0 flex items-center gap-2 px-3 py-2 border-t-2 ${colors.tickerBorder} bg-base-100/60 overflow-hidden`}
            >
              {/* Scrollr label */}
              <div className="flex items-center gap-1 shrink-0 pr-2 border-r border-base-300/15">
                <span className="relative flex h-1 w-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1 w-1 bg-primary" />
                </span>
                <span className="text-[8px] font-bold font-mono text-primary/60 uppercase tracking-wider">
                  Scrollr
                </span>
              </div>
              {/* Ticker chips */}
              {mockup.tickerChips.map((chip) => (
                <div
                  key={chip.label}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-sm border ${colors.chipBorder} ${colors.chipBg} shrink-0`}
                >
                  <span
                    className={`text-[9px] font-bold font-mono ${colors.chipText} whitespace-nowrap`}
                  >
                    {chip.label}
                  </span>
                  <span
                    className={`text-[8px] font-mono ${colors.chipSub} whitespace-nowrap`}
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
