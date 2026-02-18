import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  Activity,
  ArrowDown,
  ArrowRight,
  Box,
  Cable,
  CircuitBoard,
  Cloud,
  Code2,
  Cpu,
  Database,
  Globe,
  Layers,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Workflow,
  Zap,
} from 'lucide-react'

import { usePageMeta } from '@/lib/usePageMeta'

export const Route = createFileRoute('/architecture')({
  component: ArchitecturePage,
})

// ── Pipeline Steps (public-facing) ──────────────────────────────

const PIPELINE_STEPS = [
  {
    icon: <Globe size={20} />,
    title: 'Data Sources',
    description:
      'Finnhub WebSocket for market data, ESPN API for scores, RSS/Atom feeds for news, Yahoo Fantasy API for leagues.',
    accent: 'primary' as const,
    label: 'INGEST',
    items: ['Finnhub WS', 'ESPN HTTP', 'Yahoo API', 'RSS Feeds'],
  },
  {
    icon: <Cpu size={20} />,
    title: 'Ingestion Services',
    description:
      'Four independent Rust services collect, normalize, and write data to PostgreSQL. Each runs its own schedule and connection strategy.',
    accent: 'info' as const,
    label: 'PROCESS',
    items: ['Finance :3001', 'Sports :3002', 'Fantasy :3003', 'RSS :3004'],
  },
  {
    icon: <Database size={20} />,
    title: 'PostgreSQL + CDC',
    description:
      'All data lands in PostgreSQL. Sequin monitors table changes via CDC (Change Data Capture) and fires webhooks to the core API.',
    accent: 'secondary' as const,
    label: 'DETECT',
    items: ['trades', 'games', 'rss_items', 'yahoo_*'],
  },
  {
    icon: <Radio size={20} />,
    title: 'Real-time Delivery',
    description:
      'Core API routes CDC records to integration APIs, which return affected user lists. Core publishes to per-user Redis channels via SSE.',
    accent: 'accent' as const,
    label: 'DELIVER',
    items: ['CDC Routing', 'Redis Pub/Sub', 'SSE Stream', 'Per-user'],
  },
]

const pipelineAccent = {
  primary: {
    icon: 'bg-primary/8 border-primary/15 text-primary',
    tag: 'bg-primary/10 text-primary border-primary/20',
    line: 'bg-primary/30',
  },
  info: {
    icon: 'bg-info/8 border-info/15 text-info',
    tag: 'bg-info/10 text-info border-info/20',
    line: 'bg-info/30',
  },
  secondary: {
    icon: 'bg-secondary/8 border-secondary/15 text-secondary',
    tag: 'bg-secondary/10 text-secondary border-secondary/20',
    line: 'bg-secondary/30',
  },
  accent: {
    icon: 'bg-accent/8 border-accent/15 text-accent',
    tag: 'bg-accent/10 text-accent border-accent/20',
    line: 'bg-accent/30',
  },
} as const

// ── Architecture Principles ─────────────────────────────────────

const PRINCIPLES = [
  {
    icon: <Box size={16} />,
    title: 'Decoupled Integrations',
    description:
      'Each integration is a fully self-contained unit with its own Go API, Rust service, frontend components, and config. No shared code between integrations.',
  },
  {
    icon: <Shield size={16} />,
    title: 'Zero-trust Proxying',
    description:
      'Core API validates JWTs and injects X-User-Sub headers. Integration APIs never see tokens — they trust the core gateway.',
  },
  {
    icon: <RefreshCw size={16} />,
    title: 'Self-registration',
    description:
      'Integration APIs register in Redis on startup with a 30s TTL heartbeat. Core discovers them dynamically — no hardcoded routes.',
  },
  {
    icon: <Workflow size={16} />,
    title: 'Convention-based UI',
    description:
      'Frontend and extension discover integration components at build time via import.meta.glob. Drop a file in the right folder and it appears.',
  },
]

// ── Tech Stack ──────────────────────────────────────────────────

