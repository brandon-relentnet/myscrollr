import * as motion from 'motion/react-client'
import InstallButton from '@/components/InstallButton'

export function CallToAction() {
  return (
    <section className="container py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative overflow-hidden rounded-xl bg-base-200 border border-base-300 p-8 md:p-12 lg:p-16 shadow-2xl"
      >
        {/* Background Effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-info/5 rounded-full blur-3xl pointer-events-none" />

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `
                 linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px)
               `,
            backgroundSize: '30px 30px',
          }}
        />

        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          {/* Content */}
          <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left">
            <motion.span
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="inline-block mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono uppercase tracking-wider"
            >
              Get Started
            </motion.span>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4"
            >
              Take the ticker{' '}
              <span className="gradient-text-pulse font-black uppercase tracking-tighter">
                with you
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-lg text-base-content/60 leading-relaxed"
            >
              You've seen how it works. Now bring your sports, stocks, and feeds
              to every tab you open.
              <span className="block mt-2 text-primary font-bold uppercase text-sm tracking-wider">
                Free to use. No account required.
              </span>
            </motion.p>
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="w-full max-w-md mx-auto lg:mx-0 flex flex-col items-center lg:items-end"
          >
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute -inset-2 bg-primary/20 rounded-xl blur-xl opacity-50" />
              <InstallButton className="relative w-full text-lg py-4 shadow-xl shadow-primary/10" />
            </div>

            <p className="mt-4 text-[10px] font-mono text-base-content/40 text-center lg:text-right uppercase tracking-[0.2em] font-bold">
              Chrome • Brave • Edge
            </p>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}
