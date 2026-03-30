/**
 * DashboardCard — wrapper for dashboard summary cards.
 *
 * Renders a consistent card with hex-colored accent border, icon,
 * name, and hover-revealed action controls. Source-level management
 * (ticker toggle, remove, configure) are inline on the card.
 *
 * All cards use header-click navigation (click name → source feed).
 */
import { useState, useRef, useEffect } from "react";
import { Settings, ArrowRight, X, Eye, EyeOff } from "lucide-react";
import clsx from "clsx";
import Tooltip from "../Tooltip";

interface DashboardCardProps {
  /** Source name (e.g., "Finance", "Clock"). */
  name: string;
  /** Lucide icon component. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Hex accent color. */
  hex: string;
  /** Click to navigate to the feed. */
  onClick: () => void;
  /** Click the gear icon to configure. */
  onConfigure: () => void;
  /** Card content (summary component). */
  children: React.ReactNode;

  /** Whether this source is visible on the ticker. */
  tickerEnabled: boolean;
  /** Toggle ticker visibility for this source. */
  onToggleTicker: () => void;
  /** Remove this source. */
  onRemove: () => void;
}

export default function DashboardCard({
  name,
  icon: Icon,
  hex,
  onClick,
  onConfigure,
  children,
  tickerEnabled,
  onToggleTicker,
  onRemove,
}: DashboardCardProps) {
  // ── Two-click delete confirmation ────────────────────────────
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (deleteArmed) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      onRemove();
      setDeleteArmed(false);
    } else {
      setDeleteArmed(true);
      deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
    }
  }

  return (
    <div
      className={clsx(
        "group/card relative flex flex-col rounded-xl border border-edge/60",
        "bg-surface-2/50 hover:bg-surface-2 transition-colors overflow-hidden",
      )}
    >
      {/* Left accent bar — reflects ticker state */}
      <div
        className={clsx(
          "absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-opacity duration-300",
          tickerEnabled ? "opacity-100" : "opacity-20",
        )}
        style={{ background: hex }}
      />

      {/* Header */}
      <div className="relative flex items-center px-4 pt-3.5 pb-2">
        {/* Title area — clickable to navigate to feed */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="group/title flex items-center gap-2.5 min-w-0 rounded-lg -ml-1 pl-1 pr-2 -my-0.5 py-0.5 hover:bg-surface-3/50 transition-colors"
        >
          <span
            className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
            style={{ backgroundColor: `${hex}15`, color: hex }}
          >
            <Icon size={15} />
          </span>
          <span className="text-[13px] font-semibold text-fg truncate">
            {name}
          </span>
          <ArrowRight
            size={12}
            className="text-fg-4 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
          />
        </button>

        {/* Action controls — absolutely positioned, hover-revealed */}
        <div
          className={clsx(
            "absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-lg px-1 py-0.5 transition-opacity",
            deleteArmed
              ? "opacity-100 bg-surface-2"
              : "opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto bg-surface-2",
          )}
        >
          {/* Ticker visibility toggle */}
          <Tooltip content={tickerEnabled ? "Visible on ticker" : "Hidden from ticker"}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleTicker();
              }}
              aria-label={tickerEnabled ? `Hide ${name} from ticker` : `Show ${name} on ticker`}
              className={clsx(
                "w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0",
                tickerEnabled
                  ? "text-fg-3 hover:text-fg hover:bg-surface-hover"
                  : "text-fg-4/60 hover:text-fg-2 hover:bg-surface-hover",
                "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40",
              )}
            >
              {tickerEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          </Tooltip>

          {/* Gear — configure source */}
          <Tooltip content="Configure">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfigure();
              }}
              aria-label={`Configure ${name}`}
              className="w-6 h-6 flex items-center justify-center rounded-md text-fg-4 hover:text-fg-2 hover:bg-surface-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 transition-all shrink-0"
            >
              <Settings size={12} />
            </button>
          </Tooltip>

          {/* Remove (two-click confirm) */}
          <Tooltip content={deleteArmed ? "Click again to confirm" : "Remove"}>
            <button
              onClick={handleDeleteClick}
              aria-label={deleteArmed ? `Confirm removal of ${name}` : `Remove ${name}`}
              className={clsx(
                "flex items-center gap-1 rounded-md transition-all shrink-0",
                deleteArmed
                  ? "px-2 py-0.5 text-red-500 bg-red-500/10"
                  : "w-6 h-6 justify-center text-fg-4 hover:text-red-400 hover:bg-red-500/10",
                "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/40",
              )}
            >
              <X size={12} />
              {deleteArmed && (
                <span className="text-[10px] font-medium">Remove?</span>
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Content — summary */}
      <div className="px-4 pb-3.5 flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
