import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, TrendingUp, X, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { streamsApi } from '@/api/client'
import type { IntegrationManifest, DashboardTabProps } from '@/integrations/types'
import { StreamHeader, InfoCard } from '@/integrations/shared'

// ── Types (self-contained) ──────────────────────────────────────

interface TrackedSymbol {
  symbol: string
  name: string
  category: string
}

interface FinanceStreamConfig {
  symbols?: string[]
}

const SYMBOLS_PER_PAGE = 24

// ── API helper ──────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'

async function fetchCatalog(): Promise<TrackedSymbol[]> {
  const res = await fetch(`${API_BASE}/finance/symbols`)
  if (!res.ok) throw new Error('Failed to fetch symbol catalog')
  return res.json()
}

// ── Component ───────────────────────────────────────────────────

function FinanceDashboardTab({
  stream,
  getToken,
  connected,
  subscriptionTier,
  onToggle,
  onDelete,
  onStreamUpdate,
}: DashboardTabProps) {
  const isUplink = subscriptionTier === 'uplink'
  const [catalog, setCatalog] = useState<TrackedSymbol[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = stream.config as FinanceStreamConfig
  const symbols = Array.isArray(config?.symbols) ? config.symbols : []
  const symbolSet = new Set(symbols)

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
    ...Array.from(new Set(catalog.map((s) => s.category))),
  ]

  // Filter by category and search
  const filteredCatalog = catalog.filter((s) => {
    const matchesCategory =
      activeCategory === 'All' || s.category === activeCategory
    const matchesSearch =
      !searchQuery ||
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCatalog.length / SYMBOLS_PER_PAGE),
  )
  const paginatedCatalog = filteredCatalog.slice(
    (currentPage - 1) * SYMBOLS_PER_PAGE,
    currentPage * SYMBOLS_PER_PAGE,
  )

  // Helpers to look up name from catalog
  const nameMap = new Map(catalog.map((s) => [s.symbol, s.name]))

  const updateSymbols = async (nextSymbols: string[]) => {
    setSaving(true)
    try {
      const updated = await streamsApi.update(
        'finance',
        { config: { symbols: nextSymbols } },
        getToken,
      )
      onStreamUpdate(updated)
    } catch {
      setError('Failed to save symbol changes')
    } finally {
      setSaving(false)
    }
  }

  const addSymbol = (symbol: string) => {
    if (symbolSet.has(symbol)) return
    updateSymbols([...symbols, symbol])
  }

  const removeSymbol = (symbol: string) => {
    updateSymbols(symbols.filter((s) => s !== symbol))
  }

  // Bulk actions
  const categorySymbols = (cat: string) =>
    catalog.filter((s) => cat === 'All' || s.category === cat).map((s) => s.symbol)

  const addCategory = (cat: string) => {
    const toAdd = categorySymbols(cat).filter((s) => !symbolSet.has(s))
    if (toAdd.length === 0) return
    updateSymbols([...symbols, ...toAdd])
  }

  const removeCategory = (cat: string) => {
    const toRemove = new Set(categorySymbols(cat))
    updateSymbols(symbols.filter((s) => !toRemove.has(s)))
  }

  const clearAll = () => updateSymbols([])

  // Derive counts for the active category
  const activeCatSymbols = categorySymbols(activeCategory)
  const activeCatAdded = activeCatSymbols.filter((s) => symbolSet.has(s)).length
  const activeCatAvailable = activeCatSymbols.length - activeCatAdded

  return (
    <div className="space-y-6">
      <StreamHeader
        stream={stream}
        icon={<TrendingUp size={20} className="text-primary" />}
        title="Finance Stream"
        subtitle="Real-time market data via Finnhub WebSocket"
        connected={connected}
        subscriptionTier={subscriptionTier}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-error text-xs">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-0.5 hover:bg-error/10 rounded">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="Your Symbols" value={String(symbols.length)} />
        <InfoCard label="Available" value={String(catalog.length)} />
        <InfoCard
          label="Delivery"
          value={isUplink ? 'Real-time' : 'Polling · 30s'}
        />
      </div>

      {/* Upgrade CTA for free users */}
      {!isUplink && (
        <a
          href="/uplink"
          className="flex items-center gap-2 px-4 py-3 rounded-sm bg-primary/5 border border-primary/15 hover:border-primary/30 transition-all group"
        >
          <Zap size={14} className="text-primary/60 group-hover:text-primary transition-colors" />
          <span className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest group-hover:text-base-content/70 transition-colors">
            Upgrade to Uplink for real-time data delivery
          </span>
        </a>
      )}

      {/* Selected Symbols */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
            Your Symbols ({symbols.length} selected)
          </p>
          {symbols.length > 0 && (
            <button
              onClick={clearAll}
              disabled={saving}
              className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1 rounded border border-base-300/40 hover:text-error hover:border-error/30 transition-colors disabled:opacity-30"
            >
              Clear All
            </button>
          )}
        </div>
        {symbols.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {symbols.map((sym, i) => (
              <motion.div
                key={sym}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg"
              >
                <div className="min-w-0">
                  <span className="text-xs font-bold font-mono">{sym}</span>
                  {nameMap.has(sym) && (
                    <span className="text-[9px] text-base-content/30 ml-1.5">
                      {nameMap.get(sym)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeSymbol(sym)}
                  disabled={saving}
                  className="p-0.5 rounded hover:bg-error/10 text-base-content/20 hover:text-error transition-colors shrink-0 disabled:opacity-30"
                >
                  <X size={12} />
                </button>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <TrendingUp
              size={28}
              className="mx-auto text-base-content/15 mb-2"
            />
            <p className="text-[10px] text-base-content/25 uppercase tracking-wide">
              No symbols selected — browse the catalog below
            </p>
          </div>
        )}
      </div>

      {/* Symbol Catalog Browser */}
      <div className="space-y-4">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest px-1">
          Browse Symbol Catalog
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
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search by ticker or company name..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-base-200/50 border border-base-300/40 text-xs font-mono text-base-content/60 placeholder:text-base-content/20 focus:outline-none focus:border-primary/30 transition-colors"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-base-200/60 border border-base-300/40">
          {categories.map((cat) => {
            const catTotal = catalog.filter((s) => cat === 'All' || s.category === cat).length
            const catSelected = catalog.filter((s) => (cat === 'All' || s.category === cat) && symbolSet.has(s.symbol)).length
            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat)
                  setCurrentPage(1)
                }}
                className={`relative px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  activeCategory === cat
                    ? 'text-primary'
                    : 'text-base-content/30 hover:text-base-content/50'
                }`}
              >
                {activeCategory === cat && (
                  <motion.div
                    layoutId="finance-category-bg"
                    className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-md"
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
              className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1 rounded border border-base-300/40 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-30"
            >
              + Add All{activeCategory !== 'All' ? ` ${activeCategory}` : ''} ({activeCatAvailable})
            </button>
          )}
          {activeCatAdded > 0 && (
            <button
              onClick={() => removeCategory(activeCategory)}
              disabled={saving}
              className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1 rounded border border-base-300/40 hover:text-error hover:border-error/30 transition-colors disabled:opacity-30"
            >
              Remove All{activeCategory !== 'All' ? ` ${activeCategory}` : ''} ({activeCatAdded})
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
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {paginatedCatalog.map((entry) => {
              const isAdded = symbolSet.has(entry.symbol)
              return (
                <motion.div
                  key={entry.symbol}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isAdded
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-base-200/30 border-base-300/40 hover:border-base-300/60'
                  }`}
                >
                  <div className="min-w-0 mr-2">
                    <div className="text-xs font-bold font-mono">
                      {entry.symbol}
                    </div>
                    <div className="text-[9px] text-base-content/30 truncate">
                      {entry.name}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isAdded ? (
                      <span className="text-[9px] font-bold text-primary uppercase tracking-widest px-2 py-1 rounded bg-primary/10">
                        Added
                      </span>
                    ) : (
                      <button
                        onClick={() => addSymbol(entry.symbol)}
                        disabled={saving}
                        className="text-[9px] font-bold text-base-content/40 uppercase tracking-widest px-2 py-1 rounded border border-base-300/40 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-30"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-base-300/40 text-[10px] font-bold uppercase tracking-widest text-base-content/40 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                >
                  <ChevronLeft size={12} />
                  Prev
                </button>
                <span className="text-[10px] font-mono text-base-content/30">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-base-300/40 text-[10px] font-bold uppercase tracking-widest text-base-content/40 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                >
                  Next
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
          </>
        )}

        {!catalogLoading && catalogError && catalog.length === 0 && (
          <p className="text-center text-[10px] text-error/60 uppercase tracking-wide py-4">
            Failed to load symbol catalog — check your connection
          </p>
        )}

        {!catalogLoading && !catalogError && filteredCatalog.length === 0 && (
          <p className="text-center text-[10px] text-base-content/25 uppercase tracking-wide py-4">
            {searchQuery
              ? 'No symbols match your search'
              : 'No symbols in this category'}
          </p>
        )}
      </div>
    </div>
  )
}

export const financeIntegration: IntegrationManifest = {
  id: 'finance',
  name: 'Finance',
  tabLabel: 'Finance',
  description: 'Real-time market data via Finnhub',
  icon: TrendingUp,
  DashboardTab: FinanceDashboardTab,
}
