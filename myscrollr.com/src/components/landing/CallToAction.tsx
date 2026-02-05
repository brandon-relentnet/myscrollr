import * as motion from 'motion/react-client'
import InstallButton from '@/components/InstallButton'

export function CallToAction() {
  return (
    <section className="container py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative overflow-hidden rounded-sm bg-base-200/60 border border-base-300 p-8 md:p-12 lg:p-16 shadow-2xl"
      >
        {/* Foreground Glow Effects */}
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[250px] h-[250px] bg-info/5 rounded-full blur-[60px] pointer-events-none" />

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage: `
                 linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px)
               `,
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          {/* Content */}
          <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left">
            <motion.span
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-primary/10 border border-primary/20"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              <span className="text-xs font-mono uppercase tracking-widest text-primary">
                Get Started
              </span>
            </motion.span>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-5"
            >
              Bring your data <br />
              <span className="text-gradient-primary font-black uppercase tracking-tighter">
                everywhere
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-lg text-base-content/60 leading-relaxed"
            >
              Add to Chrome and pin your sports, crypto, and feeds over any tab.
              Never miss a moment.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap items-center justify-center lg:justify-start gap-4 mt-6"
            >
              <span className="tag tag-primary">
                <span className="w-1 h-1 rounded-full bg-primary" />
                Open Source
              </span>
              <span className="tag">
                <span className="w-1 h-1 rounded-full bg-base-content/30" />
                Free Forever
              </span>
            </motion.div>
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="w-full max-w-md mx-auto lg:mx-0 flex flex-col items-center lg:items-end"
          >
            <div className="relative w-full">
              {/* Glow effect */}
              <div className="absolute -inset-3 bg-primary/10 rounded-lg blur-xl opacity-50" />
              <InstallButton className="relative w-full text-lg py-4 shadow-xl" />
            </div>

            <p className="mt-5 text-[10px] font-mono text-base-content/40 text-center lg:text-right uppercase tracking-[0.2em] font-bold flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                Chrome
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-base-content/30" />
                Brave
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-base-content/30" />
                Edge
              </span>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}