const TECH_STACK = [
  {
    category: 'Core API',
    items: [
      { name: 'Go 1.21', detail: 'Fiber v2, pgx, Redis' },
      { name: 'SSE Hub', detail: 'Per-user Redis Pub/Sub channels' },
      { name: 'Logto', detail: 'Self-hosted OIDC, JWT validation' },
    ],
  },
  {
    category: 'Ingestion',
    items: [
      { name: 'Rust', detail: 'tokio async runtime' },
      { name: 'WebSocket', detail: 'Finnhub persistent connection' },
      { name: 'HTTP Polling', detail: 'ESPN 60s, RSS 5min, Yahoo 120s' },
    ],
  },
  {
    category: 'Frontend',
    items: [
      { name: 'React 19', detail: 'Vite 7, TanStack Router' },
      { name: 'Tailwind v4', detail: 'daisyUI theme system' },
      { name: 'Motion', detail: 'Framer Motion animations' },
    ],
  },
  {
    category: 'Extension',
    items: [
      { name: 'WXT v0.20', detail: 'Chrome MV3 / Firefox MV2' },
      { name: 'Shadow DOM', detail: 'Isolated feed bar UI' },
      { name: 'Background SSE', detail: 'CDC pass-through routing' },
    ],
  },
  {
    category: 'Infrastructure',
    items: [
      { name: 'PostgreSQL', detail: 'Shared DB, natural table isolation' },
      { name: 'Redis', detail: 'Cache, Pub/Sub, registration' },
      { name: 'Sequin', detail: 'CDC webhooks from PostgreSQL' },
    ],
  },
  {
    category: 'Deployment',
    items: [
      { name: 'Coolify', detail: 'Self-hosted PaaS' },
      { name: 'Docker Compose', detail: 'Per-integration bundles' },
      { name: 'Nixpacks', detail: 'Frontend builds' },
    ],
  },
]

// ── CDC Flow Diagram ────────────────────────────────────────────

const CDC_FLOW = [
  {
    label: 'Rust Service',
    detail: 'Writes to PostgreSQL',
    icon: <Cpu size={14} />,
    accent: 'text-info',
  },
  {
    label: 'Sequin CDC',
    detail: 'Detects row changes',
    icon: <Activity size={14} />,
    accent: 'text-secondary',
  },
  {
    label: 'Core API',
    detail: 'POST /webhooks/sequin',
    icon: <Server size={14} />,
    accent: 'text-primary',
  },
  {
    label: 'Integration API',
    detail: 'POST /internal/cdc → users[]',
    icon: <Cable size={14} />,
    accent: 'text-info',
  },
  {
    label: 'Redis Pub/Sub',
    detail: 'events:user:{sub}',
    icon: <Radio size={14} />,
    accent: 'text-accent',
  },
  {
    label: 'SSE → Client',
    detail: 'Frontend / Extension',
    icon: <MonitorSmartphone size={14} />,
    accent: 'text-primary',
  },
]

// ── Page Component ──────────────────────────────────────────────

