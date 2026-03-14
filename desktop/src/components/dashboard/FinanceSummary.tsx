/**
 * FinanceSummary — dashboard card content for the Finance channel.
 *
 * Featured-stock layout: up to 5 primary stocks shown as mini comfort
 * cards (symbol, price, % change, direction border), with remaining
 * stocks as compact clickable badges below. Clicking a badge promotes
 * it to primary (pins it); clicking a pinned primary unpins it.
 *
 * Auto-fills primary slots with top movers by |% change|. Pinned
 * stocks always stay in primary regardless of movement.
 */
import { useState, useMemo, useCallback } from "react";
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import { loadPref, savePref } from "../../preferences";
import clsx from "clsx";
import Tooltip from "../Tooltip";
import { formatPrice, formatChange } from "../../utils/format";
import type { Trade, DashboardResponse } from "../../types";
import type { FinanceCardPrefs } from "./dashboardPrefs";

// ── Pinned stock storage ────────────────────────────────────────

const PINNED_KEY = "dashboard:finance:pinnedStocks";

function loadPinned(): string[] {
  return loadPref<string[]>(PINNED_KEY, []);
}

function savePinnedStocks(pinned: string[]): void {
  savePref(PINNED_KEY, pinned);
}

function absChange(trade: Trade): number {
  const pct = Number(trade.percentage_change) || 0;
  return Math.abs(pct);
}

function isUp(trade: Trade): boolean {
  if (trade.direction === "up") return true;
  if (trade.direction === "down") return false;
  return (Number(trade.percentage_change) || 0) > 0;
}

// ── Primary stock card (mini comfort) ───────────────────────────

interface PrimaryStockProps {
  trade: Trade;
  pinned: boolean;
  prefs: FinanceCardPrefs;
  onUnpin: () => void;
}

