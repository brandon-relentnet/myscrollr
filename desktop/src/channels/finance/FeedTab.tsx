/**
 * Finance FeedTab — desktop-native.
 *
 * Renders a grid of trade cards with real-time price updates
 * via the desktop CDC/SSE pipeline. Supports compact and comfort
 * display modes with price flash animations on change.
 */
import { memo, useMemo, useRef, useEffect, useState } from "react";
import { clsx } from "clsx";
import { TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { dashboardQueryOptions } from "../../api/queries";
import { formatPrice, formatChange, timeAgo } from "../../utils/format";
import EmptyChannelState from "../../components/EmptyChannelState";
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

// ── FeedTab ──────────────────────────────────────────────────────

function FinanceFeedTab({ mode, feedContext, onConfigure }: FeedTabProps) {
  const { prefs } = useShell();
  const dp = prefs.channelDisplay.finance;

  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const trades = useMemo(
    () => (dashboard?.data?.finance as Trade[] | undefined) ?? [],
    [dashboard?.data?.finance],
  );

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
        <EmptyChannelState
          icon={TrendingUp}
          noun="stocks or crypto"
          hasConfig={!!feedContext.__hasConfig}
          dashboardLoaded={!!feedContext.__dashboardLoaded}
          loadingNoun="prices"
          actionHint="choose what to track"
          onConfigure={onConfigure}
        />
      )}
      {trades.map((trade) => (
        <TradeItem key={trade.symbol} trade={trade} mode={mode} display={dp} />
      ))}
    </div>
  );
}

// ── TradeItem ────────────────────────────────────────────────────

interface TradeItemProps {
  trade: Trade;
  mode: "comfort" | "compact";
  display: FinanceDisplayPrefs;
}

const TradeItem = memo(function TradeItem({ trade, mode, display }: TradeItemProps) {
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
            <span className="text-[9px] font-mono text-fg-4 tabular-nums">
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
  prev.trade.symbol === next.trade.symbol &&
  prev.trade.price === next.trade.price &&
  prev.trade.percentage_change === next.trade.percentage_change &&
  prev.trade.direction === next.trade.direction &&
  prev.trade.previous_close === next.trade.previous_close &&
  prev.trade.last_updated === next.trade.last_updated
);
