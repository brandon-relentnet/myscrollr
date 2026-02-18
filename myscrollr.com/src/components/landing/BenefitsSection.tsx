import { AnimatePresence, motion, useInView } from 'motion/react'
import { useRef, useState } from 'react'
import { Layers, SlidersHorizontal, Smartphone, Zap } from 'lucide-react'

// ── Types & Data ─────────────────────────────────────────────────

interface Benefit {
  icon: typeof Zap
  title: string
  headline: string
  body: string
  accent: string
  accentBg: string
  accentBorder: string
  accentRaw: string
}

const BENEFITS: Array<Benefit> = [
  {
    icon: Smartphone,
    title: 'Your Phone Stays Down',
    headline: 'Stop reaching, start glancing',
    body: 'That impulse to check scores or prices mid-task fades. The info is already in your peripheral vision, so the urge to context-switch just stops.',
    accent: 'text-primary',
    accentBg: 'bg-primary/8',
    accentBorder: 'border-primary/15',
    accentRaw: 'primary',
  },
  {
    icon: Zap,
    title: 'You Catch Things First',
    headline: 'The moment it happens, not minutes later',
    body: 'Market flash crash, buzzer-beater, breaking headline. You see it when it happens, not 10 minutes later when someone mentions it in Slack.',
    accent: 'text-secondary',
    accentBg: 'bg-secondary/8',
    accentBorder: 'border-secondary/15',
    accentRaw: 'secondary',
  },
  {
    icon: Layers,
    title: 'Your Focus Gets Deeper',
    headline: 'No more tab juggling',
    body: 'No switching to ESPN. No opening a crypto app. No refreshing Reuters. Everything flows to you, so you stay locked into whatever you were doing.',
    accent: 'text-info',
    accentBg: 'bg-info/8',
    accentBorder: 'border-info/15',
    accentRaw: 'info',
  },
  {
    icon: SlidersHorizontal,
    title: 'It Gets Out of the Way',
    headline: 'Quiet when you need quiet',
    body: "Resize it, reposition it, hide it on specific sites, or collapse it entirely. When you need deep focus, one click and it's gone.",
    accent: 'text-accent',
    accentBg: 'bg-accent/8',
    accentBorder: 'border-accent/15',
    accentRaw: 'accent',
  },
]

// ── Constants ────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const
const RING_INSETS = [0, 36, 72] as const

// ── Sticky Visual (desktop) ──────────────────────────────────────

