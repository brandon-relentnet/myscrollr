import { Link, createFileRoute } from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock,
  Code2,
  Cpu,
  Ghost,
  Lightbulb,
  Lock,
  MessageSquare,
  Music,
  Play,
  Plus,
  Puzzle,
  Rss,
  TrendingUp,
  Tv,
} from 'lucide-react'

import { motion } from 'motion/react'
import type { Stream, StreamType } from '@/api/client'
import { usePageMeta } from '@/lib/usePageMeta'
import { useGetToken } from '@/hooks/useGetToken'
import { itemVariants, pageVariants } from '@/lib/animations'
import { streamsApi } from '@/api/client'

export const Route = createFileRoute('/integrations')({
  component: IntegrationsPage,
})

// ── Integration Definitions ──────────────────────────────────────

interface Integration {
  id: string
  streamType: StreamType
  name: string
  description: string
  detail: string
  icon: React.ReactNode
  recommended?: boolean
}

interface ComingSoonIntegration {
  id: string
  name: string
  description: string
  icon: React.ReactNode
}

const INTEGRATIONS: Array<Integration> = [
  {
    id: 'finance',
    streamType: 'finance',
    name: 'Finance',
    description: 'Real-time market data',
    detail:
      '50 tracked symbols across stocks and crypto via Finnhub WebSocket. Live price changes, percentage moves, and directional indicators.',
    icon: <TrendingUp size={20} />,
    recommended: true,
  },
  {
    id: 'sports',
    streamType: 'sports',
    name: 'Sports',
    description: 'Live scores & schedules',
    detail:
      'NFL, NBA, NHL, and MLB scores from ESPN. Game states, team matchups, and real-time score updates polling every minute.',
    icon: <Cpu size={20} />,
    recommended: true,
  },
  {
    id: 'rss',
    streamType: 'rss',
    name: 'RSS Feeds',
    description: 'Custom news streams',
    detail:
      '100+ curated feeds across 8 categories. Subscribe to the sources you care about and get articles delivered in real-time.',
    icon: <Rss size={20} />,
    recommended: true,
  },
  {
    id: 'fantasy',
    streamType: 'fantasy',
    name: 'Yahoo Fantasy',
    description: 'Fantasy sports leagues',
    detail:
      'Connect your Yahoo account to view league standings, team rosters, weekly matchups, and live scoring across all your fantasy leagues.',
    icon: <Ghost size={20} />,
  },
]

const COMING_SOON: Array<ComingSoonIntegration> = [
  {
    id: 'discord',
    name: 'Discord',
    description: 'Server activity & notifications',
    icon: <MessageSquare size={18} />,
  },
  {
    id: 'twitch',
    name: 'Twitch',
    description: 'Stream alerts & follows',
    icon: <Tv size={18} />,
  },
  {
    id: 'reddit',
    name: 'Reddit',
    description: 'Subreddit feeds & trending',
    icon: <BookOpen size={18} />,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Activity & notifications',
    icon: <Code2 size={18} />,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Subscription updates',
    icon: <Play size={18} />,
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Now playing & activity',
    icon: <Music size={18} />,
  },
]

// ── Page Component ───────────────────────────────────────────────

