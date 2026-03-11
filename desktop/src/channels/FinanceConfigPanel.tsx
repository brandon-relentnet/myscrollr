import { useEffect, useState, useCallback } from "react";
import { TrendingUp } from "lucide-react";
import { Section, DisplayRow } from "../components/settings/SettingsControls";
import { CatalogBrowser } from "../components/settings/CatalogBrowser";
import { SelectedItems } from "../components/settings/SelectedItems";
import { fetch } from "@tauri-apps/plugin-http";
import { channelsApi, API_BASE } from "../api/client";
import type { Channel } from "../api/client";

// ── Types ────────────────────────────────────────────────────────

interface TrackedSymbol {
  symbol: string;
  name: string;
  category: string;
}

interface FinanceChannelConfig {
  symbols?: string[];
}

interface FinanceConfigPanelProps {
  channel: Channel;
  getToken: () => Promise<string | null>;
  onChannelUpdate: (updated: Channel) => void;
  subscriptionTier: string;
  connected: boolean;
  hex: string;
}

// ── Component ────────────────────────────────────────────────────

export default function FinanceConfigPanel({
  channel,
  getToken,
  onChannelUpdate,
  subscriptionTier,
  connected,
  hex,
}: FinanceConfigPanelProps) {
  const isUnlimited = subscriptionTier === "uplink_unlimited";
  const isUplink = subscriptionTier === "uplink" || isUnlimited;

  const [catalog, setCatalog] = useState<TrackedSymbol[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
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

  // Fetch catalog
  useEffect(() => {
    fetch(`${API_BASE}/finance/symbols`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json() as Promise<TrackedSymbol[]>;
      })
      .then(setCatalog)
      .catch(() => setCatalogError(true))
      .finally(() => setCatalogLoading(false));
  }, []);

  const nameMap = new Map(catalog.map((s) => [s.symbol, s.name]));

  const updateSymbols = useCallback(
    async (next: string[]) => {
      setSaving(true);
      try {
        const updated = await channelsApi.update(
          "finance",
          { config: { symbols: next } },
          getToken,
        );
        onChannelUpdate(updated);
      } catch {
        setError("Failed to save symbol changes");
      } finally {
        setSaving(false);
      }
    },
    [getToken, onChannelUpdate],
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

  const delivery = isUnlimited
    ? "Real-time SSE"
    : isUplink
      ? "Poll 30s"
      : "Poll 60s";

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: `${hex}15`,
            boxShadow: `0 0 15px ${hex}15, 0 0 0 1px ${hex}20`,
          }}
        >
          <TrendingUp size={16} style={{ color: hex }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">Finance</h2>
          <p className="text-[11px] text-fg-4">
            Real-time market data via TwelveData
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mb-4 flex items-center justify-between px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-error text-[12px]">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="p-0.5 hover:bg-error/10 rounded cursor-pointer"
          >
            <TrendingUp size={12} />
          </button>
        </div>
      )}

      {/* Status */}
      <Section title="Status">
        <DisplayRow label="Your Symbols" value={String(symbols.length)} />
        <DisplayRow label="Available" value={String(catalog.length)} />
        <DisplayRow label="Delivery" value={delivery} />
        <DisplayRow
          label="Connection"
          value={isUnlimited ? (connected ? "Live" : "Offline") : "Polling"}
        />
      </Section>

      {/* Selected symbols */}
      <SelectedItems
        title={`Your Symbols`}
        items={symbols}
        getKey={(s) => s}
        renderChip={(sym) => (
          <div className="min-w-0">
            <span className="text-[12px] font-bold font-mono text-fg-2">
              {sym}
            </span>
            {nameMap.has(sym) && (
              <span className="text-[11px] text-fg-4 ml-1.5">
                {nameMap.get(sym)}
              </span>
            )}
          </div>
        )}
        onRemove={removeSymbol}
        onClearAll={() => updateSymbols([])}
        hex={hex}
        emptyIcon={<TrendingUp size={24} />}
        emptyMessage="No symbols selected — browse the catalog below"
        saving={saving}
      />

      {/* Catalog browser */}
      <CatalogBrowser
        title="Symbol Catalog"
        items={catalog}
        getKey={(s) => s.symbol}
        selectedKeys={symbolSet}
        getCategory={(s) => s.category}
        matchesSearch={(s, q) => {
          const lower = q.toLowerCase();
          return (
            s.symbol.toLowerCase().includes(lower) ||
            s.name.toLowerCase().includes(lower)
          );
        }}
        renderItem={(item, isAdded) => (
          <>
            <div className="min-w-0 mr-2">
              <div className="text-[12px] font-bold font-mono text-fg-2">
                {item.symbol}
              </div>
              <div className="text-[11px] text-fg-4 truncate">{item.name}</div>
            </div>
            <span
              className="text-[10px] font-medium shrink-0"
              style={isAdded ? { color: hex } : undefined}
            >
              {isAdded ? "Added" : "+ Add"}
            </span>
          </>
        )}
        hex={hex}
        searchPlaceholder="Search by ticker or company name..."
        saving={saving}
        loading={catalogLoading}
        error={catalogError}
        onAdd={addSymbol}
        onRemove={removeSymbol}
        onBulkAdd={(keys) => updateSymbols([...symbols, ...keys])}
        onBulkRemove={(keys) => {
          const toRemove = new Set(keys);
          updateSymbols(symbols.filter((s) => !toRemove.has(s)));
        }}
      />
    </div>
  );
}
