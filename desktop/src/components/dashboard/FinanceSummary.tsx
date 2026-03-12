/**
 * FinanceSummary — dashboard card content for the Finance channel.
 *
 * Shows top movers with price + percentage change, up/down ratio.
 * Respects per-card display preferences from the dashboard editor.
 */
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import clsx from "clsx";
import type { Trade, DashboardResponse } from "../../types";
import type { FinanceCardPrefs } from "./dashboardPrefs";

interface FinanceSummaryProps {
  dashboard: DashboardResponse | undefined;
  prefs: FinanceCardPrefs;
}

export default function FinanceSummary({ dashboard, prefs }: FinanceSummaryProps) {
  const initialItems = (dashboard?.data?.finance ?? []) as Trade[];
  const { items } = useScrollrCDC<Trade>({
    table: "trades",
    initialItems,
    keyOf: (t) => t.symbol,
    maxItems: 50,
  });

  if (items.length === 0) {
    return (
      <p className="text-[11px] text-fg-4 italic py-1">
        No stocks added yet
      </p>
    );
  }

  const upCount = items.filter((t) => t.direction === "up").length;
  const downCount = items.filter((t) => t.direction === "down").length;

  // Show top N by absolute percentage change
  const sorted = [...items]
    .sort((a, b) => {
      const aVal = Math.abs(Number(a.percentage_change) || 0);
      const bVal = Math.abs(Number(b.percentage_change) || 0);
      return bVal - aVal;
    })
    .slice(0, prefs.itemCount);

  return (
    <div className="space-y-1.5">
      {prefs.topMovers &&
        sorted.map((trade) => {
          const pct = Number(trade.percentage_change) || 0;
          const isUp = trade.direction === "up" || pct > 0;
          return (
            <div key={trade.symbol} className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold text-fg-2 truncate">
                {trade.symbol}
              </span>
              <div className="flex items-center gap-2">
                {prefs.showPrice && (
                  <span className="text-[11px] font-mono text-fg-3 tabular-nums">
                    ${Number(trade.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
                {prefs.showChange && (
                  <span
                    className={clsx(
                      "text-[10px] font-mono font-semibold tabular-nums",
                      isUp ? "text-up" : "text-down",
                    )}
                  >
                    {isUp ? "+" : ""}{pct.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}

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