function ArchitecturePage() {
  usePageMeta({
    title: 'Architecture — Scrollr',
    description:
      'How Scrollr works: real-time data pipeline from source APIs through CDC to your browser, powered by Go, Rust, React, and Redis.',
  })

  return (
    <div className="min-h-screen pt-20">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(52, 211, 153, 0.15) 1px, transparent 1px),
                linear-gradient(90deg, rgba(52, 211, 153, 0.15) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />
          <motion.div
            className="absolute top-[-10%] left-[40%] w-[600px] h-[600px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(52, 211, 153, 0.04) 0%, transparent 70%)',
            }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        <div className="container relative z-10 !py-0">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-4 mb-8"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/8 text-primary text-[10px] font-bold rounded-lg border border-primary/15 uppercase tracking-wide">
              <CircuitBoard size={12} />
              System Design
            </span>
            <span className="h-px w-12 bg-gradient-to-r from-base-300 to-transparent" />
            <span className="text-[10px] text-base-content/25">
              open architecture
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.7,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.85] mb-8 max-w-5xl"
          >
            How Scrollr{' '}
            <span className="text-primary">Works</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.3,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="text-base text-base-content/40 max-w-xl leading-relaxed"
          >
            From source API to your browser in milliseconds. A decoupled,
            CDC-driven pipeline built on Go, Rust, React, and Redis.
          </motion.p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />
      </section>

      {/* ── DATA PIPELINE (Public-facing) ────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-12"
          >
            <h2 className="text-sm font-bold uppercase tracking-wide text-primary mb-2 flex items-center gap-2">
              <Zap size={16} /> The Pipeline
            </h2>
            <p className="text-[10px] text-base-content/30">
              Four stages from data source to your screen
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PIPELINE_STEPS.map((step, i) => {
              const colors = pipelineAccent[step.accent]
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: i * 0.1,
                    duration: 0.5,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="group relative bg-base-200/50 border border-base-300/50 rounded-xl p-6 hover:border-base-300 transition-colors overflow-hidden"
                >
                  <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-transparent group-hover:via-primary/20 to-transparent transition-all duration-500" />

                  <div className="relative z-10">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                      <div
                        className={`h-10 w-10 rounded-lg border flex items-center justify-center ${colors.icon}`}
                      >
                        {step.icon}
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg border ${colors.tag}`}
                      >
                        {step.label}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-base-content mb-2">
                      {step.title}
                    </h3>
                    <p className="text-xs text-base-content/30 leading-relaxed mb-4">
                      {step.description}
                    </p>

                    {/* Items */}
                    <div className="space-y-1.5 pt-4 border-t border-base-300/30">
                      {step.items.map((item) => (
                        <div
                          key={item}
                          className="flex items-center gap-2"
                        >
                          <span
                            className={`w-1 h-1 rounded-full ${colors.line}`}
                          />
                          <span className="text-[10px] font-mono text-base-content/25">
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Flow arrows between cards (desktop) */}
          <div className="hidden lg:flex items-center justify-center gap-2 mt-6">
            {['INGEST', 'PROCESS', 'DETECT', 'DELIVER'].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-base-content/15">
                  {label}
                </span>
                {i < 3 && (
                  <ArrowRight size={12} className="text-primary/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CDC FLOW (Technical) ─────────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-bold uppercase tracking-wide text-primary mb-2 flex items-center gap-2">
              <Activity size={16} /> CDC Record Flow
            </h2>
            <p className="text-[10px] text-base-content/30">
              How a single data change reaches the right user
            </p>
          </motion.div>

          {/* Two-column: flow diagram left, decorative SVG right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Flow diagram — left-aligned */}
            <div className="space-y-0">
              {CDC_FLOW.map((step, i) => (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: i * 0.08,
                    duration: 0.4,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <div className="flex items-center gap-4 p-4 bg-base-200/40 border border-base-300/40 rounded-xl">
                    <div
                      className={`h-8 w-8 rounded-lg bg-base-300/20 border border-base-300/30 flex items-center justify-center ${step.accent} shrink-0`}
                    >
                      {step.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-base-content">
                        {step.label}
                      </p>
                      <p className="text-[10px] font-mono text-base-content/25 truncate">
                        {step.detail}
                      </p>
                    </div>
                    <span className="text-[9px] font-mono text-base-content/15 font-black shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  {i < CDC_FLOW.length - 1 && (
                    <div className="flex justify-start pl-7 py-1.5">
                      <ArrowDown size={14} className="text-primary/25" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Decorative node graph — right side (desktop only) */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.3 }}
              className="hidden lg:flex items-center justify-center"
            >
              <svg
                viewBox="0 0 320 400"
                fill="none"
                className="w-full max-w-xs text-primary"
                aria-hidden
              >
                {/* Grid dots */}
                {Array.from({ length: 8 }).map((_, row) =>
                  Array.from({ length: 6 }).map((_, col) => (
                    <circle
                      key={`dot-${row}-${col}`}
                      cx={30 + col * 52}
                      cy={25 + row * 50}
                      r={1}
                      fill="currentColor"
                      opacity={0.08}
                    />
                  )),
                )}

                {/* Connection lines */}
                <line x1="82" y1="75" x2="238" y2="75" stroke="currentColor" strokeWidth="1" opacity="0.08" />
                <line x1="160" y1="75" x2="160" y2="175" stroke="currentColor" strokeWidth="1" opacity="0.1" />
                <line x1="82" y1="175" x2="238" y2="175" stroke="currentColor" strokeWidth="1" opacity="0.08" />
                <line x1="82" y1="175" x2="82" y2="275" stroke="currentColor" strokeWidth="1" opacity="0.1" />
                <line x1="238" y1="175" x2="238" y2="275" stroke="currentColor" strokeWidth="1" opacity="0.1" />
                <line x1="82" y1="275" x2="238" y2="275" stroke="currentColor" strokeWidth="1" opacity="0.08" />
                <line x1="160" y1="275" x2="160" y2="350" stroke="currentColor" strokeWidth="1" opacity="0.1" />

                {/* Animated pulse lines */}
                <motion.line
                  x1="160" y1="75" x2="160" y2="175"
                  stroke="currentColor" strokeWidth="1.5" opacity="0.25"
                  strokeDasharray="6 6"
                  animate={{ strokeDashoffset: [0, -24] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
                <motion.line
                  x1="160" y1="275" x2="160" y2="350"
                  stroke="currentColor" strokeWidth="1.5" opacity="0.25"
                  strokeDasharray="6 6"
                  animate={{ strokeDashoffset: [0, -24] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear', delay: 0.5 }}
                />

                {/* Nodes */}
                {/* Source node */}
                <rect x="134" y="50" width="52" height="52" rx="4" fill="currentColor" opacity="0.05" stroke="currentColor" strokeWidth="1" strokeOpacity="0.15" />
                <text x="160" y="80" textAnchor="middle" fill="currentColor" opacity="0.3" fontSize="9" fontFamily="monospace" fontWeight="bold">SRC</text>

                {/* CDC node */}
                <rect x="134" y="150" width="52" height="52" rx="4" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                <text x="160" y="180" textAnchor="middle" fill="currentColor" opacity="0.4" fontSize="9" fontFamily="monospace" fontWeight="bold">CDC</text>

                {/* Left route node */}
                <rect x="56" y="250" width="52" height="52" rx="4" fill="currentColor" opacity="0.05" stroke="currentColor" strokeWidth="1" strokeOpacity="0.15" />
                <text x="82" y="280" textAnchor="middle" fill="currentColor" opacity="0.3" fontSize="8" fontFamily="monospace" fontWeight="bold">USR:A</text>

                {/* Right route node */}
                <rect x="212" y="250" width="52" height="52" rx="4" fill="currentColor" opacity="0.05" stroke="currentColor" strokeWidth="1" strokeOpacity="0.15" />
                <text x="238" y="280" textAnchor="middle" fill="currentColor" opacity="0.3" fontSize="8" fontFamily="monospace" fontWeight="bold">USR:B</text>

                {/* Delivery node */}
                <rect x="134" y="330" width="52" height="52" rx="4" fill="currentColor" opacity="0.06" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                <text x="160" y="360" textAnchor="middle" fill="currentColor" opacity="0.35" fontSize="9" fontFamily="monospace" fontWeight="bold">SSE</text>

                {/* Pulsing center dot */}
                <motion.circle
                  cx="160" cy="176"
                  r="3"
                  fill="currentColor"
                  animate={{ opacity: [0.2, 0.6, 0.2], r: [3, 5, 3] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </svg>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── ARCHITECTURE PRINCIPLES ──────────────────────────── */}
      <section className="relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-bold uppercase tracking-wide text-primary mb-2 flex items-center gap-2">
              <Layers size={16} /> Design Principles
            </h2>
            <p className="text-[10px] text-base-content/30">
              The rules that shape every architectural decision
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRINCIPLES.map((principle, i) => (
              <motion.div
                key={principle.title}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.06,
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="group flex items-start gap-4 p-5 bg-base-200/40 border border-base-300/40 rounded-xl hover:border-primary/15 transition-colors"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5 group-hover:border-primary/30 transition-colors">
                  {principle.icon}
                </div>
                <div>
                  <p className="text-xs font-semibold text-base-content mb-1">
                    {principle.title}
                  </p>
                  <p className="text-xs text-base-content/30 leading-relaxed">
                    {principle.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ───────────────────────────────────────── */}
      <section className="relative">
        <div className="container pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <h2 className="text-sm font-bold uppercase tracking-wide text-primary mb-2 flex items-center gap-2">
              <Code2 size={16} /> Tech Stack
            </h2>
            <p className="text-[10px] text-base-content/30">
              What powers each layer
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TECH_STACK.map((group, i) => (
              <motion.div
                key={group.category}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.06,
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="bg-base-200/40 border border-base-300/40 rounded-xl p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Cloud size={14} className="text-primary" />
                  <h3 className="text-[10px] font-bold uppercase tracking-wide text-primary">
                    {group.category}
                  </h3>
                </div>
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <div key={item.name}>
                      <p className="text-xs font-bold text-base-content mb-0.5">
                        {item.name}
                      </p>
                      <p className="text-[10px] font-mono text-base-content/25">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Source link */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-4 mt-10"
          >
            <span className="h-px w-8 bg-base-300/30" />
            <span className="text-[10px] text-base-content/20">
              Built and deployed on self-hosted infrastructure
            </span>
            <span className="h-px w-8 bg-base-300/30" />
          </motion.div>
        </div>
      </section>
    </div>
  )
}
