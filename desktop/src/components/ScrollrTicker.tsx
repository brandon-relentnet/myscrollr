import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { Ticker } from "motion-plus/react";
import { useMotionValue, animate, AnimatePresence, motion } from "motion/react";
import type { DashboardResponse, Trade, Game, RssItem, WidgetTickerData } from "../types";
import type { MixMode, ChipColorMode, TickerDirection, ScrollMode, WidgetPinConfig } from "../preferences";
import TradeChip from "./chips/TradeChip";
import GameChip from "./chips/GameChip";
import { isLive, isCloseGame, isFinal, isPre } from "../utils/gameHelpers";
import RssChip from "./chips/RssChip";
import FantasyChip from "./chips/FantasyChip";
import ConsolidatedChip from "./chips/ConsolidatedChip";

// ── Module-level constants ───────────────────────────────────────

const WIDGET_TYPES = ["clock", "weather", "sysmon", "uptime", "github"] as const;
type WidgetType = (typeof WIDGET_TYPES)[number];

// ── Sport engagement scoring (higher = more prominent in ticker) ─

function gameEngagement(g: Game): number {
  if (isLive(g)) return isCloseGame(g) ? 100 : 80;
  if (g.state === "pre") {
    const until = new Date(g.start_time).getTime() - Date.now();
    if (until < 3_600_000) return 60;  // within 1 hour
    if (until < 86_400_000) return 40; // within 24 hours
    return 20;
  }
  if (g.state === "final") {
    const ago = Date.now() - new Date(g.start_time).getTime();
    if (ago < 7_200_000) return 30; // finished within 2 hours
    return 10;
  }
  return 0;
}

// ── Types ────────────────────────────────────────────────────────

