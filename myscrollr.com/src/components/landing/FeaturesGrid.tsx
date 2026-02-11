import { motion } from 'motion/react'

const features = [
  {
    title: 'Always on Top',
    description:
      'Pin your fantasy leagues, RSS feeds, or live markets over your work or stream. The data you need, exactly where you need it.',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    accent: 'text-primary',
    iconClass: 'text-primary',
    borderClass: 'border-primary/20',
    bgClass: 'bg-primary/10',
    stat: '∞',
    statLabel: 'Tabs Covered',
    glowColor: 'bg-primary/4',
  },
  {
    title: 'Zero Distraction',
    description:
      'Ghost mode, transparency controls, and auto-hide. Scrollr respects your screen real estate, appearing only when you need the feed.',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    accent: 'text-secondary',
    iconClass: 'text-secondary',
    borderClass: 'border-secondary/20',
    bgClass: 'bg-secondary/10',
    stat: '15px',
    statLabel: 'Min Height',
    glowColor: 'bg-secondary/4',
  },
  {
    title: 'Fully Customizable',
    description:
      'Custom feeds, scroll speed, opacity, and card layouts. Build the ticker that fits your workflow, not the other way around.',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    accent: 'text-info',
    iconClass: 'text-info',
    borderClass: 'border-info/20',
    bgClass: 'bg-info/10',
    stat: '100%',
    statLabel: 'You Control',
    glowColor: 'bg-info/4',
  },
]

export function FeaturesGrid() {
  return (
    <section id="features" className="py-24 lg:py-32 relative">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent opacity-30 pointer-events-none" />

      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16 relative z-10"
      >
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-primary/10 border border-primary/20"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
          </span>
          <span className="text-xs font-mono uppercase tracking-widest text-primary">
            Features
          </span>
        </motion.span>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
        >
          Built for <span className="text-gradient-primary">Power Users</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-lg text-base-content/60 max-w-2xl mx-auto leading-relaxed"
        >
          Everything you need to stay informed without losing focus.
        </motion.p>
      </motion.div>

      {/* Feature Cards */}
      <div className="grid md:grid-cols-3 gap-6 lg:gap-8 relative z-10">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{
              opacity: 1,
              y: 0,
              transition: { delay: 0.2 + index * 0.1 },
            }}
            viewport={{ once: true }}
            whileHover={{
              y: -4,
              transition: { duration: 0.2 },
            }}
            className="group relative p-8 rounded-sm bg-base-200/60 backdrop-blur-xl border border-base-300/50 hover:border-primary/30 transition-colors duration-300"
          >
            {/* Card-specific ambient glow */}
            <div
              className={`absolute -inset-4 ${feature.glowColor} rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
            />

            {/* Left Accent Border */}
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-sm bg-current ${feature.iconClass} opacity-60 group-hover:opacity-100 transition-opacity`}
            />

            {/* Icon Container */}
            <div
              className={`relative mb-6 w-14 h-14 rounded-sm flex items-center justify-center ${feature.bgClass} ${feature.borderClass} ${feature.iconClass}`}
            >
              <div dangerouslySetInnerHTML={{ __html: feature.icon }} />
            </div>

            {/* Content */}
            <h3 className="relative z-10 text-xl font-bold mb-3 text-base-content group-hover:text-white transition-colors">
              {feature.title}
            </h3>

            <p className="relative z-10 text-base-content/60 leading-relaxed mb-6">
              {feature.description}
            </p>

            {/* Stat Badge */}
            <div className="relative z-10 flex items-baseline gap-2 pt-5 border-t border-base-300/50">
              <span
                className={`text-2xl font-bold font-mono-numbers ${feature.accent}`}
              >
                {feature.stat}
              </span>
              <span className="text-xs font-mono text-base-content/40 uppercase tracking-wider">
                {feature.statLabel}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
