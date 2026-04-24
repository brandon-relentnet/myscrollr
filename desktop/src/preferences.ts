// ── Preferences system ──────────────────────────────────────────
// Centralized types, defaults, and helpers for all desktop settings.
// All prefs are persisted via Tauri plugin-store (disk-backed).

import { getStore, setStore } from "./lib/store";
import { getTier } from "./auth";
import { getMaxTickerRows } from "./tierLimits";

// ── Types ────────────────────────────────────────────────────────

export type Theme = "light" | "dark" | "system";
type TaskbarHeight = "compact" | "default" | "comfortable";
export type TickerGap = "tight" | "normal" | "spacious";
export type TickerMode = "compact" | "comfort";
type DefaultView = "feed" | "dashboard" | "last";
export type TickerRows = 1 | 2 | 3;
export type MixMode = "grouped" | "weave";
export type ChipColorMode = "channel" | "accent" | "muted";
export type TickerDirection = "left" | "right";
export type ScrollMode = "continuous" | "step" | "flip";
export type PinSide = "left" | "right";

export type FontWeight = "normal" | "medium" | "bold";

/** Content + optional customization for a single ticker row. */
export interface TickerRowConfig {
  /**
   * Channel/widget IDs shown on this row. Empty array falls back to
   * "all sources visible in activeTabs" — behaves like 1-row mode.
   */
  sources: string[];

  // ── Per-row scroll overrides (Ultimate-only) ──
  // When undefined, the row inherits the global prefs (prefs.ticker.*).
  scrollMode?: ScrollMode;
  direction?: TickerDirection;
  speed?: number;
  mixMode?: MixMode;
}

export interface TickerLayout {
  /** length 1..MaxTickerRows (tier-clamped on read) */
  rows: TickerRowConfig[];
}

export interface AppearancePrefs {
  theme: Theme;
  uiScale: number; // 75–150, default 100
  /** @deprecated derived from tickerLayout.rows.length. Kept in sync during the deprecation window. */
  tickerRows: TickerRows;
  /** Source of truth for the multi-deck ticker layout. */
  tickerLayout: TickerLayout;
  fontWeight: FontWeight;
  highContrast: boolean;
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
  tickerDirection: TickerDirection;
  scrollMode: ScrollMode;
  stepPause: number; // seconds between transitions (1–10)
}

