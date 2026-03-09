// ── Preferences system ──────────────────────────────────────────
// Centralized types, defaults, and helpers for all desktop settings.
// All prefs are stored in localStorage under the `scrollr:` prefix.

// ── Types ────────────────────────────────────────────────────────

export type TaskbarHeight = "compact" | "default" | "comfortable";
export type TickerGap = "tight" | "normal" | "spacious";
export type TickerMode = "compact" | "comfort";
export type DefaultView = "feed" | "dashboard" | "last";

export interface GeneralPrefs {
  defaultView: DefaultView;
  refreshInterval: number;
  smoothScroll: boolean;
  scrollSmoothness: number;
  autostart: boolean;
}

export interface TaskbarPrefs {
  showChannelIcons: boolean;
  showConnectionIndicator: boolean;
  showCanvasToggle: boolean;
  showTickerToggle: boolean;
  showWidthToggle: boolean;
  showPinButton: boolean;
  taskbarHeight: TaskbarHeight;
}

export interface TickerPrefs {
  showTicker: boolean;
  tickerSpeed: number;
  pauseOnHover: boolean;
  hoverSpeed: number;
  tickerGap: TickerGap;
  tickerMode: TickerMode;
}

export interface WindowPrefs {
  pinned: boolean;
  defaultWidth: "full" | "narrow";
  narrowWidth: number;
  skipTaskbar: boolean;
}

export interface AppPreferences {
  general: GeneralPrefs;
  taskbar: TaskbarPrefs;
  ticker: TickerPrefs;
  window: WindowPrefs;
}

// ── Defaults ────────────────────────────────────────────────────

export const DEFAULT_GENERAL: GeneralPrefs = {
  defaultView: "last",
  refreshInterval: 60_000,
  smoothScroll: true,
  scrollSmoothness: 0.1,
  autostart: false,
};

export const DEFAULT_TASKBAR: TaskbarPrefs = {
  showChannelIcons: true,
  showConnectionIndicator: true,
  showCanvasToggle: true,
  showTickerToggle: true,
  showWidthToggle: true,
  showPinButton: true,
  taskbarHeight: "default",
};

export const DEFAULT_TICKER: TickerPrefs = {
  showTicker: true,
  tickerSpeed: 40,
  pauseOnHover: true,
  hoverSpeed: 0.3,
  tickerGap: "normal",
  tickerMode: "compact",
};

export const DEFAULT_WINDOW: WindowPrefs = {
  pinned: true,
  defaultWidth: "full",
  narrowWidth: 800,
  skipTaskbar: true,
};

export const DEFAULT_PREFS: AppPreferences = {
  general: DEFAULT_GENERAL,
  taskbar: DEFAULT_TASKBAR,
  ticker: DEFAULT_TICKER,
  window: DEFAULT_WINDOW,
};

// ── Storage helpers ─────────────────────────────────────────────

const PREFIX = "scrollr:settings";

export function loadPrefs(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFIX);
    if (!raw) return { ...DEFAULT_PREFS };
    const saved = JSON.parse(raw) as Partial<AppPreferences>;
    // Deep merge with defaults so new keys are always present
    return {
      general: { ...DEFAULT_GENERAL, ...saved.general },
      taskbar: { ...DEFAULT_TASKBAR, ...saved.taskbar },
      ticker: { ...DEFAULT_TICKER, ...saved.ticker },
      window: { ...DEFAULT_WINDOW, ...saved.window },
    };
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
  const defaults = {
    general: { ...DEFAULT_GENERAL },
    taskbar: { ...DEFAULT_TASKBAR },
    ticker: { ...DEFAULT_TICKER },
    window: { ...DEFAULT_WINDOW },
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
