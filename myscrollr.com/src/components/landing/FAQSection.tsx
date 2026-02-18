import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useSpring,
  useTransform,
  useVelocity,
} from 'motion/react'
import {
  ChevronDown,
  ChevronUp,
  Code,
  Gift,
  Globe,
  Layers,
  ShieldCheck,
  SlidersHorizontal,
  UserX,
  Zap,
} from 'lucide-react'

// ── Types & Data ─────────────────────────────────────────────────

interface FAQItem {
  icon: typeof ShieldCheck
  question: string
  highlight: string
  answer: string
  accent: string // tailwind color token (e.g. "emerald", "cyan")
}

const FAQ_ITEMS: Array<FAQItem> = [
  {
    icon: Gift,
    question: 'Is Scrollr really free?',
    highlight: 'Completely free with no trials, ads, or paywalls. Ever.',
    answer:
      'Completely free, no strings attached. There are no trials, no premium gates on core features, and no ads. The entire codebase is open source under the AGPL-3.0 license, so you can inspect every line.',
    accent: 'emerald',
  },
  {
    icon: Zap,
    question: 'Does it slow down my browser?',
    highlight:
      'A single background connection handles everything. Lightweight by design.',
    answer:
      'Not noticeably. All data flows through a single connection in the background, not one per tab. The feed bar runs in an isolated Shadow DOM with at most 50 items in memory, and nothing gets written to disk.',
    accent: 'amber',
  },
  {
    icon: ShieldCheck,
    question: 'Is my browsing data private?',
    highlight: 'No analytics, no tracking pixels, and no telemetry. Period.',
    answer:
      "The extension contains zero analytics, zero tracking pixels, and zero telemetry. Your preferences are stored in your browser's local extension storage and never transmitted anywhere. The only network requests go to the Scrollr API to fetch your feed data.",
    accent: 'sky',
  },
  {
    icon: Globe,
    question: 'What browsers are supported?',
    highlight: 'Works on every major browser right out of the box.',
    answer:
      'Any Chromium-based browser works out of the box. Scrollr is available on the Chrome Web Store and Firefox Add-ons, covering virtually every modern desktop browser.',
    accent: 'violet',
  },
  {
    icon: UserX,
    question: 'Do I need an account?',
    highlight: 'Just install and go. No sign-up required to start.',
    answer:
      "Install the extension and you'll immediately receive live stock and sports data with no sign-up. Creating a free account unlocks all four integrations (finance, sports, news, and fantasy), the web dashboard, and cross-device preference sync.",
    accent: 'rose',
  },
  {
    icon: Layers,
    question: 'What data does Scrollr show?',
    highlight:
      'Live stocks, scores, news headlines, and fantasy updates in one feed.',
    answer:
      'Four integrations: real-time stock and crypto prices, live sports scores across major leagues, RSS news headlines from hundreds of sources, and Yahoo Fantasy league updates including standings and matchups.',
    accent: 'cyan',
  },
  {
    icon: SlidersHorizontal,
    question: 'Can I customize the feed?',
    highlight:
      'Adjust everything from position and size to per-site visibility.',
    answer:
      'Position the bar at the top or bottom of your screen, drag to resize the height, switch between comfort and compact modes, choose overlay or push behavior, pick which integrations appear as tabs, and choose which websites show or hide the feed.',
    accent: 'orange',
  },
  {
    icon: Code,
    question: 'Is Scrollr open source?',
    highlight: 'Every line of code is public. Inspect, fork, or contribute.',
    answer:
      'Every component, from the browser extension and web app to the API and integration services, is publicly available on GitHub under the GNU Affero General Public License v3.0. You can inspect, fork, or contribute to any part of it.',
    accent: 'fuchsia',
  },
]

// ── Accent color map ─────────────────────────────────────────────

const ACCENT_COLORS: Record<
  string,
  { ring: string; glow: string; gradient: string }
