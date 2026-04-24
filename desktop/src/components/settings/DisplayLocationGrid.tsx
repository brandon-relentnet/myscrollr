/**
 * Two-column "Feed | Ticker" checkbox grid for per-metric visibility
 * settings. Replaces the older 4-pill VenueRow control across all four
 * Display tabs (Finance, Sports, RSS, Fantasy).
 *
 * Why two checkboxes instead of four pills:
 *   The persisted enum is `off | feed | ticker | both`, but those four
 *   states are really two booleans — "show in Feed?" and "show in
 *   Ticker?". The four-pill selector forced users to think about
 *   "venue routing" as a single decision; the two-checkbox grid lets
 *   them think about each surface independently and removes the
 *   redundant per-row legend the pills required ("Off: hidden · Feed:
 *   only on feed page · Both: everywhere · Ticker: only on the
 *   ticker"). Column headers + checkboxes are self-evident.
 *
 * The persisted shape stays the same — the conversion happens at the
 * UI boundary via `enumToBools` / `boolsToEnum` from preferences.ts.
 *
 * Per-page bulk control: a single "All / None" pair under each column
 * header flips every row in that column across ALL sub-sections of
 * the grid. Users with 10+ rows (Fantasy) can blank the ticker column
 * in one click.
 *
 * See docs/superpowers/specs/2026-04-25-display-venue-toggle-design.md
 * for the venue-routing rationale, and the 2026-04-25 UI refactor
 * commit for the move from pills to checkboxes.
 */
import { clsx } from "clsx";
import { Fragment } from "react";
import {
  boolsToEnum,
  enumToBools,
  type Venue,
} from "../../preferences";

// ── Public types ────────────────────────────────────────────────

export interface DisplayGridRow {
  /** Stable React key. Typically the prefs field name. */
  key: string;
  /** Metric name shown on the row's left side. */
  label: string;
  /** Optional explanation of WHAT the metric is (not what the toggle
   *  does — column headers handle that). E.g. "62% chance to win". */
  description?: string;
  /** Current persisted enum value. */
  value: Venue;
  /** Called with the new enum value when either checkbox is toggled. */
  onChange: (next: Venue) => void;
}

export interface DisplayGridSection {
  /** Optional sub-header rendered as a thin divider with a label. Omit
   *  for an ungrouped grid (typical when the grid has only 2-3 rows). */
  title?: string;
  rows: DisplayGridRow[];
}

interface DisplayLocationGridProps {
  sections: DisplayGridSection[];
}

// ── Component ───────────────────────────────────────────────────

