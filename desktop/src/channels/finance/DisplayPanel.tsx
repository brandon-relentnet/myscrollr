/**
 * Finance display preferences — the "/channel/finance/display" page.
 *
 * Layout:
 *   1. Live preview        — Feed row + Ticker chip side by side, both
 *                            update in real time as toggles change.
 *   2. Display items       — one row per metric with two surface chips
 *                            (Feed / Ticker) on the right. Each chip
 *                            shows whether the metric appears there.
 *                            Click a chip to toggle that surface only.
 *                            Section header has bulk All / None
 *                            controls per surface.
 *   3. Layout & order      — feed density, ticker direction marker,
 *                            default sort order.
 *   4. Footer reset        — restore defaults.
 *
 * Why one row per metric (not duplicated by surface):
 *   The earlier draft had two parallel sections "On the Feed" and
 *   "On the Ticker" with the same three toggles in each. That doubled
 *   the visual surface for what is conceptually one decision per
 *   metric ("where should this show up?"). Folding back to a single
 *   row per metric keeps the matrix structure of the original
 *   DisplayLocationGrid but replaces the abstract checkbox columns
 *   with labeled surface chips paired with the live preview, so the
 *   user always sees the visual outcome of their choices.
 *
 * Persisted shape unchanged: `off | feed | ticker | both` enum
 * converted at the UI boundary via enumToBools / boolsToEnum.
 */
import { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Eye,
  Tv,
  Clock,
  History,
  Check,
} from "lucide-react";
import { clsx } from "clsx";
import { motion } from "motion/react";
import { useShell } from "../../shell-context";
import { useQuery } from "@tanstack/react-query";
import { dashboardQueryOptions } from "../../api/queries";
import {
  boolsToEnum,
  enumToBools,
  type Venue,
  type FinanceDisplayPrefs,
} from "../../preferences";
import {
  Section,
  SegmentedRow,
  ResetButton,
} from "../../components/settings/SettingsControls";
import { formatPrice, formatChange, relativeTime } from "../../utils/format";
import type { Trade } from "../../types";
import { useNow } from "../../hooks/useNow";

// ── Constants ────────────────────────────────────────────────────

const DEFAULTS: FinanceDisplayPrefs = {
  showChange: "both",
  showPrevClose: "both",
  showLastUpdated: "both",
  defaultSort: "alpha",
  feedDensity: "comfort",
  tickerDirectionMarker: "arrow",
};

const SORT_OPTIONS = [
  { value: "alpha", label: "A–Z" },
  { value: "price", label: "Price" },
  { value: "change", label: "% Change" },
  { value: "updated", label: "Updated" },
];

const DENSITY_OPTIONS = [
  { value: "comfort", label: "Comfort" },
  { value: "compact", label: "Compact" },
];

const MARKER_OPTIONS = [
  { value: "arrow", label: "Arrow" },
  { value: "sign", label: "+/−" },
  { value: "none", label: "None" },
];

// Metric definitions drive the unified Display items section. Each
// row binds one prefs field to its label, description, and chip
// labels. Adding a new metric = one entry here.
type MetricKey = "showChange" | "showPrevClose" | "showLastUpdated";

interface MetricDef {
  key: MetricKey;
  label: string;
  description: string;
}

const METRICS: MetricDef[] = [
  {
    key: "showChange",
    label: "% change",
    description: "Daily price change percentage with up/down marker",
  },
  {
    key: "showPrevClose",
    label: "Previous close",
    description: "Last session's closing price",
  },
  {
    key: "showLastUpdated",
    label: "Last updated",
    description: "Relative time since the last tick",
  },
];

// Sample trade used for the preview when no real symbol is tracked.
function buildSampleTrade(): Trade {
  return {
    symbol: "AAPL",
    price: "179.42",
    previous_close: 177.3,
    percentage_change: "1.20",
    price_change: "2.12",
    direction: "up",
    link: "",
    last_updated: new Date(Date.now() - 12_000).toISOString(),
  };
}

// ── Component ────────────────────────────────────────────────────