> = {
  emerald: {
    ring: 'rgba(52,211,153,0.25)',
    glow: 'rgba(52,211,153,0.12)',
    gradient: 'rgba(52,211,153,0.06)',
  },
  amber: {
    ring: 'rgba(251,191,36,0.25)',
    glow: 'rgba(251,191,36,0.12)',
    gradient: 'rgba(251,191,36,0.06)',
  },
  sky: {
    ring: 'rgba(56,189,248,0.25)',
    glow: 'rgba(56,189,248,0.12)',
    gradient: 'rgba(56,189,248,0.06)',
  },
  violet: {
    ring: 'rgba(167,139,250,0.25)',
    glow: 'rgba(167,139,250,0.12)',
    gradient: 'rgba(167,139,250,0.06)',
  },
  rose: {
    ring: 'rgba(251,113,133,0.25)',
    glow: 'rgba(251,113,133,0.12)',
    gradient: 'rgba(251,113,133,0.06)',
  },
  cyan: {
    ring: 'rgba(34,211,238,0.25)',
    glow: 'rgba(34,211,238,0.12)',
    gradient: 'rgba(34,211,238,0.06)',
  },
  orange: {
    ring: 'rgba(251,146,60,0.25)',
    glow: 'rgba(251,146,60,0.12)',
    gradient: 'rgba(251,146,60,0.06)',
  },
  fuchsia: {
    ring: 'rgba(232,121,249,0.25)',
    glow: 'rgba(232,121,249,0.12)',
    gradient: 'rgba(232,121,249,0.06)',
  },
}

// ── Constants & Utils ────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

function calculateViewY(difference: number, containerHeight: number) {
  return difference * containerHeight * 0.75 * -1
}

function useMounted() {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])
  return isMounted
}

// ── Desktop Answer Panel ─────────────────────────────────────────

