import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Apple,
  Check,
  Download,
  ExternalLink,
  Monitor,
} from 'lucide-react'
import { motion } from 'motion/react'
import { usePageMeta } from '@/lib/usePageMeta'

export const Route = createFileRoute('/download')({
  component: DownloadPage,
})

// ── Constants ──────────────────────────────────────────────────

const REPO = 'https://github.com/brandon-relentnet/myscrollr'
const RELEASES_URL = `${REPO}/releases/latest`

const EASE = [0.22, 1, 0.36, 1] as const

type Platform = {
  id: 'macos' | 'windows' | 'linux'
  name: string
  arch: string
  icon: React.ReactNode
  requirements: string[]
  note?: string
}

const PLATFORMS: Platform[] = [
  {
    id: 'macos',
    name: 'macOS',
    arch: 'Apple Silicon (arm64)',
    icon: <Apple className="h-6 w-6" />,
    requirements: ['macOS 11 Big Sur or later', 'Apple Silicon (M1/M2/M3/M4)'],
    note: 'Intel Macs are not currently supported.',
  },
  {
    id: 'windows',
    name: 'Windows',
    arch: 'x64',
    icon: <Monitor className="h-6 w-6" />,
    requirements: ['Windows 10 (1803) or later', '64-bit processor'],
  },
  {
    id: 'linux',
    name: 'Linux',
    arch: 'x64',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.5 2c-1.7 0-3 2.3-3 5.2 0 1.5.3 2.8.8 3.9-.8.4-1.5.9-2 1.5C7 14 6.3 16.2 6.3 18.5c0 .3 0 .6.1.9-1 .4-1.7 1-1.7 1.7 0 .5.4.9 1 1.2.7.3 1.6.5 2.6.5 1.2 0 2.3-.3 3-.7.4.1.8.2 1.2.2s.8-.1 1.2-.2c.7.4 1.8.7 3 .7 1 0 1.9-.2 2.6-.5.6-.3 1-.7 1-1.2 0-.7-.7-1.3-1.7-1.7 0-.3.1-.6.1-.9 0-2.3-.7-4.5-2-5.9-.5-.6-1.2-1.1-2-1.5.5-1.1.8-2.4.8-3.9C15.5 4.3 14.2 2 12.5 2z" />
      </svg>
    ),
    requirements: ['Ubuntu 22.04+ or equivalent', '64-bit processor'],
    note: 'AppImage format — works on most distributions.',
  },
]

// ── OS detection ───────────────────────────────────────────────

function detectPlatform(): Platform['id'] {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  return 'linux'
}

// ── Component ──────────────────────────────────────────────────

function DownloadPage() {
  usePageMeta({
    title: 'Download Scrollr — Free Desktop App',
    description:
      'Download Scrollr for macOS, Windows, or Linux. A quiet ticker at the edge of your screen with live sports, markets, news, and fantasy data.',
    canonicalUrl: 'https://myscrollr.com/download',
  })

  const detected = detectPlatform()
  const recommended = PLATFORMS.find((p) => p.id === detected) ?? PLATFORMS[0]

  return (
    <div className="min-h-screen bg-base-100">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="text-4xl font-bold tracking-tight text-base-content sm:text-5xl"
          >
            Download Scrollr
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-base-content/60"
          >
            A quiet ticker at the edge of your screen. Live scores, prices,
            headlines, and fantasy data &mdash; always visible, never in the
            way.
          </motion.p>

          {/* ── Recommended download ───────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
            className="mt-10"
          >
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 rounded-2xl bg-primary px-8 py-4 text-lg font-semibold text-primary-content! shadow-lg transition-all duration-200 hover:brightness-110 hover:shadow-xl active:scale-[0.98]"
            >
              <Download className="h-5 w-5 transition-transform duration-200 group-hover:-translate-y-0.5" />
              Download for {recommended.name}
            </a>
            <p className="mt-3 text-sm text-base-content/40">
              {recommended.arch} &middot; Free &middot; Open source
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── All platforms ────────────────────────────────────── */}
      <section className="border-t border-base-content/5 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-2xl font-bold text-base-content sm:text-3xl">
            All Platforms
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-base-content/50">
            Scrollr runs natively on macOS, Windows, and Linux. Pick your
            platform below.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {PLATFORMS.map((platform, i) => (
              <motion.a
                key={platform.id}
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.4,
                  ease: EASE,
                  delay: i * 0.1,
                }}
                className={`group relative flex flex-col rounded-2xl border p-6 transition-all duration-200 hover:shadow-lg ${
                  platform.id === detected
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-base-content/10 bg-base-200/30 hover:border-base-content/20'
                }`}
              >
                {platform.id === detected && (
                  <span className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-content!">
                    Recommended
                  </span>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-base-content/5 text-base-content/60">
                    {platform.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-base-content">
                      {platform.name}
                    </h3>
                    <p className="text-sm text-base-content/40">
                      {platform.arch}
                    </p>
                  </div>
                </div>

                <ul className="mt-4 flex-1 space-y-1.5">
                  {platform.requirements.map((req) => (
                    <li
                      key={req}
                      className="flex items-start gap-2 text-sm text-base-content/50"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                      {req}
                    </li>
                  ))}
                </ul>

                {platform.note && (
                  <p className="mt-3 text-xs text-base-content/35 italic">
                    {platform.note}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary transition-colors group-hover:text-primary/80">
                  <Download className="h-4 w-4" />
                  Download
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </div>
              </motion.a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Details ──────────────────────────────────────────── */}
      <section className="border-t border-base-content/5 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid gap-12 sm:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold text-base-content">
                What you get
              </h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  'Real-time stock prices and crypto markets',
                  'Live sports scores across major leagues',
                  'RSS news feeds from your favorite sources',
                  'Yahoo Fantasy Sports league tracking',
                  'Automatic updates — always the latest version',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-sm text-base-content/60"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary/50" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-base-content">
                Privacy first
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-base-content/60">
                Scrollr stores your preferences locally on your device.
                No browsing data, no analytics, no tracking. The app
                communicates only with Scrollr&rsquo;s API servers to deliver
                live data via Server-Sent Events.
              </p>
              <Link
                to="/legal"
                search={{ doc: 'privacy' }}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
              >
                Read our privacy policy
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── GitHub CTA ───────────────────────────────────────── */}
      <section className="border-t border-base-content/5 py-16">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="text-sm text-base-content/40">
            Scrollr is open source under the AGPL-3.0 license.
          </p>
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-base-content/50 transition-colors hover:text-base-content/70"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            View on GitHub
          </a>
        </div>
      </section>
    </div>
  )
}
