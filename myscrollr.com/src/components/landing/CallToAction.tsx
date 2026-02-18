import { motion } from 'motion/react'
import InstallButton from '@/components/InstallButton'

export function CallToAction() {
  return (
    <section className="relative">
      {/* Full-bleed background band */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-200/40 via-base-200/60 to-base-200/40 pointer-events-none" />

      <div className="container relative py-24 lg:py-32">
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto gap-5">
          {/* Headline */}
          <motion.h2
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95]"
          >
            Start <span className="text-rainbow">Scrolling</span>
          </motion.h2>

          {/* Subtext */}
          <motion.span
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.1,
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="text-base text-base-content/45 leading-relaxed max-w-md block pb-5"
          >
            Live sports, markets, news, and fantasy pinned to every tab. Free,
            private, and open source.
          </motion.span>

          {/* Single CTA button */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.2,
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="pb-3"
          >
            <InstallButton className="text-base px-8 py-4 shadow-xl" />
          </motion.div>

          {/* Browser compat line */}
          <motion.span
            style={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.35 }}
            className="text-[11px] text-base-content/30 flex items-center gap-3"
          >
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
              Chrome
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-base-content/20" />
              Brave
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-base-content/20" />
              Edge
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-base-content/20" />
              Firefox
            </span>
          </motion.span>
        </div>
      </div>
    </section>
  )
}