interface StartupPrefs {
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

interface TaskbarPrefs {
  showChannelIcons: boolean;
  showConnectionIndicator: boolean;
  showCanvasToggle: boolean;
  taskbarHeight: TaskbarHeight;
  pinnedActions: string[];
}

// ── Per-widget config types ─────────────────────────────────────

export interface ClockTickerConfig {
  localTime: boolean;
  /** Whether to show world clocks on the ticker at all (default false). */
  showTimezones: boolean;
  /** Timezone IANA IDs excluded from the ticker (empty = all configured TZs shown). */
  excludedTimezones: string[];
  activeTimer: boolean;
}

export interface ClockPomodoroConfig {
  workMins: number;
  shortBreakMins: number;
  longBreakMins: number;
  longBreakEvery: number;
}

export interface ClockWidgetConfig {
  ticker: ClockTickerConfig;
  pomodoro: ClockPomodoroConfig;
}

export interface WeatherTickerConfig {
  /** City display names excluded from the ticker (empty = all configured cities shown). */
  excludedCities: string[];
}

export interface WeatherWidgetConfig {
  /** City display name shown on the taskbar mini chip (empty = first configured city). */
  taskbarCity: string;
  ticker: WeatherTickerConfig;
}

export type TaskbarMetric = "cpu" | "memory" | "gpu";
export type TempUnit = "celsius" | "fahrenheit";

export interface SysmonTickerConfig {
  cpu: boolean;
  memory: boolean;
  gpu: boolean;
  gpuPower: boolean;
}

export interface SysmonWidgetConfig {
  taskbarMetric: TaskbarMetric;
  refreshInterval: number;
  tempUnit: TempUnit;
  ticker: SysmonTickerConfig;
}

export interface UptimeTickerConfig {
  /** Monitor IDs excluded from the ticker (empty = all configured monitors shown). */
  excludedMonitors: number[];
}

export interface UptimeWidgetConfig {
  /** The user's Uptime Kuma public status page URL. Empty = not configured. */
  url: string;
  /** Poll interval in seconds (default 60). */
  pollInterval: number;
  ticker: UptimeTickerConfig;
}

export interface GitHubTickerConfig {
  /** Repo keys ("owner/repo") excluded from the ticker. */
  excludedRepos: string[];
}

export interface GitHubWidgetConfig {
  /** Configured repos to track. */
  repos: Array<{ owner: string; repo: string }>;
  /** Poll interval in seconds (default 120). */
  pollInterval: number;
  ticker: GitHubTickerConfig;
}

export interface WidgetPinConfig {
  side: PinSide;
  /** Which ticker row this pin belongs to (0-indexed). Defaults to 0. */
  row?: number;
}

export interface WidgetPrefs {
  /** Widget IDs that are enabled (shown in sidebar and feed tabs). */
  enabledWidgets: string[];
  /** Widget IDs whose data appears on the ticker. Subset of enabledWidgets. */
  widgetsOnTicker: string[];
  /** Per-widget pin state: removes the chip from the scrolling ticker and
   *  places it as a static element on the chosen side. Keyed by widget ID. */
  pinnedWidgets: Record<string, WidgetPinConfig>;
  clock: ClockWidgetConfig;
  weather: WeatherWidgetConfig;
  sysmon: SysmonWidgetConfig;
  uptime: UptimeWidgetConfig;
  github: GitHubWidgetConfig;
}

// ── Channel display preferences ─────────────────────────────────
// Controls what data is shown in FeedTabs and ticker chips.
// Sports display prefs live server-side (useSportsConfig), not here.

export interface FinanceDisplayPrefs {
  showChange: boolean;
  showPrevClose: boolean;
  showLastUpdated: boolean;
  defaultSort: "alpha" | "price" | "change" | "updated";
}

export interface RssDisplayPrefs {
  showDescription: boolean;
  showSource: boolean;
  showTimestamps: boolean;
  articlesPerSource: number; // 1, 3, 5, 10, or 0 (all)
}

export type FantasySubTab = "overview" | "matchup" | "standings" | "roster";

export interface FantasyDisplayPrefs {
  showStandings: boolean;
  showInjuryCount: boolean;
  showMatchups: boolean;
  defaultSort: "name" | "season" | "record" | "matchup";
  /** Which sub-tab the Feed view opens on. Defaults to overview when in 2+ leagues, matchup otherwise. */
  defaultSubTab: FantasySubTab;
  /** The user-preferred "primary" league key shown as the hero in Overview/Matchup tabs. */
  primaryLeagueKey: string | null;
  /** Explicit list of league keys the user wants visible. Empty array means "all imported leagues". */
  enabledLeagueKeys: string[];
  /** Show matchups on the always-on-top ticker chip. */
  tickerShowMatchup: boolean;
}

export interface ChannelDisplayPrefs {
  finance: FinanceDisplayPrefs;
  rss: RssDisplayPrefs;
  fantasy: FantasyDisplayPrefs;
}

/**
 * Per-channel homepage preview filter.
 *
 * Keys are group identifiers: symbols for finance, league names for
 * sports, source names for rss, and league keys for fantasy.
 * An empty array means "auto" — use default sort/slice.
 */
export type HomePreview = Record<string, string[]>;

export interface AppPreferences {
  appearance: AppearancePrefs;
  ticker: TickerPrefs;
  startup: StartupPrefs;
  window: WindowPrefs;
  taskbar: TaskbarPrefs;
  widgets: WidgetPrefs;
  channelDisplay: ChannelDisplayPrefs;
  /** Channel/widget IDs pinned to the sidebar for quick access. */
  pinnedSources: string[];
  /** Per-channel homepage preview selections (up to 5 group keys). */
  homePreview: HomePreview;
  /** Show the setup wizard when signing in. Users can disable this. */
  showSetupOnLogin: boolean;
}

// ── Defaults ────────────────────────────────────────────────────

const DEFAULT_TICKER_LAYOUT: TickerLayout = {
  rows: [{ sources: [] }],
};

const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: "dark",
  uiScale: 100,
  tickerRows: 1,
  tickerLayout: { rows: [{ sources: [] }] },
  fontWeight: "normal",
  highContrast: false,
};

const DEFAULT_TICKER: TickerPrefs = {
  showTicker: true,
  tickerSpeed: 40,
  pauseOnHover: true,
  hoverSpeed: 0.3,
  tickerGap: "tight",
  tickerMode: "comfort",
  mixMode: "weave",
  chipColors: "channel",
  tickerDirection: "left",
  scrollMode: "continuous",
  stepPause: 5,
};

const DEFAULT_STARTUP: StartupPrefs = {
  defaultView: "last",
  refreshInterval: 60_000,
  autostart: false,
};