export default function FinanceDisplayPanel() {
  const { prefs, onPrefsChange } = useShell();
  const dp = prefs.channelDisplay.finance;

  // Pull the user's first real tracked symbol so the preview shows
  // something they recognise. Falls back to the sample.
  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const previewTrade: Trade = useMemo(() => {
    const trades = (dashboard?.data?.finance as Trade[] | undefined) ?? [];
    if (trades.length > 0) return trades[0];
    return buildSampleTrade();
  }, [dashboard?.data?.finance]);

  // ── Patch helpers ──────────────────────────────────────────────

  function patch(next: Partial<FinanceDisplayPrefs>) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        finance: { ...dp, ...next },
      },
    });
  }

  function setVenue(
    key: MetricKey,
    surface: "feed" | "ticker",
    on: boolean,
  ) {
    const bools = enumToBools(dp[key]);
    const next: Venue = boolsToEnum(
      surface === "feed" ? on : bools.feed,
      surface === "ticker" ? on : bools.ticker,
    );
    patch({ [key]: next } as Partial<FinanceDisplayPrefs>);
  }

  function bulkSurface(surface: "feed" | "ticker", on: boolean) {
    const next: Partial<FinanceDisplayPrefs> = {};
    for (const m of METRICS) {
      const bools = enumToBools(dp[m.key]);
      next[m.key] = boolsToEnum(
        surface === "feed" ? on : bools.feed,
        surface === "ticker" ? on : bools.ticker,
      );
    }
    patch(next);
  }

  function handleReset() {
    patch(DEFAULTS);
  }

  // ── Booleans the preview reads from ───────────────────────────

  const feedShowChange = enumToBools(dp.showChange).feed;
  const feedShowPrevClose = enumToBools(dp.showPrevClose).feed;
  const feedShowLastUpdated = enumToBools(dp.showLastUpdated).feed;
  const tickerShowChange = enumToBools(dp.showChange).ticker;
  const tickerShowPrevClose = enumToBools(dp.showPrevClose).ticker;
  const tickerShowLastUpdated = enumToBools(dp.showLastUpdated).ticker;

  // The header buttons are themselves the bulk toggles. They light up
  // when EVERY metric is enabled for that surface; otherwise (mixed
  // or all-off) the next press fills them all in. Press again to
  // clear them all.
  const allFeedOn = METRICS.every((m) => enumToBools(dp[m.key]).feed);
  const allTickerOn = METRICS.every((m) => enumToBools(dp[m.key]).ticker);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      {/* ── Live preview ─────────────────────────────────────────── */}
      <Section title="Live preview">
        <div className="px-3 pb-1 space-y-3">
          <p className="text-[11px] text-fg-4 leading-snug">
            Toggle items below to see the Feed and Ticker update in real time.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <PreviewSurface label="Feed" icon={Eye}>
              <FeedPreview
                trade={previewTrade}
                density={dp.feedDensity}
                showChange={feedShowChange}
                showPrevClose={feedShowPrevClose}
                showLastUpdated={feedShowLastUpdated}
              />
            </PreviewSurface>
            <PreviewSurface label="Ticker" icon={Tv}>
              <TickerPreview
                trade={previewTrade}
                directionMarker={dp.tickerDirectionMarker}
                showChange={tickerShowChange}
                showPrevClose={tickerShowPrevClose}
                showLastUpdated={tickerShowLastUpdated}
              />
            </PreviewSurface>
          </div>
        </div>
      </Section>

      {/* ── Display items (single row per metric) ──────────────────
          Section header carries two surface buttons that double as
          bulk toggles: pressing "Feed" flips every Feed chip in the
          rows below (All when any are off, None when all are on).
          Same for "Ticker". The same pattern as the per-row chips,
          just operating on the whole list at once. */}
      <Section
        title="Display items"
        action={
          <div className="flex items-center gap-1.5">
            <BulkSurfaceToggle
              icon={Eye}
              label="Feed"
              // "All-on" reads as ON, anything else (mixed or all-off)
              // reads as OFF so the press flips toward fully on.
              active={allFeedOn}
              onClick={() => bulkSurface("feed", !allFeedOn)}
            />
            <BulkSurfaceToggle
              icon={Tv}
              label="Ticker"
              active={allTickerOn}
              onClick={() => bulkSurface("ticker", !allTickerOn)}
            />
          </div>
        }
      >
        <div className="rounded-lg border border-edge/40 overflow-hidden divide-y divide-edge/30 mx-3">
          {METRICS.map((metric) => {
            const bools = enumToBools(dp[metric.key]);
            return (
              <MetricRow
                key={metric.key}
                label={metric.label}
                description={metric.description}
                feedOn={bools.feed}
                tickerOn={bools.ticker}
                onToggleFeed={() =>
                  setVenue(metric.key, "feed", !bools.feed)
                }
                onToggleTicker={() =>
                  setVenue(metric.key, "ticker", !bools.ticker)
                }
              />
            );
          })}
        </div>
      </Section>

      {/* ── Layout & order ───────────────────────────────────────── */}
      <Section title="Layout & order">
        <SegmentedRow
          label="Feed density"
          description="Comfort shows two-row cards; Compact stacks more per screen"
          value={dp.feedDensity}
          options={DENSITY_OPTIONS}
          onChange={(v) =>
            patch({ feedDensity: v as FinanceDisplayPrefs["feedDensity"] })
          }
        />
        <SegmentedRow
          label="Ticker direction marker"
          description="How up/down moves are flagged next to the percentage"
          value={dp.tickerDirectionMarker}
          options={MARKER_OPTIONS}
          onChange={(v) =>
            patch({
              tickerDirectionMarker:
                v as FinanceDisplayPrefs["tickerDirectionMarker"],
            })
          }
        />
        <SegmentedRow
          label="Default sort"
          description="How symbols are ordered on the Feed and the Ticker"
          value={dp.defaultSort}
          options={SORT_OPTIONS}
          onChange={(v) =>
            patch({ defaultSort: v as FinanceDisplayPrefs["defaultSort"] })
          }
        />
      </Section>

      {/* ── Footer reset ─────────────────────────────────────────── */}
      <div className="flex items-center justify-end pt-2">
        <ResetButton label="Reset display settings" onClick={handleReset} />
      </div>
    </div>
  );
}

