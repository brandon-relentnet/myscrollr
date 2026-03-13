/**
 * DashboardCard — wrapper for dashboard summary cards.
 *
 * Renders a consistent card with hex-colored accent border, icon,
 * name, and hover-revealed action controls. All management actions
 * (ticker toggle, reorder, configure, remove) are inline on the card.
 *
 * Card display preferences (what data the summary shows) are edited
 * via a per-card inline expansion — click the sliders icon to toggle.
 *
 * All cards use header-click navigation (click name → source feed).
 */
import { useState, useRef, useEffect } from "react";
import { Settings, SlidersHorizontal, ChevronUp, ChevronDown, ArrowRight, X } from "lucide-react";
import clsx from "clsx";
import CardEditor from "./CardEditor";
import type { EditorField } from "./dashboardPrefs";

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
  /** Move this card up in the order (undefined = first, disabled). */
  onMoveUp?: () => void;
  /** Move this card down in the order (undefined = last, disabled). */
  onMoveDown?: () => void;
  /** Remove this source. */
  onRemove: () => void;

  /** Editor schema for card display prefs. */
  schema?: EditorField[];
  /** Current card display pref values. */
  editorValues?: Record<string, boolean | number>;
  /** Callback when a card display pref changes. */
  onEditorChange?: (key: string, value: boolean | number) => void;
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
  onMoveUp,
  onMoveDown,
  onRemove,
  schema,
  editorValues,
  onEditorChange,
}: DashboardCardProps) {
  // ── Per-card customize expansion ─────────────────────────────
  const [customizing, setCustomizing] = useState(false);
  const hasEditor = schema && editorValues && onEditorChange;

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
        customizing && "ring-1 ring-accent/15",
      )}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ background: hex }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
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

        {/* Action controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Ticker status dot — always visible */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleTicker();
            }}
            aria-label={tickerEnabled ? `Hide ${name} from ticker` : `Show ${name} on ticker`}
            title={tickerEnabled ? "Visible on ticker" : "Hidden from ticker"}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover transition-colors"
          >
            <div
              className={clsx(
                "w-[7px] h-[7px] rounded-full transition-all duration-300",
                tickerEnabled
                  ? "shadow-[0_0_4px_var(--glow-color)]"
                  : "opacity-40",
              )}
              style={{
                background: tickerEnabled ? hex : "var(--color-fg-4)",
                "--glow-color": `${hex}60`,
              } as React.CSSProperties}
            />
          </button>

          {/* Customize card display (hover-revealed, toggles inline editor) */}
          {hasEditor && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCustomizing((p) => !p);
              }}
              aria-label={customizing ? "Close card customization" : "Customize card display"}
              title={customizing ? "Done customizing" : "Customize card"}
              className={clsx(
                "w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0",
                customizing
                  ? "opacity-100 text-accent bg-accent/10"
                  : "text-fg-4 opacity-0 group-hover/card:opacity-60 hover:!opacity-100 hover:text-fg-2 hover:bg-surface-hover",
                "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40",
              )}
            >
              <SlidersHorizontal size={12} />
            </button>
          )}

          {/* Gear — configure source (hover-revealed) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfigure();
            }}
            aria-label={`Configure ${name}`}
            title="Configure"
            className="w-6 h-6 flex items-center justify-center rounded-md text-fg-4 opacity-0 group-hover/card:opacity-60 hover:!opacity-100 hover:text-fg-2 hover:bg-surface-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 transition-all shrink-0"
          >
            <Settings size={12} />
          </button>

          {/* Reorder arrows (hover-revealed) */}
          <div className="flex items-center opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp?.();
              }}
              disabled={!onMoveUp}
              className={clsx(
                "w-5 h-5 flex items-center justify-center rounded transition-colors",
                onMoveUp
                  ? "text-fg-4 hover:text-fg-2 hover:bg-surface-hover"
                  : "text-fg-4/20 cursor-default",
              )}
              aria-label={`Move ${name} up`}
              title="Move up"
            >
              <ChevronUp size={13} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown?.();
              }}
              disabled={!onMoveDown}
              className={clsx(
                "w-5 h-5 flex items-center justify-center rounded transition-colors",
                onMoveDown
                  ? "text-fg-4 hover:text-fg-2 hover:bg-surface-hover"
                  : "text-fg-4/20 cursor-default",
              )}
              aria-label={`Move ${name} down`}
              title="Move down"
            >
              <ChevronDown size={13} />
            </button>
          </div>

          {/* Remove (hover-revealed, two-click confirm) */}
          <button
            onClick={handleDeleteClick}
            aria-label={deleteArmed ? `Confirm removal of ${name}` : `Remove ${name}`}
            title={deleteArmed ? "Click again to confirm" : "Remove"}
            className={clsx(
              "flex items-center gap-1 rounded-md transition-all shrink-0",
              deleteArmed
                ? "opacity-100 px-2 py-0.5 text-red-500 bg-red-500/10"
                : "opacity-0 group-hover/card:opacity-60 hover:!opacity-100 w-6 h-6 justify-center text-fg-4 hover:text-red-400 hover:bg-red-500/10",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/40",
            )}
          >
            <X size={12} />
            {deleteArmed && (
              <span className="text-[10px] font-medium">Remove?</span>
            )}
          </button>
        </div>
      </div>

      {/* Content — summary */}
      <div className="px-4 pb-3.5 flex-1 min-h-0">
        {children}
      </div>

      {/* Inline card editor — per-card expansion */}
      {customizing && hasEditor && (
        <div className="px-4 pb-3.5 pt-2 border-t border-edge/40">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-4 mb-1.5">
            Card display
          </p>
          <CardEditor
            schema={schema}
            values={editorValues}
            onChange={onEditorChange}
          />
        </div>
      )}
    </div>
  );
}

// ── Ghost card for un-added sources ─────────────────────────────

interface GhostCardProps {
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hex: string;
  onClick: () => void;
}

export function GhostCard({ name, description, icon: Icon, hex, onClick }: GhostCardProps) {
  return (
    <button
      onClick={onClick}
      aria-label={`Add ${name}`}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge/40 hover:border-edge bg-transparent hover:bg-surface-2/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent/30 transition-all p-5 cursor-pointer min-h-[120px]"
    >
      <span style={{ color: hex }} className="opacity-40">
        <Icon size={20} />
      </span>
      <span className="text-[12px] font-medium text-fg-3">{name}</span>
      <span className="text-[10px] text-fg-4 text-center leading-snug max-w-[160px]">
        {description}
      </span>
    </button>
  );
}
