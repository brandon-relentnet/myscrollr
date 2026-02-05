import * as motion from 'motion/react-client'

export function AboutPreview() {
  return (
    <section className="container py-32 relative">
      <div className="relative z-10 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
        {/* Content */}
        <motion.div
          className="flex-1 space-y-6 text-center lg:text-left"
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <span className="inline-block px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold font-mono uppercase tracking-widest">
            Our Mission
          </span>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase">
            Building the last ticker <br />
            <span className="text-primary">you'll ever need</span>
          </h2>

          <p className="text-lg text-base-content/60 leading-relaxed max-w-lg">
            Scrollr started as a simple idea: why do we have to switch tabs to
            see the score? It has since evolved into a powerful overlay engine
            for the modern web.
          </p>

          <motion.div whileHover={{ x: 5 }} className="pt-2">
            <a
              href="https://chromewebstore.google.com/detail/scrollr/pjeafpgbpfbcaddipkcbacohhbfakclb"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary font-bold uppercase text-sm tracking-wider hover:opacity-80 transition-colors"
            >
              Get the Extension
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
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
          <div className="relative aspect-video rounded border border-base-300 bg-base-200/50 backdrop-blur-sm overflow-hidden shadow-2xl">
            {/* Abstract visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full border-4 border-primary/30 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-4 border-secondary/30 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-primary animate-pulse" />
                </div>
              </div>
            </div>

            {/* Floating data points */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute top-4 left-4 px-2 py-1 rounded bg-base-300 text-[10px] font-bold font-mono text-primary border border-base-300 shadow-sm"
            >
              LIVE
            </motion.div>
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute bottom-4 right-4 px-2 py-1 rounded bg-base-300 text-[10px] font-bold font-mono text-secondary border border-base-300 shadow-sm"
            >
              CONNECTED
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}