function IntegrationsPage() {
  usePageMeta({
    title: 'Integrations — Scrollr',
    description:
      'Browse and connect integrations to extend your Scrollr feed with real-time data from your favorite platforms.',
  })

  const { isAuthenticated, signIn } = useLogto()
  const [streams, setStreams] = useState<Array<Stream>>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const getToken = useGetToken()

  // Fetch user's streams when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setStreams([])
      return
    }
    setLoading(true)
    streamsApi
      .getAll(getToken)
      .then((res) => setStreams(res.streams || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated, getToken])

  const hasStream = (type: StreamType) =>
    streams.some((s) => s.stream_type === type)

  const handleAdd = async (integration: Integration) => {
    if (!isAuthenticated) {
      signIn(`${window.location.origin}/callback`)
      return
    }
    if (hasStream(integration.streamType)) return

    setAdding(integration.id)
    try {
      const created = await streamsApi.create(
        integration.streamType,
        {},
        getToken,
      )
      setStreams((prev) => [...prev, created])
    } catch {
      // Silently handle — likely 409 conflict (already exists)
    } finally {
      setAdding(null)
    }
  }

  return (
    <motion.div
      className="min-h-screen pt-20"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero */}
      <section className="relative pt-24 pb-16 overflow-hidden border-b border-base-300 bg-base-200/30">
        <div className="container relative z-10">
          <motion.div className="max-w-4xl" variants={itemVariants}>
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-sm border border-primary/20 uppercase tracking-[0.2em] flex items-center gap-2">
                <Puzzle size={14} /> integrations
              </span>
              <span className="h-px w-12 bg-base-300" />
              <span className="text-[10px] font-mono text-base-content/30 uppercase">
                {INTEGRATIONS.length} available &middot; {COMING_SOON.length}{' '}
                coming soon
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight uppercase mb-6 leading-none">
              Extend Your
              <br />
              <span className="text-primary">Feed</span>
            </h1>

            <p className="text-sm text-base-content/40 max-w-lg leading-relaxed font-mono">
              Browse official integrations or explore what the community is
              building. Can't find what you want? Build it or suggest it.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Integrations */}
      <section className="container py-16">
        <motion.div variants={itemVariants}>
          <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
            <Puzzle size={16} /> Integrations
          </h2>
          <p className="text-[10px] font-mono text-base-content/30 mb-8">
            Add data sources to your account to build your feed
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {INTEGRATIONS.map((integration) => (
            <motion.div key={integration.id} variants={itemVariants}>
              <IntegrationCard
                integration={integration}
                installed={hasStream(integration.streamType)}
                loading={loading}
                onAdd={handleAdd}
                adding={adding === integration.id}
                isAuthenticated={isAuthenticated}
                recommended={integration.recommended}
              />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Coming Soon */}
      <section className="container pb-16">
        <motion.div variants={itemVariants}>
          <h2 className="text-sm font-bold uppercase tracking-widest text-base-content/30 mb-2 flex items-center gap-2">
            <Clock size={16} /> On the Roadmap
          </h2>
          <p className="text-[10px] font-mono text-base-content/20 mb-8">
            Community-requested integrations in development
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {COMING_SOON.map((item) => (
            <motion.div
              key={item.id}
              variants={itemVariants}
              className="bg-base-200/50 border border-base-300/50 rounded-sm p-5 text-center opacity-50"
            >
              <div className="h-10 w-10 rounded-sm bg-base-300/50 flex items-center justify-center mx-auto mb-3 text-base-content/30">
                {item.icon}
              </div>
              <p className="text-xs font-bold text-base-content/40 uppercase tracking-wider">
                {item.name}
              </p>
              <p className="text-[9px] font-mono text-base-content/20 mt-1">
                {item.description}
              </p>
              <span className="inline-block mt-3 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-base-content/20 border border-base-300/50 rounded-sm">
                Roadmap
              </span>
            </motion.div>
          ))}

          {/* Suggest card */}
          <motion.a
            href="https://github.com/scrollr/discussions"
            target="_blank"
            rel="noopener noreferrer"
            variants={itemVariants}
            whileHover={{
              scale: 1.02,
              transition: { type: 'tween', duration: 0.2 },
            }}
            className="group bg-primary/[0.03] border border-dashed border-primary/20 rounded-sm p-5 text-center hover:border-primary/40 hover:bg-primary/[0.06] transition-colors cursor-pointer"
          >
            <div className="h-10 w-10 rounded-sm bg-primary/8 border border-primary/15 flex items-center justify-center mx-auto mb-3 text-primary/50 group-hover:text-primary transition-colors">
              <Plus size={18} />
            </div>
            <p className="text-xs font-bold text-primary/50 uppercase tracking-wider group-hover:text-primary/70 transition-colors">
              Suggest
            </p>
            <p className="text-[9px] font-mono text-primary/30 mt-1">
              Your idea here
            </p>
            <span className="inline-flex items-center gap-1 mt-3 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-primary/30 border border-primary/15 rounded-sm group-hover:text-primary/50 group-hover:border-primary/25 transition-colors">
              <Lightbulb size={8} />
              Propose
            </span>
          </motion.a>
        </div>
      </section>

      {/* Community CTA */}
      <section className="container pb-24">
        <motion.div
          variants={itemVariants}
          className="relative overflow-hidden rounded-sm bg-base-200/40 border border-base-300/40 p-8 md:p-10"
        >
          {/* Background texture */}
          <div
            className="absolute inset-0 opacity-[0.01] pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left">
              <h3 className="text-lg font-bold uppercase tracking-wider text-base-content mb-2">
                Missing Something?
              </h3>
              <p className="text-sm text-base-content/35 leading-relaxed max-w-md">
                Every Scrollr integration is a self-contained package. Fork the
                repo, follow the architecture, ship your plugin — or just tell
                us what you want.
              </p>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <a
                href="https://discord.gg/scrollr"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2.5 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] border border-base-300/50 text-base-content/60 rounded-sm hover:border-info/30 hover:text-info transition-colors"
              >
                <MessageSquare size={14} />
                Suggest an Idea
                <ArrowUpRight
                  size={12}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </a>
              <a
                href="https://github.com/scrollr"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2.5 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] border border-base-300/50 text-base-content/60 rounded-sm hover:border-primary/30 hover:text-primary transition-colors"
              >
                <Code2 size={14} />
                Build Your Own
                <ArrowUpRight
                  size={12}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </a>
            </div>
          </div>
        </motion.div>
      </section>
    </motion.div>
  )
}

