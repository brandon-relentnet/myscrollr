/**
 * Dashboard card display preferences.
 *
 * Controls what data each summary card shows on the dashboard.
 * Stored via loadPref/savePref (Tauri store-backed).
 */
import { loadPref, savePref } from "../../preferences";
import { CHANNEL_ORDER } from "../../channels/registry";
import { WIDGET_ORDER } from "../../widgets/registry";

// ── Per-card preference types ───────────────────────────────────

export interface FinanceCardPrefs {
  primaryCount: number;
  showPrice: boolean;
  showChange: boolean;
  showBadges: boolean;
  stats: boolean;
}

export interface RssCardPrefs {
  headlines: boolean;
  itemCount: number;
  showSource: boolean;
  showTime: boolean;
  stats: boolean;
}

export interface FantasyCardPrefs {
  matchup: boolean;
  standings: boolean;
}

export interface ClockCardPrefs {
  date: boolean;
  timer: boolean;
  worldClocks: boolean;
}

export interface WeatherCardPrefs {
  condition: boolean;
  feelsLike: boolean;
  cityCount: boolean;
}

export interface SysmonCardPrefs {
  cpu: boolean;
  ram: boolean;
  gpu: boolean;
  uptime: boolean;
}

export interface UptimeCardPrefs {
  health: boolean;
  monitorCount: boolean;
  monitors: boolean;
}

export interface GitHubCardPrefs {
  status: boolean;
  counts: boolean;
  repos: boolean;
}

export interface DashboardCardPrefs {
  finance: FinanceCardPrefs;
  rss: RssCardPrefs;
  fantasy: FantasyCardPrefs;
  clock: ClockCardPrefs;
  weather: WeatherCardPrefs;
  sysmon: SysmonCardPrefs;
  uptime: UptimeCardPrefs;
  github: GitHubCardPrefs;
}

// ── Defaults ────────────────────────────────────────────────────

export const DEFAULT_CARD_PREFS: DashboardCardPrefs = {
  finance: { primaryCount: 5, showPrice: true, showChange: true, showBadges: true, stats: true },
  rss: { headlines: true, itemCount: 3, showSource: true, showTime: true, stats: true },
  fantasy: { matchup: true, standings: true },
  clock: { date: true, timer: true, worldClocks: true },
  weather: { condition: true, feelsLike: true, cityCount: true },
  sysmon: { cpu: true, ram: true, gpu: true, uptime: true },
  uptime: { health: true, monitorCount: true, monitors: true },
  github: { status: true, counts: true, repos: true },
};

// ── Storage ─────────────────────────────────────────────────────

const PREFS_KEY = "dashboard:cardPrefs";
const GHOSTS_KEY = "dashboard:showAddMore";

export function loadCardPrefs(): DashboardCardPrefs {
  const saved = loadPref<Partial<DashboardCardPrefs>>(PREFS_KEY, {});
  // Deep-merge each card's prefs with defaults so new fields get defaults
  return {
    finance: { ...DEFAULT_CARD_PREFS.finance, ...saved.finance },
    rss: { ...DEFAULT_CARD_PREFS.rss, ...saved.rss },
    fantasy: { ...DEFAULT_CARD_PREFS.fantasy, ...saved.fantasy },
    clock: { ...DEFAULT_CARD_PREFS.clock, ...saved.clock },
    weather: { ...DEFAULT_CARD_PREFS.weather, ...saved.weather },
    sysmon: { ...DEFAULT_CARD_PREFS.sysmon, ...saved.sysmon },
    uptime: { ...DEFAULT_CARD_PREFS.uptime, ...saved.uptime },
    github: { ...DEFAULT_CARD_PREFS.github, ...saved.github },
  };
}

export function saveCardPrefs(prefs: DashboardCardPrefs): void {
  savePref(PREFS_KEY, prefs);
}

export function loadShowAddMore(): boolean {
  return loadPref<boolean>(GHOSTS_KEY, true);
}

export function saveShowAddMore(show: boolean): void {
  savePref(GHOSTS_KEY, show);
}

// ── Card order ──────────────────────────────────────────────────

const ORDER_KEY = "dashboard:cardOrder";

const DEFAULT_CHANNEL_ORDER = [...CHANNEL_ORDER];
const DEFAULT_WIDGET_ORDER = [...WIDGET_ORDER];

