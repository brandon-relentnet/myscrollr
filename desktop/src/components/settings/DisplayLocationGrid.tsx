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
 * API shape:
 *   Rows DO NOT own their own `onChange`. Instead the grid emits a
 *   single top-level `onChange(Record<rowKey, Venue>)` for every
 *   interaction — a per-row click yields `{[rowKey]: newVenue}`; a
 *   bulk "All" / "None" click yields one object with every changed
 *   row. Callers merge that into their prefs state in ONE
 *   onPrefsChange call. This is what makes the bulk toggle actually
 *   flip every row at once — the previous per-row-callback design
 *   had every row's onChange close over the same stale prefs
 *   snapshot, so only the last iteration ever won.
 *
 * See docs/superpowers/specs/2026-04-25-display-venue-toggle-design.md
 * for the venue-routing rationale, and the 2026-04-25 UI refactor
 * commits for the move from pills to checkboxes.
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
  /** Stable React key. Typically the prefs field name — the grid
   *  echoes it back in the `onChange` payload so callers can
   *  splat it into their prefs slice. */
  key: string;
  /** Metric name shown on the row's left side. */
  label: string;
  /** Optional explanation of WHAT the metric is (not what the toggle
   *  does — column headers handle that). E.g. "62% chance to win". */
  description?: string;
  /** Current persisted enum value. */
  value: Venue;
}

export interface DisplayGridSection {
  /** Optional sub-header rendered as a thin divider with a label. Omit
   *  for an ungrouped grid (typical when the grid has only 2-3 rows). */
  title?: string;
  rows: DisplayGridRow[];
}

interface DisplayLocationGridProps {
  sections: DisplayGridSection[];
  /** Called on any interaction with a `{rowKey: newVenue}` map. For a
   *  per-row click the map has a single entry; for a bulk All / None
   *  click every row whose value changed is included in the same
   *  map. Callers MUST apply the entire map in a single state update
   *  so bulk toggles don't get clobbered by stale-state overwrites. */
  onChange: (changes: Record<string, Venue>) => void;
}

// ── Layout constants ────────────────────────────────────────────

// Each checkbox column is 88px — wide enough to comfortably contain
// the column's widest interactive element (the "All · None" bulk
// row, which renders at ~71px after button padding + the dot
// separator). 64px overflowed the cell boundary and made the headers
// look misaligned with the 18px checkboxes below — even though the
// CSS centers all matched, the visual was off because the bulk row
// bled into the gap-x-2 gutter.
//
// Header and body rows MUST share this grid-cols string VERBATIM so
// Tailwind's JIT compiler generates the same utility for both. Do
// NOT construct via template literal — the scanner can't see classes
// assembled at runtime and will produce no CSS at all (silent
// breakage where the grid falls back to auto-fit).
const GRID_COLS = "grid-cols-[1fr_88px_88px]";

// ── Component ───────────────────────────────────────────────────

