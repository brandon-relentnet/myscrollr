import { motion } from 'motion/react'
import { Eye, Feather, ShieldCheck, UserX } from 'lucide-react'

// ── Types & Data ─────────────────────────────────────────────────

interface TrustPillar {
  icon: typeof ShieldCheck
  title: string
  body: string
}

const PILLARS: Array<TrustPillar> = [
  {
    icon: ShieldCheck,
    title: 'Open Source',
    body: 'Every line of code is public. Inspect it, fork it, contribute to it. No black boxes, no hidden agendas.',
  },
  {
    icon: Eye,
    title: 'Privacy First',
    body: 'Your browsing data never leaves your machine. No analytics, no tracking pixels, no data brokers. Period.',
  },
  {
    icon: UserX,
    title: 'No Account Required',
    body: 'Install and go. No email, no sign-up, no onboarding flows. Your identity is none of our business.',
  },
  {
    icon: Feather,
    title: 'Lightweight',
    body: "Under 500KB total. No background resource drain, no battery hog. You won't even know it's running.",
  },
]

interface Stat {
  value: string
  label: string
}

const STATS: Stat[] = [
  { value: '4', label: 'Live integrations' },
  { value: '50+', label: 'Tracked symbols' },
  { value: '100+', label: 'News sources' },
  { value: '<500KB', label: 'Extension size' },
]

// ── Ease constant ────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

// ── Main Component ───────────────────────────────────────────────

export function TrustSection() {
  return (
    <section className="relative">
      {/* Subtle background — cooler/calmer than other sections */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/25 to-transparent pointer-events-none" />

      <div className="container relative py-24 lg:py-32">
        {/* Section heading — centered */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col items-center text-center mb-14 lg:mb-18"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4 text-center">
            Built on <span className="text-gradient-primary">Trust</span>
          </h2>
          <p className="text-base text-base-content/45 leading-relaxed text-center max-w-lg">
            We believe useful software should also be respectful software.
          </p>
        </motion.div>

        {/* Trust pillars — 2x2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6 mb-20 lg:mb-24">
          {PILLARS.map((pillar, i) => {
            const Icon = pillar.icon
            return (
              <motion.div
                key={pillar.title}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{
                  delay: 0.08 + i * 0.08,
                  duration: 0.5,
                  ease: EASE,
                }}
                className="group p-6 sm:p-7 rounded-2xl bg-base-200/30 border border-base-300/25 hover:border-base-300/50 transition-[color,background-color,border-color,box-shadow] duration-400"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-base-300/15 border border-base-300/20 flex items-center justify-center shrink-0 group-hover:bg-primary/8 group-hover:border-primary/15 transition-colors duration-400">
                    <Icon
                      size={18}
                      className="text-base-content/30 group-hover:text-primary transition-colors duration-400"
                    />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-base-content mb-1.5">
                      {pillar.title}
                    </h3>
                    <p className="text-sm text-base-content/40 leading-relaxed">
                      {pillar.body}
                    </p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* By the numbers — stats row */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="border-t border-base-300/30 pt-10 lg:pt-12">
            <p className="text-xs font-bold uppercase tracking-wider text-base-content/25 mb-8">
              By the numbers
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
              {STATS.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  style={{ opacity: 0 }}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: 0.1 + i * 0.08,
                    duration: 0.5,
                    ease: EASE,
                  }}
                >
                  <span className="block text-3xl sm:text-4xl font-black text-base-content tracking-tight mb-1">
                    {stat.value}
                  </span>
                  <span className="text-sm text-base-content/35">
                    {stat.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
