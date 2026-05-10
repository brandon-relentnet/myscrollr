import { motion } from 'motion/react'
import { Activity, GitPullRequest, HeartPulse } from 'lucide-react'
import type { Sliders } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

// ── Constants ────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

// ── Types & Data ─────────────────────────────────────────────────

interface CustomizationCard {
  /** Stable id for keying. */
  id: 'style' | 'catalog'
  /** Eyebrow above the headline (e.g. "Density · Speed · Color"). */
  eyebrow: string
  /** Headline shown on the card. */
  title: string
  /** Body copy under the headline. */
  body: string
  /**
   * Public file basename for the screenshot. The component appends
   * `-{theme}@1x.webp` and `-{theme}@2x.webp` per device pixel ratio.
   */
  imageBasename: string
  /** Alt text for the screenshot. */
  alt: string
  /** Aspect ratio fed into the wrapper as `aspect-[w/h]`. */
  aspect: string
  /** Optional badge chips rendered under the body copy. */
  chips?: Array<{
    icon: typeof Sliders
    label: string
  }>
}

const CARDS: Array<CustomizationCard> = [
  {
    id: 'style',
    eyebrow: 'Density · Speed · Color',
    title: 'Tune it to your day',
    body: 'Compact when you want a glance, detailed when you want context. Crank the speed up for a busy market, slow it down for a quiet afternoon. Pick a color treatment that matches the rest of your desktop.',
    imageBasename: 'style',
    alt: 'Scrollr settings panel with side-by-side compact and detailed previews, a slow-to-fast speed slider, and tight, normal, wide, colorful, theme, subtle style presets.',
    aspect: '1600/1134',
  },
  {
    id: 'catalog',
    eyebrow: 'Channels · Widgets · Extensions',
    title: 'Add what you actually need',
    body: 'Markets, scores, headlines, and fantasy are just the start. Pin live system stats, your Uptime Kuma board, or GitHub Actions status right next to last quarter\u2019s earnings &mdash; the ticker becomes whatever your day looks like.',
    imageBasename: 'catalog',
    alt: 'Scrollr source catalog showing Finance, Sports, Fantasy, News, Clock, and Weather as added, alongside available widgets for System Monitor, Uptime, and GitHub.',
    aspect: '1600/1134',
    chips: [
      { icon: Activity, label: 'System Monitor' },
      { icon: HeartPulse, label: 'Uptime Kuma' },
      { icon: GitPullRequest, label: 'GitHub Actions' },
    ],
  },
]

// ── Showcase Card ────────────────────────────────────────────────

function ShowcaseCard({
  card,
  delay,
}: {
  card: CustomizationCard
  delay: number
}) {
  const { theme } = useTheme()
  const base = `/screenshots/customization/${card.imageBasename}-${theme}`

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay, duration: 0.6, ease: EASE }}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-base-300/40 bg-base-200/40 backdrop-blur-sm shadow-sm h-full"
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-12 right-12 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--color-primary) 50%, transparent)',
          opacity: 0.25,
        }}
        aria-hidden="true"
      />

      {/* Screenshot */}
      <div
        className="relative w-full overflow-hidden border-b border-base-300/40 bg-base-100/40"
        style={{ aspectRatio: card.aspect.replace('/', ' / ') }}
      >
        <picture className="absolute inset-0">
          <source
            srcSet={`${base}@1x.webp 1x, ${base}@2x.webp 2x`}
            type="image/webp"
          />
          <img
            src={`${base}@1x.webp`}
            alt={card.alt}
            width={1600}
            height={1134}
            loading="lazy"
            decoding="async"
            className="block h-full w-full object-cover object-top"
            draggable={false}
          />
        </picture>

        {/* Soft inner shadow for depth against light bg */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: 'inset 0 -40px 60px -40px rgba(0,0,0,0.08)',
          }}
          aria-hidden="true"
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-6 sm:p-7">
        <span className="text-[11px] font-mono uppercase tracking-wider text-base-content/35">
          {card.eyebrow}
        </span>
        <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-base-content">
          {card.title}
        </h3>
        <p
          className="text-sm leading-relaxed text-base-content/55"
          // Body intentionally renders an HTML entity (&mdash;) inline.
          dangerouslySetInnerHTML={{ __html: card.body }}
        />

        {card.chips ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {card.chips.map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1.5 rounded-lg border border-base-300/40 bg-base-100/40 px-2.5 py-1 text-[11px] font-semibold text-base-content/60"
              >
                <chip.icon size={12} className="text-base-content/45" />
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </motion.article>
  )
}

// ── Main Component ───────────────────────────────────────────────

export function CustomizationShowcase() {
  return (
    <section id="customize" className="relative scroll-m-20">
      <div
        className="mx-auto px-5 sm:px-6 lg:px-8 py-20 lg:py-28 relative"
        style={{ maxWidth: 1400 }}
      >
        {/* Section header */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col items-center text-center mb-12 lg:mb-16"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4 text-center">
            Bend it to{' '}
            <span className="text-gradient-primary">your workflow</span>
          </h2>
          <p className="text-base text-base-content/45 max-w-xl leading-relaxed text-center">
            Pick the density, the speed, the color. Drop in extra widgets when
            your day calls for it. Scrollr is opinionated where it matters and
            quiet everywhere else.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="grid gap-6 lg:gap-8 md:grid-cols-2">
          {CARDS.map((card, index) => (
            <ShowcaseCard
              key={card.id}
              card={card}
              delay={0.15 + index * 0.1}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
