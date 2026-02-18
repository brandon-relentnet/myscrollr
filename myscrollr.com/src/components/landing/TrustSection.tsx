import { useEffect, useRef, useState } from 'react'
import { animate, motion, useInView } from 'motion/react'
import { ShieldCheck } from 'lucide-react'

// ── Types & Data ─────────────────────────────────────────────────

const REFUSALS = [
  'Track your browsing',
  'Collect personal data',
  'Show you ads',
  'Sell to data brokers',
] as const

interface Pledge {
  title: string
  body: string
}

const PLEDGES: Array<Pledge> = [
  {
    title: 'Open Source',
    body: 'Every line of code is public and auditable.',
  },
  {
    title: 'Local Only',
    body: 'Your data never leaves your browser. Period.',
  },
  {
    title: 'No Account Required',
    body: 'Install the extension and go. No email, no password.',
  },
  {
    title: 'Featherweight',
    body: 'Under 500 KB total. Zero battery drain.',
  },
]

interface StatItem {
  value: number
  prefix?: string
  suffix?: string
  label: string
}

const STATS: Array<StatItem> = [
  { value: 4, label: 'Live integrations' },
  { value: 50, suffix: '+', label: 'Tracked symbols' },
  { value: 100, suffix: '+', label: 'News sources' },
  { value: 500, prefix: '<', suffix: 'KB', label: 'Extension size' },
]

// ── Constants ────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

// ── Animated SVG Checkmark ───────────────────────────────────────
// Circle draws itself, then the check sweeps in — "verified" feel.

function AnimatedCheck({ delay }: { delay: number }) {
  return (
    <motion.svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* Circle ring */}
      <motion.circle
        cx="18"
        cy="18"
        r="15.5"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 0.35 }}
        viewport={{ once: true }}
        transition={{ delay, duration: 0.6, ease: 'easeOut' }}
      />
      {/* Checkmark */}
      <motion.path
        d="M12 18.5l4.5 4.5 7.5-8"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: delay + 0.45, duration: 0.35, ease: 'easeOut' }}
      />
    </motion.svg>
  )
}

// ── Animated Counter ─────────────────────────────────────────────

function AnimatedCounter({
  target,
  prefix = '',
  suffix = '',
}: {
  target: number
  prefix?: string
  suffix?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, target, {
      duration: target <= 10 ? 0.6 : 1.4,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [inView, target])

  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  )
}

// ── Main Component ───────────────────────────────────────────────

export function TrustSection() {
  return (
    <section className="relative">
      {/* Cool, calmer background band */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/25 to-transparent pointer-events-none" />

      <div className="container relative py-24 lg:py-32">
        {/* ── Section header ── */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col items-center text-center mb-10 lg:mb-14"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4 text-center">
            Your Privacy,{' '}
            <span className="text-gradient-primary">Guaranteed</span>
          </h2>
          <p className="text-base text-base-content/45 leading-relaxed text-center max-w-lg">
            We built Scrollr the way we&rsquo;d want software built for us.
          </p>
        </motion.div>

        {/* ── "What we refuse" badges ── */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex flex-wrap justify-center gap-2.5 sm:gap-3 mb-14 lg:mb-18"
        >
          {REFUSALS.map((item, i) => (
            <motion.span
              key={item}
              style={{ opacity: 0 }}
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.06 + i * 0.07,
                duration: 0.4,
                ease: EASE,
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] bg-error/[0.06] border border-error/[0.1] text-base-content/35 line-through decoration-error/25"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="shrink-0 text-error/40"
                aria-hidden="true"
              >
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {item}
            </motion.span>
          ))}
        </motion.div>

        {/* ── Promise card ── */}
        <div className="max-w-3xl mx-auto relative">
          {/* Outer glow behind card */}
          <div
            className="absolute -inset-3 rounded-3xl pointer-events-none blur-2xl"
            style={{
              background:
                'radial-gradient(ellipse at center, var(--color-primary) 0%, transparent 70%)',
              opacity: 0.06,
            }}
          />

          {/* Card body */}
          <div className="relative rounded-2xl border border-primary/[0.08] bg-base-200/40 p-7 sm:p-10 overflow-hidden">
            {/* Shield watermark */}
            <ShieldCheck
              size={220}
              strokeWidth={0.4}
              className="absolute -bottom-12 -right-12 text-primary/[0.03] pointer-events-none select-none"
            />

            {/* 2×2 pledge grid */}
            <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-x-10 sm:gap-y-10">
              {PLEDGES.map((pledge, i) => (
                <motion.div
                  key={pledge.title}
                  style={{ opacity: 0 }}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{
                    delay: 0.08 + i * 0.1,
                    duration: 0.5,
                    ease: EASE,
                  }}
                  className="flex items-start gap-4"
                >
                  <AnimatedCheck delay={0.15 + i * 0.18} />
                  <div className="pt-0.5">
                    <h3 className="text-[15px] font-bold text-base-content mb-1">
                      {pledge.title}
                    </h3>
                    <p className="text-sm text-base-content/45 leading-relaxed">
                      {pledge.body}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 mt-14 lg:mt-18 max-w-3xl mx-auto text-center">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.08 + i * 0.08,
                duration: 0.5,
                ease: EASE,
              }}
            >
              <span className="block text-3xl sm:text-4xl font-black text-base-content tracking-tight mb-1">
                <AnimatedCounter
                  target={stat.value}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                />
              </span>
              <span className="text-sm text-base-content/35">{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
