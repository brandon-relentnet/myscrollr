import { motion } from 'motion/react'
import { Download, Globe, Sliders } from 'lucide-react'

const accentMap = {
  primary: {
    icon: 'bg-primary/8 border-primary/15 text-primary',
    hoverGradient: 'from-primary/[0.03]',
    hoverBorder: 'hover:border-primary/20',
    accentLine: 'group-hover:via-primary/20',
  },
  info: {
    icon: 'bg-info/8 border-info/15 text-info',
    hoverGradient: 'from-info/[0.03]',
    hoverBorder: 'hover:border-info/20',
    accentLine: 'group-hover:via-info/20',
  },
  secondary: {
    icon: 'bg-secondary/8 border-secondary/15 text-secondary',
    hoverGradient: 'from-secondary/[0.03]',
    hoverBorder: 'hover:border-secondary/20',
    accentLine: 'group-hover:via-secondary/20',
  },
} as const

const steps = [
  {
    number: '01',
    icon: <Download size={22} />,
    title: 'Install',
    description:
      'Add Scrollr to Chrome in one click. Free, lightweight, no account required.',
    accent: 'primary' as const,
  },
  {
    number: '02',
    icon: <Sliders size={22} />,
    title: 'Choose Your Streams',
    description:
      'Pick from sports scores, market data, news feeds, and fantasy leagues.',
    accent: 'info' as const,
  },
  {
    number: '03',
    icon: <Globe size={22} />,
    title: 'Browse Anywhere',
    description:
      'Your data follows you across every tab. Always visible, never in the way.',
    accent: 'secondary' as const,
  },
]

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="container py-24 lg:py-32 relative scroll-m-20"
    >
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mb-16 text-center"
      >
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/8 text-primary text-[10px] font-bold rounded-lg border border-primary/15 uppercase tracking-[0.2em]">
            How It Works
          </span>
        </div>

        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-5">
          Three Steps to{' '}
          <span className="text-gradient-primary">Your Feed</span>
        </h2>
        <p className="text-sm text-base-content/40 mx-auto leading-relaxed">
          Up and running in under a minute. No sign-up required.
        </p>
      </motion.div>

      {/* Steps */}
      <div className="relative">
        {/* Connecting line (desktop only) */}
        <div className="hidden lg:block absolute top-1/2 left-0 right-0 -translate-y-1/2 h-px z-0">
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-full bg-gradient-to-r from-primary/0 via-primary/15 to-primary/0 origin-left"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-5 relative">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.15 + i * 0.12,
                duration: 0.6,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="group relative"
            >
              <div
                className={`relative bg-base-200/50 border border-base-300/50 rounded-xl p-8 ${accentMap[step.accent].hoverBorder} transition-colors overflow-hidden`}
              >
                {/* Hover gradient */}
                <div
                  className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b ${accentMap[step.accent].hoverGradient} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
                />

                {/* Top accent line */}
                <div
                  className={`absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-transparent ${accentMap[step.accent].accentLine} to-transparent transition-[background] duration-500`}
                />

                <div className="relative z-10">
                  {/* Number + Icon row */}
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-5xl font-black text-base-content/[0.06] tracking-tighter leading-none select-none">
                      {step.number}
                    </span>
                    <div
                      className={`h-11 w-11 rounded-xl flex items-center justify-center ${accentMap[step.accent].icon}`}
                    >
                      {step.icon}
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-bold text-base-content mb-3">
                    {step.title}
                  </h3>
                  <p className="text-sm text-base-content/40 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
