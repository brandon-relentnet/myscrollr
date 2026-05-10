/**
 * Finance display preferences — the "/channel/finance/display" page.
 *
 * Replaces the old DisplayLocationGrid (a 3-row × 2-checkbox abstract
 * grid forcing users to mentally simulate "show % change in Ticker").
 * The new design pairs each control with a LIVE preview of the actual
 * surface (Feed row + Ticker chip) using either the user's first
 * tracked symbol or a sample, so toggling immediately reflects the
 * visual outcome.
 *
 * Structure:
 *   1. Live preview            — mini Feed row + Ticker chip side by side
 *   2. On the Feed section     — 3 toggles + Sort order
 *   3. On the Ticker section   — 3 toggles
 *   4. Reset                   — restore defaults
 *
 * The persisted enum (`off | feed | ticker | both`) is unchanged — we
 * just split it into two booleans at the UI boundary, same as the
 * grid did, but presented as side-anchored controls instead of a
 * matrix. Bulk "show all on Feed / Ticker" lives as small inline
 * "All / None" links in each section header.
 */
import { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Eye,
  Tv,
  Clock,
  History,
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
import { Section, ToggleRow, SegmentedRow, ResetButton } from "../../components/settings/SettingsControls";
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

// Sample trade used for the preview when no real symbol is tracked.
// Up direction so the preview shows the up-color (most users will
// have at least one positive mover, but a fresh install has nothing).
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
    key: "showChange" | "showPrevClose" | "showLastUpdated",
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
    const keys: Array<"showChange" | "showPrevClose" | "showLastUpdated"> = [
      "showChange",
      "showPrevClose",
      "showLastUpdated",
    ];
    const next: Partial<FinanceDisplayPrefs> = {};
    for (const k of keys) {
      const bools = enumToBools(dp[k]);
      next[k] = boolsToEnum(
        surface === "feed" ? on : bools.feed,
        surface === "ticker" ? on : bools.ticker,
      );
    }
    patch(next);
  }

  function handleReset() {
    patch(DEFAULTS);
  }

  // ── Booleans the preview / toggles read from ──────────────────

  const feedShowChange = enumToBools(dp.showChange).feed;
  const feedShowPrevClose = enumToBools(dp.showPrevClose).feed;
  const feedShowLastUpdated = enumToBools(dp.showLastUpdated).feed;
  const tickerShowChange = enumToBools(dp.showChange).ticker;
  const tickerShowPrevClose = enumToBools(dp.showPrevClose).ticker;
  const tickerShowLastUpdated = enumToBools(dp.showLastUpdated).ticker;

  const allFeedOn = feedShowChange && feedShowPrevClose && feedShowLastUpdated;
  const allFeedOff = !feedShowChange && !feedShowPrevClose && !feedShowLastUpdated;
  const allTickerOn = tickerShowChange && tickerShowPrevClose && tickerShowLastUpdated;
  const allTickerOff = !tickerShowChange && !tickerShowPrevClose && !tickerShowLastUpdated;

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      {/* ── Live preview ─────────────────────────────────────────── */}
      <Section title="Live preview">
        <div className="px-3 pb-1 space-y-3">
          <p className="text-[11px] text-fg-4 leading-snug">
            Toggling the controls below updates these previews in real time.
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

      {/* ── On the Feed ──────────────────────────────────────────── */}
      <Section
        title="On the Feed"
        action={
          <BulkToggle
            allOn={allFeedOn}
            allOff={allFeedOff}
            onAll={() => bulkSurface("feed", true)}
            onNone={() => bulkSurface("feed", false)}
          />
        }
      >
        <ToggleRow
          label="% change"
          description="Daily price change percentage"
          checked={feedShowChange}
          onChange={(v) => setVenue("showChange", "feed", v)}
        />
        <ToggleRow
          label="Previous close"
          description="Last session's closing price"
          checked={feedShowPrevClose}
          onChange={(v) => setVenue("showPrevClose", "feed", v)}
        />
        <ToggleRow
          label="Last updated"
          description="Relative time since the last tick"
          checked={feedShowLastUpdated}
          onChange={(v) => setVenue("showLastUpdated", "feed", v)}
        />
      </Section>

      {/* ── On the Ticker ────────────────────────────────────────── */}
      <Section
        title="On the Ticker"
        action={
          <BulkToggle
            allOn={allTickerOn}
            allOff={allTickerOff}
            onAll={() => bulkSurface("ticker", true)}
            onNone={() => bulkSurface("ticker", false)}
          />
        }
      >
        <ToggleRow
          label="% change"
          description="Compact arrow + percent next to the symbol"
          checked={tickerShowChange}
          onChange={(v) => setVenue("showChange", "ticker", v)}
        />
        <ToggleRow
          label="Previous close"
          description="Adds 'Prev $X' on the comfort row"
          checked={tickerShowPrevClose}
          onChange={(v) => setVenue("showPrevClose", "ticker", v)}
        />
        <ToggleRow
          label="Last updated"
          description="Tiny 'Xs ago' next to the chip"
          checked={tickerShowLastUpdated}
          onChange={(v) => setVenue("showLastUpdated", "ticker", v)}
        />
      </Section>

      {/* ── Layout & order ───────────────────────────────────────── */}
      <Section title="Layout & order">
        <SegmentedRow
          label="Feed density"
          description="Comfort shows two-row cards; Compact stacks more per screen"
          value={dp.feedDensity}
          options={DENSITY_OPTIONS}
          onChange={(v) => patch({ feedDensity: v as FinanceDisplayPrefs["feedDensity"] })}
        />
        <SegmentedRow
          label="Ticker direction marker"
          description="How up/down moves are flagged next to the percentage"
          value={dp.tickerDirectionMarker}
          options={MARKER_OPTIONS}
          onChange={(v) => patch({ tickerDirectionMarker: v as FinanceDisplayPrefs["tickerDirectionMarker"] })}
        />
        <SegmentedRow
          label="Default sort"
          description="How symbols are ordered on the Feed and the Ticker"
          value={dp.defaultSort}
          options={SORT_OPTIONS}
          onChange={(v) => patch({ defaultSort: v as FinanceDisplayPrefs["defaultSort"] })}
        />
      </Section>

      {/* ── Footer reset ─────────────────────────────────────────── */}
      <div className="flex items-center justify-end pt-2">
        <ResetButton label="Reset display settings" onClick={handleReset} />
      </div>
    </div>
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