export function DisplayLocationGrid({ sections }: DisplayLocationGridProps) {
  // Aggregate every row across every section. The bulk "All/None"
  // toggles ignore sub-section boundaries — flipping "ticker = none"
  // affects every row in the entire grid, which matches the user's
  // "flip every row in that column" intent.
  const allRows = sections.flatMap((s) => s.rows);

  const allFeedOn = allRows.length > 0 && allRows.every((r) => enumToBools(r.value).feed);
  const allFeedOff = allRows.length > 0 && allRows.every((r) => !enumToBools(r.value).feed);
  const allTickerOn = allRows.length > 0 && allRows.every((r) => enumToBools(r.value).ticker);
  const allTickerOff = allRows.length > 0 && allRows.every((r) => !enumToBools(r.value).ticker);

  function setColumn(column: "feed" | "ticker", on: boolean) {
    for (const row of allRows) {
      const bools = enumToBools(row.value);
      const next = boolsToEnum(
        column === "feed" ? on : bools.feed,
        column === "ticker" ? on : bools.ticker,
      );
      if (next !== row.value) row.onChange(next);
    }
  }

  return (
    <div role="grid" aria-label="Display locations" className="px-1">
      {/* ── Header strip ──────────────────────────────────────── */}
      <div
        role="row"
        className="grid grid-cols-[1fr_72px_72px] items-end gap-x-2 px-2 pb-2 mb-1 border-b border-edge/30"
      >
        <span className="sr-only" role="columnheader">
          Setting
        </span>
        <ColumnHeader
          label="Feed"
          allOn={allFeedOn}
          allOff={allFeedOff}
          onAll={() => setColumn("feed", true)}
          onNone={() => setColumn("feed", false)}
        />
        <ColumnHeader
          label="Ticker"
          allOn={allTickerOn}
          allOff={allTickerOff}
          onAll={() => setColumn("ticker", true)}
          onNone={() => setColumn("ticker", false)}
        />
      </div>

      {/* ── Rows ──────────────────────────────────────────────── */}
      {sections.map((section, sIdx) => (
        <Fragment key={section.title ?? `__sec_${sIdx}`}>
          {section.title && (
            <div
              role="row"
              className={clsx(
                "grid grid-cols-[1fr_72px_72px] gap-x-2 px-2 mt-3 mb-1",
                sIdx === 0 && "mt-1",
              )}
            >
              <div
                role="columnheader"
                aria-colspan={3}
                className="col-span-3 text-[10px] font-mono font-semibold uppercase tracking-wider text-fg-4 pt-1"
              >
                {section.title}
              </div>
            </div>
          )}
          {section.rows.map((row) => (
            <GridRow key={row.key} row={row} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

// ── Column header ───────────────────────────────────────────────

interface ColumnHeaderProps {
  label: string;
  allOn: boolean;
  allOff: boolean;
  onAll: () => void;
  onNone: () => void;
}

function ColumnHeader({ label, allOn, allOff, onAll, onNone }: ColumnHeaderProps) {
  return (
    <div role="columnheader" className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-3">
        {label}
      </span>
      <div className="flex items-center gap-1 text-[10px] leading-none">
        <button
          type="button"
          onClick={onAll}
          disabled={allOn}
          aria-label={`Show every setting in ${label}`}
          className={clsx(
            "px-1 py-0.5 rounded text-fg-4 transition-colors",
            allOn
              ? "opacity-30 cursor-default"
              : "hover:text-fg-2 hover:bg-base-250/50 cursor-pointer",
          )}
        >
          All
        </button>
        <span aria-hidden="true" className="text-fg-4/50">
          ·
        </span>
        <button
          type="button"
          onClick={onNone}
          disabled={allOff}
          aria-label={`Hide every setting from ${label}`}
          className={clsx(
            "px-1 py-0.5 rounded text-fg-4 transition-colors",
            allOff
              ? "opacity-30 cursor-default"
              : "hover:text-fg-2 hover:bg-base-250/50 cursor-pointer",
          )}
        >
          None
        </button>
      </div>
    </div>
  );
}

// ── Single row ──────────────────────────────────────────────────

function GridRow({ row }: { row: DisplayGridRow }) {
  const { feed, ticker } = enumToBools(row.value);
  const labelId = `disp-${row.key}-label`;

  function toggleFeed() {
    row.onChange(boolsToEnum(!feed, ticker));
  }
  function toggleTicker() {
    row.onChange(boolsToEnum(feed, !ticker));
  }

  return (
    <div
      role="row"
      className="grid grid-cols-[1fr_72px_72px] items-center gap-x-2 px-2 py-2 rounded-lg hover:bg-base-250/30 transition-colors"
    >
      <div role="rowheader" className="flex flex-col gap-0.5 min-w-0">
        <span
          id={labelId}
          className="text-[12px] text-fg-2 leading-tight truncate"
        >
          {row.label}
        </span>
        {row.description && (
          <span className="text-[11px] text-fg-4 leading-tight truncate">
            {row.description}
          </span>
        )}
      </div>
      <CheckboxCell
        checked={feed}
        onToggle={toggleFeed}
        ariaLabel={`Show ${row.label} in Feed`}
        ariaLabelledBy={labelId}
      />
      <CheckboxCell
        checked={ticker}
        onToggle={toggleTicker}
        ariaLabel={`Show ${row.label} in Ticker`}
        ariaLabelledBy={labelId}
      />
    </div>
  );
}

// ── Single checkbox ─────────────────────────────────────────────

interface CheckboxCellProps {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
  ariaLabelledBy: string;
}

function CheckboxCell({
  checked,
  onToggle,
  ariaLabel,
  ariaLabelledBy,
}: CheckboxCellProps) {
  return (
    <div role="gridcell" className="flex items-center justify-center">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={onToggle}
        className={clsx(
          "h-[18px] w-[18px] rounded-md flex items-center justify-center transition-colors cursor-pointer",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
          checked
            ? "bg-accent text-on-accent"
            : "bg-base-300 text-transparent hover:bg-base-350 border border-edge/40",
        )}
      >
        {/* Inline checkmark — sized to the box */}
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={clsx(
            "h-3 w-3",
            checked ? "opacity-100" : "opacity-0",
          )}
        >
          <path
            d="M2 6.5l2.5 2.5L10 3.5"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
  );
}