const DEFAULT_WINDOW: WindowPrefs = {
  pinned: true,
  defaultWidth: "full",
  narrowWidth: 800,
  skipTaskbar: true,
  tickerPosition: "top",
};

const DEFAULT_TASKBAR: TaskbarPrefs = {
  showChannelIcons: true,
  showConnectionIndicator: true,
  showCanvasToggle: true,
  taskbarHeight: "default",
  pinnedActions: ["showTicker", "width", "pinned"],
};

export const DEFAULT_CLOCK_TICKER: ClockTickerConfig = {
  localTime: true,
  showTimezones: false,
  excludedTimezones: [],
  activeTimer: true,
};

export const DEFAULT_CLOCK_POMODORO: ClockPomodoroConfig = {
  workMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  longBreakEvery: 4,
};

export const DEFAULT_WEATHER_TICKER: WeatherTickerConfig = {
  excludedCities: [],
};

export const DEFAULT_SYSMON_TICKER: SysmonTickerConfig = {
  cpu: true,
  memory: true,
  gpu: false,
  gpuPower: false,
};

export const DEFAULT_UPTIME_TICKER: UptimeTickerConfig = {
  excludedMonitors: [],
};

export const DEFAULT_GITHUB_TICKER: GitHubTickerConfig = {
  excludedRepos: [],
};

const DEFAULT_CHANNEL_DISPLAY: ChannelDisplayPrefs = {
  finance: { showChange: true, showPrevClose: true, showLastUpdated: true, defaultSort: "alpha" },
  rss: { showDescription: true, showSource: true, showTimestamps: true, articlesPerSource: 4 },
  fantasy: {
    showStandings: true,
    showInjuryCount: true,
    showMatchups: true,
    defaultSort: "name",
    defaultSubTab: "overview",
    primaryLeagueKey: null,
    enabledLeagueKeys: [],
    tickerShowMatchup: true,
  },
};

const DEFAULT_WIDGETS: WidgetPrefs = {
  enabledWidgets: [],
  widgetsOnTicker: [],
  pinnedWidgets: {},
  clock: {
    ticker: { ...DEFAULT_CLOCK_TICKER },
    pomodoro: { ...DEFAULT_CLOCK_POMODORO },
  },
  weather: {
    taskbarCity: "",
    ticker: { ...DEFAULT_WEATHER_TICKER },
  },
  sysmon: {
    taskbarMetric: "cpu",
    refreshInterval: 2,
    tempUnit: "celsius",
    ticker: { ...DEFAULT_SYSMON_TICKER },
  },
  uptime: {
    url: "",
    pollInterval: 60,
    ticker: { ...DEFAULT_UPTIME_TICKER },
  },
  github: {
    repos: [],
    pollInterval: 120,
    ticker: { ...DEFAULT_GITHUB_TICKER },
  },
};

const DEFAULT_PREFS: AppPreferences = {
  appearance: DEFAULT_APPEARANCE,
  ticker: DEFAULT_TICKER,
  startup: DEFAULT_STARTUP,
  window: DEFAULT_WINDOW,
  taskbar: DEFAULT_TASKBAR,
  widgets: DEFAULT_WIDGETS,
  channelDisplay: DEFAULT_CHANNEL_DISPLAY,
  pinnedSources: [],
  homePreview: {},
  showSetupOnLogin: true,
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
  return getStore(`scrollr:${key}`, fallback);
}

export function savePref<T>(key: string, value: T): void {
  setStore(`scrollr:${key}`, value);
}

// ── Structured preferences ─────────────────────────────────────

/** Deep-merge saved widget prefs with defaults.
 *  Handles migration from the old flat shape gracefully. */
