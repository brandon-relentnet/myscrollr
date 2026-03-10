import { useEffect, useState } from 'react'
import { Search, Trophy, X, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { channelsApi } from '@/api/client'
import type { ChannelManifest, DashboardTabProps } from '@/channels/types'
import { ChannelHeader, InfoCard } from '@/channels/shared'

// ── Types (self-contained) ──────────────────────────────────────

interface TrackedLeague {
  name: string
  sport_api: string
  category: string
  country: string
  logo_url: string
  game_count: number
  live_count: number
  next_game: string | null
}

interface SportsChannelConfig {
  leagues?: string[]
}

const HEX = '#ff4757'

// ── API helper ──────────────────────────────────────────────────

const API_BASE =
  import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'
  // import.meta.env.VITE_API_URL || 'https://api.myscrollr.enanimate.dev'

async function fetchCatalog(): Promise<TrackedLeague[]> {
  const res = await fetch(`${API_BASE}/sports/leagues`)
  if (!res.ok) throw new Error('Failed to fetch league catalog')
  return res.json()
}

// ── League activity helpers ──────────────────────────────────────

function leagueActivitySort(a: TrackedLeague, b: TrackedLeague): number {
  // Live leagues first, then by game count desc, then alphabetical
  if (a.live_count !== b.live_count) return b.live_count - a.live_count
  if (a.game_count !== b.game_count) return b.game_count - a.game_count
  return a.name.localeCompare(b.name)
}

function formatNextGame(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = Date.now()
  const diff = d.getTime() - now
  if (diff <= 0) return 'Starting'
  const h = Math.floor(diff / 3_600_000)
  if (h < 24) {
    const m = Math.floor((diff % 3_600_000) / 60_000)
    return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Component ───────────────────────────────────────────────────

function SportsDashboardTab({
  channel,
  getToken,
  connected,
  subscriptionTier,
  hex,
  onToggle,
  onDelete,
  onChannelUpdate,
}: DashboardTabProps) {
  const isUnlimited = subscriptionTier === 'uplink_unlimited'
  const isUplink = subscriptionTier === 'uplink' || isUnlimited
  const [catalog, setCatalog] = useState<TrackedLeague[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = channel.config as SportsChannelConfig
  const leagues = Array.isArray(config?.leagues) ? config.leagues : []
  const leagueSet = new Set(leagues)

  // Auto-dismiss errors
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(t)
  }, [error])

  // Fetch catalog on mount
  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch(() => setCatalogError(true))
      .finally(() => setCatalogLoading(false))
  }, [])

  // Derive categories from catalog
  const categories = [
    'All',
    ...Array.from(new Set(catalog.map((l) => l.category))),
  ]

  // Sort by activity (live first, then game count, then alpha), then filter
  const sortedCatalog = [...catalog].sort(leagueActivitySort)

  const filteredCatalog = sortedCatalog.filter((l) => {
    const matchesCategory =
      activeCategory === 'All' || l.category === activeCategory
    const matchesSearch =
      !searchQuery ||
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.category.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Check if all selected leagues are off-season
  const selectedAllOffSeason =
    leagues.length > 0 &&
    leagues.every((name) => {
      const entry = catalog.find((l) => l.name === name)
      return !entry || entry.game_count === 0
    })

  const updateLeagues = async (nextLeagues: string[]) => {
    setSaving(true)
    try {
      const updated = await channelsApi.update(
        'sports',
        { config: { leagues: nextLeagues } },
        getToken,
      )
      onChannelUpdate(updated)
    } catch {
      setError('Failed to save league changes')
    } finally {
      setSaving(false)
    }
  }

  const addLeague = (name: string) => {
    if (leagueSet.has(name)) return
    updateLeagues([...leagues, name])
  }

  const removeLeague = (name: string) => {
    updateLeagues(leagues.filter((l) => l !== name))
  }

  // Bulk actions
  const categoryLeagues = (cat: string) =>
    catalog
      .filter((l) => cat === 'All' || l.category === cat)
      .map((l) => l.name)

  const addCategory = (cat: string) => {
    const toAdd = categoryLeagues(cat).filter((l) => !leagueSet.has(l))
    if (toAdd.length === 0) return
    updateLeagues([...leagues, ...toAdd])
  }

  const removeCategory = (cat: string) => {
    const toRemove = new Set(categoryLeagues(cat))
    updateLeagues(leagues.filter((l) => !toRemove.has(l)))
  }

  const clearAll = () => updateLeagues([])

  // Derive counts for the active category
  const activeCatLeagues = categoryLeagues(activeCategory)
  const activeCatAdded = activeCatLeagues.filter((l) =>
    leagueSet.has(l),
  ).length
  const activeCatAvailable = activeCatLeagues.length - activeCatAdded

  return (
    <div className="space-y-6">
      <ChannelHeader
        channel={channel}
        icon={<Trophy size={16} className="text-base-content/80" />}
        title="Sports Channel"
        subtitle="Live scores via api-sports.io"
        connected={connected}
        subscriptionTier={subscriptionTier}
        hex={hex}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-error text-xs">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="p-0.5 hover:bg-error/10 rounded"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard
          label="Your Leagues"
          value={String(leagues.length)}
          hex={hex}
        />
        <InfoCard label="Available" value={String(catalog.length)} hex={hex} />
        <InfoCard
          label="Delivery"
          value={
            isUnlimited
              ? 'Real-time SSE'
              : isUplink
                ? 'Poll \u00b7 30s'
                : 'Poll \u00b7 60s'
          }
          hex={hex}
          glow={isUnlimited}
        />
      </div>

      {/* Upgrade CTA */}
      {!isUnlimited && (
        <a
          href="/uplink"
          className="flex items-center gap-2 px-4 py-3 rounded-sm border transition-all group"
          style={{
            background: `${hex}0D`,
            borderColor: `${hex}26`,
          }}
        >
          <Zap
            size={14}
            className="text-base-content/40 group-hover:text-base-content/60 transition-colors"
          />
          <span className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest group-hover:text-base-content/70 transition-colors">
            {isUplink
              ? 'Upgrade to Unlimited for real-time score delivery'
              : 'Upgrade to Uplink for faster score delivery'}
          </span>
        </a>
      )}

      {/* Selected Leagues */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
            Your Leagues ({leagues.length} selected)
          </p>
          {leagues.length > 0 && (
            <button
              onClick={clearAll}
              disabled={saving}
              className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1 rounded border border-base-300/25 hover:text-error hover:border-error/30 transition-colors disabled:opacity-30"
            >
              Clear All
            </button>
          )}
        </div>
        {leagues.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {leagues.map((name, i) => {
              const entry = catalog.find((l) => l.name === name)
              return (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                  style={{
                    background: `${hex}0D`,
                    borderColor: `${hex}33`,
                  }}
                >
                  {entry?.logo_url && (
                    <img
                      src={entry.logo_url}
                      alt=""
                      className="w-4 h-4 object-contain"
                    />
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-bold">{name}</span>
                    {entry?.category && (
                      <span className="text-[9px] text-base-content/30 ml-1.5">
                        {entry.category}
                      </span>
                    )}
                    {entry && entry.live_count > 0 && (
                      <span className="text-[8px] text-live font-bold ml-1.5">
                        <span className="inline-block w-1 h-1 rounded-full bg-live animate-pulse mr-0.5 align-middle" />
                        {entry.live_count} Live
                      </span>
                    )}
                    {entry &&
                      entry.live_count === 0 &&
                      entry.game_count === 0 && (
                        <span className="text-[8px] text-base-content/20 ml-1.5">
                          Off-season
                        </span>
                      )}
                  </div>
                  <button
                    onClick={() => removeLeague(name)}
                    disabled={saving}
                    className="p-0.5 rounded hover:bg-error/10 text-base-content/20 hover:text-error transition-colors shrink-0 disabled:opacity-30"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <Trophy size={28} className="mx-auto text-base-content/15 mb-2" />
            <p className="text-[10px] text-base-content/25 uppercase tracking-wide">
              No leagues selected — browse the catalog below
            </p>
          </div>
        )}

        {/* Off-season warning */}
        {selectedAllOffSeason && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[10px]"
            style={{
              background: `${hex}08`,
              borderColor: `${hex}1A`,
            }}
          >
            <Trophy size={14} className="text-base-content/20 shrink-0" />
            <p className="text-base-content/40">
              Your selected leagues are currently off-season. No game data will
              appear in your feed until games are scheduled.
            </p>
          </div>
        )}
      </div>

      {/* League Catalog Browser */}
      <div className="space-y-4">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest px-1">
          Browse League Catalog
        </p>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/20"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by league name..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-base-200/50 border border-base-300/25 text-xs font-mono text-base-content/60 placeholder:text-base-content/20 focus:outline-none transition-colors"
            style={{ ['--tw-ring-color' as string]: `${hex}4D` }}
            onFocus={(e) => (e.currentTarget.style.borderColor = `${hex}4D`)}
            onBlur={(e) => (e.currentTarget.style.borderColor = '')}
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-base-200/60 border border-base-300/25">
          {categories.map((cat) => {
            const catTotal = catalog.filter(
              (l) => cat === 'All' || l.category === cat,
            ).length
            const catSelected = catalog.filter(
              (l) =>
                (cat === 'All' || l.category === cat) &&
                leagueSet.has(l.name),
            ).length
            const isActive = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`relative px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  isActive
                    ? ''
                    : 'text-base-content/30 hover:text-base-content/50'
                }`}
                style={isActive ? { color: hex } : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="sports-category-bg"
                    className="absolute inset-0 rounded-md border"
                    style={{
                      background: `${hex}10`,
                      borderColor: `${hex}33`,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative">
                  {cat}
                  <span className="ml-1 text-[8px] opacity-60">
                    {catSelected}/{catTotal}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Bulk actions for active category */}
        <div className="flex items-center gap-2 px-1">
          {activeCatAvailable > 0 && (
            <button
              onClick={() => addCategory(activeCategory)}
              disabled={saving}
              className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1 rounded border border-base-300/25 transition-colors disabled:opacity-30"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = hex
                e.currentTarget.style.borderColor = `${hex}4D`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = ''
                e.currentTarget.style.borderColor = ''
              }}
            >
              + Add All{activeCategory !== 'All' ? ` ${activeCategory}` : ''} (
              {activeCatAvailable})
            </button>
          )}
          {activeCatAdded > 0 && (
            <button
              onClick={() => removeCategory(activeCategory)}
              disabled={saving}
              className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1 rounded border border-base-300/25 hover:text-error hover:border-error/30 transition-colors disabled:opacity-30"
            >
              Remove All
              {activeCategory !== 'All' ? ` ${activeCategory}` : ''} (
              {activeCatAdded})
            </button>
          )}
        </div>

        {/* Catalog Grid */}
        {catalogLoading ? (
          <div className="text-center py-8">
            <motion.span
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-[10px] font-mono text-base-content/30 uppercase"
            >
              Loading catalog...
            </motion.span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredCatalog.map((entry) => {
              const isAdded = leagueSet.has(entry.name)
              return (
                <motion.div
                  key={entry.name}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isAdded
                      ? ''
                      : 'bg-base-200/30 border-base-300/25 hover:border-base-300/40'
                  }`}
                  style={
                    isAdded
                      ? {
                          background: `${hex}0D`,
                          borderColor: `${hex}33`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2.5 min-w-0 mr-2">
                    {entry.logo_url && (
                      <img
                        src={entry.logo_url}
                        alt=""
                        className="w-6 h-6 object-contain shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold">{entry.name}</div>
                      <div className="flex items-center gap-1.5 text-[9px] text-base-content/30 truncate">
                        <span>{entry.country}</span>
                        {entry.live_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-live font-bold">
                            <span className="w-1 h-1 rounded-full bg-live animate-pulse" />
                            {entry.live_count} Live
                          </span>
                        )}
                        {entry.live_count === 0 && entry.game_count > 0 && (
                          <span className="text-base-content/40">
                            {entry.game_count} games
                          </span>
                        )}
                        {entry.game_count === 0 && (
                          <span className="text-base-content/20">
                            {formatNextGame(entry.next_game)
                              ? `Next: ${formatNextGame(entry.next_game)}`
                              : 'Off-season'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {isAdded ? (
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded"
                        style={{
                          color: hex,
                          background: `${hex}1A`,
                        }}
                      >
                        Added
                      </span>
                    ) : (
                      <button
                        onClick={() => addLeague(entry.name)}
                        disabled={saving}
                        className="text-[9px] font-bold text-base-content/40 uppercase tracking-widest px-2 py-1 rounded border border-base-300/25 transition-colors disabled:opacity-30"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = hex
                          e.currentTarget.style.borderColor = `${hex}4D`
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = ''
                          e.currentTarget.style.borderColor = ''
                        }}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {!catalogLoading && catalogError && catalog.length === 0 && (
          <p className="text-center text-[10px] text-error/60 uppercase tracking-wide py-4">
            Failed to load league catalog — check your connection
          </p>
        )}

        {!catalogLoading && !catalogError && filteredCatalog.length === 0 && (
          <p className="text-center text-[10px] text-base-content/25 uppercase tracking-wide py-4">
            {searchQuery
              ? 'No leagues match your search'
              : 'No leagues in this category'}
          </p>
        )}
      </div>
    </div>
  )
}

export const sportsChannel: ChannelManifest = {
  id: 'sports',
  name: 'Sports',
  tabLabel: 'Sports',
  description: 'Live scores via api-sports.io',
  hex: HEX,
  icon: Trophy,
  DashboardTab: SportsDashboardTab,
}
