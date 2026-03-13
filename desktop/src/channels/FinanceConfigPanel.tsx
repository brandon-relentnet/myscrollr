import { useState, useCallback, useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SetupBrowser } from "../components/settings/SetupBrowser";
import { channelsApi } from "../api/client";
import { financeCatalogOptions, queryKeys } from "../api/queries";
import type { TrackedSymbol } from "../api/queries";
import type { Channel } from "../api/client";

// ── Types ────────────────────────────────────────────────────────

interface FinanceChannelConfig {
  symbols?: string[];
}

interface FinanceConfigPanelProps {
  channel: Channel;
  subscriptionTier: string;
  connected: boolean;
  hex: string;
}

// ── Popular symbols — shown as quick-add chips ───────────────────

const POPULAR_SYMBOLS = [
  "AAPL",
  "MSFT",
  "GOOG",
  "AMZN",
  "TSLA",
  "META",
  "NVDA",
  "AMD",
  "NFLX",
  "DIS",
  "BTC/USD",
  "ETH/USD",
];

// ── Component ────────────────────────────────────────────────────

export default function FinanceConfigPanel({
  channel,
  hex,
}: FinanceConfigPanelProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [hidePopular, setHidePopular] = useState(
    () => localStorage.getItem("scrollr:hidePopular") === "1",
  );

  const config = channel.config as FinanceChannelConfig;
  const symbols = Array.isArray(config?.symbols) ? config.symbols : [];
  const symbolSet = useMemo(() => new Set(symbols), [symbols]);

  // ── Catalog query ──────────────────────────────────────────────
  const {
    data: catalog = [],
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery(financeCatalogOptions());

  const nameMap = useMemo(
    () => new Map(catalog.map((s) => [s.symbol, s.name])),
    [catalog],
  );

  // Auto-dismiss errors
  useState(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  });

  // ── Update mutation ────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (nextSymbols: string[]) =>
      channelsApi.update("finance", { config: { symbols: nextSymbols } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    onError: () => {
      setError("Failed to save — try again");
    },
  });

  const updateSymbols = useCallback(
    (next: string[]) => updateMutation.mutate(next),
    [updateMutation],
  );

  const addSymbol = useCallback(
    (sym: string) => {
      if (symbolSet.has(sym)) return;
      updateSymbols([...symbols, sym]);
    },
    [symbols, symbolSet, updateSymbols],
  );

  const removeSymbol = useCallback(
    (sym: string) => {
      updateSymbols(symbols.filter((s) => s !== sym));
    },
    [symbols, updateSymbols],
  );

  // Popular symbols that exist in the catalog
  const popularItems = useMemo(
    () =>
      POPULAR_SYMBOLS.filter((sym) => catalog.some((s) => s.symbol === sym)),
    [catalog],
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      <SetupBrowser
        title="Finance"
        subtitle="Stocks, ETFs, and crypto prices"
        icon={TrendingUp}
        hex={hex}
        items={catalog}
        selectedKeys={symbolSet}
        getKey={(s: TrackedSymbol) => s.symbol}
        getCategory={(s: TrackedSymbol) => s.category}
        matchesSearch={(s: TrackedSymbol, q: string) => {
          const lower = q.toLowerCase();
          return (
            s.symbol.toLowerCase().includes(lower) ||
            s.name.toLowerCase().includes(lower)
          );
        }}
        renderItem={(item: TrackedSymbol, isSelected: boolean) => (
          <>
            <div className="min-w-0 mr-2">
              <span className="text-[12px] font-bold font-mono text-fg-2">
                {item.symbol}
              </span>
              <span className="text-[11px] text-fg-4 ml-2 truncate">
                {item.name}
              </span>
            </div>
            <span
              className="text-[10px] font-medium shrink-0"
              style={isSelected ? { color: hex } : undefined}
            >
              {isSelected ? "✓ Added" : "+ Add"}
            </span>
          </>
        )}
        searchPlaceholder="Search by ticker or company name..."
        renderBeforeList={() => (
          <PopularPicks
            symbols={popularItems}
            selectedKeys={symbolSet}
            nameMap={nameMap}
            hex={hex}
            onAdd={addSymbol}
            onRemove={removeSymbol}
            saving={updateMutation.isPending}
            hidden={hidePopular}
            onToggleHidden={(hidden) => {
              setHidePopular(hidden);
              localStorage.setItem("scrollr:hidePopular", hidden ? "1" : "0");
            }}
          />
        )}
        error={error}
        onDismissError={() => setError(null)}
        loading={catalogLoading}
        catalogError={catalogError}
        saving={updateMutation.isPending}
        onAdd={addSymbol}
        onRemove={removeSymbol}
        onBulkAdd={(keys: string[]) => updateSymbols([...symbols, ...keys])}
        onBulkRemove={(keys: string[]) => {
          const toRemove = new Set(keys);
          updateSymbols(symbols.filter((s) => !toRemove.has(s)));
        }}
        onClearAll={() => updateSymbols([])}
      />
    </div>
  );
}

// ── Popular Picks ────────────────────────────────────────────────

interface PopularPicksProps {
  symbols: string[];
  selectedKeys: Set<string>;
  nameMap: Map<string, string>;
  hex: string;
  onAdd: (sym: string) => void;
  onRemove: (sym: string) => void;
  saving: boolean;
  hidden: boolean;
  onToggleHidden: (hidden: boolean) => void;
}

function PopularPicks({
  symbols,
  selectedKeys,
  nameMap,
  hex,
  onAdd,
  onRemove,
  saving,
  hidden,
  onToggleHidden,
}: PopularPicksProps) {
  if (symbols.length === 0) return null;

  if (hidden) {
    return (
      <div className="flex justify-end">
        <button
          onClick={() => onToggleHidden(false)}
          className="text-[10px] text-fg-4 hover:text-fg-3 transition-colors cursor-pointer"
        >
          Show suggestions
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-wider font-bold text-fg-4">
          Popular
        </h3>
        <button
          onClick={() => onToggleHidden(true)}
          className="text-[10px] text-fg-4 hover:text-fg-3 transition-colors cursor-pointer"
        >
          Hide
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {symbols.map((sym) => {
          const isSelected = selectedKeys.has(sym);
          return (
            <button
              key={sym}
              onClick={() => (isSelected ? onRemove(sym) : onAdd(sym))}
              disabled={saving}
              className={clsx(
                "flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[11px] transition-colors cursor-pointer disabled:opacity-30",
                isSelected
                  ? "border-accent/25 bg-accent/5"
                  : "bg-base-250/30 border-edge/20 hover:border-edge/40 hover:bg-base-250/50",
              )}
            >
              <span className="font-mono font-bold text-fg-2">{sym}</span>
              {nameMap.has(sym) && (
                <span className="text-[10px] text-fg-4 hidden sm:inline">
                  {nameMap.get(sym)}
                </span>
              )}
              <span
                className="text-[10px] font-medium shrink-0"
                style={isSelected ? { color: hex } : undefined}
              >
                {isSelected ? "✓" : "+"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