export function DisplayLocationGrid({
  sections,
  onChange,
}: DisplayLocationGridProps) {
  // Aggregate every row across every section. The bulk "All/None"
  // toggles ignore sub-section boundaries — flipping "ticker = none"
  // affects every row in the entire grid, which matches the user's
  // "flip every row in that column" intent.
  const allRows = sections.flatMap((s) => s.rows);

  const allFeedOn =
    allRows.length > 0 && allRows.every((r) => enumToBools(r.value).feed);
  const allFeedOff =
    allRows.length > 0 && allRows.every((r) => !enumToBools(r.value).feed);
  const allTickerOn =
    allRows.length > 0 && allRows.every((r) => enumToBools(r.value).ticker);
  const allTickerOff =
    allRows.length > 0 && allRows.every((r) => !enumToBools(r.value).ticker);

  /** Build a single patch for all rows when a column-level All/None
   *  bulk toggle fires. Emits ONE onChange so the caller can apply
   *  the whole thing in one state update. */
  function setColumn(column: "feed" | "ticker", on: boolean) {
    const changes: Record<string, Venue> = {};
    for (const row of allRows) {
      const bools = enumToBools(row.value);
      const next = boolsToEnum(
        column === "feed" ? on : bools.feed,
        column === "ticker" ? on : bools.ticker,
      );
      if (next !== row.value) changes[row.key] = next;
    }
    if (Object.keys(changes).length > 0) onChange(changes);
  }

  function toggleOne(rowKey: string, current: Venue, column: "feed" | "ticker") {
    const bools = enumToBools(current);
    const next = boolsToEnum(
      column === "feed" ? !bools.feed : bools.feed,
      column === "ticker" ? !bools.ticker : bools.ticker,
    );
    onChange({ [rowKey]: next });
  }

  return (
    <div role="grid" aria-label="Display locations" className="select-none">
      {/* ── Header strip ──────────────────────────────────────── */}
      {/*
        Note: the first cell MUST be a real grid item with normal
        layout (a <div>, not a <span class="sr-only">). `sr-only`
        applies `position: absolute`, which removes the element from
        CSS Grid track placement. With that placeholder removed from
        flow, the "Feed" header lands in column 1 (the 1fr cell) and
        "Ticker" lands in column 2, leaving column 3 empty — exactly
        the misalignment seen in user screenshots before this fix.
        Putting the sr-only text inside a real <div> keeps the grid
        cell occupied while still reading "Setting" to screen readers.
      */}
      <div
        role="row"
        className={clsx(
          "grid gap-x-2 px-2 pb-2 mb-1 border-b border-edge/30",
          GRID_COLS,
        )}
      >
        <div role="columnheader">
          <span className="sr-only">Setting</span>
        </div>
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
              className={clsx("grid gap-x-2 px-2 mt-3 mb-1", GRID_COLS)}
            >
              <div
                role="columnheader"
                className="col-span-3 text-[10px] font-mono font-semibold uppercase tracking-wider text-fg-4"
              >
                {section.title}
              </div>
            </div>
          )}
          {section.rows.map((row) => (
            <GridRow
              key={row.key}
              row={row}
              onToggle={(col) => toggleOne(row.key, row.value, col)}
            />
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

function ColumnHeader({
  label,
  allOn,
  allOff,
  onAll,
  onNone,
}: ColumnHeaderProps) {
  return (
    // Column is a fixed-width cell. Every child is text-centered so
    // the label AND the All/None line both sit over the checkbox
    // center in the rows below.
    <div
      role="columnheader"
      className="flex flex-col items-center gap-0.5 text-center"
    >
      <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-3 leading-tight">
        {label}
      </span>
      <div className="flex items-center justify-center gap-1 text-[10px] leading-none">
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

interface GridRowProps {
  row: DisplayGridRow;
  onToggle: (column: "feed" | "ticker") => void;
}

function GridRow({ row, onToggle }: GridRowProps) {
  const { feed, ticker } = enumToBools(row.value);
  const labelId = `disp-${row.key}-label`;

  return (
    <div
      role="row"
      className={clsx(
        "grid items-center gap-x-2 px-2 py-2 rounded-lg hover:bg-base-250/30 transition-colors",
        GRID_COLS,
      )}
    >
      <div role="rowheader" className="flex flex-col gap-0.5 min-w-0">
        <span
          id={labelId}
          className="text-[12px] text-fg-2 leading-tight"
        >
          {row.label}
        </span>
        {row.description && (
          <span className="text-[11px] text-fg-4 leading-tight">
            {row.description}
          </span>
        )}
      </div>
      <CheckboxCell
        checked={feed}
        onToggle={() => onToggle("feed")}
        ariaLabel={`Show ${row.label} in Feed`}
        ariaLabelledBy={labelId}
      />
      <CheckboxCell
        checked={ticker}
        onToggle={() => onToggle("ticker")}
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
    // Checkbox cell is the same fixed-width column as the header
    // above. Contents are centered so the checkbox visually sits
    // directly under the "Feed" / "Ticker" label and the All/None
    // controls.
    <div role="gridcell" className="flex items-center justify-center">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={onToggle}
        className={clsx(
          "h-[18px] w-[18px] rounded-md flex items-center justify-center transition-colors cursor-pointer shrink-0",
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
          className={clsx("h-3 w-3", checked ? "opacity-100" : "opacity-0")}
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
