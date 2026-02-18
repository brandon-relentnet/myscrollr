import { useMemo, useCallback } from "react";
import { clsx } from "clsx";
import type { Trade } from "~/utils/types";
import type { FeedTabProps, ChannelManifest } from "~/channels/types";
import { useScrollrCDC } from "~/channels/hooks/useScrollrCDC";
import TradeItem from "./TradeItem";

/** Extract initial trades from the dashboard response stored in channelConfig. */
function getInitialTrades(config: Record<string, unknown>): Trade[] {
  const items = config.__initialItems as Trade[] | undefined;
  return items ?? [];
}

export const financeChannel: ChannelManifest = {
  id: "finance",
  name: "Finance",
  tabLabel: "Finance",
  tier: "official",
  FeedTab: FinanceFeedTab,
};

export default function FinanceFeedTab({ mode, channelConfig }: FeedTabProps) {
  const initialItems = useMemo(
    () => getInitialTrades(channelConfig),
    [channelConfig],
  );

  const keyOf = useCallback((t: Trade) => t.symbol, []);
  const validate = useCallback(
    (record: Record<string, unknown>) => typeof record.symbol === "string",
    [],
  );

  const { items: trades } = useScrollrCDC<Trade>({
    table: "trades",
    initialItems,
    keyOf,
    validate,
  });

  return (
    <div
      className={clsx(
        "grid gap-px bg-edge",
        mode === "compact"
          ? "grid-cols-1"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      )}
    >
      {trades.length === 0 && (
        <div className="col-span-full text-center py-8 text-fg-3 text-xs font-mono">
          {channelConfig.__dashboardLoaded && initialItems.length === 0
            ? "No symbols selected \u2014 configure on myscrollr.com"
            : "Waiting for trade data\u2026"}
        </div>
      )}
      {trades.map((trade) => (
        <TradeItem key={trade.symbol} trade={trade} mode={mode} />
      ))}
    </div>
  );
}
