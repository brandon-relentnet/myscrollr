import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Code,
  Eye,
  GitFork,
  Github,
  Heart,
  MessageSquare,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const
const REPO = 'brandon-relentnet/myscrollr'

// ── "What we refuse" badges ─────────────────────────────────────

const REFUSALS = [
  'Track your browsing',
  'Collect personal data',
  'Show you ads',
  'Sell to data brokers',
] as const

// ── Principle cards ─────────────────────────────────────────────

interface Principle {
  icon: typeof Eye
  title: string
  highlight: string
  body: string
  accent: {
    text: string
    ring: string
    glow: string
    gradient: string
  }
}

const PRINCIPLES: Array<Principle> = [
  {
    icon: Eye,
    title: 'Fully Auditable',
    highlight: 'Every line is public',
    body: 'No secret tracking, no hidden code, no fine print. The entire codebase is publicly available for anyone to inspect.',
    accent: {
      text: 'text-primary',
      ring: 'rgba(52,211,153,0.25)',
      glow: 'rgba(52,211,153,0.12)',
      gradient: 'rgba(52,211,153,0.06)',
    },
  },
  {
    icon: Users,
    title: 'Community Driven',
    highlight: 'Made by the people who use it',
    body: 'Built and maintained by developers who rely on Scrollr every day. No investors, no monetization playbook — just useful software.',
    accent: {
      text: 'text-info',
      ring: 'rgba(0,212,255,0.25)',
      glow: 'rgba(0,212,255,0.12)',
      gradient: 'rgba(0,212,255,0.06)',
    },
  },
  {
    icon: Heart,
    title: 'Getting Better Every Week',
    highlight: 'Actively maintained',
    body: "New features, fixes, and improvements ship constantly. If something bugs you, it probably won't for long.",
    accent: {
      text: 'text-secondary',
      ring: 'rgba(255,71,87,0.25)',
      glow: 'rgba(255,71,87,0.12)',
      gradient: 'rgba(255,71,87,0.06)',
    },
  },
]

// ── Privacy pledges ─────────────────────────────────────────────

interface Pledge {
  title: string
  body: string
}

const PLEDGES: Array<Pledge> = [
  {
    title: 'Local Only',
    body: 'Your data never leaves your browser. Period.',
  },
  {
    title: 'No Account Required',
    body: 'Install the extension and go. No email, no password.',
  },
  {
    title: 'Featherweight',
    body: 'Under 500 KB total. Zero battery drain.',
  },
  {
    title: 'Open Source',
    body: 'Every line of code is public and auditable.',
  },
]

// ── GitHub repo stats hook ───────────────────────────────────────

interface GitHubStats {
  stars: number
  forks: number
  issues: number
}

function useGitHubStats(repo: string) {
  const [stats, setStats] = useState<GitHubStats | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`https://api.github.com/repos/${repo}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.stargazers_count != null) {
          setStats({
            stars: data.stargazers_count as number,
            forks: data.forks_count as number,
            issues: data.open_issues_count as number,
          })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [repo])

  return stats
}

// ── Animated SVG Checkmark ───────────────────────────────────────

function AnimatedCheck({ delay }: { delay: number }) {
  return (
    <motion.svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <motion.circle
        cx="18"
        cy="18"
        r="15.5"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 0.35 }}
        viewport={{ once: true }}
        transition={{ delay, duration: 0.6, ease: 'easeOut' }}
      />
      <motion.path
        d="M12 18.5l4.5 4.5 7.5-8"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: delay + 0.45, duration: 0.35, ease: 'easeOut' }}
      />
    </motion.svg>
  )
}

// ── Principle Card ───────────────────────────────────────────────

function PrincipleCard({
  principle,
  index,
}: {
  principle: Principle
  index: number
}) {
  const Icon = principle.icon
  const { accent } = principle

  return (
    <motion.div
      style={{ opacity: 0 }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{
        delay: 0.08 + index * 0.1,
        duration: 0.5,
        ease: EASE,
      }}
      className="relative rounded-2xl bg-base-200/40 border border-base-300/25 p-6 sm:p-7 overflow-hidden h-full"
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-6 right-6 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent.ring} 50%, transparent)`,
        }}
      />

      {/* Ambient gradient orb */}
      <div
        className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none blur-3xl"
        style={{ background: accent.gradient }}
      />

      {/* Watermark icon */}
      <Icon
        size={130}
        strokeWidth={0.4}
        className="absolute -bottom-5 -right-5 text-base-content/[0.025] pointer-events-none select-none"
      />

      {/* Corner dot grid */}
      <div
        className="absolute bottom-4 right-4 w-14 h-14 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
      />

      {/* Icon badge with glow */}
      <div className="relative mb-5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{
            background: accent.glow,
            boxShadow: `0 0 20px ${accent.glow}, 0 0 0 1px ${accent.ring}`,
          }}
        >
          <Icon size={20} className="text-base-content/80" />
        </div>
      </div>

      {/* Text content */}
      <div className="relative">
        <h3 className="text-[15px] font-bold text-base-content mb-1">
          {principle.title}
        </h3>
        <p
          className={`text-sm font-semibold ${accent.text} mb-2.5 leading-snug`}
        >
          {principle.highlight}
        </p>
        <p className="text-sm text-base-content/45 leading-relaxed">
          {principle.body}
        </p>
      </div>
    </motion.div>
  )
}

// ── GitHub Stats Row ─────────────────────────────────────────────