interface ScrollrTickerProps {
  dashboard: DashboardResponse | null;
  activeTabs: string[];
  /** Pre-built widget chip data (clock, weather, sysmon). */
  widgetData?: WidgetTickerData;
  onChipClick?: (channelType: string, itemId: string | number) => void;
  /** Toggle pin state for a widget (hover pin icon). */
  onTogglePin?: (widgetId: string) => void;
  /** Which widgets are pinned (excluded from scrolling ticker). */
  pinnedWidgets?: Record<string, WidgetPinConfig>;
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
  /** Scroll direction: left (default) or right */
  direction?: TickerDirection;
  /** Scroll mode: continuous, step, or flip */
  scrollMode?: ScrollMode;
  /** Seconds to pause between transitions in step/flip modes (default 2) */
  stepPause?: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function getItemId(item: Record<string, unknown>): string | number {
  return (item.id as string | number) ?? (item.symbol as string) ?? 0;
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
  widgetData,
  onChipClick,
  onTogglePin,
  pinnedWidgets = {},
  speed = 25,
  gap = 8,
  pauseOnHover = true,
  hoverSpeed = 0.3,
  mixMode = "grouped",
  chipColorMode = "channel",
  comfort = false,
  rowIndex = 0,
  totalRows = 1,
  direction = "left",
  scrollMode = "continuous",
  stepPause = 5,
}: ScrollrTickerProps) {
  // Build chip arrays per channel/widget, then combine based on mixMode.
  // When totalRows > 1, items are distributed round-robin across rows.
  const chips = useMemo(() => {
    const wrap = (key: string, chip: React.ReactNode) => (
      <div key={key} className="py-1">
        {chip}
      </div>
    );

    const buckets: React.ReactNode[][] = [];

    for (const tab of activeTabs) {
      const bucket: React.ReactNode[] = [];

      // ── Widget tabs: consolidated chips (skip if pinned) ────────
      if (WIDGET_TYPES.includes(tab as WidgetType)) {
        const wt = tab as WidgetType;
        const items = widgetData?.[wt];
        if (items?.length && !pinnedWidgets[wt]) {
          bucket.push(
            wrap(`${wt}-consolidated`,
              <ConsolidatedChip
                type={wt}
                items={items}
                comfort={comfort}
                colorMode={chipColorMode}
                onTogglePin={onTogglePin ? () => onTogglePin(wt) : undefined}
                onClick={() => onChipClick?.(wt, wt)}
              />
            )
          );
          buckets.push(bucket);
        }
        continue;
      }

      // ── Channel tabs: use dashboard.data ──────────────────────
      const data = dashboard?.data?.[tab];
      if (!Array.isArray(data) || data.length === 0) continue;

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

        case "sports": {
          // Read sports display prefs from dashboard channel config
          const sportsChannel = dashboard?.channels?.find(
            (c) => c.channel_type === "sports",
          );
          const sportsDisplay = (sportsChannel?.config?.display ?? {}) as {
            showUpcoming?: boolean;
            showFinal?: boolean;
            showLogos?: boolean;
          };
          const showUpcoming = sportsDisplay.showUpcoming ?? true;
          const showFinal = sportsDisplay.showFinal ?? true;
          const showLogos = sportsDisplay.showLogos ?? true;

          // Filter by display prefs, then sort by engagement
          const filtered = (data as Game[]).filter((g) => {
            if (!showUpcoming && isPre(g)) return false;
            if (!showFinal && isFinal(g)) return false;
            return true;
          });
          const sorted = filtered.sort((a, b) => gameEngagement(b) - gameEngagement(a));
          for (const game of sorted) {
            bucket.push(
              wrap(`spo-${game.id}`,
                <GameChip
                  game={game}
                  comfort={comfort}
                  colorMode={chipColorMode}
                  showLogos={showLogos}
                  onClick={() => onChipClick?.("sports", game.id)}
                />
              )
            );
          }
          break;
        }

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
    const allItems: React.ReactNode[] = mixMode === "weave"
      ? weave(buckets)
      : buckets.flat();

    // When multiple rows, distribute items round-robin
    if (totalRows <= 1) return allItems;
    return allItems.filter((_, i) => i % totalRows === rowIndex);
  }, [dashboard, activeTabs, widgetData, onChipClick, onTogglePin, pinnedWidgets, comfort, mixMode, chipColorMode, rowIndex, totalRows]);

  // ── Shared refs ─────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);

  // ── Step mode: external offset driven by async animate loop ──
  const offset = useMotionValue(0);
  const stepLoopRef = useRef(false);

  const transitionDuration = speedToTransitionDuration(speed);

  // Measure the width of the first ticker item + gap to determine step size.
  // Queries .ticker-item inside containerRef — works because <Ticker> renders
  // its items as descendants of our wrapper div. Only called once per step
  // cycle (~5s apart), not in a tight loop, so the layout read is safe.
  const measureStepSize = useCallback((): number => {
    const container = containerRef.current;
    if (!container) return 200; // fallback
    const firstItem = container.querySelector(".ticker-item") as HTMLElement | null;
    if (!firstItem) return 200;
    return firstItem.offsetWidth + gap;
  }, [gap]);

  // Reset step offset when entering step mode or when direction changes,
  // so the ticker doesn't start from a stale accumulated position.
  useEffect(() => {
    if (scrollMode === "step") offset.set(0);
  }, [scrollMode, direction, offset]);

  // Step loop: animate offset by one item width, pause, repeat
  useEffect(() => {
    if (scrollMode !== "step" || chips.length === 0) return;

    stepLoopRef.current = true;
    let cancelled = false;

    async function stepLoop() {
      // Small delay to let DOM render and measure
      await sleep(500);

      while (!cancelled && stepLoopRef.current) {
        // Skip advancing while hovered and pauseOnHover is enabled
        if (pauseOnHover && isHoveredRef.current) {
          await sleep(100);
          continue;
        }

        const stepSize = measureStepSize();
        const sign = direction === "left" ? 1 : -1;
        const current = offset.get();
        const target = current + sign * stepSize;

        // Animate one step — duration derived from unified speed slider
        await animate(offset, target, {
          duration: transitionDuration,
          ease: [0.25, 0.1, 0.25, 1],
        });

        if (cancelled) break;

        // Pause between steps
        await sleep(stepPause * 1000);
      }
    }

    stepLoop();

    return () => {
      cancelled = true;
      stepLoopRef.current = false;
    };
  }, [scrollMode, direction, stepPause, pauseOnHover, speed, chips.length, measureStepSize, offset, transitionDuration]);

  // ── Flip mode: paginated vertical slide ───────────────────────
  const [flipPage, setFlipPage] = useState(0);

  // Estimate how many chips fit visually, then rotate the array
  const visibleCount = useMemo(() => {
    const containerWidth = containerRef.current?.clientWidth ?? 1200;
    const avgChipWidth = comfort ? 180 : 120;
    return Math.max(1, Math.floor(containerWidth / (avgChipWidth + gap)));
  }, [comfort, gap, chips.length]); // re-estimate when chip count changes

  const flipChips = useMemo(() => {
    if (chips.length === 0) return [];
    const shift = (flipPage * visibleCount) % chips.length;
    return [...chips.slice(shift), ...chips.slice(0, shift)];
  }, [chips, flipPage, visibleCount]);

  // Flip timer: cycle pages on stepPause interval.
  // Also resets flipPage when chips change (chips.length in deps triggers
  // cleanup → fresh start) avoiding a separate effect with ordering concerns.
  useEffect(() => {
    if (scrollMode !== "flip" || chips.length === 0) return;

    setFlipPage(0);

    const timer = setInterval(() => {
      if (pauseOnHover && isHoveredRef.current) return;
      setFlipPage((p) => p + 1);
    }, stepPause * 1000);

    return () => clearInterval(timer);
  }, [scrollMode, stepPause, pauseOnHover, chips.length]);

  // ── Build pinned chip arrays (rendered inside this row) ─────────

  const pinnedLeft: React.ReactNode[] = [];
  const pinnedRight: React.ReactNode[] = [];

  for (const tab of activeTabs) {
    const pin = pinnedWidgets[tab];
    if (!pin) continue;
    const target = pin.side === "left" ? pinnedLeft : pinnedRight;

    if (WIDGET_TYPES.includes(tab as WidgetType)) {
      const wt = tab as WidgetType;
      const items = widgetData?.[wt];
      if (items?.length) {
        target.push(
          <ConsolidatedChip
            key={`pinned-${wt}`}
            type={wt}
            items={items}
            comfort={comfort}
            colorMode={chipColorMode}
            pinned
            onTogglePin={onTogglePin ? () => onTogglePin(wt) : undefined}
            onClick={() => onChipClick?.(wt, wt)}
          />
        );
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────
  const hasPinnedLeft = pinnedLeft.length > 0;
  const hasPinnedRight = pinnedRight.length > 0;
  const hasScrollingChips = chips.length > 0;

  // Nothing to show at all
  if (!hasScrollingChips && !hasPinnedLeft && !hasPinnedRight) return null;

  const containerClass = `ticker-container ${comfort ? "h-16" : "h-11"} flex items-center bg-base-150 border-b border-edge/50 flex-shrink-0 relative w-full overflow-hidden`;
  const accentLine = (
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent z-10" />
  );

  const pinnedZone = (side: "left" | "right", items: React.ReactNode[]) =>
    items.length > 0 ? (
      <div
        className={clsx(
          "ticker-pinned-zone flex items-center shrink-0 h-full z-10 px-2 bg-base-150",
          side === "left" ? "border-r" : "border-l",
          "border-edge/30",
        )}
        style={{ gap }}
      >
        {items}
      </div>
    ) : null;

  // ── Flip mode: AnimatePresence with vertical slide ────────────
  if (scrollMode === "flip") {
    return (
      <div
        ref={containerRef}
        className={containerClass}
        onMouseEnter={() => { isHoveredRef.current = true; }}
        onMouseLeave={() => { isHoveredRef.current = false; }}
      >
        {accentLine}
        {pinnedZone("left", pinnedLeft)}
        <div className="ticker-scroll-wrapper">
          <AnimatePresence mode="wait">
            <motion.div
              key={flipPage}
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ duration: transitionDuration, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex items-center h-full"
              style={{ gap }}
            >
              {flipChips}
            </motion.div>
          </AnimatePresence>
        </div>
        {pinnedZone("right", pinnedRight)}
      </div>
    );
  }

  // ── Continuous / Step mode: motion-plus Ticker ────────────────
  const velocity = direction === "left" ? speed : -speed;
  const isStepMode = scrollMode === "step";

  return (
    <div
      ref={containerRef}
      className={containerClass}
      onMouseEnter={() => { isHoveredRef.current = true; }}
      onMouseLeave={() => { isHoveredRef.current = false; }}
    >
      {accentLine}
      {pinnedZone("left", pinnedLeft)}
      <div className="ticker-scroll-wrapper">
        <Ticker
          items={chips}
          velocity={isStepMode ? 0 : velocity}
          offset={isStepMode ? offset : undefined}
          hoverFactor={isStepMode ? 1 : (pauseOnHover ? hoverSpeed : 1)}
          gap={gap}
          fade={hasPinnedLeft || hasPinnedRight ? 20 : 40}
        />
      </div>
      {pinnedZone("right", pinnedRight)}
    </div>
  );
}

// ── Helpers (module-level) ───────────────────────────────────────

/** Promise-based sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map speed slider (5–150) to transition duration for step/flip modes.
 *  speed 5 → ~1.2s (crawl), speed 25 → ~0.9s (default),
 *  speed 60 → ~0.55s, speed 150 → ~0.15s (blazing). */
function speedToTransitionDuration(speed: number): number {
  return Math.max(0.15, 1.2 - (speed - 5) * 0.0072);
}
