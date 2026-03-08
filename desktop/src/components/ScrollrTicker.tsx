import { useMemo } from "react";
import { Ticker } from "motion-plus/react";
import type { DashboardResponse, Trade, Game, RssItem } from "~/utils/types";
import TradeChip from "./chips/TradeChip";
import GameChip from "./chips/GameChip";
import RssChip from "./chips/RssChip";
import FantasyChip from "./chips/FantasyChip";

// ── Types ────────────────────────────────────────────────────────

interface ScrollrTickerProps {
  dashboard: DashboardResponse | null;
  activeTabs: string[];
  onChipClick?: (channelType: string, itemId: string | number) => void;
}

// ── Helpers ──────────────────────────────────────────────────────

function getItemId(item: Record<string, unknown>): string | number {
  return (item.id as string | number) ?? (item.symbol as string) ?? 0;
}

// ── Component ────────────────────────────────────────────────────

export default function ScrollrTicker({
  dashboard,
  activeTabs,
  onChipClick,
}: ScrollrTickerProps) {
  // Build a unified chip array from all active channels' data.
  // Each chip is a React node keyed by channel + item identity.
  const chips = useMemo(() => {
    if (!dashboard?.data) return [];

    const items: React.ReactNode[] = [];

    for (const tab of activeTabs) {
      const data = dashboard.data[tab];
      if (!Array.isArray(data) || data.length === 0) continue;

      switch (tab) {
        case "finance":
          for (const trade of data as Trade[]) {
            items.push(
              <TradeChip
                key={`fin-${trade.symbol}`}
                trade={trade}
                onClick={() => onChipClick?.("finance", trade.symbol)}
              />
            );
          }
          break;

        case "sports":
          for (const game of data as Game[]) {
            items.push(
              <GameChip
                key={`spo-${game.id}`}
                game={game}
                onClick={() => onChipClick?.("sports", game.id)}
              />
            );
          }
          break;

        case "rss":
          for (const item of data as RssItem[]) {
            items.push(
              <RssChip
                key={`rss-${item.id}`}
                item={item}
                onClick={() => onChipClick?.("rss", item.id)}
              />
            );
          }
          break;

        default: {
          // Fantasy or future channels — generic chip
          const records = data as Record<string, unknown>[];
          for (const item of records) {
            const id = getItemId(item);
            items.push(
              <FantasyChip
                key={`${tab}-${id}`}
                item={item}
                onClick={() => onChipClick?.(tab, id)}
              />
            );
          }
          break;
        }
      }
    }

    return items;
  }, [dashboard, activeTabs, onChipClick]);

  if (chips.length === 0) return null;

  return (
    <div className="ticker-container h-7 bg-surface border-b border-edge flex-shrink-0 overflow-hidden relative">
      <Ticker items={chips} velocity={-40} hoverFactor={0.3} gap={6} />
      {/* Fade masks */}
      <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent pointer-events-none z-10" />
    </div>
  );
}
