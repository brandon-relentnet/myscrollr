import { useState, useMemo, useCallback } from "react";
import clsx from "clsx";
import CategoryFilter from "../rss/CategoryFilter";
import type { TrackedSymbol } from "../../api/queries";

// ── Types ────────────────────────────────────────────────────────

interface SymbolCatalogProps {
  catalog: TrackedSymbol[];
  subscribedSymbols: Set<string>;
  onAdd: (symbol: string) => void;
  loading: boolean;
  error: boolean;
  atLimit: boolean;
}

// ── Constants ────────────────────────────────────────────────────

const POPULAR_SYMBOLS = [
  "AAPL",
  "MSFT",
  "GOOG",
  "AMZN",
  "TSLA",
  "META",
  "NVDA",
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
];

// ── Component ────────────────────────────────────────────────────

export default function SymbolCatalog({
  catalog,
  subscribedSymbols,
  onAdd,
  loading,
  error,
  atLimit,
}: SymbolCatalogProps) {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Build a lookup set from catalog symbols for quick-pick filtering
  const catalogSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const s of catalog) set.add(s.symbol);
    return set;
  }, [catalog]);

  // Popular symbols that exist in the catalog
  const popularChips = useMemo(
    () => POPULAR_SYMBOLS.filter((s) => catalogSymbols.has(s)),
    [catalogSymbols],
  );

  // Derive categories with counts
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of catalog) {
      map.set(s.category, (map.get(s.category) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [catalog]);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // Filter catalog
  const filtered = useMemo(() => {
    let list = catalog;
    if (selectedCategories.size > 0) {
      list = list.filter((s) => selectedCategories.has(s.category));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [catalog, selectedCategories, search]);

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-fg-3">Failed to load symbol catalog</p>
        <p className="text-[11px] text-fg-3 mt-1">
          Check your connection and try again
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-fg">Add Symbols</h3>
        <p className="text-[11px] text-fg-3 mt-0.5">
          Browse {catalog.length} available symbols
        </p>
      </div>

      {/* Popular quick-picks */}
      {popularChips.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-fg-3 uppercase tracking-wider">
              Popular
            </span>
            <button
              onClick={() => setShowSuggestions((v) => !v)}
              className="text-[10px] text-fg-3 hover:text-fg-2 transition-colors cursor-pointer"
            >
              {showSuggestions ? "Hide" : "Show suggestions"}
            </button>
          </div>
          {showSuggestions && (
            <div className="flex flex-wrap gap-1.5">
              {popularChips.map((sym) => {
                const isAdded = subscribedSymbols.has(sym);
                return (
                  <button
                    key={sym}
                    onClick={() => {
                      if (!isAdded) onAdd(sym);
                    }}
                    disabled={atLimit && !isAdded}
                    className={clsx(
                      "flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-mono transition-colors",
                      isAdded
                        ? "border-[#22c55e]/30 bg-[#22c55e]/5 text-fg-3 cursor-default"
                        : "border-edge/30 text-fg-2 hover:border-edge/40 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
                    )}
                  >
                    {sym}
                    {isAdded && (
                      <span className="text-[#22c55e] text-[10px]">
                        &#10003;
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Search + Category filter */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search symbols..."
          className="flex-1 px-2.5 py-1.5 rounded-md bg-base-200 border border-edge/40 text-[11px] text-fg-2 placeholder:text-fg-3 focus:outline-none focus:border-accent/60 transition-colors"
        />
        <CategoryFilter
          categories={categories}
          selected={selectedCategories}
          onToggle={toggleCategory}
          onClearAll={() => setSelectedCategories(new Set())}
          alignRight
        />
      </div>

      {/* Active filter chips */}
      {selectedCategories.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(selectedCategories).map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-[10px] text-accent hover:bg-accent/25 transition-colors cursor-pointer"
            >
              {cat}
              <span className="opacity-60">&times;</span>
            </button>
          ))}
          <button
            onClick={() => setSelectedCategories(new Set())}
            className="px-2 py-0.5 text-[10px] text-fg-3 hover:text-fg-2 transition-colors cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Catalog grid */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-[11px] text-fg-3 animate-pulse">
            Loading catalog...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-[11px] text-fg-3">
            No symbols match your search
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {filtered.map((sym) => {
            const isAdded = subscribedSymbols.has(sym.symbol);
            return (
              <div
                key={sym.symbol}
                className={clsx(
                  "flex flex-col gap-1 p-2.5 rounded-lg border transition-colors",
                  isAdded
                    ? "border-accent/30 bg-accent/5"
                    : "border-edge/30 hover:border-edge/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-mono font-bold text-fg-2 leading-tight">
                      {sym.symbol}
                    </span>
                    <p className="text-[10px] text-fg-3 truncate">
                      {sym.name}
                    </p>
                  </div>
                  <span className="px-1.5 py-px rounded text-[9px] text-fg-3 bg-[#22c55e]/10 shrink-0 whitespace-nowrap">
                    {sym.category}
                  </span>
                </div>
                <div className="mt-auto pt-1">
                  {isAdded ? (
                    <span className="text-[11px] text-fg-3">
                      Added &#10003;
                    </span>
                  ) : (
                    <button
                      onClick={() => onAdd(sym.symbol)}
                      disabled={atLimit}
                      className="text-[11px] text-[#22c55e] hover:text-[#4ade80] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
