import { useState, useMemo } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import Tooltip from "../../components/Tooltip";
import UpgradePrompt from "../../components/UpgradePrompt";
import { formatPrice, formatChange } from "../../utils/format";
import type { TrackedSymbol } from "../../api/queries";
import type { Trade } from "../../types";
import type { SubscriptionTier } from "../../auth";

// ── Types ────────────────────────────────────────────────────────

interface MyWatchlistProps {
  symbols: string[];
  catalog: TrackedSymbol[];
  trades: Trade[];
  onRemove: (symbol: string) => void;
  symbolCount: number;
  maxSymbols: number;
  subscriptionTier: SubscriptionTier;
  saving: boolean;
}

type SortKey = "name" | "price" | "change" | "category";

// ── Component ────────────────────────────────────────────────────

export default function MyWatchlist({
  symbols,
  catalog,
  trades,
  onRemove,
  symbolCount,
  maxSymbols,
  subscriptionTier,
  saving,
}: MyWatchlistProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const catalogMap = useMemo(
    () => new Map(catalog.map((s) => [s.symbol, s])),
    [catalog],
  );

  const tradeMap = useMemo(
    () => new Map(trades.map((t) => [t.symbol, t])),
    [trades],
  );

  const atLimit = symbolCount >= maxSymbols;

  // Filter + sort symbols
  const sortedSymbols = useMemo(() => {
    let list = symbols;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((sym) => {
        const entry = catalogMap.get(sym);
        return (
          sym.toLowerCase().includes(q) ||
          entry?.name?.toLowerCase().includes(q) ||
          entry?.category?.toLowerCase().includes(q)
        );
      });
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.localeCompare(b);
        case "price": {
          const aPrice = parseFloat(String(tradeMap.get(a)?.price ?? 0));
          const bPrice = parseFloat(String(tradeMap.get(b)?.price ?? 0));
          return bPrice - aPrice;
        }
        case "change": {
          const aChange = parseFloat(
            String(tradeMap.get(a)?.percentage_change ?? 0),
          );
          const bChange = parseFloat(
            String(tradeMap.get(b)?.percentage_change ?? 0),
          );
          return bChange - aChange;
        }
        case "category": {
          const aCat = catalogMap.get(a)?.category ?? "zzz";
          const bCat = catalogMap.get(b)?.category ?? "zzz";
          return aCat.localeCompare(bCat) || a.localeCompare(b);
        }
        default:
          return 0;
      }
    });
  }, [symbols, search, sort, catalogMap, tradeMap]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            My Watchlist
            <span className="bg-[#22c55e]/15 text-[#22c55e] px-1.5 py-px rounded-full text-[11px] font-medium tabular-nums">
              {symbolCount}
            </span>
          </div>
          <p className="text-[11px] text-fg-3 mt-0.5">
            Manage your tracked symbols
          </p>
        </div>
      </div>

      {/* Upgrade prompt when at symbol limit */}
      {atLimit && (
        <UpgradePrompt
          current={symbolCount}
          max={maxSymbols}
          noun="symbols"
          tier={subscriptionTier}
        />
      )}

      {/* Search + Sort controls */}
      {symbols.length > 0 && (
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter symbols..."
            className="flex-1 px-2.5 py-1.5 rounded-md bg-base-200 border border-edge/40 text-[11px] text-fg-2 placeholder:text-fg-3 focus:outline-none focus:border-accent/60 transition-colors"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="px-2.5 py-1.5 rounded-md bg-base-200 border border-edge/40 text-[11px] text-fg-2 focus:outline-none focus:border-accent/60 transition-colors cursor-pointer appearance-none"
          >
            <option value="name">Sort: Name</option>
            <option value="price">Sort: Price</option>
            <option value="change">Sort: Change</option>
            <option value="category">Sort: Category</option>
          </select>
        </div>
      )}

      {/* Symbol list */}
      {sortedSymbols.length > 0 ? (
        <div className="border border-edge/30 rounded-lg overflow-hidden divide-y divide-edge/20">
          {sortedSymbols.map((sym) => {
            const entry = catalogMap.get(sym);
            const trade = tradeMap.get(sym);
            const pctChange = trade?.percentage_change != null
              ? parseFloat(String(trade.percentage_change))
              : null;

            return (
              <div
                key={sym}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-base-200/50 transition-colors"
              >
                {/* Symbol + company name */}
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-mono font-bold text-fg-2 truncate block">
                    {sym}
                  </span>
                  {entry?.name && (
                    <span className="text-[10px] text-fg-3 truncate block">
                      {entry.name}
                    </span>
                  )}
                </div>

                {/* Category badge */}
                <span className="px-1.5 py-px rounded text-[9px] text-fg-3 bg-[#22c55e]/10 shrink-0">
                  {entry?.category ?? ""}
                </span>

                {/* Live price */}
                <span className="text-[11px] font-mono tabular-nums text-fg-2 shrink-0 w-16 text-right">
                  {trade ? formatPrice(trade.price) : "--"}
                </span>

                {/* % change */}
                <span
                  className={clsx(
                    "text-[11px] font-mono tabular-nums shrink-0 w-16 text-right",
                    pctChange != null && pctChange > 0 && "text-up",
                    pctChange != null && pctChange < 0 && "text-down",
                    (pctChange == null || pctChange === 0) && "text-fg-3",
                  )}
                >
                  {trade ? formatChange(trade.percentage_change) : "--"}
                </span>

                {/* Remove button */}
                <Tooltip content="Remove symbol">
                  <button
                    onClick={() => onRemove(sym)}
                    disabled={saving}
                    className="p-1 rounded hover:bg-error/10 text-fg-3 hover:text-error transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                    aria-label={`Remove ${sym}`}
                  >
                    <X size={12} />
                  </button>
                </Tooltip>
              </div>
            );
          })}
        </div>
      ) : symbols.length > 0 ? (
        <p className="text-[11px] text-fg-3 text-center py-4">
          No symbols match your filter
        </p>
      ) : (
        <p className="text-[11px] text-fg-3 text-center py-4">
          No symbols tracked yet. Browse the catalog below to add some.
        </p>
      )}

      {/* Tier limit footer */}
      {symbols.length > 0 && (
        <p className="text-[10px] text-fg-3 text-right tabular-nums">
          {symbolCount} / {maxSymbols === Infinity ? "\u221E" : maxSymbols} symbols
        </p>
      )}
    </div>
  );
}
