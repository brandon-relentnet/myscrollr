import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Download,
  Ghost,
  Rss,
  Shield,
  Star,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import InstallButton from '@/components/InstallButton'
import ScrollrSVG from '@/components/ScrollrSVG'

// ── Constants ────────────────────────────────────────────────────

const CYCLE_MS = 5000

const STEPS = [
  {
    id: 'install',
    title: 'Add to Chrome',
    description:
      'One click from the Chrome Web Store. No sign-up, no account, nothing else.',
  },
  {
    id: 'choose',
    title: 'Pick Your Streams',
    description:
      'Toggle on sports, markets, news, or fantasy — whatever matters to you.',
  },
  {
    id: 'browse',
    title: 'Browse as Usual',
    description:
      'A quiet ticker at the bottom of every tab. Always there, never in the way.',
  },
]

// ── Stream & chip data for visuals ───────────────────────────────

type StreamColor = 'primary' | 'secondary' | 'info' | 'accent'
type ChipColor = 'primary' | 'secondary' | 'info'

const STREAMS: Array<{
  name: string
  icon: typeof TrendingUp
  color: StreamColor
  defaultOn: boolean
}> = [
  { name: 'Finance', icon: TrendingUp, color: 'primary', defaultOn: true },
  { name: 'Sports', icon: Trophy, color: 'secondary', defaultOn: true },
  { name: 'News', icon: Rss, color: 'info', defaultOn: false },
  { name: 'Fantasy', icon: Ghost, color: 'accent', defaultOn: true },
]

const DEMO_CHIPS: { label: string; value: string; color: ChipColor }[] = [
  { label: 'BTC', value: '$67,241', color: 'primary' },
  { label: 'LAL 118', value: 'BOS 112', color: 'secondary' },
  { label: 'NVDA', value: '$891.20', color: 'primary' },
  { label: 'Fed holds rates', value: 'Reuters', color: 'info' },
]

// ── Style maps ───────────────────────────────────────────────────

const toggleBg: Record<StreamColor, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  info: 'bg-info',
  accent: 'bg-accent',
}

const iconStyle: Record<StreamColor, string> = {
  primary: 'text-primary bg-primary/10 border border-primary/15',
  secondary: 'text-secondary bg-secondary/10 border border-secondary/15',
  info: 'text-info bg-info/10 border border-info/15',
  accent: 'text-accent bg-accent/10 border border-accent/15',
}

const chipStyle: Record<
  ChipColor,
  { border: string; text: string; bg: string; sub: string }
> = {
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

// ── Shared visual transition ─────────────────────────────────────

const VISUAL_EASE = [0.22, 1, 0.36, 1] as const

// ── Step 1 Visual: Install ───────────────────────────────────────

function InstallVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: VISUAL_EASE }}
      className="flex flex-col h-full"
    >
      {/* Store-style listing card */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 py-8 sm:py-10">
        {/* Top: Extension info row */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45, ease: VISUAL_EASE }}
          className="flex items-start gap-4 sm:gap-5 mb-6 sm:mb-8"
        >
          {/* Extension icon */}
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20,
              delay: 0.15,
            }}
            className="relative shrink-0"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
              <ScrollrSVG className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>
          </motion.div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h4 className="text-lg sm:text-xl font-bold text-base-content mb-1">
              Scrollr
            </h4>
            <p className="text-xs sm:text-sm text-base-content/40 leading-relaxed mb-2.5">
              Live finance, sports &amp; news in a quiet ticker on every tab.
            </p>

            {/* Rating + meta row */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Stars */}
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: 0.4 + i * 0.06,
                      type: 'spring',
                      stiffness: 400,
                      damping: 15,
                    }}
                  >
                    <Star size={12} className="text-warning fill-warning" />
                  </motion.div>
                ))}
                <span className="text-[11px] text-base-content/30 ml-1 font-medium">
                  5.0
                </span>
              </div>

              <span className="text-base-content/10">|</span>

              {/* Tags */}
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary/70 bg-primary/[0.07] border border-primary/10 rounded-md px-1.5 py-0.5">
                  <Zap size={9} />
                  Free
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-base-content/30 bg-base-300/10 border border-base-300/15 rounded-md px-1.5 py-0.5">
                  <Shield size={9} />
                  Privacy-first
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Feature highlights */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4, ease: VISUAL_EASE }}
          className="grid grid-cols-3 gap-3 mb-7 sm:mb-8"
        >
          {[
            { icon: Zap, label: 'Lightweight', sub: '<1MB' },
            { icon: Shield, label: 'No tracking', sub: 'Zero analytics' },
            { icon: Download, label: 'Instant setup', sub: 'No account' },
          ].map((feat, i) => (
            <motion.div
              key={feat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.6 + i * 0.08,
                duration: 0.4,
                ease: VISUAL_EASE,
              }}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-base-100/40 border border-base-300/15"
            >
              <feat.icon size={14} className="text-base-content/30" />
              <span className="text-[11px] font-semibold text-base-content/60">
                {feat.label}
              </span>
              <span className="text-[10px] text-base-content/25">
                {feat.sub}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* Actual install button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.4, ease: VISUAL_EASE }}
          className="flex justify-center"
        >
          <InstallButton className="w-full sm:w-auto sm:min-w-[240px] text-center" />
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Step 2 Visual: Choose Streams ────────────────────────────────

