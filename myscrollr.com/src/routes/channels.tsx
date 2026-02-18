import { Link, createFileRoute } from '@tanstack/react-router'
import { useScrollrAuth } from '@/hooks/useScrollrAuth'
import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Code2,
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
  Trophy,
  Tv,
} from 'lucide-react'

import { motion } from 'motion/react'
import type { Channel, ChannelType } from '@/api/client'
import { usePageMeta } from '@/lib/usePageMeta'
import { useGetToken } from '@/hooks/useGetToken'
import { channelsApi } from '@/api/client'

export const Route = createFileRoute('/channels')({
  component: ChannelsPage,
})

// ── Signature easing (matches homepage) ────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const

// ── Channel hex map ────────────────────────────────────────────
const HEX = {
  primary: '#34d399',
  secondary: '#ff4757',
  info: '#00b8db',
  accent: '#a855f7',
} as const

// ── Channel Definitions ────────────────────────────────────────

interface ChannelDef {
  id: string
  channelType: ChannelType
  name: string
  description: string
  detail: string
  Icon: ComponentType<{ size?: number; className?: string }>
  hex: string
  Watermark: ComponentType<{
    size?: number
    strokeWidth?: number
    className?: string
  }>
  recommended?: boolean
}

interface ComingSoonChannel {
  id: string
  name: string
  description: string
  Icon: ComponentType<{ size?: number; className?: string }>
}

const CHANNELS: ChannelDef[] = [
  {
    id: 'finance',
    channelType: 'finance',
    name: 'Finance',
    description: 'Real-time market data',
    detail:
      '50 tracked symbols across stocks and crypto via Finnhub WebSocket. Live price changes, percentage moves, and directional indicators.',
    Icon: TrendingUp,
    hex: HEX.primary,
    Watermark: TrendingUp,
    recommended: true,
  },
  {
    id: 'sports',
    channelType: 'sports',
    name: 'Sports',
    description: 'Live scores & schedules',
    detail:
      'NFL, NBA, NHL, and MLB scores from ESPN. Game states, team matchups, and real-time score updates polling every minute.',
    Icon: Trophy,
    hex: HEX.secondary,
    Watermark: Trophy,
    recommended: true,
  },
  {
    id: 'rss',
    channelType: 'rss',
    name: 'RSS Feeds',
    description: 'Custom news streams',
    detail:
      '100+ curated feeds across 8 categories. Subscribe to the sources you care about and get articles delivered in real-time.',
    Icon: Rss,
    hex: HEX.info,
    Watermark: Rss,
    recommended: true,
  },
  {
    id: 'fantasy',
    channelType: 'fantasy',
    name: 'Yahoo Fantasy',
    description: 'Fantasy sports leagues',
    detail:
      'Connect your Yahoo account to view league standings, team rosters, weekly matchups, and live scoring across all your fantasy leagues.',
    Icon: Ghost,
    hex: HEX.accent,
    Watermark: Ghost,
  },
]

const COMING_SOON: ComingSoonChannel[] = [
  {
    id: 'discord',
    name: 'Discord',
    description: 'Server activity & notifications',
    Icon: MessageSquare,
  },
  {
    id: 'twitch',
    name: 'Twitch',
    description: 'Stream alerts & follows',
    Icon: Tv,
  },
  {
    id: 'reddit',
    name: 'Reddit',
    description: 'Subreddit feeds & trending',
    Icon: BookOpen,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Activity & notifications',
    Icon: Code2,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Subscription updates',
    Icon: Play,
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Now playing & activity',
    Icon: Music,
  },
]

// ── Page Component ─────────────────────────────────────────────