function StickyVisual({ activeIndex }: { activeIndex: number }) {
  const benefit = BENEFITS[activeIndex]
  const Icon = benefit.icon
  const visualRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(visualRef, { amount: 0.2 })

  return (
    <div
      ref={visualRef}
      className="relative w-[280px] h-[280px] flex items-center justify-center"
    >
      {/* Diffused backdrop glow */}
      <div
        className="absolute inset-0 rounded-full blur-3xl transition-colors duration-700"
        style={{
          backgroundColor: `var(--color-${benefit.accentRaw})`,
          opacity: 0.1,
        }}
      />

      {/* Pulsing concentric rings — gated by viewport visibility */}
      {RING_INSETS.map((inset, i) => (
        <motion.div
          key={i}
          animate={
            isInView
              ? {
                  scale: [1, 1.04, 1],
                  opacity: [0.08, 0.18, 0.08],
                }
              : { scale: 1, opacity: 0.08 }
          }
          transition={
            isInView
              ? {
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.5,
                }
              : { duration: 0.3 }
          }
          className="absolute rounded-full border transition-colors duration-700"
          style={{
            inset: `${inset}px`,
            borderColor: `var(--color-${benefit.accentRaw})`,
          }}
        />
      ))}

      {/* Center icon with glow */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute w-28 h-28 rounded-full blur-2xl transition-colors duration-700"
          style={{
            backgroundColor: `var(--color-${benefit.accentRaw})`,
            opacity: 0.25,
          }}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, scale: 0.7, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.15, filter: 'blur(8px)' }}
            transition={{ duration: 0.3, ease: EASE }}
            className="relative"
          >
            <Icon size={56} strokeWidth={1.5} className={benefit.accent} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Single benefit block ─────────────────────────────────────────

function BenefitBlock({
  benefit,
  isHighlighted,
  onHighlight,
  index,
}: {
  benefit: Benefit
  isHighlighted: boolean
  onHighlight: (index: number) => void
  index: number
}) {
  const Icon = benefit.icon

  return (
    <div className="relative">
      {/* Accent glow — extends beyond card bounds */}
      <motion.div
        initial={false}
        animate={{ opacity: isHighlighted ? 0.1 : 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="absolute -inset-3 rounded-3xl blur-2xl pointer-events-none"
        style={{ backgroundColor: `var(--color-${benefit.accentRaw})` }}
      />

      {/* Card */}
      <motion.div
        initial={false}
        animate={{
          opacity: isHighlighted ? 1 : 0.45,
          scale: isHighlighted ? 1 : 0.98,
        }}
        transition={{ duration: 0.4, ease: EASE }}
        onViewportEnter={() => onHighlight(index)}
        viewport={{ margin: '-40% 0px -50% 0px', amount: 'some' }}
        className="relative rounded-2xl py-6 px-5 lg:px-8 overflow-hidden"
      >
        {/* Background card — visible when highlighted */}
        <motion.div
          initial={false}
          animate={{ opacity: isHighlighted ? 1 : 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="absolute inset-0 rounded-2xl bg-base-200/50 border border-base-300/25 pointer-events-none"
        />

        {/* Watermark icon — large, faint, positioned top-right */}
        <motion.div
          initial={false}
          animate={{ opacity: isHighlighted ? 0.06 : 0.02 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="absolute -top-4 -right-4 pointer-events-none"
        >
          <Icon size={140} strokeWidth={1} className={benefit.accent} />
        </motion.div>

        {/* Left accent bar */}
        <motion.div
          initial={false}
          animate={{
            opacity: isHighlighted ? 1 : 0,
            scaleY: isHighlighted ? 1 : 0.5,
          }}
          transition={{ duration: 0.4, ease: EASE }}
          className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full origin-center"
          style={{ backgroundColor: `var(--color-${benefit.accentRaw})` }}
        />

        {/* Content row */}
        <div className="relative flex items-start gap-4 lg:gap-5">
          {/* Icon */}
          <div className="shrink-0">
            <div
              className={`w-12 h-12 rounded-xl ${benefit.accentBg} border ${benefit.accentBorder} flex items-center justify-center`}
            >
              <Icon size={22} className={benefit.accent} />
            </div>
          </div>

          {/* Title + headline + body */}
          <div className="flex-1 min-w-0">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider ${benefit.accent} mb-1.5 block`}
            >
              {benefit.title}
            </span>
            <h3 className="text-xl sm:text-2xl font-black tracking-tight text-base-content mb-2.5 leading-tight">
              {benefit.headline}
            </h3>
            <p className="text-[15px] text-base-content/55 leading-relaxed">
              {benefit.body}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export function BenefitsSection() {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <section className="relative overflow-clip">
      {/* Ambient gradient orb — color-shifts per active card */}
      <div
        className="absolute pointer-events-none rounded-full blur-[120px] transition-colors duration-1000"
        style={{
          width: 500,
          height: 500,
          right: 0,
          top: '25%',
          opacity: 0.07,
          backgroundColor: `var(--color-${BENEFITS[activeIndex].accentRaw})`,
        }}
      />

      <div className="container relative py-20 lg:py-28">
        {/* Section heading — centered */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col items-center text-center mb-14 lg:mb-20"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4 text-center">
            What Actually <span className="text-gradient-primary">Changes</span>
          </h2>
          <p className="text-base sm:text-lg text-base-content/55 leading-relaxed text-center max-w-lg">
            It's not another app to check. It's the reason you stop checking.
          </p>
        </motion.div>

        {/* Two-column layout: cards scroll left, visual sticks right */}
        <div className="flex gap-8 lg:gap-16 max-w-5xl mx-auto">
          {/* Left — scrolling benefit cards */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ delay: 0.15, duration: 0.6, ease: EASE }}
            className="flex-1 min-w-0 space-y-6 lg:space-y-10"
          >
            {BENEFITS.map((benefit, i) => (
              <BenefitBlock
                key={benefit.title}
                benefit={benefit}
                index={i}
                isHighlighted={activeIndex === i}
                onHighlight={setActiveIndex}
              />
            ))}
          </motion.div>

          {/* Right — sticky visual (desktop only) */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ delay: 0.3, duration: 0.6, ease: EASE }}
            className="hidden lg:flex items-start justify-center w-[280px] shrink-0"
          >
            <div className="sticky top-[28vh]">
              <StickyVisual activeIndex={activeIndex} />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
