import { motion } from 'motion/react'
import { ArrowDown, Check, Feather, Shield, Sparkles } from 'lucide-react'
import InstallButton from '@/components/InstallButton'

// ── Constants ────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

const PROMISES = [
  { icon: Check, label: 'Free forever', accent: 'text-success' },
  { icon: Shield, label: 'No data collected', accent: 'text-info' },
  { icon: Feather, label: 'Under 500 KB', accent: 'text-primary' },
] as const

// ── Main Component ───────────────────────────────────────────────

export function MidPageCTA() {
  return (
    <section className="relative py-20 lg:py-28">
      {/* Background band */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

      <div className="container relative">
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="max-w-2xl mx-auto relative"
        >
          {/* Outer ambient glow */}
          <div
            className="absolute -inset-6 rounded-3xl pointer-events-none blur-3xl"
            style={{
              background:
                'radial-gradient(ellipse at center, var(--color-primary) 0%, transparent 70%)',
              opacity: 0.06,
            }}
          />

          {/* Card */}
          <div className="relative rounded-2xl border border-primary/[0.08] bg-base-200/40 overflow-hidden">
            {/* Top accent line */}
            <div
              className="absolute top-0 left-8 right-8 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, var(--color-primary) 50%, transparent)',
                opacity: 0.3,
              }}
            />

            {/* Watermark icon */}
            <Sparkles
              size={180}
              strokeWidth={0.4}
              className="absolute -bottom-8 -right-8 text-primary/[0.03] pointer-events-none select-none"
            />

            {/* Ambient gradient orb — top-right corner */}
            <div
              className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none blur-3xl"
              style={{
                background: 'rgba(52, 211, 153, 0.06)',
              }}
            />

            {/* Content */}
            <div className="relative px-7 py-10 sm:px-10 sm:py-12 flex flex-col items-center text-center gap-6">
              {/* Scroll-down indicator */}
              <motion.div
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: -8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1, duration: 0.5, ease: EASE }}
                className="w-10 h-10 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center"
              >
                <motion.div
                  animate={{ y: [0, 3, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <ArrowDown size={18} className="text-primary" />
                </motion.div>
              </motion.div>

              {/* Headline */}
              <div>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-base-content mb-2 leading-tight">
                  Seen enough?
                </h3>
                <p className="text-sm sm:text-base text-base-content/40 leading-relaxed max-w-md mx-auto">
                  One click to install. No account needed. Remove it anytime.
                </p>
              </div>

              {/* Install button */}
              <motion.div
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15, duration: 0.5, ease: EASE }}
              >
                <InstallButton />
              </motion.div>

              {/* Promise badges */}
              <motion.div
                style={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.5, ease: EASE }}
                className="flex flex-wrap items-center justify-center gap-4 sm:gap-5"
              >
                {PROMISES.map((promise) => {
                  const Icon = promise.icon
                  return (
                    <span
                      key={promise.label}
                      className="flex items-center gap-2 text-xs text-base-content/35"
                    >
                      <span
                        className={`w-5 h-5 rounded-md bg-base-200/60 border border-base-300/20 flex items-center justify-center`}
                      >
                        <Icon size={11} className={promise.accent} />
                      </span>
                      {promise.label}
                    </span>
                  )
                })}
              </motion.div>
            </div>

            {/* Bottom accent line */}
            <div
              className="absolute bottom-0 left-12 right-12 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, var(--color-primary) 50%, transparent)',
                opacity: 0.12,
              }}
            />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
