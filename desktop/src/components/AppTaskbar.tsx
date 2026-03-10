import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import {
  Sun,
  Moon,
  Pin,
  PinOff,
  Rows2,
  Rows3,
  Rows4,
  TicketSlash,
  TicketCheck,
} from "lucide-react";
import type { AppPreferences, TickerRows } from "../preferences";
import { TASKBAR_HEIGHTS, resolveTheme } from "../preferences";
import type { DeliveryMode } from "~/utils/types";

// ── Props ───────────────────────────────────────────────────────

interface AppTaskbarProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
  showTicker: boolean;
  onToggleTicker: () => void;
  tickerAlive: boolean;
  onToggleStandaloneTicker: () => void;
  deliveryMode: DeliveryMode;
}

// ── Component ───────────────────────────────────────────────────

export default function AppTaskbar({
  prefs,
  onPrefsChange,
  showTicker,
  onToggleTicker,
  tickerAlive,
  onToggleStandaloneTicker,
  deliveryMode,
}: AppTaskbarProps) {
  const isDark = resolveTheme(prefs.appearance.theme) === "dark";

  const isPinned = prefs.window.pinned;
  const rows = prefs.appearance.tickerRows;
  const taskbarH = TASKBAR_HEIGHTS[prefs.taskbar.taskbarHeight];

  const RowIcon = rows === 1 ? Rows2 : rows === 2 ? Rows3 : Rows4;

  function update(next: AppPreferences) {
    onPrefsChange(next);
  }

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    update({
      ...prefs,
      appearance: { ...prefs.appearance, theme: next },
    });
  }

  function togglePin() {
    const next = !isPinned;
    update({
      ...prefs,
      window: { ...prefs.window, pinned: next },
    });
    invoke("pin_window", { pinned: next }).catch(() => {});
  }

  function cycleRows() {
    const next = ((rows % 3) + 1) as TickerRows;
    update({
      ...prefs,
      appearance: { ...prefs.appearance, tickerRows: next },
    });
  }

  const btnBase =
    "flex items-center justify-center w-7 h-7 rounded-md transition-colors cursor-pointer";
  const btnIdle = `${btnBase} text-fg-3 hover:text-fg hover:bg-surface-hover`;
  const btnActive = `${btnBase} text-accent hover:text-accent hover:bg-accent/10`;

  return (
    <div
      className="flex items-center gap-0.5 px-3 border-b border-edge/50 bg-surface-2/50 shrink-0"
      style={{ height: `${taskbarH}px` }}
    >
      {/* Left: status indicators */}
      <div className="flex items-center gap-3 mr-auto select-none">
        {/* Ticker toggle + status */}
        <div className="flex items-center gap-1.5">
          <button
            role="switch"
            aria-checked={tickerAlive}
            aria-label="Toggle ticker widget"
            className="toggle-switch shrink-0"
            data-checked={tickerAlive}
            onClick={onToggleStandaloneTicker}
          />
          <div
            className={clsx(
              "w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-500",
              tickerAlive
                ? "bg-accent ekg-dot"
                : "bg-fg-4/30 scale-75",
            )}
          />
          <span className={clsx(
            "text-[11px] font-mono uppercase tracking-widest transition-colors duration-300",
            tickerAlive ? "text-accent" : "text-fg-4",
          )}>
            {tickerAlive ? "Ticker" : "Off"}
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-edge" />

        {/* Data delivery mode */}
        <div className="flex items-center gap-1.5">
          <div
            className={clsx(
              "w-1.5 h-1.5 rounded-full shrink-0",
              deliveryMode === "sse"
                ? "bg-info motion-safe:animate-pulse"
                : "bg-warn motion-safe:animate-pulse",
            )}
          />
          <span className={clsx(
            "text-[11px] font-mono uppercase tracking-widest",
            deliveryMode === "sse" ? "text-info" : "text-warn",
          )}>
            {deliveryMode === "sse" ? "SSE" : "Poll"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={toggleTheme}
        className={btnIdle}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      <button
        onClick={onToggleTicker}
        className={clsx(showTicker ? btnActive : btnIdle)}
        title={showTicker ? "Hide ticker preview" : "Show ticker preview"}
        aria-label={showTicker ? "Hide ticker preview" : "Show ticker preview"}
      >
        {showTicker ? <TicketCheck size={14} /> : <TicketSlash size={14} />}
      </button>

      <button
        onClick={cycleRows}
        className={clsx(btnIdle, "relative")}
        title={`Ticker rows: ${rows} (click to cycle)`}
        aria-label={`Ticker rows: ${rows}`}
      >
        <RowIcon size={14} />
        <span className="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 flex items-center justify-center rounded-full bg-accent/20 text-accent text-[8px] font-bold leading-none">
          {rows}
        </span>
      </button>

      <button
        onClick={togglePin}
        className={clsx(isPinned ? btnActive : btnIdle)}
        title={isPinned ? "Unpin from top" : "Pin on top"}
        aria-label={isPinned ? "Unpin from top" : "Pin on top"}
      >
        {isPinned ? <Pin size={14} /> : <PinOff size={14} />}
      </button>
    </div>
  );
}
