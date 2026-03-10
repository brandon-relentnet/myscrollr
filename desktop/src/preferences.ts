// ── Preferences system ──────────────────────────────────────────
// Centralized types, defaults, and helpers for all desktop settings.
// All prefs are stored in localStorage under the `scrollr:` prefix.

// ── Types ────────────────────────────────────────────────────────

export type Theme = "light" | "dark" | "system";
export type TaskbarHeight = "compact" | "default" | "comfortable";
export type TickerGap = "tight" | "normal" | "spacious";
export type TickerMode = "compact" | "comfort";
export type DefaultView = "feed" | "dashboard" | "last";
export type TickerRows = 1 | 2 | 3;
export type MixMode = "grouped" | "weave" | "random";
export type ChipColorMode = "channel" | "accent" | "muted";

export interface AppearancePrefs {
  theme: Theme;
  uiScale: number; // 75–150, default 100
  tickerRows: TickerRows;
}

export interface TickerPrefs {
  showTicker: boolean;
  tickerSpeed: number;
  pauseOnHover: boolean;
  hoverSpeed: number;
  tickerGap: TickerGap;
  tickerMode: TickerMode;
  mixMode: MixMode;
  chipColors: ChipColorMode;
}

export interface StartupPrefs {
  defaultView: DefaultView;
  refreshInterval: number;
  autostart: boolean;
}

export type TickerPosition = "top" | "bottom";

export interface WindowPrefs {
  pinned: boolean;
  defaultWidth: "full" | "narrow";
  narrowWidth: number;
  skipTaskbar: boolean;
  tickerPosition: TickerPosition;
}

export interface TaskbarPrefs {
  showChannelIcons: boolean;
  showConnectionIndicator: boolean;
  showCanvasToggle: boolean;
  taskbarHeight: TaskbarHeight;
  pinnedActions: string[];
}

export interface AppPreferences {
  appearance: AppearancePrefs;
  ticker: TickerPrefs;
  startup: StartupPrefs;
  window: WindowPrefs;
  taskbar: TaskbarPrefs;
}

// ── Defaults ────────────────────────────────────────────────────

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: "dark",
  uiScale: 100,
  tickerRows: 1,
};

export const DEFAULT_TICKER: TickerPrefs = {
  showTicker: true,
  tickerSpeed: 40,
  pauseOnHover: true,
  hoverSpeed: 0.3,
  tickerGap: "normal",
  tickerMode: "compact",
  mixMode: "grouped",
  chipColors: "channel",
};

export const DEFAULT_STARTUP: StartupPrefs = {
  defaultView: "last",
  refreshInterval: 60_000,
  autostart: false,
};

export const DEFAULT_WINDOW: WindowPrefs = {
  pinned: true,
  defaultWidth: "full",
  narrowWidth: 800,
  skipTaskbar: true,
  tickerPosition: "top",
};

export const DEFAULT_TASKBAR: TaskbarPrefs = {
  showChannelIcons: true,
  showConnectionIndicator: true,
  showCanvasToggle: true,
  taskbarHeight: "default",
  pinnedActions: ["showTicker", "width", "pinned"],
};

export const DEFAULT_PREFS: AppPreferences = {
  appearance: DEFAULT_APPEARANCE,
  ticker: DEFAULT_TICKER,
  startup: DEFAULT_STARTUP,
  window: DEFAULT_WINDOW,
  taskbar: DEFAULT_TASKBAR,
};

// ── Storage helpers ─────────────────────────────────────────────

const PREFIX = "scrollr:settings";

/** Migrate v1 prefs (general/taskbar/ticker/window) to v2 shape. */
function migrateV1(saved: Record<string, unknown>): Partial<AppPreferences> {
  const result: Record<string, unknown> = {};

  // Old "general" → split into startup + appearance
  const general = saved.general as Record<string, unknown> | undefined;
  if (general) {
    result.startup = {
      defaultView: general.defaultView ?? DEFAULT_STARTUP.defaultView,
      refreshInterval: general.refreshInterval ?? DEFAULT_STARTUP.refreshInterval,
      autostart: general.autostart ?? DEFAULT_STARTUP.autostart,
    };
    // smoothScroll and scrollSmoothness are dropped (removed)
  }

  // Old "taskbar" → taskbar (add pinnedActions)
  const taskbar = saved.taskbar as Record<string, unknown> | undefined;
  if (taskbar) {
    result.taskbar = {
      ...DEFAULT_TASKBAR,
      ...taskbar,
      // v1 had no pinnedActions; default to the standard set
      pinnedActions: (taskbar.pinnedActions as string[]) ?? DEFAULT_TASKBAR.pinnedActions,
    };
  }

  // "ticker" stays the same shape
  if (saved.ticker) {
    result.ticker = { ...DEFAULT_TICKER, ...(saved.ticker as Record<string, unknown>) };
  }

  // "window" stays the same shape
  if (saved.window) {
    result.window = { ...DEFAULT_WINDOW, ...(saved.window as Record<string, unknown>) };
  }

  // New keys — use defaults (appearance didn't exist in v1)
  if (!result.appearance && !saved.appearance) {
    result.appearance = { ...DEFAULT_APPEARANCE };
  }

  return result as Partial<AppPreferences>;
}

