import { motion } from 'motion/react'
import { useState } from 'react'
import { EyeOff, Globe, Lock, Zap } from 'lucide-react'

// ── Types & Data ─────────────────────────────────────────────────

interface Benefit {
  icon: typeof Zap
  title: string
  headline: string
  body: string
  accent: string
  accentBg: string
  accentBorder: string
}

const BENEFITS: Array<Benefit> = [
  {
    icon: Zap,
    title: 'Never Miss a Moment',
    headline: 'Real-time, every time',
    body: "Market moves, game-winning plays, breaking headlines — they happen while you're reading, working, browsing. Scrollr makes sure you see them the instant they matter, without interrupting what you're doing.",
    accent: 'text-primary',
    accentBg: 'bg-primary/8',
    accentBorder: 'border-primary/15',
  },
  {
    icon: EyeOff,
    title: 'Zero Distractions',
    headline: 'A quiet presence, not a loud app',
    body: "No pop-ups. No notifications. No new tabs. Scrollr lives in a thin bar at the bottom of your screen — visible when you want it, invisible when you don't. It respects your focus.",
    accent: 'text-secondary',
    accentBg: 'bg-secondary/8',
    accentBorder: 'border-secondary/15',
  },
  {
    icon: Globe,
    title: 'Works Everywhere',
    headline: 'Every tab, every site',
    body: "Reddit, YouTube, Google Docs, your company intranet — it doesn't matter. Scrollr runs on every tab so you never have to go somewhere specific to check your feed.",
    accent: 'text-info',
    accentBg: 'bg-info/8',
    accentBorder: 'border-info/15',
  },
  {
    icon: Lock,
    title: 'Completely Yours',
    headline: 'Your data stays with you',
    body: 'No accounts to create. No tracking. No ads. Your browsing data never leaves your machine. Scrollr is open source and always will be — inspect every line if you want.',
    accent: 'text-accent',
    accentBg: 'bg-accent/8',
    accentBorder: 'border-accent/15',
  },
]

// ── Ease constant ────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

// ── Single benefit block ─────────────────────────────────────────

function BenefitBlock({
  benefit,
  index,
  isHighlighted,
  onHighlight,
}: {
  benefit: Benefit
  index: number
  isHighlighted: boolean
  onHighlight: (index: number) => void
}) {
  const isEven = index % 2 === 0
  const Icon = benefit.icon

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: isHighlighted ? 1 : 0.25,
        scale: isHighlighted ? 1 : 0.98,
      }}
      transition={{ duration: 0.3, ease: EASE }}
      onViewportEnter={() => onHighlight(index)}
      viewport={{
        margin: '-30% 0px -65% 0px',
        amount: 'some',
      }}
      className="relative rounded-2xl py-6 px-5 lg:px-8"
    >
      {/* Background card — visible when highlighted */}
      <motion.div
        initial={false}
        animate={{ opacity: isHighlighted ? 1 : 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="absolute inset-0 rounded-2xl bg-base-200/50 border border-base-300/25 pointer-events-none"
      />

      {/* Accent border line — left for even, right for odd */}
      <motion.div
        initial={false}
        animate={{ opacity: isHighlighted ? 1 : 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className={`absolute top-4 bottom-4 w-[3px] rounded-full ${benefit.accentBg.replace('/8', '')} ${
          isEven ? 'left-0' : 'right-0'
        }`}
      />

      {/* Content row — icon on same side as border */}
      <div
        className={`relative flex items-start gap-4 lg:gap-5 ${
          isEven ? '' : 'flex-row-reverse'
        }`}
      >
        {/* Icon */}
        <div className="shrink-0">
          <div
            className={`w-14 h-14 rounded-2xl ${benefit.accentBg} border ${benefit.accentBorder} flex items-center justify-center`}
          >
            <Icon size={24} className={benefit.accent} />
          </div>
        </div>

        {/* Title + headline */}
        <div className={`flex-1 min-w-0 ${isEven ? '' : 'text-right'}`}>
          <span
            className={`text-xs font-bold uppercase tracking-wider ${benefit.accent} mb-2 block`}
          >
            {benefit.title}
          </span>
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-base-content mb-3 leading-tight">
            {benefit.headline}
          </h3>
        </div>
      </div>

      {/* Body text — indented to align with icon edge */}
      <div
        className={`relative mt-3 ${
          isEven
            ? 'pl-[calc(3.5rem+1rem)] lg:pl-[calc(3.5rem+1.25rem)]'
            : 'pr-[calc(3.5rem+1rem)] lg:pr-[calc(3.5rem+1.25rem)] text-right'
        }`}
      >
        <p className="text-base text-base-content/60 leading-relaxed">
          {benefit.body}
        </p>
      </div>
    </motion.div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export function BenefitsSection() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  return (
    <section className="relative">
      <div className="container relative py-24 lg:py-32">
        <div className="max-w-3xl mx-auto">
          {/* Section heading — centered */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mb-20 lg:mb-28 text-center"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              Why <span className="text-gradient-primary">Scrollr</span>
            </h2>
            <p className="text-base text-base-content/60 leading-relaxed">
              Built for people who want to stay informed without being consumed.
            </p>
          </motion.div>

          {/* Benefits — stacked with alternating alignment */}
          <div className="space-y-16 lg:space-y-20">
            {BENEFITS.map((benefit, i) => (
              <BenefitBlock
                key={benefit.title}
                benefit={benefit}
                index={i}
                isHighlighted={activeIndex === i}
                onHighlight={setActiveIndex}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