function mergeWidgetPrefs(saved?: Partial<WidgetPrefs>): WidgetPrefs {
  if (!saved) return { ...DEFAULT_WIDGETS };

  // Safe accessor for nested sub-objects that may not exist in old formats
  const obj = (v: unknown): Record<string, unknown> | undefined =>
    v != null && typeof v === "object" ? (v as Record<string, unknown>) : undefined;

  const clk = obj(saved.clock);
  const wth = obj(saved.weather);
  const sys = obj(saved.sysmon);
  const upt = obj(saved.uptime);
  const ghb = obj(saved.github);

  const enabledWidgets = Array.isArray(saved.enabledWidgets) ? saved.enabledWidgets : DEFAULT_WIDGETS.enabledWidgets;

  return {
    enabledWidgets,
    // Migration: if widgetsOnTicker doesn't exist, default to enabledWidgets
    widgetsOnTicker: Array.isArray(saved.widgetsOnTicker) ? saved.widgetsOnTicker : enabledWidgets,
    pinnedWidgets: (saved.pinnedWidgets != null && typeof saved.pinnedWidgets === "object" && !Array.isArray(saved.pinnedWidgets))
      ? saved.pinnedWidgets as Record<string, WidgetPinConfig>
      : {},
    clock: {
      ticker: { ...DEFAULT_CLOCK_TICKER, ...obj(clk?.ticker) },
      pomodoro: { ...DEFAULT_CLOCK_POMODORO, ...obj(clk?.pomodoro) },
    },
    weather: {
      taskbarCity: typeof wth?.taskbarCity === "string" ? wth.taskbarCity : DEFAULT_WIDGETS.weather.taskbarCity,
      ticker: { ...DEFAULT_WEATHER_TICKER, ...obj(wth?.ticker) },
    },
    sysmon: {
      taskbarMetric: (sys?.taskbarMetric as TaskbarMetric) ?? DEFAULT_WIDGETS.sysmon.taskbarMetric,
      refreshInterval: typeof sys?.refreshInterval === "number" ? sys.refreshInterval : DEFAULT_WIDGETS.sysmon.refreshInterval,
      tempUnit: (sys?.tempUnit as TempUnit) ?? DEFAULT_WIDGETS.sysmon.tempUnit,
      ticker: { ...DEFAULT_SYSMON_TICKER, ...obj(sys?.ticker) },
    },
    uptime: {
      url: typeof upt?.url === "string" ? upt.url : DEFAULT_WIDGETS.uptime.url,
      pollInterval: typeof upt?.pollInterval === "number" ? upt.pollInterval : DEFAULT_WIDGETS.uptime.pollInterval,
      ticker: { ...DEFAULT_UPTIME_TICKER, ...obj(upt?.ticker) },
    },
    github: {
      repos: Array.isArray(ghb?.repos)
        ? (ghb.repos as unknown[]).filter(
            (r): r is { owner: string; repo: string } =>
              r != null && typeof r === "object" &&
              typeof (r as Record<string, unknown>).owner === "string" &&
              typeof (r as Record<string, unknown>).repo === "string",
          )
        : DEFAULT_WIDGETS.github.repos,
      pollInterval: typeof ghb?.pollInterval === "number" ? ghb.pollInterval : DEFAULT_WIDGETS.github.pollInterval,
      ticker: { ...DEFAULT_GITHUB_TICKER, ...obj(ghb?.ticker) },
    },
  };
}

// ── Ticker layout migration ─────────────────────────────────────

