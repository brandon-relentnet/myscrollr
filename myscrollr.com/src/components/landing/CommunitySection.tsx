import { motion } from 'motion/react'
import {
  ArrowUpRight,
  Code2,
  Github,
  Lightbulb,
  MessageSquare,
  Shield,
  Users,
} from 'lucide-react'

// ── Coming-soon integration icons (visual hook for "suggest" card) ──

const COMING_SOON_ICONS = [
  { name: 'Discord', emoji: '💬' },
  { name: 'Twitch', emoji: '📺' },
  { name: 'Reddit', emoji: '📖' },
  { name: 'GitHub', emoji: '🐙' },
  { name: 'YouTube', emoji: '▶' },
  { name: 'Spotify', emoji: '🎵' },
]

export function CommunitySection() {
  return (
    <section className="container py-24 lg:py-32 relative">
      <div className="relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14 flex flex-col items-center"
        >
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/8 text-primary text-[10px] font-bold rounded-lg border border-primary/15 uppercase tracking-[0.2em]">
              <Users size={12} />
              Open Ecosystem
            </span>
          </div>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-5">
            Built{' '}
            <span className="text-gradient-primary">Together</span>
          </h2>
          <p className="text-sm text-base-content/40 max-w-xl mx-auto leading-relaxed">
            Scrollr is open source and community-driven. Build your own
            integration, or tell us what data matters to you.
          </p>
        </motion.div>

        {/* Two-Path Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl mx-auto mb-12">
          {/* ── Card 1: Create (for developers) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.1,
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="group relative bg-base-200/40 border border-base-300/50 rounded-xl overflow-hidden"
          >
            {/* Hover glow */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary/0 group-hover:via-primary/20 to-transparent transition-[background] duration-500" />

            <div className="relative z-10 p-8 lg:p-10">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center text-primary">
                  <Code2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-base-content">
                    Create an Integration
                  </h3>
                  <p className="text-[10px] text-primary/50">
                    For developers
                  </p>
                </div>
              </div>

              {/* Body */}
              <p className="text-sm text-base-content/40 leading-relaxed mb-6">
                Every integration is a self-contained package — your own API,
                your own service, your own UI components. Follow the
                architecture, ship your plugin. The ecosystem grows with every
                contributor.
              </p>

              {/* Architecture highlights */}
              <div className="relative rounded-xl border border-base-300/40 bg-base-100/50 overflow-hidden mb-6 p-5">
                <p className="text-[9px] text-base-content/20 mb-4">
                  Each integration includes:
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: 'Go API', desc: 'HTTP endpoints' },
                    { label: 'Rust Service', desc: 'Data ingestion' },
                    { label: 'Dashboard Tab', desc: 'Web UI component' },
                    { label: 'Feed Tab', desc: 'Extension component' },
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.06 }}
                      className="flex flex-col gap-0.5 px-3 py-2.5 rounded-lg bg-base-200/60 border border-base-300/30"
                    >
                      <span className="text-[11px] font-semibold text-base-content/60">
                        {item.label}
                      </span>
                      <span className="text-[9px] text-base-content/25">
                        {item.desc}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <a
                href="https://github.com/brandon-relentnet/myscrollr"
                target="_blank"
                rel="noopener noreferrer"
                className="group/link inline-flex items-center gap-2.5 px-5 py-2.5 text-[11px] font-semibold border border-base-300/50 text-base-content/60 rounded-lg hover:border-primary/30 hover:text-primary transition-colors"
              >
                <Github size={14} />
                View on GitHub
                <ArrowUpRight
                  size={12}
                  className="opacity-0 group-hover/link:opacity-100 transition-opacity"
                />
              </a>
            </div>
          </motion.div>

          {/* ── Card 2: Suggest (for everyone) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.2,
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="group relative bg-base-200/40 border border-base-300/50 rounded-xl overflow-hidden"
          >
            {/* Hover glow */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-info/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-info/0 group-hover:via-info/20 to-transparent transition-[background] duration-500" />

            <div className="relative z-10 p-8 lg:p-10">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-info/8 border border-info/15 flex items-center justify-center text-info">
                  <Lightbulb size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-base-content whitespace-nowrap">
                    Suggest an Integration
                  </h3>
                  <p className="text-[10px] text-info/50">
                    For everyone
                  </p>
                </div>
              </div>

              {/* Body */}
              <p className="text-sm text-base-content/40 leading-relaxed mb-6">
                Don't code? No problem. The best integrations start as community
                ideas. Tell us what platforms and data you want in your feed —
                we'll make it happen.
              </p>

              {/* Coming soon constellation */}
              <div className="rounded-xl border border-base-300/40 bg-base-100/50 p-5 mb-6">
                <p className="text-[9px] text-base-content/20 mb-4">
                  Community requested · On the roadmap
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {COMING_SOON_ICONS.map((item, i) => (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.35 + i * 0.05 }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-200/60 border border-base-300/30"
                    >
                      <span className="text-sm leading-none">{item.emoji}</span>
                      <span className="text-[10px] text-base-content/30 truncate">
                        {item.name}
                      </span>
                    </motion.div>
                  ))}
                </div>
                {/* The "yours" slot */}
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.7 }}
                  className="mt-2.5 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-primary/20 bg-primary/[0.03] text-primary/40 hover:text-primary/60 hover:border-primary/30 transition-colors cursor-default"
                >
                  <span className="text-lg leading-none">+</span>
                  <span className="text-[10px]">
                    Yours could be next
                  </span>
                </motion.div>
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="https://discord.gg/85b49TcGJa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link inline-flex items-center gap-2.5 px-5 py-2.5 text-[11px] font-semibold border border-base-300/50 text-base-content/60 rounded-lg hover:border-info/30 hover:text-info transition-colors"
                >
                  <MessageSquare size={14} />
                  Join Discord
                  <ArrowUpRight
                    size={12}
                    className="opacity-0 group-hover/link:opacity-100 transition-opacity"
                  />
                </a>
                <a
                  href="https://github.com/brandon-relentnet/myscrollr/discussions/categories/integration-requests"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link inline-flex items-center gap-2 text-[11px] font-semibold text-base-content/30 hover:text-info transition-colors"
                >
                  Propose an Idea
                  <ArrowUpRight
                    size={12}
                    className="opacity-0 group-hover/link:opacity-100 transition-opacity"
                  />
                </a>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Trust Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 px-8 py-5 rounded-xl bg-base-200/30 border border-base-300/30">
            {/* Trust signals */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] text-base-content/25">
              <span className="flex items-center gap-1.5">
                <Shield size={10} className="text-primary/40" />
                No tracking
              </span>
              <span className="text-base-content/10">&middot;</span>
              <span>No ads</span>
              <span className="text-base-content/10">&middot;</span>
              <span>AGPL-3.0</span>
              <span className="text-base-content/10">&middot;</span>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                </span>
                Open Source
              </span>
            </div>

            {/* Secondary links */}
            <div className="flex items-center gap-4">
                <a
                  href="https://github.com/brandon-relentnet/myscrollr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-base-content/20 hover:text-primary transition-colors"
                >
                  GitHub
                </a>
                <span className="h-3 w-px bg-base-300/20" />
                <a
                  href="https://chromewebstore.google.com/detail/scrollr/pjeafpgbpfbcaddipkcbacohhbfakclb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-base-content/20 hover:text-primary transition-colors"
                >
                  Chrome Web Store
                </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
