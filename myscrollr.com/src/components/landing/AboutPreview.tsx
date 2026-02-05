import * as motion from 'motion/react-client'
import { ArrowUpRight } from 'lucide-react'

export function AboutPreview() {
  return (
    <section className="container py-32 relative">
      <div className="relative z-10 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
        {/* Content */}
        <motion.div
          className="flex-1 space-y-8 text-center lg:text-left"
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            <span className="text-xs font-mono uppercase tracking-widest text-primary">
              Our Mission
            </span>
          </motion.div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase leading-tight">
            The last ticker <br />
            <span className="text-gradient-primary">you'll ever need</span>
          </h2>

          <p className="text-lg text-base-content/60 leading-relaxed max-w-lg">
            Scrollr started with a simple question: why do we have to switch tabs 
            to see the score? It evolved into an overlay engine for anyone who needs 
            data without the distraction.
          </p>

          <motion.div whileHover={{ x: 5 }} className="pt-2">
            <a
              href="https://chromewebstore.google.com/detail/scrollr/pjeafpgbpfbcaddipkcbacohhbfakclb"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary font-bold uppercase text-sm tracking-wider hover:opacity-80 transition-opacity group cursor-pointer"
            >
              Get the Extension
              <ArrowUpRight size={16} className="group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </motion.div>
        </motion.div>

        {/* Image/Graphic */}
        <motion.div
          className="flex-1 w-full max-w-md"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          <div className="relative aspect-video rounded-sm border border-base-300/50 bg-base-200/50 backdrop-blur-xl overflow-hidden shadow-2xl">
            {/* Abstract visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Outer ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                className="w-40 h-40 rounded-full border border-primary/20 flex items-center justify-center"
              >
                {/* Inner ring */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                  className="w-28 h-28 rounded-full border border-secondary/30 flex items-center justify-center"
                >
                  {/* Center dot */}
                  <div className="w-16 h-16 rounded-full border-2 border-primary/40 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-primary shadow-[0_0_20px_rgba(191,255,0,0.5)]" />
                  </div>
                </motion.div>
              </motion.div>
            </div>

            {/* Floating data points */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute top-4 left-4 px-3 py-1.5 rounded-sm bg-base-300/80 backdrop-blur-sm text-[10px] font-bold font-mono text-primary border border-primary/20 shadow-lg flex items-center gap-2"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              LIVE
            </motion.div>

            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute bottom-4 right-4 px-3 py-1.5 rounded-sm bg-base-300/80 backdrop-blur-sm text-[10px] font-bold font-mono text-secondary border border-secondary/20 shadow-lg"
            >
              CONNECTED
            </motion.div>

            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary/20" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary/20" />

            {/* Ambient glow behind graphic */}
            <div className="absolute inset-0 bg-primary/5 rounded-full blur-3xl" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