// ── Integration Card ─────────────────────────────────────────────

function IntegrationCard({
  integration,
  installed,
  loading,
  onAdd,
  adding,
  isAuthenticated,
  recommended = false,
}: {
  integration: Integration
  installed: boolean
  loading: boolean
  onAdd: (integration: Integration) => void
  adding: boolean
  isAuthenticated: boolean
  recommended?: boolean
}) {
  return (
    <div className="group bg-base-200 border border-base-300 rounded-sm p-6 hover:border-primary/20 transition-all relative overflow-hidden h-full flex flex-col">
      {/* Subtle hover glow */}
      <div className="absolute inset-0 bg-primary/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="h-10 w-10 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            {integration.icon}
          </div>

          {/* Status Badge */}
          {loading ? (
            <span className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-base-content/30 bg-base-300/50 rounded-sm border border-base-300/50">
              Loading
            </span>
          ) : installed ? (
            <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-success/80 bg-success/10 rounded-sm border border-success/20">
              <Check size={10} /> Added
            </span>
          ) : recommended ? (
            <span className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-primary/60 bg-primary/8 rounded-sm border border-primary/15">
              Recommended
            </span>
          ) : null}
        </div>

        {/* Content */}
        <h3 className="text-sm font-bold uppercase tracking-wider text-base-content mb-1">
          {integration.name}
        </h3>
        <p className="text-[10px] font-mono text-primary/50 uppercase tracking-wider mb-3">
          {integration.description}
        </p>
        <p className="text-xs text-base-content/30 leading-relaxed">
          {integration.detail}
        </p>

        {/* Action — pinned to bottom */}
        <div className="mt-auto pt-5">
          {installed ? (
            <Link
              to="/dashboard"
              search={{ tab: integration.streamType }}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/50 hover:text-primary transition-colors"
            >
              Manage on Dashboard <ArrowRight size={12} />
            </Link>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onAdd(integration)}
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-primary/30 text-primary/80 hover:bg-primary/10 hover:border-primary/50 transition-all rounded-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!isAuthenticated ? (
                <>
                  <Lock size={12} /> Sign in to Add
                </>
              ) : adding ? (
                <>
                  <div className="h-2.5 w-2.5 rounded-full border border-primary/50 border-t-transparent animate-spin" />
                  Adding...
                </>
              ) : (
                <>Add to Account</>
              )}
            </motion.button>
          )}
        </div>
      </div>
    </div>
  )
}
