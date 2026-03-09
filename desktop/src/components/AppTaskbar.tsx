import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import {
  Sun,
  Moon,
  Pin,
  PinOff,
  Rows3,
  Rows2,
  TicketSlash,
  TicketCheck,
} from "lucide-react";
import type { AppPreferences, TickerRows } from "../preferences";
import { savePrefs } from "../preferences";

// ── Props ───────────────────────────────────────────────────────

interface AppTaskbarProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
  showTicker: boolean;
  onToggleTicker: () => void;
}

// ── Component ───────────────────────────────────────────────────

export default function AppTaskbar({
  prefs,
  onPrefsChange,
  showTicker,
  onToggleTicker,
}: AppTaskbarProps) {
  const isDark =
    prefs.appearance.theme === "dark" ||
    (prefs.appearance.theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const isPinned = prefs.window.pinned;
  const rows = prefs.appearance.tickerRows;

  function update(next: AppPreferences) {
    onPrefsChange(next);
    savePrefs(next);
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
    <div className="flex items-center gap-0.5 px-3 h-8 border-b border-edge/50 bg-surface-2/50 shrink-0">
      {/* Left: label */}
      <span className="text-[10px] font-mono text-fg-4 uppercase tracking-widest mr-auto select-none">
        Quick
      </span>

      {/* Actions */}
      <button
        onClick={toggleTheme}
        className={btnIdle}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      <button
        onClick={onToggleTicker}
        className={clsx(showTicker ? btnActive : btnIdle)}
        title={showTicker ? "Hide ticker preview" : "Show ticker preview"}
      >
        {showTicker ? <TicketCheck size={14} /> : <TicketSlash size={14} />}
      </button>

      <button
        onClick={cycleRows}
        className={btnIdle}
        title={`Ticker rows: ${rows} (click to cycle)`}
      >
        {rows <= 1 ? <Rows2 size={14} /> : <Rows3 size={14} />}
      </button>

      <button
        onClick={togglePin}
        className={clsx(isPinned ? btnActive : btnIdle)}
        title={isPinned ? "Unpin from top" : "Pin on top"}
      >
        {isPinned ? <Pin size={14} /> : <PinOff size={14} />}
      </button>


    </div>
  );
}