export interface CardOrder {
  channels: string[];
  widgets: string[];
}

/**
 * Load persisted card order, merging with current sources.
 *
 * - Removes stale IDs no longer present in activeChannels/activeWidgets
 * - Appends newly-added IDs at the end (in canonical order among themselves)
 */
export function loadCardOrder(
  activeChannels: string[],
  activeWidgets: string[],
): CardOrder {
  const saved = loadPref<Partial<CardOrder>>(ORDER_KEY, {});

  function merge(saved: string[] | undefined, active: string[], defaults: string[]): string[] {
    const activeSet = new Set(active);
    // Filter stale entries from saved order
    const kept = (saved ?? defaults).filter((id) => activeSet.has(id));
    // Find new IDs not in saved order, sorted by canonical position
    const keptSet = new Set(kept);
    const added = defaults
      .filter((id) => activeSet.has(id) && !keptSet.has(id));
    // Any active IDs not in defaults at all go last
    const remaining = active.filter((id) => !keptSet.has(id) && !added.includes(id));
    return [...kept, ...added, ...remaining];
  }

  return {
    channels: merge(saved.channels, activeChannels, DEFAULT_CHANNEL_ORDER),
    widgets: merge(saved.widgets, activeWidgets, DEFAULT_WIDGET_ORDER),
  };
}

export function saveCardOrder(order: CardOrder): void {
  savePref(ORDER_KEY, order);
}

// ── Toggle schema (used by CardEditor) ──────────────────────────

export interface ToggleField {
  key: string;
  label: string;
  /** Indented sub-option, disabled when parent is off. */
  parent?: string;
}

export interface StepperField {
  key: string;
  label: string;
  min: number;
  max: number;
  parent?: string;
}

export type EditorField =
  | (ToggleField & { type: "toggle" })
  | (StepperField & { type: "stepper" });

// ── Schemas per card type ───────────────────────────────────────

export const FINANCE_SCHEMA: EditorField[] = [
  { type: "stepper", key: "primaryCount", label: "Primary Stocks", min: 1, max: 5 },
  { type: "toggle", key: "showPrice", label: "Price" },
  { type: "toggle", key: "showChange", label: "% Change" },
  { type: "toggle", key: "showBadges", label: "Other Stocks" },
  { type: "toggle", key: "stats", label: "Stats" },
];

export const RSS_SCHEMA: EditorField[] = [
  { type: "toggle", key: "headlines", label: "Headlines" },
  { type: "stepper", key: "itemCount", label: "Items", min: 1, max: 5, parent: "headlines" },
  { type: "toggle", key: "showSource", label: "Source", parent: "headlines" },
  { type: "toggle", key: "showTime", label: "Time", parent: "headlines" },
  { type: "toggle", key: "stats", label: "Stats" },
];

export const FANTASY_SCHEMA: EditorField[] = [
  { type: "toggle", key: "matchup", label: "Matchup" },
  { type: "toggle", key: "standings", label: "Standings" },
];

export const CLOCK_SCHEMA: EditorField[] = [
  { type: "toggle", key: "date", label: "Date" },
  { type: "toggle", key: "timer", label: "Timer Status" },
  { type: "toggle", key: "worldClocks", label: "World Clocks" },
];

export const WEATHER_SCHEMA: EditorField[] = [
  { type: "toggle", key: "condition", label: "Condition" },
  { type: "toggle", key: "feelsLike", label: "Feels Like" },
  { type: "toggle", key: "cityCount", label: "City Count" },
];

export const SYSMON_SCHEMA: EditorField[] = [
  { type: "toggle", key: "cpu", label: "CPU" },
  { type: "toggle", key: "ram", label: "RAM" },
  { type: "toggle", key: "gpu", label: "GPU" },
  { type: "toggle", key: "uptime", label: "Uptime" },
];

export const UPTIME_SCHEMA: EditorField[] = [
  { type: "toggle", key: "health", label: "Health Status" },
  { type: "toggle", key: "monitorCount", label: "Monitor Count" },
  { type: "toggle", key: "monitors", label: "Monitor List" },
];

export const GITHUB_SCHEMA: EditorField[] = [
  { type: "toggle", key: "status", label: "Overall Status" },
  { type: "toggle", key: "counts", label: "Pass/Fail Counts" },
  { type: "toggle", key: "repos", label: "Repo List" },
];
