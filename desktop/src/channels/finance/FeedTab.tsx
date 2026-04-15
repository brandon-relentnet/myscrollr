/**
 * Finance FeedTab — desktop-native.
 *
 * Renders a grid of trade cards with real-time price updates
 * via the desktop CDC/SSE pipeline. Supports compact and comfort
 * display modes with price flash animations on change.
 *
 * Controls bar provides direction filter pills (All / Gainers / Losers),
 * sort dropdown, and category filter. Summary bar shows up/down/unchanged
 * counts. Dismissible filter chips appear when category filters are active.
 */
import { memo, useMemo, useRef, useEffect, useState, useCallback } from "react";
import { clsx } from "clsx";
import { TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { dashboardQueryOptions, financeCatalogOptions } from "../../api/queries";
import { formatPrice, formatChange, timeAgo } from "../../utils/format";
import EmptyChannelState from "../../components/EmptyChannelState";
import CategoryFilter from "../rss/CategoryFilter";
import { useShell } from "../../shell-context";
import type { Trade, FeedTabProps, ChannelManifest } from "../../types";
import type { FinanceDisplayPrefs } from "../../preferences";

// ── Channel manifest ─────────────────────────────────────────────

export const financeChannel: ChannelManifest = {
  id: "finance",
  name: "Finance",
  tabLabel: "Finance",
  description: "Real-time stock and crypto prices",
  hex: "#22c55e",
  icon: TrendingUp,
  info: {
    about:
      "Track stocks, ETFs, and cryptocurrencies with live price updates. " +
      "Prices update automatically so your feed always shows the latest.",
    usage: [
      "Add symbols from the Settings tab to start tracking.",
      "Prices update automatically when connected.",
      "Click any symbol to view its chart on Google Finance.",
    ],
  },
  FeedTab: FinanceFeedTab,
};

// ── Types ────────────────────────────────────────────────────────

type DirectionFilter = "all" | "gainers" | "losers";
type SortKey = "alpha" | "price" | "change" | "updated";

const DIRECTION_OPTIONS: { value: DirectionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "gainers", label: "Gainers" },
  { value: "losers", label: "Losers" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "alpha", label: "A–Z" },
  { value: "price", label: "Price" },
  { value: "change", label: "% Change" },
  { value: "updated", label: "Last Updated" },
];

// ── FeedTab ──────────────────────────────────────────────────────

