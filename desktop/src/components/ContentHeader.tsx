/**
 * ContentHeader — source-specific header for channel/widget detail views.
 *
 * Shows: back button, source name + icon, ticker toggle, tab pills,
 * and a double-click-confirm delete button.
 */
import { useState, useRef } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import clsx from "clsx";

// ── Types ───────────────────────────────────────────────────────

type SourceTab = "feed" | "info" | "configuration";

interface ContentHeaderProps {
  /** Source name (e.g., "Finance", "Clock"). */
  name: string;
  /** Lucide icon component for the source. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Hex accent color for the source. */
  hex: string;
  /** Currently active tab. */
  activeTab: SourceTab;
  /** Tab change handler. */
  onTabChange: (tab: SourceTab) => void;
  /** Whether this source is visible on the ticker. */
  tickerEnabled: boolean;
  /** Toggle ticker visibility for this source. */
  onToggleTicker: () => void;
  /** Delete/remove this source. */
  onDelete: () => void;
  /** Navigate back to the feed dashboard. */
  onBack: () => void;
}

// ── Tab definitions ─────────────────────────────────────────────

const TABS: { key: SourceTab; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "info", label: "About" },
  { key: "configuration", label: "Settings" },
];

// ── Component ───────────────────────────────────────────────────

export default function ContentHeader({
  name,
  icon: Icon,
  hex,
  activeTab,
  onTabChange,
  tickerEnabled,
  onToggleTicker,
  onDelete,
  onBack,
}: ContentHeaderProps) {
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleDeleteClick() {
    if (deleteArmed) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      onDelete();
      setDeleteArmed(false);
    } else {
      setDeleteArmed(true);
      deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
    }
  }

  return (
    <header className="flex items-center justify-between px-5 h-14 border-b border-edge shrink-0">
      {/* Left — back, icon, name, ticker toggle */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onBack}
          title="Back to dashboard"
          className="w-7 h-7 flex items-center justify-center rounded-md text-fg-3 hover:text-fg-2 hover:bg-surface-hover transition-colors shrink-0"
        >
          <ArrowLeft size={15} />
        </button>

        <span
          className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
          style={{ backgroundColor: `${hex}15`, color: hex }}
        >
          <Icon size={14} />
        </span>

        <h1 className="text-sm font-semibold truncate">{name}</h1>

        {/* Ticker toggle — spring-animated switch */}
        <button
          onClick={onToggleTicker}
          className="shrink-0"
          title={tickerEnabled ? "Visible on ticker" : "Hidden from ticker"}
          aria-label={tickerEnabled ? "Hide from ticker" : "Show on ticker"}
        >
          <span
            className="block h-4 w-7 rounded-full relative transition-colors"
            style={{ background: tickerEnabled ? hex : undefined }}
          >
            {!tickerEnabled && (
              <span className="absolute inset-0 rounded-full bg-fg-4/25" />
            )}
            <motion.span
              className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white"
              animate={{ x: tickerEnabled ? 12 : 0 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
              }}
            />
          </span>
        </button>
      </div>

      {/* Right — tabs + delete */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex gap-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeTab === key
                  ? "bg-accent/10 text-accent"
                  : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={handleDeleteClick}
          className={clsx(
            "px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5",
            deleteArmed
              ? "text-red-500 bg-red-500/10"
              : "text-fg-4/40 hover:text-red-500",
          )}
          title={
            deleteArmed
              ? "Click again to confirm removal"
              : "Remove this source"
          }
        >
          <Trash2 size={14} />
          {deleteArmed && (
            <span className="text-[11px] font-medium">Remove?</span>
          )}
        </button>
      </div>
    </header>
  );
}
