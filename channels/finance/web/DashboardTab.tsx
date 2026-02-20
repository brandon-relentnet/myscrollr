import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { channelsApi } from "@/api/client";
import type { ChannelManifest, DashboardTabProps } from "@/channels/types";
import { ChannelHeader, InfoCard } from "@/channels/shared";

// ── Types (self-contained) ──────────────────────────────────────

interface TrackedSymbol {
  symbol: string;
  name: string;
  category: string;
}

interface FinanceChannelConfig {
  symbols?: string[];
}

const SYMBOLS_PER_PAGE = 24;
const HEX = "#34d399";

// ── API helper ──────────────────────────────────────────────────

const API_BASE =
  import.meta.env.VITE_API_URL || "https://api.myscrollr.relentnet.dev";

async function fetchCatalog(): Promise<TrackedSymbol[]> {
  const res = await fetch(`${API_BASE}/finance/symbols`);
  if (!res.ok) throw new Error("Failed to fetch symbol catalog");
  return res.json();
}

// ── Component ───────────────────────────────────────────────────

function FinanceDashboardTab({
  channel,
  getToken,
  connected,
  subscriptionTier,
  hex,
  onToggle,
  onDelete,
  onChannelUpdate,
}: DashboardTabProps) {
  const isUnlimited = subscriptionTier === "uplink_unlimited";
  const isUplink = subscriptionTier === "uplink" || isUnlimited;
  const [catalog, setCatalog] = useState<TrackedSymbol[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = channel.config as FinanceChannelConfig;
  const symbols = Array.isArray(config?.symbols) ? config.symbols : [];
  const symbolSet = new Set(symbols);

  // Auto-dismiss errors
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // Fetch catalog on mount
  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch(() => setCatalogError(true))
      .finally(() => setCatalogLoading(false));
  }, []);

  // Derive categories from catalog
  const categories = [
    "All",
    ...Array.from(new Set(catalog.map((s) => s.category))),
  ];

  // Filter by category and search
  const filteredCatalog = catalog.filter((s) => {
    const matchesCategory =
      activeCategory === "All" || s.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCatalog.length / SYMBOLS_PER_PAGE),
  );
  const paginatedCatalog = filteredCatalog.slice(
    (currentPage - 1) * SYMBOLS_PER_PAGE,
    currentPage * SYMBOLS_PER_PAGE,
  );

  // Helpers to look up name from catalog
  const nameMap = new Map(catalog.map((s) => [s.symbol, s.name]));

  const updateSymbols = async (nextSymbols: string[]) => {
    setSaving(true);
    try {
      const updated = await channelsApi.update(
        "finance",
        { config: { symbols: nextSymbols } },
        getToken,
      );
      onChannelUpdate(updated);
    } catch {
      setError("Failed to save symbol changes");
    } finally {
      setSaving(false);
    }
  };

  const addSymbol = (symbol: string) => {
    if (symbolSet.has(symbol)) return;
    updateSymbols([...symbols, symbol]);
  };

  const removeSymbol = (symbol: string) => {
    updateSymbols(symbols.filter((s) => s !== symbol));
  };

  // Bulk actions
  const categorySymbols = (cat: string) =>
    catalog
      .filter((s) => cat === "All" || s.category === cat)
      .map((s) => s.symbol);

  const addCategory = (cat: string) => {
    const toAdd = categorySymbols(cat).filter((s) => !symbolSet.has(s));
    if (toAdd.length === 0) return;
    updateSymbols([...symbols, ...toAdd]);
  };

  const removeCategory = (cat: string) => {
    const toRemove = new Set(categorySymbols(cat));
    updateSymbols(symbols.filter((s) => !toRemove.has(s)));
  };

  const clearAll = () => updateSymbols([]);

  // Derive counts for the active category
  const activeCatSymbols = categorySymbols(activeCategory);
  const activeCatAdded = activeCatSymbols.filter((s) =>
    symbolSet.has(s),
  ).length;
  const activeCatAvailable = activeCatSymbols.length - activeCatAdded;

  return (
    <div className="space-y-6">
      <ChannelHeader
        channel={channel}
        icon={<TrendingUp size={16} className="text-base-content/80" />}
        title="Finance Channel"
        subtitle="Real-time market data via Finnhub WebSocket"
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
          label="Your Symbols"
          value={String(symbols.length)}
          hex={hex}
        />
        <InfoCard label="Available" value={String(catalog.length)} hex={hex} />
        <InfoCard
          label="Delivery"
          value={isUnlimited ? "Real-time SSE" : isUplink ? "Poll \u00b7 30s" : "Poll \u00b7 60s"}
          hex={hex}
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
              ? "Upgrade to Unlimited for real-time SSE delivery"
              : "Upgrade to Uplink for faster data delivery"}
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
              className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1 rounded border border-base-300/25 hover:text-error hover:border-error/30 transition-colors disabled:opacity-30"
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
                className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                style={{
                  background: `${hex}0D`,
                  borderColor: `${hex}33`,
                }}
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
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by ticker or company name..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-base-200/50 border border-base-300/25 text-xs font-mono text-base-content/60 placeholder:text-base-content/20 focus:outline-none transition-colors"
            style={{ ["--tw-ring-color" as string]: `${hex}4D` }}
            onFocus={(e) => (e.currentTarget.style.borderColor = `${hex}4D`)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-base-200/60 border border-base-300/25">
          {categories.map((cat) => {
            const catTotal = catalog.filter(
              (s) => cat === "All" || s.category === cat,
            ).length;
            const catSelected = catalog.filter(
              (s) =>
                (cat === "All" || s.category === cat) &&
                symbolSet.has(s.symbol),
            ).length;
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setCurrentPage(1);
                }}
                className={`relative px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  isActive
                    ? ""
                    : "text-base-content/30 hover:text-base-content/50"
                }`}
                style={isActive ? { color: hex } : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="finance-category-bg"
                    className="absolute inset-0 rounded-md border"
                    style={{
                      background: `${hex}10`,
                      borderColor: `${hex}33`,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative">
                  {cat}
                  <span className="ml-1 text-[8px] opacity-60">
                    {catSelected}/{catTotal}
                  </span>
                </span>
              </button>
            );
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
                e.currentTarget.style.color = hex;
                e.currentTarget.style.borderColor = `${hex}4D`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "";
                e.currentTarget.style.borderColor = "";
              }}
            >
              + Add All{activeCategory !== "All" ? ` ${activeCategory}` : ""} (
              {activeCatAvailable})
            </button>
          )}
          {activeCatAdded > 0 && (
            <button
              onClick={() => removeCategory(activeCategory)}
              disabled={saving}
              className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2 py-1 rounded border border-base-300/25 hover:text-error hover:border-error/30 transition-colors disabled:opacity-30"
            >
              Remove All{activeCategory !== "All" ? ` ${activeCategory}` : ""} (
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
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {paginatedCatalog.map((entry) => {
                const isAdded = symbolSet.has(entry.symbol);
                return (
                  <motion.div
                    key={entry.symbol}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      isAdded
                        ? ""
                        : "bg-base-200/30 border-base-300/25 hover:border-base-300/40"
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
                          onClick={() => addSymbol(entry.symbol)}
                          disabled={saving}
                          className="text-[9px] font-bold text-base-content/40 uppercase tracking-widest px-2 py-1 rounded border border-base-300/25 transition-colors disabled:opacity-30"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = hex;
                            e.currentTarget.style.borderColor = `${hex}4D`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "";
                            e.currentTarget.style.borderColor = "";
                          }}
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-base-300/25 text-[10px] font-bold uppercase tracking-widest text-base-content/40 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = hex;
                    e.currentTarget.style.borderColor = `${hex}4D`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.borderColor = "";
                  }}
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
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-base-300/25 text-[10px] font-bold uppercase tracking-widest text-base-content/40 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = hex;
                    e.currentTarget.style.borderColor = `${hex}4D`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.borderColor = "";
                  }}
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
              ? "No symbols match your search"
              : "No symbols in this category"}
          </p>
        )}
      </div>
    </div>
  );
}

export const financeChannel: ChannelManifest = {
  id: "finance",
  name: "Finance",
  tabLabel: "Finance",
  description: "Real-time market data via Finnhub",
  hex: HEX,
  icon: TrendingUp,
  DashboardTab: FinanceDashboardTab,
};