function AnswerPanel({ item }: { item: FAQItem }) {
  const Icon = item.icon
  const colors = ACCENT_COLORS[item.accent] ?? ACCENT_COLORS.emerald

  return (
    <div className="relative h-full rounded-2xl bg-base-200/40 border border-base-300/25 p-8 sm:p-9 overflow-hidden flex flex-col gap-4">
      {/* Ambient gradient orb — top-right, per-card accent color */}
      <div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none blur-3xl"
        style={{ background: colors.gradient }}
      />

      {/* Subtle corner dot grid */}
      <div
        className="absolute bottom-4 right-4 w-16 h-16 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
      />

      {/* Top accent line */}
      <div
        className="absolute top-0 left-8 right-8 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${colors.ring} 50%, transparent)`,
        }}
      />

      {/* Watermark icon — slightly more visible */}
      <Icon
        size={140}
        strokeWidth={0.4}
        className="absolute -bottom-6 -right-6 text-base-content/[0.025] pointer-events-none select-none"
      />

      {/* ── Icon badge ── */}
      <div className="relative">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: colors.glow,
            boxShadow: `0 0 24px ${colors.glow}, 0 0 0 1px ${colors.ring}`,
          }}
        >
          <Icon size={22} className="text-base-content/80" />
        </div>
      </div>

      {/* ── Highlight TLDR ── */}
      <span className="relative text-lg sm:text-xl font-bold text-base-content leading-snug block pb-2">
        {item.highlight}
      </span>

      {/* ── Divider ── */}
      <div className="relative flex items-center gap-3">
        <div
          className="h-px flex-1"
          style={{
            background: `linear-gradient(90deg, ${colors.ring}, transparent)`,
          }}
        />
        <span className="text-[11px] font-semibold tracking-widest uppercase text-base-content/20">
          Details
        </span>
        <div
          className="h-px flex-1"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.ring})`,
          }}
        />
      </div>

      {/* ── Full answer ── */}
      <span className="relative text-[15px] text-base-content/45 leading-relaxed flex-1 block">
        {item.answer}
      </span>
    </div>
  )
}

// ── Desktop Answer View (spring-animated sliding container) ──────

function AnswerView({
  children,
  containerHeight,
  viewIndex,
  activeIndex,
}: {
  children: React.ReactNode
  containerHeight: number
  viewIndex: number
  activeIndex: number
}) {
  const y = useSpring(
    calculateViewY(activeIndex - viewIndex, containerHeight),
    {
      stiffness: 400,
      damping: 60,
    },
  )

  const yVelocity = useVelocity(y)

  const opacity = useTransform(
    y,
    [-containerHeight * 0.6, 0, containerHeight * 0.6],
    [0, 1, 0],
  )

  const blur = useTransform(yVelocity, [-1000, 0, 1000], [4, 0, 4], {
    clamp: false,
  })

  const filter = useMotionTemplate`blur(${blur}px)`

  useEffect(() => {
    y.set(calculateViewY(activeIndex - viewIndex, containerHeight))
  }, [activeIndex, containerHeight, viewIndex, y])

  return (
    <motion.div
      style={{
        position: 'absolute',
        inset: 0,
        y,
        opacity,
        filter,
        transformOrigin: 'center',
        willChange: 'transform, filter',
        isolation: 'isolate',
      }}
    >
      {children}
    </motion.div>
  )
}

// ── Mobile Accordion Item ────────────────────────────────────────

function AccordionItem({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: FAQItem
  index: number
  isOpen: boolean
  onToggle: () => void
}) {
  const Icon = item.icon

  return (
    <motion.div
      style={{ opacity: 0 }}
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        delay: 0.06 + index * 0.08,
        duration: 0.5,
        ease: EASE,
      }}
    >
      <div
        className={`group relative bg-base-200/40 border rounded-xl overflow-hidden transition-[color,background-color,border-color,box-shadow] duration-300 ${
          isOpen
            ? 'border-primary/20'
            : 'border-base-300/30 hover:border-base-300/50'
        }`}
      >
        {/* Question trigger */}
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
        >
          <span className="flex items-center gap-3 min-w-0">
            <Icon
              size={16}
              className={`shrink-0 transition-colors duration-200 ${
                isOpen ? 'text-primary' : 'text-base-content/25'
              }`}
            />
            <span
              className={`text-[15px] font-semibold transition-colors duration-200 leading-snug ${
                isOpen ? 'text-base-content' : 'text-base-content/60'
              }`}
            >
              {item.question}
            </span>
          </span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center transition-colors duration-200 ${
              isOpen
                ? 'bg-primary/10 text-primary'
                : 'bg-base-300/20 text-base-content/25'
            }`}
          >
            <ChevronDown size={15} />
          </motion.div>
        </button>

        {/* Collapsible answer */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.3, ease: EASE },
                opacity: { duration: 0.2, delay: 0.05 },
              }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 pt-0">
                <div className="h-px bg-base-300/20 mb-3" />
                <p className="text-[13px] font-semibold text-base-content/70 mb-2 leading-snug">
                  {item.highlight}
                </p>
                <p className="text-sm text-base-content/40 leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export function FAQSection() {
  const [activeIndex, setActiveIndex] = useState(0)
  const sectionRef = useRef<HTMLElement>(null)
  const isMounted = useMounted()

  // Container height measurement for spring animation
  const viewsContainerRef = useRef<HTMLDivElement>(null)
  const [viewsContainerHeight, setViewsContainerHeight] = useState(0)

  useEffect(() => {
    const updateHeight = () => {
      if (viewsContainerRef.current) {
        setViewsContainerHeight(
          viewsContainerRef.current.getBoundingClientRect().height,
        )
      }
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [viewsContainerHeight])

  // ── Manual selection ───────────────────────────────────────────
  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  const goNext = useCallback(() => {
    handleSelect((activeIndex + 1) % FAQ_ITEMS.length)
  }, [activeIndex, handleSelect])

  const goPrev = useCallback(() => {
    handleSelect((activeIndex - 1 + FAQ_ITEMS.length) % FAQ_ITEMS.length)
  }, [activeIndex, handleSelect])

  // ── Keyboard nav ───────────────────────────────────────────────
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      }
    }

    section.addEventListener('keydown', handleKeyDown)
    return () => section.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrev])

  // Mobile accordion can close all items; desktop always has one selected
  const handleMobileToggle = (i: number) => {
    if (activeIndex === i) {
      setActiveIndex(-1)
    } else {
      handleSelect(i)
    }
  }

  return (
    <section ref={sectionRef} className="relative" tabIndex={-1}>
      <div className="container relative py-24 lg:py-32">
        {/* ── Section header ── */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col items-center text-center mb-14 lg:mb-16"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4 text-center">
            Before You <span className="text-gradient-primary">Install</span>
          </h2>
          <p className="text-base text-base-content/50 leading-relaxed text-center max-w-lg">
            Quick answers, no fluff.
          </p>
        </motion.div>

        {/* ── Desktop: Split panel ── */}
        <div className="hidden lg:flex gap-6 max-w-5xl mx-auto items-stretch">
          {/* Left — question nav */}
          <div className="w-[360px] shrink-0 flex flex-col">
            <div className="flex-1 space-y-1">
              {FAQ_ITEMS.map((item, i) => {
                const NavIcon = item.icon
                const isActive = activeIndex === i
                return (
                  <motion.button
                    key={item.question}
                    type="button"
                    onClick={() => handleSelect(i)}
                    style={{ opacity: 0 }}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{
                      delay: 0.06 + i * 0.08,
                      duration: 0.5,
                      ease: EASE,
                    }}
                    className={`relative w-full text-left pl-5 pr-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer transition-[color,background-color,border-color,box-shadow] duration-300 ${
                      isActive
                        ? 'bg-base-200/60 text-base-content'
                        : 'text-base-content/40 hover:text-base-content/60 hover:bg-base-200/25'
                    }`}
                  >
                    {/* Sliding accent indicator */}
                    {isActive && (
                      <motion.div
                        layoutId="faq-indicator"
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary"
                        transition={{
                          type: 'spring',
                          bounce: 0.15,
                          duration: 0.4,
                        }}
                      />
                    )}

                    <NavIcon
                      size={16}
                      className={`shrink-0 transition-colors duration-300 ${
                        isActive ? 'text-primary' : ''
                      }`}
                    />
                    <span className="text-[15px] font-semibold leading-snug">
                      {item.question}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>

          {/* Right — spring-animated answer views + nav controls */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: 0.2, duration: 0.6, ease: EASE }}
            className="flex-1 flex flex-col gap-4"
          >
            {/* Answer views — fixed height, overflow hidden for sliding */}
            <div
              ref={viewsContainerRef}
              className="relative min-h-[380px] flex-1 overflow-hidden rounded-2xl"
            >
              {isMounted &&
                FAQ_ITEMS.map((item, idx) => (
                  <AnswerView
                    key={item.question}
                    containerHeight={viewsContainerHeight}
                    viewIndex={idx}
                    activeIndex={activeIndex}
                  >
                    <AnswerPanel item={item} />
                  </AnswerView>
                ))}
            </div>

            {/* Navigation controls */}
            <div className="flex items-center justify-between">
              {/* Counter */}
              <span className="text-sm text-base-content/30 font-medium tabular-nums">
                {activeIndex + 1}{' '}
                <span className="text-base-content/15">
                  / {FAQ_ITEMS.length}
                </span>
              </span>

              {/* Prev / Next */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="h-9 w-9 rounded-lg bg-base-200/40 border border-base-300/20 flex items-center justify-center text-base-content/40 hover:text-base-content/70 hover:border-base-300/40 transition-[color,background-color,border-color,box-shadow] duration-200 cursor-pointer"
                  aria-label="Previous question"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="h-9 w-9 rounded-lg bg-base-200/40 border border-base-300/20 flex items-center justify-center text-base-content/40 hover:text-base-content/70 hover:border-base-300/40 transition-[color,background-color,border-color,box-shadow] duration-200 cursor-pointer"
                  aria-label="Next question"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Mobile / Tablet: Accordion ── */}
        <div className="lg:hidden max-w-3xl mx-auto space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem
              key={item.question}
              item={item}
              index={i}
              isOpen={activeIndex === i}
              onToggle={() => handleMobileToggle(i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