// ── Single-key helpers ──────────────────────────────────────────
// For ad-hoc prefs not in the structured AppPreferences object
// (e.g. feedHeight, activeTab, canvasMode). Used by both windows.

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`scrollr:${key}`);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function savePref<T>(key: string, value: T): void {
  localStorage.setItem(`scrollr:${key}`, JSON.stringify(value));
}

// ── Structured preferences ─────────────────────────────────────

export function loadPrefs(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFIX);
    if (!raw) return { ...DEFAULT_PREFS };
    const saved = JSON.parse(raw) as Record<string, unknown>;

    // Detect v1 format: has "general" key but no "appearance" key
    const isV1 = "general" in saved && !("appearance" in saved);
    const source = isV1 ? migrateV1(saved) : (saved as Partial<AppPreferences>);

    // Deep merge with defaults so new keys are always present
    const merged: AppPreferences = {
      appearance: { ...DEFAULT_APPEARANCE, ...source.appearance },
      ticker: { ...DEFAULT_TICKER, ...source.ticker },
      startup: { ...DEFAULT_STARTUP, ...source.startup },
      window: { ...DEFAULT_WINDOW, ...source.window },
      taskbar: { ...DEFAULT_TASKBAR, ...source.taskbar },
    };

    // If migrated from v1, persist the new format
    if (isV1) {
      localStorage.setItem(PREFIX, JSON.stringify(merged));
    }

    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: AppPreferences): void {
  localStorage.setItem(PREFIX, JSON.stringify(prefs));
}

/** Reset a single category to its defaults. */
export function resetCategory<K extends keyof AppPreferences>(
  prefs: AppPreferences,
  category: K,
): AppPreferences {
  return { ...prefs, [category]: { ...DEFAULT_PREFS[category] } };
}

/** Reset everything to defaults. */
export function resetAll(): AppPreferences {
  const defaults: AppPreferences = {
    appearance: { ...DEFAULT_APPEARANCE },
    ticker: { ...DEFAULT_TICKER },
    startup: { ...DEFAULT_STARTUP },
    window: { ...DEFAULT_WINDOW },
    taskbar: { ...DEFAULT_TASKBAR },
  };
  savePrefs(defaults);
  return defaults;
}

// ── Derived values ──────────────────────────────────────────────

export const TASKBAR_HEIGHTS: Record<TaskbarHeight, number> = {
  compact: 28,
  default: 36,
  comfortable: 44,
};

export const TICKER_GAPS: Record<TickerGap, number> = {
  tight: 8,
  normal: 12,
  spacious: 20,
};

export const TICKER_HEIGHTS: Record<TickerMode, number> = {
  compact: 44,
  comfort: 64,
};

// ── Pinnable actions registry ───────────────────────────────────
// Defines which settings can be pinned to the taskbar as quick toggles.

export interface PinnableAction {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  category: "appearance" | "ticker" | "window";
}

export const PINNABLE_ACTIONS: PinnableAction[] = [
  { id: "showTicker", label: "Ticker", icon: "TicketSlash", category: "ticker" },
  { id: "width", label: "Width", icon: "ArrowLeftRight", category: "window" },
  { id: "pinned", label: "Pin", icon: "Pin", category: "window" },
  { id: "theme", label: "Theme", icon: "Moon", category: "appearance" },
  { id: "tickerRows", label: "Rows", icon: "Rows3", category: "appearance" },
  { id: "tickerMode", label: "Density", icon: "Rows3", category: "ticker" },
  { id: "mixMode", label: "Mix", icon: "Shuffle", category: "ticker" },
];