function ChannelsPage() {
  usePageMeta({
    title: 'Channels — Scrollr',
    description:
      'Browse and connect channels to extend your Scrollr feed with real-time data from your favorite platforms.',
    canonicalUrl: 'https://myscrollr.com/channels',
  })

  const { isAuthenticated, signIn } = useScrollrAuth()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const getToken = useGetToken()

  // Fetch user's channels when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setChannels([])
      return
    }
    setLoading(true)
    channelsApi
      .getAll(getToken)
      .then((res) => setChannels(res.channels || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated, getToken])

  const hasChannel = (type: ChannelType) =>
    channels.some((s) => s.channel_type === type)

  const handleAdd = async (channel: ChannelDef) => {
    if (!isAuthenticated) {
      signIn(`${window.location.origin}/callback`)
      return
    }
    if (hasChannel(channel.channelType)) return

    setAdding(channel.id)
    try {
      const created = await channelsApi.create(
        channel.channelType,
        {},
        getToken,
      )
      setChannels((prev) => [...prev, created])
    } catch {
      // Silently handle — likely 409 conflict (already exists)
    } finally {
      setAdding(null)
    }
  }

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
        </div>

        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        <div className="container relative z-10 !py-0 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="flex items-center justify-center gap-3 mb-8"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/8 text-primary text-[10px] font-bold rounded-lg border border-primary/15 uppercase tracking-wide">
              <Puzzle size={12} />
              {CHANNELS.length} available &middot; {COMING_SOON.length} coming
              soon
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight leading-[0.95] mb-6"
          >
            Extend Your <span className="text-gradient-primary">Feed</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
            className="text-base text-base-content/45 max-w-lg mx-auto leading-relaxed"
          >
            Browse official channels or explore what the community is building.
            Can't find what you want? Build it or suggest it.
          </motion.p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />
      </section>

      {/* ── CHANNELS GRID ─────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base-200/20 to-transparent pointer-events-none" />

        <div className="container relative z-10">
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              <span className="text-gradient-primary">Channels</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Add data sources to your account to build your feed
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {CHANNELS.map((channel, i) => (
              <motion.div
                key={channel.id}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.6,
                  ease: EASE,
                }}
              >
                <ChannelCard
                  channel={channel}
                  installed={hasChannel(channel.channelType)}
                  loading={loading}
                  onAdd={handleAdd}
                  adding={adding === channel.id}
                  isAuthenticated={isAuthenticated}
                  recommended={channel.recommended}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMING SOON / ROADMAP ────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="container">
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4">
              On the <span className="text-gradient-primary">Roadmap</span>
            </h2>
            <p className="text-base text-base-content/45 leading-relaxed max-w-lg mx-auto">
              Community-requested channels in development
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
            {COMING_SOON.map((item, i) => (
              <motion.div
                key={item.id}
                style={{ opacity: 0 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.06,
                  duration: 0.5,
                  ease: EASE,
                }}
                className="bg-base-200/40 border border-base-300/25 rounded-xl p-5 text-center opacity-60"
              >
                <div className="h-10 w-10 rounded-lg bg-base-300/30 flex items-center justify-center mx-auto mb-3 text-base-content/30">
                  <item.Icon size={18} />
                </div>
                <p className="text-xs font-semibold text-base-content/40">
                  {item.name}
                </p>
                <p className="text-[9px] text-base-content/25 mt-1">
                  {item.description}
                </p>
                <span className="inline-block mt-3 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-base-content/20 border border-base-300/25 rounded-full">
                  Roadmap
                </span>
              </motion.div>
            ))}

            {/* Suggest card */}
            <motion.a
              href="https://github.com/brandon-relentnet/myscrollr/discussions/categories/integration-requests"
              target="_blank"
              rel="noopener noreferrer"
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: COMING_SOON.length * 0.06,
                duration: 0.5,
                ease: EASE,
              }}
              className="group bg-primary/[0.03] border border-dashed border-primary/20 rounded-xl p-5 text-center hover:border-primary/40 hover:bg-primary/[0.06] transition-colors cursor-pointer"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center mx-auto mb-3 text-base-content/50 group-hover:text-base-content/70 transition-colors">
                <Plus size={18} />
              </div>
              <p className="text-xs font-semibold text-primary/50 group-hover:text-primary/70 transition-colors">
                Suggest
              </p>
              <p className="text-[9px] text-primary/30 mt-1">Your idea here</p>
              <span className="inline-flex items-center gap-1 mt-3 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary/30 border border-primary/15 rounded-full group-hover:text-primary/50 group-hover:border-primary/25 transition-colors">
                <Lightbulb size={8} />
                Propose
              </span>
            </motion.a>
          </div>
        </div>
      </section>

      {/* ── COMMUNITY CTA ────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="container pb-8">
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="relative overflow-hidden rounded-2xl bg-base-200/40 border border-base-300/25 p-8 md:p-10"
          >
            {/* Accent top line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${HEX.primary} 50%, transparent)`,
              }}
            />

            {/* Background texture */}
            <div
              className="absolute inset-0 opacity-[0.01] pointer-events-none"
              style={{
                backgroundImage: `
                  linear-gradient(var(--grid-line-color) 1px, transparent 1px),
                  linear-gradient(90deg, var(--grid-line-color) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
              }}
            />

            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="text-center md:text-left">
                <h3 className="text-lg font-bold text-base-content mb-2">
                  Missing Something?
                </h3>
                <p className="text-sm text-base-content/45 leading-relaxed max-w-md">
                  Every Scrollr channel is a self-contained package. Fork the
                  repo, follow the architecture, ship your plugin — or just tell
                  us what you want.
                </p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <a
                  href="https://discord.gg/85b49TcGJa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  <MessageSquare size={14} />
                  Suggest an Idea
                  <ArrowUpRight size={12} />
                </a>
                <a
                  href="https://github.com/brandon-relentnet/myscrollr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  <Code2 size={14} />
                  Build Your Own
                  <ArrowUpRight size={12} />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

// ── Channel Card ───────────────────────────────────────────────

function ChannelCard({
  channel,
  installed,
  loading,
  onAdd,
  adding,
  isAuthenticated,
  recommended = false,
}: {
  channel: ChannelDef
  installed: boolean
  loading: boolean
  onAdd: (channel: ChannelDef) => void
  adding: boolean
  isAuthenticated: boolean
  recommended?: boolean
}) {
  const { hex } = channel

  return (
    <div className="group relative bg-base-200/40 border border-base-300/25 rounded-xl p-6 overflow-hidden hover:border-base-300/50 transition-colors h-full flex flex-col">
      {/* Accent top line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${hex} 50%, transparent)`,
        }}
      />

      {/* Corner dot grid */}
      <div
        className="absolute top-0 right-0 w-20 h-20 opacity-[0.04] text-base-content"
        style={{
          backgroundImage:
            'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
      />

      {/* Ambient glow orb on hover */}
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `${hex}10` }}
      />

      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{
              background: `${hex}15`,
              boxShadow: `0 0 20px ${hex}15, 0 0 0 1px ${hex}20`,
            }}
          >
            <channel.Icon size={20} className="text-base-content/80" />
          </div>

          {/* Status Badge */}
          {loading ? (
            <span className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-base-content/30 bg-base-300/30 rounded-full border border-base-300/25">
              Loading
            </span>
          ) : installed ? (
            <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-success/80 bg-success/10 rounded-full border border-success/20">
              <Check size={10} /> Added
            </span>
          ) : recommended ? (
            <span
              className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide rounded-full border"
              style={{
                color: hex,
                background: `${hex}10`,
                borderColor: `${hex}20`,
              }}
            >
              Recommended
            </span>
          ) : null}
        </div>

        {/* Content */}
        <h3 className="text-sm font-bold text-base-content mb-1">
          {channel.name}
        </h3>
        <p
          className="text-[10px] mb-3 font-medium"
          style={{ color: `${hex}90` }}
        >
          {channel.description}
        </p>
        <p className="text-xs text-base-content/40 leading-relaxed">
          {channel.detail}
        </p>

        {/* Action — pinned to bottom */}
        <div className="mt-auto pt-5">
          {installed ? (
            <Link
              to="/dashboard"
              search={{ tab: channel.channelType }}
              className="flex items-center gap-2 text-[10px] font-semibold text-base-content/50 hover:text-base-content/70 transition-colors"
            >
              Manage on Dashboard <ArrowRight size={12} />
            </Link>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onAdd(channel)}
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 text-[10px] font-semibold border rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{
                borderColor: `${hex}30`,
                color: `${hex}cc`,
              }}
            >
              {!isAuthenticated ? (
                <>
                  <Lock size={12} /> Sign in to Add
                </>
              ) : adding ? (
                <>
                  <div
                    className="h-2.5 w-2.5 rounded-full border border-t-transparent animate-spin"
                    style={{ borderColor: `${hex}50` }}
                  />
                  Adding...
                </>
              ) : (
                <>Add to Account</>
              )}
            </motion.button>
          )}
        </div>
      </div>

      {/* Watermark icon */}
      <channel.Watermark
        size={100}
        strokeWidth={0.4}
        className="absolute -bottom-3 -right-3 text-base-content/[0.025] pointer-events-none"
      />
    </div>
  )
}