function PrimaryStock({ trade, pinned, prefs, onUnpin }: PrimaryStockProps) {
  const up = isUp(trade);
  const pct = Number(trade.percentage_change) || 0;
  const hasMovement = pct !== 0;

  return (
    <div
      className={clsx(
        "group flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors",
        pinned
          ? clsx(
              "border",
              hasMovement && up && "bg-up/5 border-up/15",
              hasMovement && !up && "bg-down/5 border-down/15",
              !hasMovement && "bg-surface-3/30 border-edge/30",
            )
          : clsx(
              "border-l-2 border border-edge/30 bg-surface-3/30",
              hasMovement && up && "border-l-up/50",
              hasMovement && !up && "border-l-down/50",
              !hasMovement && "border-l-transparent",
            ),
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] font-mono font-bold text-fg tracking-wide truncate">
          {trade.symbol}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {prefs.showPrice && (
          <span className="text-[12px] font-mono text-fg-2 tabular-nums">
            {formatPrice(trade.price)}
          </span>
        )}
        {prefs.showChange && pct !== 0 && (
          <span
            className={clsx(
              "text-[11px] font-mono font-semibold tabular-nums",
              up ? "text-up" : "text-down",
            )}
          >
            {formatChange(trade.percentage_change)}
          </span>
        )}
        {pinned && (
          <Tooltip content="Unpin">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnpin();
              }}
              className={clsx(
                "w-4 h-4 flex items-center justify-center rounded-sm",
                "text-[10px] text-fg-4 opacity-0 group-hover:opacity-100",
                "hover:text-fg-2 hover:bg-surface-3/80 transition-all",
              )}
            >
              &#x2715;
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ── Compact stock badge (clickable) ─────────────────────────────

interface CompactBadgeProps {
  trade: Trade;
  onPromote: () => void;
}

function CompactBadge({ trade, onPromote }: CompactBadgeProps) {
  const up = isUp(trade);
  const pct = Number(trade.percentage_change) || 0;

  return (
    <Tooltip content="Click to pin this stock">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPromote();
        }}
        className={clsx(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono",
          "transition-colors shrink-0 cursor-pointer",
          "bg-surface-3/40 hover:bg-surface-3/70 text-fg-3",
        )}
      >
        <span className="font-semibold">{trade.symbol}</span>
        {pct !== 0 && (
          <span
            className={clsx("tabular-nums", up ? "text-up" : "text-down")}
          >
            {formatChange(trade.percentage_change)}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

// ── Component ───────────────────────────────────────────────────

interface FinanceSummaryProps {
  dashboard: DashboardResponse | undefined;
  prefs: FinanceCardPrefs;
  onConfigure?: () => void;
}

export default function FinanceSummary({ dashboard, prefs, onConfigure }: FinanceSummaryProps) {
  const { items } = useScrollrCDC<Trade>({
    table: "trades",
    dataKey: "finance",
    keyOf: (t) => t.symbol,
    maxItems: 50,
  });

  const [pinned, setPinned] = useState<string[]>(loadPinned);

  const handlePin = useCallback(
    (symbol: string) => {
      setPinned((prev) => {
        if (prev.includes(symbol)) return prev;
        // Block if at capacity — user must unpin first
        const activeCount = prev.filter((s) =>
          items.some((t) => t.symbol === s),
        ).length;
        if (activeCount >= prefs.primaryCount) return prev;
        const next = [...prev, symbol];
        savePinnedStocks(next);
        return next;
      });
    },
    [prefs.primaryCount, items],
  );

  const handleUnpin = useCallback((symbol: string) => {
    setPinned((prev) => {
      const next = prev.filter((s) => s !== symbol);
      savePinnedStocks(next);
      return next;
    });
  }, []);

  // Split into primary and compact
  const { primaryTrades, compactTrades } = useMemo(() => {
    // Clean stale pins — only keep symbols that exist in data
    const symbolSet = new Set(items.map((t) => t.symbol));
    const activePins = pinned.filter((s) => symbolSet.has(s));

    // Pinned trades in pin order
    const pinnedTrades = activePins
      .map((s) => items.find((t) => t.symbol === s)!)
      .filter(Boolean);

    // Remaining slots filled by top movers (excluding pinned)
    const pinnedSet = new Set(activePins);
    const unpinned = items.filter((t) => !pinnedSet.has(t.symbol));
    const autoFill = [...unpinned]
      .sort((a, b) => absChange(b) - absChange(a))
      .slice(0, Math.max(0, prefs.primaryCount - pinnedTrades.length));

    const primary = [...pinnedTrades, ...autoFill];
    const primarySet = new Set(primary.map((t) => t.symbol));
    const compact = items
      .filter((t) => !primarySet.has(t.symbol))
      .sort((a, b) => absChange(b) - absChange(a));

    return { primaryTrades: primary, compactTrades: compact };
  }, [items, pinned, prefs.primaryCount]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-1">
        <p className="text-[11px] text-fg-4">No stocks added yet</p>
        {onConfigure && (
          <button
            onClick={onConfigure}
            className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors self-start"
          >
            Add stocks &rarr;
          </button>
        )}
      </div>
    );
  }

  const upCount = items.filter((t) => t.direction === "up").length;
  const downCount = items.filter((t) => t.direction === "down").length;
  const pinnedSet = new Set(pinned);

  return (
    <div className="space-y-2">
      {/* Primary stocks */}
      <div className="space-y-1">
        {primaryTrades.map((trade) => (
          <PrimaryStock
            key={trade.symbol}
            trade={trade}
            pinned={pinnedSet.has(trade.symbol)}
            prefs={prefs}
            onUnpin={() => handleUnpin(trade.symbol)}
          />
        ))}
      </div>

      {/* Compact badges */}
      {prefs.showBadges && compactTrades.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {compactTrades.map((trade) => (
            <CompactBadge
              key={trade.symbol}
              trade={trade}
              onPromote={() => handlePin(trade.symbol)}
            />
          ))}
        </div>
      )}

      {/* Stats footer */}
      {prefs.stats && (
        <div className="flex items-center gap-3 pt-1 border-t border-edge/30">
          <span className="text-[10px] text-fg-4">
            {items.length} symbols
          </span>
          <span className="text-[10px] text-up">{upCount}&#8593;</span>
          <span className="text-[10px] text-down">{downCount}&#8595;</span>
        </div>
      )}
    </div>
  );
}