function ChooseVisual() {
  const [toggled, setToggled] = useState<boolean[]>(STREAMS.map(() => false))

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = []
    STREAMS.forEach((stream, i) => {
      if (stream.defaultOn) {
        timeouts.push(
          setTimeout(
            () => {
              setToggled((prev) => {
                const next = [...prev]
                next[i] = true
                return next
              })
            },
            500 + i * 200,
          ),
        )
      }
    })
    return () => timeouts.forEach(clearTimeout)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: VISUAL_EASE }}
      className="flex items-center justify-center h-full py-8 sm:py-12 px-5 sm:px-10"
    >
      <div className="w-full max-w-sm space-y-2.5">
        {STREAMS.map((stream, i) => (
          <motion.div
            key={stream.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: 0.12 + i * 0.08,
              duration: 0.4,
              ease: VISUAL_EASE,
            }}
            className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-base-100/60 border border-base-300/30"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconStyle[stream.color]}`}
              >
                <stream.icon size={15} />
              </div>
              <span className="text-sm font-medium text-base-content/80">
                {stream.name}
              </span>
            </div>

            {/* Toggle pill */}
            <div
              className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${toggled[i] ? toggleBg[stream.color] : 'bg-base-300/40'}`}
            >
              <motion.div
                className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm"
                animate={{ x: toggled[i] ? 20 : 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 30,
                }}
              />
            </div>
          </motion.div>
        ))}

        {/* Subtle helper text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5, ease: VISUAL_EASE }}
          className="text-[11px] text-base-content/25 text-center pt-2"
        >
          Change anytime from the extension popup
        </motion.p>
      </div>
    </motion.div>
  )
}

// ── Step 3 Visual: Browse ────────────────────────────────────────

function BrowseVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: VISUAL_EASE }}
      className="flex flex-col h-full"
    >
      {/* Browser frame — full bleed within container */}
      <div className="flex-1 flex flex-col bg-base-100/40">
        {/* Tab / URL bar */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-base-300/20 bg-base-200/50">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-error/25" />
            <div className="w-2 h-2 rounded-full bg-warning/25" />
            <div className="w-2 h-2 rounded-full bg-success/25" />
          </div>
          <div className="flex-1 mx-2 px-3 py-1 rounded-md bg-base-100/50 border border-base-300/20">
            <span className="text-[10px] text-base-content/20">
              reddit.com/r/nba
            </span>
          </div>
        </div>

        {/* Content skeleton — fills remaining space */}
        <div className="flex-1 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-base-300/12 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-2 bg-base-300/10 rounded w-3/4" />
              <div className="h-1.5 bg-base-300/7 rounded w-1/2" />
            </div>
          </div>
          <div className="h-14 bg-base-300/5 rounded-lg border border-base-300/8" />
          <div className="space-y-2">
            <div className="h-1.5 bg-base-300/8 rounded w-full" />
            <div className="h-1.5 bg-base-300/6 rounded w-5/6" />
            <div className="h-1.5 bg-base-300/5 rounded w-2/3" />
          </div>
          {/* Extra skeleton rows to fill taller containers */}
          <div className="flex items-center gap-3 pt-2">
            <div className="w-7 h-7 rounded-full bg-base-300/8 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-2 bg-base-300/7 rounded w-2/3" />
              <div className="h-1.5 bg-base-300/5 rounded w-2/5" />
            </div>
          </div>
          <div className="h-10 bg-base-300/4 rounded-lg border border-base-300/6" />
        </div>

        {/* Ticker bar — pinned to bottom, slides up */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.6, ease: VISUAL_EASE }}
          className="mt-auto border-t border-primary/15 bg-base-100/95 px-3 py-2"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            {/* Scrollr badge */}
            <div className="flex items-center gap-1.5 pr-2 border-r border-base-300/20 shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
            </div>

            {/* Data chips */}
            {DEMO_CHIPS.map((chip, i) => {
              const cs = chipStyle[chip.color]
              return (
                <motion.div
                  key={chip.label}
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: 0.6 + i * 0.08,
                    duration: 0.4,
                    ease: VISUAL_EASE,
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded border ${cs.border} ${cs.bg} shrink-0`}
                >
                  <span className={`text-[9px] font-bold font-mono ${cs.text}`}>
                    {chip.label}
                  </span>
                  <span className={`text-[8px] font-mono ${cs.sub}`}>
                    {chip.value}
                  </span>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Visual lookup ────────────────────────────────────────────────

const VISUALS = [InstallVisual, ChooseVisual, BrowseVisual]

// ── Main Component ───────────────────────────────────────────────

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0)
  const [cycleKey, setCycleKey] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setCycleKey((k) => k + 1)
    timerRef.current = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length)
      setCycleKey((k) => k + 1)
    }, CYCLE_MS)
  }, [])

  useEffect(() => {
    startTimer()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startTimer])

  const handleSelect = useCallback(
    (index: number) => {
      setActiveStep(index)
      startTimer()
    },
    [startTimer],
  )

  const ActiveVisual = VISUALS[activeStep]

  return (
    <section id="how-it-works" className="relative scroll-m-20">
      {/* Subtle background band — signals a new "room" */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

      <div className="container relative py-24 lg:py-32">
        {/* Section Header — centered */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: VISUAL_EASE }}
          className="flex flex-col items-center text-center mb-12 lg:mb-16"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4 text-center">
            Ready in{' '}
            <span className="text-gradient-primary">Under a Minute</span>
          </h2>
          <p className="text-base text-base-content/50 leading-relaxed text-center max-w-lg">
            Three steps between you and live data in your browser.
          </p>
        </motion.div>

        {/* ── Mobile layout ── */}
        <div className="lg:hidden">
          {/* Tab pills */}
          <div className="flex gap-2 mb-5">
            {STEPS.map((step, i) => {
              const isActive = activeStep === i
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleSelect(i)}
                  className={`relative flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all duration-300 cursor-pointer overflow-hidden ${
                    isActive
                      ? 'bg-primary text-primary-content shadow-md shadow-primary/15'
                      : 'bg-base-200/50 text-base-content/40 border border-base-300/30 hover:text-base-content/60'
                  }`}
                >
                  {step.title}
                  {/* Progress bar at bottom of active tab */}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary-content/15">
                      <motion.div
                        key={`mob-progress-${cycleKey}`}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                          duration: CYCLE_MS / 1000,
                          ease: 'linear',
                        }}
                        className="h-full bg-primary-content/40 origin-left"
                      />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Visual stage */}
          <div className="rounded-2xl bg-base-200/40 border border-base-300/40 overflow-hidden min-h-[320px] sm:min-h-[360px] flex flex-col [&>*]:flex-1 [&>*]:flex [&>*]:flex-col">
            <AnimatePresence mode="wait">
              <ActiveVisual key={`mobile-${activeStep}`} />
            </AnimatePresence>
          </div>

          {/* Description */}
          <AnimatePresence mode="wait">
            <motion.p
              key={`desc-${activeStep}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: VISUAL_EASE }}
              className="text-sm text-base-content/50 text-center mt-5 px-2 leading-relaxed"
            >
              {STEPS[activeStep].description}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* ── Desktop layout ── */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-10 items-start">
          {/* Steps — left column */}
          <div className="lg:col-span-5 space-y-3">
            {STEPS.map((step, i) => {
              const isActive = activeStep === i
              return (
                <motion.button
                  key={step.id}
                  type="button"
                  onClick={() => handleSelect(i)}
                  style={{ opacity: 0 }}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: 0.1 + i * 0.08,
                    duration: 0.5,
                    ease: VISUAL_EASE,
                  }}
                  className={`w-full text-left rounded-xl px-6 py-5 transition-[color,background-color,border-color,box-shadow] duration-300 cursor-pointer relative overflow-hidden ${
                    isActive
                      ? 'bg-base-200/70 border border-primary/15 shadow-sm shadow-primary/5'
                      : 'bg-transparent border border-transparent hover:bg-base-200/30'
                  }`}
                >
                  {/* Top progress bar */}
                  {isActive && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/10 overflow-hidden">
                      <motion.div
                        key={`progress-${cycleKey}`}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                          duration: CYCLE_MS / 1000,
                          ease: 'linear',
                        }}
                        className="h-full bg-primary origin-left"
                      />
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    {/* Step number circle */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors duration-300 ${
                        isActive
                          ? 'bg-primary text-primary-content'
                          : 'bg-base-300/20 text-base-content/25'
                      }`}
                    >
                      {i + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3
                        className={`text-sm font-bold transition-colors duration-300 ${
                          isActive
                            ? 'text-base-content'
                            : 'text-base-content/45'
                        }`}
                      >
                        {step.title}
                      </h3>

                      {/* Description — expands when active */}
                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{
                              height: {
                                duration: 0.3,
                                ease: VISUAL_EASE,
                              },
                              opacity: { duration: 0.2, delay: 0.05 },
                            }}
                            className="overflow-hidden"
                          >
                            <p className="text-sm text-base-content/45 leading-relaxed mt-2">
                              {step.description}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>

          {/* Visual stage — right column */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.6, ease: VISUAL_EASE }}
            className="lg:col-span-7"
          >
            <div className="rounded-2xl bg-base-200/40 border border-base-300/40 overflow-hidden min-h-[420px] flex flex-col [&>*]:flex-1 [&>*]:flex [&>*]:flex-col">
              <AnimatePresence mode="wait">
                <ActiveVisual key={`desktop-${activeStep}`} />
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