function FinanceFeedTab({ mode, feedContext, onConfigure }: FeedTabProps) {
  const { prefs } = useShell();
  const dp = prefs.channelDisplay.finance;

  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const { data: catalog } = useQuery(financeCatalogOptions());

  const trades = useMemo(
    () => (dashboard?.data?.finance as Trade[] | undefined) ?? [],
    [dashboard?.data?.finance],
  );

  // Symbol → category lookup from the catalog
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    if (catalog) {
      for (const sym of catalog) {
        if (sym.category) {
          map.set(sym.symbol, sym.category);
        }
      }
    }
    return map;
  }, [catalog]);

  // Derive categories with counts from current trades
  const categoryList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const trade of trades) {
      const cat = categoryMap.get(trade.symbol);
      if (cat) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [trades, categoryMap]);

  // ── Filter / sort state ──────────────────────────────────────
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>(() => dp.defaultSort ?? "alpha");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const clearCategories = useCallback(() => setSelectedCategories(new Set()), []);

  const clearAllFilters = useCallback(() => {
    setDirectionFilter("all");
    setSelectedCategories(new Set());
  }, []);

  const hasFilters = directionFilter !== "all" || selectedCategories.size > 0;

  // ── Data pipeline ────────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = trades;

    // Direction filter
    if (directionFilter === "gainers") {
      items = items.filter((t) => {
        const pct = typeof t.percentage_change === "string"
          ? parseFloat(t.percentage_change)
          : (t.percentage_change ?? 0);
        return pct > 0;
      });
    } else if (directionFilter === "losers") {
      items = items.filter((t) => {
        const pct = typeof t.percentage_change === "string"
          ? parseFloat(t.percentage_change)
          : (t.percentage_change ?? 0);
        return pct < 0;
      });
    }

    // Category filter
    if (selectedCategories.size > 0) {
      items = items.filter((t) => {
        const cat = categoryMap.get(t.symbol);
        return cat != null && selectedCategories.has(cat);
      });
    }

    // Sort
    items = [...items].sort((a, b) => {
      switch (sortKey) {
        case "alpha":
          return a.symbol.localeCompare(b.symbol);
        case "price": {
          const ap = typeof a.price === "string" ? parseFloat(a.price) : a.price;
          const bp = typeof b.price === "string" ? parseFloat(b.price) : b.price;
          return bp - ap; // highest first
        }
        case "change": {
          const ac = typeof a.percentage_change === "string"
            ? parseFloat(a.percentage_change)
            : (a.percentage_change ?? 0);
          const bc = typeof b.percentage_change === "string"
            ? parseFloat(b.percentage_change)
            : (b.percentage_change ?? 0);
          return bc - ac; // biggest gain first, biggest loss last
        }
        case "updated": {
          const at = a.last_updated ?? "";
          const bt = b.last_updated ?? "";
          return bt.localeCompare(at); // most recent first
        }
        default:
          return 0;
      }
    });

    return items;
  }, [trades, directionFilter, selectedCategories, categoryMap, sortKey]);

  // ── Summary counts ───────────────────────────────────────────
  const { upCount, downCount, unchangedCount } = useMemo(() => {
    let up = 0;
    let down = 0;
    let unchanged = 0;
    for (const t of filtered) {
      if (t.direction === "up") up++;
      else if (t.direction === "down") down++;
      else unchanged++;
    }
    return { upCount: up, downCount: down, unchangedCount: unchanged };
  }, [filtered]);

  // ── Empty state (no data at all) ─────────────────────────────
  if (trades.length === 0) {
    return (
      <EmptyChannelState
        icon={TrendingUp}
        noun="stocks or crypto"
        hasConfig={!!feedContext.__hasConfig}
        dashboardLoaded={!!feedContext.__dashboardLoaded}
        loadingNoun="prices"
        actionHint="choose what to track"
        onConfigure={onConfigure}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="sticky top-0 z-20 bg-surface border-b border-edge/30 px-3 py-2 flex items-center gap-2">
        {/* Direction filter pills — left side */}
        <div className="flex gap-1">
          {DIRECTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDirectionFilter(opt.value)}
              className={clsx(
                "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer",
                directionFilter === opt.value
                  ? "bg-accent/15 text-accent"
                  : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sort + category filter — right side */}
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-surface-2 border border-edge/40 rounded-md px-2 py-1.5 text-[11px] text-fg-2 cursor-pointer outline-none focus:border-accent/60"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {categoryList.length > 0 && (
            <CategoryFilter
              categories={categoryList}
              selected={selectedCategories}
              onToggle={toggleCategory}
              onClearAll={clearCategories}
              alignRight
            />
          )}
        </div>
      </div>

      {/* Filter chips */}
      {selectedCategories.size > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border-b border-edge/30 flex-wrap">
          {Array.from(selectedCategories).map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] hover:bg-accent/25 transition-colors cursor-pointer"
            >
              <span className="truncate max-w-[120px]">{cat}</span>
              <span className="text-accent/60">&times;</span>
            </button>
          ))}
          <button
            onClick={clearCategories}
            className="px-2 py-0.5 text-[10px] text-fg-3 hover:text-fg-3 transition-colors cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="px-3 py-1 bg-surface border-b border-edge/30 font-mono text-[10px] tabular-nums flex items-center gap-1.5">
          <span className="text-fg-3">{filtered.length} symbols</span>
          <span className="text-fg-3">&middot;</span>
          <span className="text-up">{upCount} up</span>
          <span className="text-fg-3">&middot;</span>
          <span className="text-down">{downCount} down</span>
          {unchangedCount > 0 && (
            <>
              <span className="text-fg-3">&middot;</span>
              <span className="text-fg-3">{unchangedCount} unchanged</span>
            </>
          )}
        </div>
      )}

      {/* Trade grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-[12px] text-fg-3">No symbols match your filters</p>
          <button
            onClick={clearAllFilters}
            className="px-3 py-1.5 rounded-md text-[11px] font-medium text-accent bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div
          className={clsx(
            "grid gap-px bg-edge",
            mode === "compact"
              ? "grid-cols-1"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
          )}
        >
          {filtered.map((trade) => (
            <TradeItem
              key={trade.symbol}
              trade={trade}
              mode={mode}
              display={dp}
              category={categoryMap.get(trade.symbol)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── TradeItem ────────────────────────────────────────────────────

interface TradeItemProps {
  trade: Trade;
  mode: "comfort" | "compact";
  display: FinanceDisplayPrefs;
  category?: string;
}

const TradeItem = memo(function TradeItem({ trade, mode, display, category }: TradeItemProps) {
  const isUp = trade.direction === "up";
  const isDown = trade.direction === "down";

  // Track previous price for flash animation
  const prevPriceRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const currentPrice =
      typeof trade.price === "string" ? parseFloat(trade.price) : trade.price;
    const prevPrice = prevPriceRef.current;

    if (
      prevPrice !== null &&
      !isNaN(currentPrice) &&
      currentPrice !== prevPrice
    ) {
      setFlash(currentPrice > prevPrice ? "up" : "down");
      const timer = setTimeout(() => setFlash(null), 800);
      return () => clearTimeout(timer);
    }

    prevPriceRef.current = currentPrice;
  }, [trade.price]);

  // Keep ref in sync after flash logic
  useEffect(() => {
    const currentPrice =
      typeof trade.price === "string" ? parseFloat(trade.price) : trade.price;
    prevPriceRef.current = currentPrice;
  }, [trade.price]);

  const dirColor = isUp ? "text-up" : isDown ? "text-down" : "text-fg-3";

  if (mode === "compact") {
    return (
      <a
        href={trade.link}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          "flex items-center gap-2 px-3 py-1.5 bg-surface text-xs font-mono transition-colors duration-700 hover:bg-surface-hover",
          flash === "up" && "bg-up/8",
          flash === "down" && "bg-down/8",
        )}
      >
        <span className="font-bold text-fg min-w-[52px] tracking-wide">
          {trade.symbol}
        </span>
        <span className="text-fg-2 tabular-nums">
          {formatPrice(trade.price)}
        </span>
        {display.showChange && (
          <span className={clsx("tabular-nums", dirColor)}>
            {formatChange(trade.percentage_change)}
          </span>
        )}
      </a>
    );
  }

  // Comfort mode
  return (
    <a
      href={trade.link}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        "flex items-center justify-between px-3 py-2 bg-surface transition-colors duration-700 hover:bg-surface-hover border-l-2",
        flash === "up" && "bg-up/6",
        flash === "down" && "bg-down/6",
        isUp && "border-l-up/40",
        isDown && "border-l-down/40",
        !isUp && !isDown && "border-l-transparent",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-mono font-bold text-sm text-fg tracking-wide">
          {trade.symbol}
        </span>
        {category && (
          <span className="bg-[#22c55e]/10 text-fg-3 text-[9px] font-medium rounded px-1.5 py-px w-fit">
            {category}
          </span>
        )}
        {display.showPrevClose && trade.previous_close != null && Number(trade.previous_close) > 0 && (
          <span className="text-[10px] font-mono text-fg-3 tabular-nums">
            Prev close {formatPrice(trade.previous_close)}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm font-mono font-medium text-fg tabular-nums">
          {formatPrice(trade.price)}
        </span>
        <div className="flex items-center gap-2">
          {display.showChange && (
            <span
              className={clsx(
                "text-[11px] font-mono font-medium tabular-nums",
                dirColor,
              )}
            >
              {formatChange(trade.percentage_change)}
            </span>
          )}
          {display.showLastUpdated && trade.last_updated && (
            <span className="text-[9px] font-mono text-fg-3 tabular-nums">
              {timeAgo(trade.last_updated, { includeSeconds: true })}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}, (prev, next) =>
  prev.mode === next.mode &&
  prev.display === next.display &&
  prev.category === next.category &&
  prev.trade.symbol === next.trade.symbol &&
  prev.trade.price === next.trade.price &&
  prev.trade.percentage_change === next.trade.percentage_change &&
  prev.trade.direction === next.trade.direction &&
  prev.trade.previous_close === next.trade.previous_close &&
  prev.trade.last_updated === next.trade.last_updated
);