// ── Metric row (one row per metric, two surface chips on the right) ──

interface MetricRowProps {
  label: string;
  description: string;
  feedOn: boolean;
  tickerOn: boolean;
  onToggleFeed: () => void;
  onToggleTicker: () => void;
}

function MetricRow({
  label,
  description,
  feedOn,
  tickerOn,
  onToggleFeed,
  onToggleTicker,
}: MetricRowProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-base-250/30 transition-colors">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-[12px] text-fg-2 leading-tight">{label}</span>
        <span className="text-[11px] text-fg-4 leading-tight">{description}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <SurfaceChip
          icon={Eye}
          label="Feed"
          active={feedOn}
          onClick={onToggleFeed}
        />
        <SurfaceChip
          icon={Tv}
          label="Ticker"
          active={tickerOn}
          onClick={onToggleTicker}
        />
      </div>
    </div>
  );
}

// ── Surface chip ─────────────────────────────────────────────────
//
// Pill-shaped toggle with an icon, surface label, and a subtle
// indicator. Active state tints accent and shows a check; inactive
// shows muted with the surface icon only.

interface SurfaceChipProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}

function SurfaceChip({
  icon: Icon,
  label,
  active,
  onClick,
}: SurfaceChipProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${active ? "Hide from" : "Show on"} ${label}`}
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium",
        "transition-all duration-150 active:scale-[0.93]",
        active
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-edge/40 text-fg-4 hover:text-fg-3 hover:border-edge/60",
      )}
    >
      <Icon size={11} />
      <span>{label}</span>
      <motion.span
        key={active ? "on" : "off"}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 24 }}
        className={clsx(
          "flex items-center justify-center w-3 h-3 rounded-sm",
          active
            ? "bg-accent text-surface"
            : "bg-base-300 text-fg-4/50 opacity-60",
        )}
      >
        {active ? <Check size={9} strokeWidth={3.5} /> : null}
      </motion.span>
    </button>
  );
}

// ── Bulk surface toggle (in the section header) ─────────────────
//
// Visually mirrors the per-row SurfaceChip but operates on every
// metric in the section. Active = every metric on for this surface;
// pressing flips toward whatever the row chips don't already have.
// One button = one decision: "show all on Feed?" / "show all on
// Ticker?".

interface BulkSurfaceToggleProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}

function BulkSurfaceToggle({
  icon: Icon,
  label,
  active,
  onClick,
}: BulkSurfaceToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${active ? "Hide all from" : "Show all on"} ${label}`}
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium",
        "transition-all duration-150 active:scale-[0.93]",
        active
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-edge/40 text-fg-4 hover:text-fg-3 hover:border-edge/60",
      )}
    >
      <Icon size={11} />
      <span>{label}</span>
      <motion.span
        key={active ? "on" : "off"}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 24 }}
        className={clsx(
          "flex items-center justify-center w-3 h-3 rounded-sm",
          active
            ? "bg-accent text-surface"
            : "bg-base-300 text-fg-4/50 opacity-60",
        )}
      >
        {active ? <Check size={9} strokeWidth={3.5} /> : null}
      </motion.span>
    </button>
  );
}

// ── Preview surface card ────────────────────────────────────────

interface PreviewSurfaceProps {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}

