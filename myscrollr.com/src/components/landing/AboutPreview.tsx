import { motion } from 'motion/react'
import { ArrowUpRight, Github, Shield } from 'lucide-react'

export function AboutPreview() {
  return (
    <section className="container py-24 lg:py-32 relative">
      <div className="relative z-10 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-sm bg-base-200/40 border border-base-300/50 backdrop-blur-sm"
        >
          {/* Background layers */}
          <div className="absolute inset-0 pointer-events-none">
            <motion.div
              className="absolute top-0 left-0 w-[400px] h-[400px] rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(191, 255, 0, 0.04) 0%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div
              className="absolute inset-0 opacity-[0.015]"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
              }}
            />
          </div>

          <div className="relative z-10 p-10 md:p-14 lg:p-16 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Content */}
            <div className="flex-1 text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/8 text-primary text-[10px] font-bold rounded-sm border border-primary/15 uppercase tracking-[0.2em] mb-6"
              >
                <Shield size={12} />
                Open Source
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase leading-[0.95] mb-5"
              >
                Free &{' '}
                <span className="text-gradient-primary">Open Source</span>
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="text-sm text-base-content/40 leading-relaxed max-w-md mx-auto lg:mx-0 mb-8"
              >
                No tracking. No data collection. No ads. Scrollr is built in the
                open — every line of code is public, auditable, and community-driven.
                Your data stays on your machine.
              </motion.p>

              {/* Action links */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-wrap items-center gap-5 justify-center lg:justify-start"
              >
                <a
                  href="https://github.com/scrollr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2.5 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] border border-base-300/50 text-base-content/60 rounded-sm hover:border-primary/30 hover:text-primary transition-colors"
                >
                  <Github size={14} />
                  View on GitHub
                  <ArrowUpRight
                    size={12}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </a>
                <a
                  href="https://chromewebstore.google.com/detail/scrollr/pjeafpgbpfbcaddipkcbacohhbfakclb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-base-content/30 hover:text-primary transition-colors"
                >
                  Chrome Web Store
                  <ArrowUpRight
                    size={12}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </a>
              </motion.div>
            </div>

            {/* Visual: Commit-log style graphic */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="flex-shrink-0 w-full max-w-xs"
            >
              <div className="relative rounded-sm border border-base-300/40 bg-base-100/50 overflow-hidden">
                {/* Mini terminal header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-base-300/30 bg-base-200/50">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-base-300/40" />
                    <div className="w-2 h-2 rounded-full bg-base-300/40" />
                    <div className="w-2 h-2 rounded-full bg-base-300/40" />
                  </div>
                  <span className="text-[8px] font-mono text-base-content/15 uppercase tracking-widest ml-2">
                    git log --oneline
                  </span>
                </div>

                {/* Commit lines */}
                <div className="p-4 font-mono text-[10px] space-y-2.5">
                  {[
                    { hash: 'a3f8d2c', msg: 'feat: yahoo fantasy integration', color: 'text-primary/50' },
                    { hash: '7e1b4a9', msg: 'feat: rss feed aggregation', color: 'text-info/50' },
                    { hash: 'b2c9e1f', msg: 'fix: cdc routing per-feed-url', color: 'text-secondary/50' },
                    { hash: 'd4a7c3b', msg: 'feat: sports espn polling', color: 'text-primary/50' },
                    { hash: 'f9e2d8a', msg: 'feat: finance finnhub ws', color: 'text-info/50' },
                    { hash: '1c6b3e7', msg: 'feat: sse real-time pipeline', color: 'text-accent/50' },
                    { hash: '8a4f2d1', msg: 'init: scrollr monorepo', color: 'text-base-content/20' },
                  ].map((commit, i) => (
                    <motion.div
                      key={commit.hash}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.06 }}
                      className="flex items-center gap-2"
                    >
                      <span className="text-warning/30 shrink-0">{commit.hash}</span>
                      <span className={`${commit.color} truncate`}>{commit.msg}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Subtle tech tags -- the Easter eggs */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                {['Rust', 'Go', 'PostgreSQL', 'Redis'].map((tech) => (
                  <span
                    key={tech}
                    className="text-[9px] font-mono text-base-content/15 uppercase tracking-wider px-2 py-0.5 border border-base-300/20 rounded-sm"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