// ── Feed preview — mini comfort-row ─────────────────────────────

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
        {showPrevClose && trade.previous_close != null && Number(trade.previous_close) > 0 && (
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

  // Render the direction marker according to the user's choice. The
  // % itself stays — only the lead-in changes.
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
          {showPrevClose && trade.previous_close != null && Number(trade.previous_close) > 0 && (
            <span className="flex items-center gap-0.5">
              <History size={8} />
              Prev {formatPrice(trade.previous_close)}
            </span>
          )}
          {showPrevClose && showLastUpdated && (
            <span aria-hidden className="text-fg-4/50">·</span>
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

// ── Bulk toggle (All / None) ────────────────────────────────────

interface BulkToggleProps {
  allOn: boolean;
  allOff: boolean;
  onAll: () => void;
  onNone: () => void;
}

function BulkToggle({ allOn, allOff, onAll, onNone }: BulkToggleProps) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <button
        type="button"
        onClick={onAll}
        disabled={allOn}
        className={clsx(
          "px-1.5 py-0.5 rounded text-fg-4 transition-all duration-150 active:scale-90",
          allOn
            ? "opacity-30 cursor-default"
            : "hover:text-fg-2 hover:bg-base-250/50 cursor-pointer",
        )}
      >
        All
      </button>
      <span aria-hidden className="text-fg-4/50">·</span>
      <button
        type="button"
        onClick={onNone}
        disabled={allOff}
        className={clsx(
          "px-1.5 py-0.5 rounded text-fg-4 transition-all duration-150 active:scale-90",
          allOff
            ? "opacity-30 cursor-default"
            : "hover:text-fg-2 hover:bg-base-250/50 cursor-pointer",
        )}
      >
        None
      </button>
    </div>
  );
}