function GitHubFooter({ stats }: { stats: GitHubStats | null }) {
  return (
    <motion.div
      style={{ opacity: 0 }}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.35, duration: 0.5, ease: EASE }}
      className="relative max-w-4xl mx-auto"
    >
      {/* Outer glow */}
      <div
        className="absolute -inset-3 rounded-2xl pointer-events-none blur-2xl"
        style={{
          background:
            'radial-gradient(ellipse at center, var(--color-primary) 0%, transparent 70%)',
          opacity: 0.04,
        }}
      />

      {/* Card */}
      <div className="relative rounded-xl border border-base-300/20 bg-base-200/30 overflow-hidden">
        {/* Top accent */}
        <div
          className="absolute top-0 left-10 right-10 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(52,211,153,0.15) 50%, transparent)',
          }}
        />

        <div className="px-6 py-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left: message */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center">
              <Code size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-base-content/70">
                Fully open source
              </p>
              <p className="text-xs text-base-content/30">
                Inspect, fork, or contribute on GitHub
              </p>
            </div>
          </div>

          {/* Right: stats + links */}
          <div className="flex items-center gap-3">
            {/* Live stats */}
            {stats != null && (
              <div className="hidden sm:flex items-center gap-1">
                <a
                  href={`https://github.com/${REPO}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Star on GitHub"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-warning/50 hover:text-warning hover:bg-warning/[0.06] transition-[color,background-color] duration-200"
                >
                  <Star className="size-3.5" />
                  <span className="font-semibold tabular-nums">
                    {stats.stars.toLocaleString()}
                  </span>
                </a>
                <a
                  href={`https://github.com/${REPO}/forks`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-info/50 hover:text-info hover:bg-info/[0.06] transition-[color,background-color] duration-200"
                >
                  <GitFork className="size-3.5" />
                  <span className="font-semibold tabular-nums">
                    {stats.forks.toLocaleString()}
                  </span>
                </a>
                <a
                  href={`https://github.com/${REPO}/discussions`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-accent/50 hover:text-accent hover:bg-accent/[0.06] transition-[color,background-color] duration-200"
                >
                  <MessageSquare className="size-3.5" />
                  <span className="font-semibold">Discuss</span>
                </a>
              </div>
            )}

            {/* Divider */}
            <span className="hidden sm:block w-px h-6 bg-base-300/20" />

            {/* Architecture link */}
            <Link
              to="/architecture"
              className="group inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-base-300/25 bg-base-200/40 text-sm font-semibold text-base-content/50 hover:text-primary hover:border-primary/25 transition-[color,border-color] duration-200"
            >
              <span>How It Works</span>
              <ArrowRight
                size={14}
                className="group-hover:translate-x-0.5 transition-transform duration-200"
              />
            </Link>

            {/* GitHub link */}
            <a
              href={`https://github.com/${REPO}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-base-300/25 bg-base-200/40 text-sm font-semibold text-base-content/50 hover:text-primary hover:border-primary/25 transition-[color,border-color] duration-200"
            >
              <Github className="size-4" />
              <span>View on GitHub</span>
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export function TrustSection() {
  const stats = useGitHubStats(REPO)

  return (
    <section className="relative py-24 lg:py-32">
      {/* Background band */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

      <div className="container relative">
        {/* ── Header ── */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col items-center text-center mb-10 lg:mb-14"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
            Transparent by <span className="text-gradient-primary">Design</span>
          </h2>
          <p className="text-base text-base-content/45 leading-relaxed max-w-lg">
            Open source, zero analytics, no accounts. Your browser, your data —
            we never see it.
          </p>
        </motion.div>

        {/* ── "What we refuse" badges ── */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex flex-wrap justify-center gap-2.5 sm:gap-3 mb-14 lg:mb-18"
        >
          {REFUSALS.map((item, i) => (
            <motion.span
              key={item}
              style={{ opacity: 0 }}
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.06 + i * 0.08,
                duration: 0.4,
                ease: EASE,
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] bg-error/[0.06] border border-error/[0.1] text-base-content/35 line-through decoration-error/25"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="shrink-0 text-error/40"
                aria-hidden="true"
              >
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {item}
            </motion.span>
          ))}
        </motion.div>

        {/* ── Principle cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6 max-w-4xl mx-auto mb-14 lg:mb-18">
          {PRINCIPLES.map((principle, i) => (
            <PrincipleCard
              key={principle.title}
              principle={principle}
              index={i}
            />
          ))}
        </div>

        {/* ── Promise card ── */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="max-w-3xl mx-auto relative mb-14 lg:mb-18"
        >
          {/* Outer glow behind card */}
          <div
            className="absolute -inset-3 rounded-3xl pointer-events-none blur-2xl"
            style={{
              background:
                'radial-gradient(ellipse at center, var(--color-primary) 0%, transparent 70%)',
              opacity: 0.06,
            }}
          />

          {/* Card body */}
          <div className="relative rounded-2xl border border-primary/[0.08] bg-base-200/40 p-7 sm:p-10 overflow-hidden">
            {/* Shield watermark */}
            <ShieldCheck
              size={220}
              strokeWidth={0.4}
              className="absolute -bottom-12 -right-12 text-primary/[0.03] pointer-events-none select-none"
            />

            {/* 2x2 pledge grid */}
            <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-x-10 sm:gap-y-10">
              {PLEDGES.map((pledge, i) => (
                <motion.div
                  key={pledge.title}
                  style={{ opacity: 0 }}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{
                    delay: 0.08 + i * 0.08,
                    duration: 0.5,
                    ease: EASE,
                  }}
                  className="flex items-start gap-4"
                >
                  <AnimatedCheck delay={0.15 + i * 0.18} />
                  <div className="pt-0.5">
                    <h3 className="text-[15px] font-bold text-base-content mb-1">
                      {pledge.title}
                    </h3>
                    <p className="text-sm text-base-content/45 leading-relaxed">
                      {pledge.body}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── GitHub footer ── */}
        <GitHubFooter stats={stats} />
      </div>
    </section>
  )
}
