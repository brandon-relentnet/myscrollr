import { useMemo } from "react";
import { Ticker } from "motion-plus/react";
import type { DashboardResponse, Trade, Game, RssItem } from "~/utils/types";
import type { MixMode, ChipColorMode } from "../preferences";
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
  /** How items from different channels are ordered */
  mixMode?: MixMode;
  /** Chip color scheme */
  chipColorMode?: ChipColorMode;
  /** Which row this ticker represents (0-indexed, for multi-row splitting) */
  rowIndex?: number;
  /** Total number of ticker rows (items distributed round-robin) */
  totalRows?: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function getItemId(item: Record<string, unknown>): string | number {
  return (item.id as string | number) ?? (item.symbol as string) ?? 0;
}

/** Fisher-Yates shuffle using Math.random(). */
function randomShuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Round-robin interleave across buckets:
 *  bucket0[0], bucket1[0], bucket2[0], bucket0[1], bucket1[1], ... */
function weave<T>(buckets: T[][]): T[] {
  if (buckets.length === 0) return [];
  const result: T[] = [];
  const maxLen = Math.max(...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (i < bucket.length) result.push(bucket[i]);
    }
  }
  return result;
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
  mixMode = "grouped",
  chipColorMode = "channel",
  comfort = false,
  rowIndex = 0,
  totalRows = 1,
}: ScrollrTickerProps) {
  // Build chip arrays per channel, then combine based on mixMode.
  // When totalRows > 1, items are distributed round-robin across rows.
  const chips = useMemo(() => {
    if (!dashboard?.data) return [];

    const wrap = (key: string, chip: React.ReactNode) => (
      <div key={key} className="py-1">
        {chip}
      </div>
    );

    const buckets: React.ReactNode[][] = [];

    for (const tab of activeTabs) {
      const data = dashboard.data[tab];
      if (!Array.isArray(data) || data.length === 0) continue;

      const bucket: React.ReactNode[] = [];

      switch (tab) {
        case "finance":
          for (const trade of data as Trade[]) {
            bucket.push(
              wrap(`fin-${trade.symbol}`,
                <TradeChip
                  trade={trade}
                  comfort={comfort}
                  colorMode={chipColorMode}
                  onClick={() => onChipClick?.("finance", trade.symbol)}
                />
              )
            );
          }
          break;

        case "sports":
          for (const game of data as Game[]) {
            bucket.push(
              wrap(`spo-${game.id}`,
                <GameChip
                  game={game}
                  comfort={comfort}
                  colorMode={chipColorMode}
                  onClick={() => onChipClick?.("sports", game.id)}
                />
              )
            );
          }
          break;

        case "rss":
          for (const item of data as RssItem[]) {
            bucket.push(
              wrap(`rss-${item.id}`,
                <RssChip
                  item={item}
                  comfort={comfort}
                  colorMode={chipColorMode}
                  onClick={() => onChipClick?.("rss", item.id)}
                />
              )
            );
          }
          break;

        default: {
          const records = data as Record<string, unknown>[];
          for (const item of records) {
            const id = getItemId(item);
            bucket.push(
              wrap(`${tab}-${id}`,
                <FantasyChip
                  item={item}
                  comfort={comfort}
                  colorMode={chipColorMode}
                  onClick={() => onChipClick?.(tab, id)}
                />
              )
            );
          }
          break;
        }
      }

      buckets.push(bucket);
    }

    // Combine based on mix mode
    let allItems: React.ReactNode[];
    switch (mixMode) {
      case "weave":
        allItems = weave(buckets);
        break;
      case "random":
        allItems = randomShuffle(buckets.flat());
        break;
      default:
        allItems = buckets.flat();
        break;
    }

    // When multiple rows, distribute items round-robin
    if (totalRows <= 1) return allItems;
    return allItems.filter((_, i) => i % totalRows === rowIndex);
  }, [dashboard, activeTabs, onChipClick, comfort, mixMode, chipColorMode, rowIndex, totalRows]);

  if (chips.length === 0) return null;

  return (
    <div className={`ticker-container ${comfort ? "h-16" : "h-11"} flex items-center bg-base-150 border-b border-edge/50 flex-shrink-0 relative w-full overflow-hidden`}>
      {/* Top accent line — matches the website's card accent pattern */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent z-10" />
      <Ticker
        items={chips}
        velocity={-speed}
        hoverFactor={pauseOnHover ? hoverSpeed : 1}
        gap={gap}
        fade={40}
        style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
      />
    </div>
  );
}
