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
  /** Scroll speed in px/sec (default 40) */
  speed?: number;
  /** Gap between chips in px (default 8) */
  gap?: number;
  /** Whether hovering slows the ticker (default true) */
  pauseOnHover?: boolean;
  /** Speed multiplier on hover, 0 = full pause (default 0.3) */
  hoverSpeed?: number;
  /** Show 2-row comfort chips with extra detail */
  comfort?: boolean;
  /** Which row this ticker represents (0-indexed, for multi-row splitting) */
  rowIndex?: number;
  /** Total number of ticker rows (items distributed round-robin) */
  totalRows?: number;
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
  speed = 40,
  gap = 8,
  pauseOnHover = true,
  hoverSpeed = 0.3,
  comfort = false,
  rowIndex = 0,
  totalRows = 1,
}: ScrollrTickerProps) {
  // Build a unified chip array from all active channels' data.
  // When totalRows > 1, items are distributed round-robin across rows.
  const chips = useMemo(() => {
    if (!dashboard?.data) return [];

    const allItems: React.ReactNode[] = [];

    for (const tab of activeTabs) {
      const data = dashboard.data[tab];
      if (!Array.isArray(data) || data.length === 0) continue;

      // Wrap each chip in a vertical padding container so the chip
      // (including its border) sits safely inside the Ticker's clip
      // boundary, regardless of how motion-plus handles overflow.
      const wrap = (key: string, chip: React.ReactNode) => (
        <div key={key} className="py-1">
          {chip}
        </div>
      );

      switch (tab) {
        case "finance":
          for (const trade of data as Trade[]) {
            allItems.push(
              wrap(`fin-${trade.symbol}`,
                <TradeChip
                  trade={trade}
                  comfort={comfort}
                  onClick={() => onChipClick?.("finance", trade.symbol)}
                />
              )
            );
          }
          break;

        case "sports":
          for (const game of data as Game[]) {
            allItems.push(
              wrap(`spo-${game.id}`,
                <GameChip
                  game={game}
                  comfort={comfort}
                  onClick={() => onChipClick?.("sports", game.id)}
                />
              )
            );
          }
          break;

        case "rss":
          for (const item of data as RssItem[]) {
            allItems.push(
              wrap(`rss-${item.id}`,
                <RssChip
                  item={item}
                  comfort={comfort}
                  onClick={() => onChipClick?.("rss", item.id)}
                />
              )
            );
          }
          break;

        default: {
          // Fantasy or future channels — generic chip
          const records = data as Record<string, unknown>[];
          for (const item of records) {
            const id = getItemId(item);
            allItems.push(
              wrap(`${tab}-${id}`,
                <FantasyChip
                  item={item}
                  comfort={comfort}
                  onClick={() => onChipClick?.(tab, id)}
                />
              )
            );
          }
          break;
        }
      }
    }

    // When multiple rows, distribute items round-robin
    if (totalRows <= 1) return allItems;
    return allItems.filter((_, i) => i % totalRows === rowIndex);
  }, [dashboard, activeTabs, onChipClick, comfort, rowIndex, totalRows]);

  if (chips.length === 0) return null;

  return (
    <div className={`ticker-container ${comfort ? "h-16" : "h-11"} flex items-center bg-base-150 border-b border-edge/50 flex-shrink-0 overflow-hidden relative`}>
      {/* Top accent line — matches the website's card accent pattern */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent z-10" />
      <Ticker
        items={chips}
        velocity={-speed}
        hoverFactor={pauseOnHover ? hoverSpeed : 1}
        gap={gap}
        fade="10%"
      />
    </div>
  );
}