/** Narrow any number to the TickerRows union (1|2|3). */
function clampTickerRows(n: number): TickerRows {
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

/**
 * Build or migrate `tickerLayout` from a saved AppearancePrefs fragment.
 *
 * Responsibilities:
 *   1. Synthesize a layout when none exists (derive length from legacy
 *      `tickerRows`; sources default to [] = "show all visible tabs").
 *   2. Tier-clamp the row count — if the current tier allows fewer rows
 *      than stored, drop from the BOTTOM so row 0 is preserved.
 */
function migrateTickerLayout(
  saved: Partial<AppearancePrefs> | undefined,
): TickerLayout {
  const fallbackRowCount = clampTickerRows(
    typeof saved?.tickerRows === "number" ? saved.tickerRows : 1,
  );

  const savedLayout = saved?.tickerLayout;
  let rows: TickerRowConfig[];

  const isValidRow = (r: unknown): r is TickerRowConfig => {
    if (r == null || typeof r !== "object") return false;
    const rec = r as Record<string, unknown>;
    return Array.isArray(rec.sources) && rec.sources.every((s) => typeof s === "string");
  };

  if (
    savedLayout &&
    typeof savedLayout === "object" &&
    Array.isArray((savedLayout as TickerLayout).rows) &&
    (savedLayout as TickerLayout).rows.every(isValidRow) &&
    (savedLayout as TickerLayout).rows.length > 0
  ) {
    rows = (savedLayout as TickerLayout).rows.map((r) => ({ ...r, sources: [...r.sources] }));
  } else {
    // Synthesize N empty-sourced rows from the legacy tickerRows field.
    rows = Array.from({ length: fallbackRowCount }, () => ({ sources: [] }));
  }

  // Tier-clamp on read. Reading auth synchronously; if auth isn't ready
  // yet (e.g. first paint) getTier() returns "free" — which just clamps
  // to 1 row, the safest fallback. Subsequent loads post-auth will reflect
  // the real tier.
  let maxRows = 3;
  try {
    maxRows = getMaxTickerRows(getTier());
  } catch {
    maxRows = 3;
  }

  if (rows.length > maxRows) {
    // eslint-disable-next-line no-console
    console.info(
      `[prefs] tickerLayout clamped from ${rows.length} to ${maxRows} rows (tier cap)`,
    );
    rows = rows.slice(0, maxRows);
  }

  if (rows.length === 0) rows = [{ sources: [] }];

  return { rows };
}

export function loadPrefs(): AppPreferences {
  try {
    const saved = getStore<Record<string, unknown> | null>(PREFIX, null);
    if (!saved) return { ...DEFAULT_PREFS };

    // Detect v1 format: has "general" key but no "appearance" key
    const isV1 = "general" in saved && !("appearance" in saved);
    const source = isV1 ? migrateV1(saved) : (saved as Partial<AppPreferences>);

    // Deep merge with defaults so new keys are always present
    const savedDisplay = source.channelDisplay as Partial<ChannelDisplayPrefs> | undefined;
    const mergedAppearance: AppearancePrefs = {
      ...DEFAULT_APPEARANCE,
      ...source.appearance,
      tickerLayout: migrateTickerLayout(source.appearance as Partial<AppearancePrefs> | undefined),
    };
    // Keep the deprecated `tickerRows` in lockstep with the layout so
    // legacy consumers (window-height math) keep working.
    mergedAppearance.tickerRows = clampTickerRows(mergedAppearance.tickerLayout.rows.length);
    const merged: AppPreferences = {
      appearance: mergedAppearance,
      ticker: { ...DEFAULT_TICKER, ...source.ticker },
      startup: { ...DEFAULT_STARTUP, ...source.startup },
      window: { ...DEFAULT_WINDOW, ...source.window },
      taskbar: { ...DEFAULT_TASKBAR, ...source.taskbar },
      widgets: mergeWidgetPrefs(source.widgets as Partial<WidgetPrefs> | undefined),
      channelDisplay: {
        finance: { ...DEFAULT_CHANNEL_DISPLAY.finance, ...savedDisplay?.finance },
        rss: { ...DEFAULT_CHANNEL_DISPLAY.rss, ...savedDisplay?.rss },
        fantasy: { ...DEFAULT_CHANNEL_DISPLAY.fantasy, ...savedDisplay?.fantasy },
      },
      pinnedSources: Array.isArray(source.pinnedSources) ? source.pinnedSources : [],
      homePreview:
        source.homePreview && typeof source.homePreview === "object" && !Array.isArray(source.homePreview)
          ? (source.homePreview as HomePreview)
          : {},
      showSetupOnLogin: typeof source.showSetupOnLogin === "boolean" ? source.showSetupOnLogin : true,
    };

    // Clamp any widget pin rows that reference rows above the current
    // layout's row count (e.g. user downgraded from Pro to Uplink and
    // lost row 2). See spec §Edge Cases #2 — pins on dropped rows
    // reassign to row 0, not silently reduced, so the user sees them.
    const layoutRowCount = merged.appearance.tickerLayout.rows.length;
    let pinsChanged = false;
    const clampedPins: Record<string, WidgetPinConfig> = {};
    for (const [widgetId, pin] of Object.entries(merged.widgets.pinnedWidgets)) {
      const currentRow = pin.row ?? 0;
      if (currentRow >= layoutRowCount) {
        clampedPins[widgetId] = { ...pin, row: 0 };
        pinsChanged = true;
      } else {
        clampedPins[widgetId] = pin;
      }
    }
    if (pinsChanged) {
      merged.widgets = { ...merged.widgets, pinnedWidgets: clampedPins };
    }

    // If migrated from v1, persist the new format
    if (isV1) {
      setStore(PREFIX, merged);
    }

    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: AppPreferences): void {
  setStore(PREFIX, prefs);
}

/** Reset a single category to its defaults. */
export function resetCategory<K extends keyof AppPreferences>(
  prefs: AppPreferences,
  category: K,
): AppPreferences {
  const def = DEFAULT_PREFS[category];
  const value = typeof def === "object" && def !== null && !Array.isArray(def)
    ? { ...def }
    : def;
  return { ...prefs, [category]: value };
}

/** Reset everything to defaults. */
export function resetAll(): AppPreferences {
  const defaults: AppPreferences = {
    appearance: { ...DEFAULT_APPEARANCE, tickerLayout: { rows: [{ sources: [] }] } },
    ticker: { ...DEFAULT_TICKER },
    startup: { ...DEFAULT_STARTUP },
    window: { ...DEFAULT_WINDOW },
    taskbar: { ...DEFAULT_TASKBAR },
    widgets: { ...DEFAULT_WIDGETS },
    channelDisplay: { ...DEFAULT_CHANNEL_DISPLAY },
    pinnedSources: [],
    homePreview: {},
    showSetupOnLogin: true,
  };
  savePrefs(defaults);
  return defaults;
}

// ── Theme resolution ────────────────────────────────────────

/** Resolve the effective theme from a Theme preference value.
 *  "system" follows the OS preference; otherwise returns as-is. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
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

// ── Ticker layout helpers ───────────────────────────────────────

/**
 * Write a new `tickerLayout` while keeping the deprecated `tickerRows`
 * field in sync. Use this everywhere instead of mutating the layout
 * in-place so both fields never drift.
 */
export function setTickerLayout(
  prefs: AppPreferences,
  layout: TickerLayout,
): AppPreferences {
  const rows = layout.rows.length > 0 ? layout.rows : [{ sources: [] }];
  return {
    ...prefs,
    appearance: {
      ...prefs.appearance,
      tickerLayout: { rows },
      tickerRows: clampTickerRows(rows.length),
    },
  };
}

/**
 * Drop a row from the layout at `index`. Any pinned widgets that
 * target the removed row (or any row above it) are re-mapped:
 *   - Pins on the removed row → row 0
 *   - Pins on rows above `index` → row - 1 (shifted up)
 *
 * See spec §Edge Cases #3 — removed-row pins fall back to row 0, not
 * a neighbour, so users notice the widget rather than silently moving
 * it somewhere they didn't expect.
 */
export function removeTickerRow(
  prefs: AppPreferences,
  index: number,
): AppPreferences {
  const rows = prefs.appearance.tickerLayout.rows;
  if (rows.length <= 1) return prefs; // never drop the last row
  if (index < 0 || index >= rows.length) return prefs;

  const nextRows = rows.filter((_, i) => i !== index);
  const nextPinned: Record<string, WidgetPinConfig> = {};
  for (const [widgetId, pin] of Object.entries(prefs.widgets.pinnedWidgets)) {
    const currentRow = pin.row ?? 0;
    let nextRow: number;
    if (currentRow === index) {
      nextRow = 0;
    } else if (currentRow > index) {
      nextRow = currentRow - 1;
    } else {
      nextRow = currentRow;
    }
    nextPinned[widgetId] = { ...pin, row: nextRow };
  }

  const withLayout = setTickerLayout(prefs, { rows: nextRows });
  return {
    ...withLayout,
    widgets: { ...withLayout.widgets, pinnedWidgets: nextPinned },
  };
}

// ── Pure preference updaters ────────────────────────────────────

/** Toggle a widget on/off the ticker. Returns a new AppPreferences. */
export function toggleWidgetOnTicker(prefs: AppPreferences, widgetId: string): AppPreferences {
  const onTicker = prefs.widgets.widgetsOnTicker;
  const next = onTicker.includes(widgetId)
    ? onTicker.filter((id) => id !== widgetId)
    : [...onTicker, widgetId];
  return {
    ...prefs,
    widgets: { ...prefs.widgets, widgetsOnTicker: next },
  };
}

/** Toggle a widget's pin state. Returns a new AppPreferences. */
export function toggleWidgetPin(prefs: AppPreferences, widgetId: string): AppPreferences {
  const pinned = { ...prefs.widgets.pinnedWidgets };
  if (pinned[widgetId]) {
    delete pinned[widgetId];
  } else {
    pinned[widgetId] = { side: "left" };
  }
  return {
    ...prefs,
    widgets: { ...prefs.widgets, pinnedWidgets: pinned },
  };
}

/** Shallow-merge a patch into a widget's config. Returns a new AppPreferences. */
export function updateWidgetPrefs(
  prefs: AppPreferences,
  widgetKey: string,
  patch: Record<string, unknown>,
): AppPreferences {
  const widgets = prefs.widgets as unknown as Record<string, unknown>;
  const current = widgets[widgetKey];
  return {
    ...prefs,
    widgets: {
      ...prefs.widgets,
      [widgetKey]: { ...(current as Record<string, unknown>), ...patch },
    },
  };
}