function PreviewSurface({ label, icon: Icon, children }: PreviewSurfaceProps) {
  return (
    <div className="rounded-lg border border-edge/40 bg-base-200/40 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-edge/40 bg-surface-2/30">
        <Icon size={11} className="text-fg-4" />
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-fg-4">
          {label}
        </span>
      </div>
      <div className="p-2.5 min-h-[72px] flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// ── Feed preview — mini comfort/compact row ─────────────────────

interface FeedPreviewProps {
  trade: Trade;
  density: FinanceDisplayPrefs["feedDensity"];
  showChange: boolean;
  showPrevClose: boolean;
  showLastUpdated: boolean;
}

function FeedPreview({
  trade,
  density,
  showChange,
  showPrevClose,
  showLastUpdated,
}: FeedPreviewProps) {
  const now = useNow();
  const isUp = trade.direction === "up";
  const isDown = trade.direction === "down";
  const dirColor = isUp ? "text-up" : isDown ? "text-down" : "text-fg-3";
  const isCompact = density === "compact";

  if (isCompact) {
    return (
      <motion.div
        key={`compact-${showChange}-${showPrevClose}-${showLastUpdated}`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-surface rounded-md font-mono"
      >
        <span className="font-bold text-[12px] text-fg min-w-[44px]">
          {trade.symbol}
        </span>
        <span className="text-[12px] text-fg-2 tabular-nums">
          {formatPrice(trade.price)}
        </span>
        {showChange && (
          <span className={clsx("text-[11px] tabular-nums ml-auto", dirColor)}>
            {formatChange(trade.percentage_change)}
          </span>
        )}
        {showLastUpdated && trade.last_updated && !showChange && (
          <span className="text-[9px] text-fg-4 tabular-nums ml-auto">
            {relativeTime(trade.last_updated, now, { includeSeconds: true })}
          </span>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      key={`comfort-${showChange}-${showPrevClose}-${showLastUpdated}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
      className={clsx(
        "w-full flex items-center justify-between px-3 py-2 bg-surface rounded-md border-l-2",
        isUp && "border-l-up/40",
        isDown && "border-l-down/40",
        !isUp && !isDown && "border-l-transparent",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-mono font-bold text-[12px] text-fg tracking-wide">
          {trade.symbol}
        </span>
        {showPrevClose &&
          trade.previous_close != null &&
          Number(trade.previous_close) > 0 && (
            <span className="text-[9px] font-mono text-fg-3 tabular-nums">
              Prev {formatPrice(trade.previous_close)}
            </span>
          )}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[12px] font-mono font-medium text-fg tabular-nums">
          {formatPrice(trade.price)}
        </span>
        <div className="flex items-center gap-1.5">
          {showChange && (
            <span
              className={clsx(
                "text-[10px] font-mono font-medium tabular-nums",
                dirColor,
              )}
            >
              {formatChange(trade.percentage_change)}
            </span>
          )}
          {showLastUpdated && trade.last_updated && (
            <span className="text-[9px] font-mono text-fg-4 tabular-nums">
              {relativeTime(trade.last_updated, now, { includeSeconds: true })}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Ticker preview — mini chip ──────────────────────────────────

interface TickerPreviewProps {
  trade: Trade;
  directionMarker: FinanceDisplayPrefs["tickerDirectionMarker"];
  showChange: boolean;
  showPrevClose: boolean;
  showLastUpdated: boolean;
}

function TickerPreview({
  trade,
  directionMarker,
  showChange,
  showPrevClose,
  showLastUpdated,
}: TickerPreviewProps) {
  const now = useNow();
  const isUp = trade.direction === "up";
  const ArrowIcon = isUp ? TrendingUp : TrendingDown;

  const marker =
    directionMarker === "arrow" ? (
      <ArrowIcon size={9} />
    ) : directionMarker === "sign" ? (
      <span className="font-bold">{isUp ? "+" : "−"}</span>
    ) : null;

  return (
    <motion.div
      key={`${showChange}-${showPrevClose}-${showLastUpdated}-${directionMarker}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
      className="inline-flex flex-col items-start gap-0.5 px-2.5 py-1.5 rounded-md bg-surface-2 border border-edge/30 font-mono whitespace-nowrap"
    >
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className="font-semibold text-fg">{trade.symbol}</span>
        <span className="text-fg-3">{formatPrice(trade.price)}</span>
        {showChange && (
          <span
            className={clsx(
              "flex items-center gap-0.5 text-[10px] font-medium",
              isUp ? "text-up" : "text-down",
            )}
          >
            {marker}
            {formatChange(trade.percentage_change)}
          </span>
        )}
      </div>
      {(showPrevClose || showLastUpdated) && (
        <div className="flex items-center gap-1.5 text-[9px] text-fg-4">
          {showPrevClose &&
            trade.previous_close != null &&
            Number(trade.previous_close) > 0 && (
              <span className="flex items-center gap-0.5">
                <History size={8} />
                Prev {formatPrice(trade.previous_close)}
              </span>
            )}
          {showPrevClose && showLastUpdated && (
            <span aria-hidden className="text-fg-4/50">
              ·
            </span>
          )}
          {showLastUpdated && trade.last_updated && (
            <span className="flex items-center gap-0.5">
              <Clock size={8} />
              {relativeTime(trade.last_updated, now, { includeSeconds: true })}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
