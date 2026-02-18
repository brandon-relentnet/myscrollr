import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  Code,
  Eye,
  GitPullRequest,
  Github,
  Heart,
  Star,
  Users,
} from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const
const REPO = 'brandon-relentnet/myscrollr'

// ── Data ─────────────────────────────────────────────────────────

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
    title: 'Nothing to Hide',
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
    title: 'Built by Real People',
    highlight: 'Not a corporate side project',
    body: 'Made by people who actually use it, for people who actually need it. No investors, no monetization playbook.',
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

// ── GitHub stars hook (lightweight) ──────────────────────────────

function useGitHubStars(repo: string) {
  const [stars, setStars] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`https://api.github.com/repos/${repo}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.stargazers_count != null) {
          setStars(data.stargazers_count as number)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [repo])

  return stars
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

      {/* Ambient gradient orb — top-right */}
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

function GitHubFooter({ stars }: { stars: number | null }) {
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

          {/* Right: link + stats */}
          <div className="flex items-center gap-4">
            {/* Stats chips */}
            <div className="hidden sm:flex items-center gap-3">
              {stars != null && (
                <span className="inline-flex items-center gap-1.5 text-xs text-warning/50">
                  <Star className="size-3.5" />
                  <span className="font-semibold tabular-nums">
                    {stars.toLocaleString()}
                  </span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs text-accent/50">
                <GitPullRequest className="size-3.5" />
                <span className="font-semibold">Open</span>
              </span>
            </div>

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

export function BuiltInTheOpen() {
  const stars = useGitHubStars(REPO)

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
          className="flex flex-col items-center text-center mb-14 lg:mb-18"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
            Nothing to <span className="text-gradient-primary">Hide</span>
          </h2>
          <p className="text-base text-base-content/45 leading-relaxed max-w-lg">
            Scrollr is completely open source. Anyone can see exactly how it
            works — because we think that's how software should be.
          </p>
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

        {/* ── GitHub footer ── */}
        <GitHubFooter stars={stars} />
      </div>
    </section>
  )
}
