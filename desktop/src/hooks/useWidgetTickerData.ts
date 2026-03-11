import { useState, useEffect, useRef, useCallback } from "react";
import type { WidgetPrefs } from "../preferences";
import { fetchSysmonData } from "./useSysmonData";
import type { SystemInfo } from "./useSysmonData";

// ── localStorage keys (shared with widget FeedTabs) ─────────────
const LS_TIMEZONES = "scrollr:widget:clock:timezones";
const LS_FORMAT = "scrollr:widget:clock:format";
const LS_TIMER_STATE = "scrollr:widget:timer:state";
const LS_CITIES = "scrollr:widget:weather:cities";
const LS_UNIT = "scrollr:widget:weather:unit";

// ── Types matching widget localStorage structures ───────────────

interface TimerState {
  mode: string;
  startedAt: number | null;
  bankedMs: number;
  targetSecs: number;
  completedSessions?: number;
}

interface SavedCity {
  location: { name: string; lat: number; lon: number; country?: string; admin1?: string };
  weather?: {
    temperature?: number;
    apparent_temperature?: number;
    weather_code?: number;
    relative_humidity?: number;
    wind_speed?: number;
    wind_direction?: number;
  };
  lastFetched?: number;
}

// ── Chip data types (local to this hook; mirrored in each chip component) ──

interface ClockChipData {
  id: string;
  kind: "clock" | "timer";
  label: string;
  value: string;
  detail?: string;
}

interface WeatherChipData {
  id: string;
  label: string;
  temp: string;
  icon: string;
  detail?: string;
}

interface SysmonChipData {
  id: string;
  label: string;
  value: string;
  detail?: string;
  hot?: boolean;
}

// ── Result type ─────────────────────────────────────────────────

export interface WidgetTickerData {
  clock: ClockChipData[];
  weather: WeatherChipData[];
  sysmon: SysmonChipData[];
}

const EMPTY: WidgetTickerData = { clock: [], weather: [], sysmon: [] };

// ── Weather code → emoji ────────────────────────────────────────

function weatherIcon(code: number | undefined): string {
  if (code == null) return "\u2601\uFE0F";
  if (code === 0) return "\u2600\uFE0F";
  if (code <= 3) return "\u26C5";
  if (code <= 49) return "\uD83C\uDF2B\uFE0F";
  if (code <= 69) return "\uD83C\uDF27\uFE0F";
  if (code <= 79) return "\u2744\uFE0F";
  if (code <= 82) return "\uD83C\uDF27\uFE0F";
  if (code <= 86) return "\uD83C\uDF28\uFE0F";
  if (code <= 99) return "\u26A1";
  return "\u2601\uFE0F";
}

function weatherCondition(code: number | undefined): string {
  if (code == null) return "";
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 49) return "Fog";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  if (code <= 99) return "Thunderstorm";
  return "";
}

// ── Time formatting helpers ─────────────────────────────────────

function formatTime(date: Date, tz: string | undefined, format: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: format === "12h",
    ...(tz ? { timeZone: tz } : {}),
  };
  return new Intl.DateTimeFormat("en-US", opts).format(date);
}

function formatDetail(date: Date, tz: string | undefined): string {
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZoneName: "short",
    ...(tz ? { timeZone: tz } : {}),
  }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "";

  const dateStr = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(tz ? { timeZone: tz } : {}),
  }).format(date);

  return `${tzName} \u00B7 ${dateStr}`;
}

function tzShortLabel(tz: string): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  // Abbreviate long city names for compact ticker chips
  if (city.length > 10) {
    const words = city.split(" ");
    return words.map((w) => w[0]).join("").toUpperCase();
  }
  return city;
}

// ── Temperature formatting ──────────────────────────────────────

function formatTemp(celsius: number | undefined, unit: string): string {
  if (celsius == null) return "--";
  if (unit === "fahrenheit") {
    return `${Math.round(celsius * 9 / 5 + 32)}\u00B0F`;
  }
  return `${Math.round(celsius)}\u00B0C`;
}

// ── Timer helpers ───────────────────────────────────────────────

function getTimerChipData(state: TimerState): ClockChipData | null {
  const isRunning = state.startedAt != null;
  const elapsed = isRunning
    ? state.bankedMs + (Date.now() - state.startedAt!)
    : state.bankedMs;

  if (!isRunning && elapsed === 0) return null; // No active timer

  const isCountUp = state.mode === "stopwatch";
  const totalMs = isCountUp ? elapsed : Math.max(0, state.targetSecs * 1000 - elapsed);
  const totalSecs = Math.floor(totalMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const value = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const mode = state.mode.charAt(0).toUpperCase() + state.mode.slice(1);
  const sessions = state.completedSessions ?? 0;
  const detail = state.mode === "pomodoro"
    ? `${mode} \u00B7 ${sessions}/4 sessions`
    : mode;

  return {
    id: "timer",
    kind: "timer",
    label: "Timer",
    value,
    detail,
  };
}

// ── Sysmon helpers ──────────────────────────────────────────────

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

function cpuTemp(info: SystemInfo, tempUnit: string): string {
  const sensor = info.components.find((c) =>
    /package id|^tctl$|^tdie$/i.test(c.label),
  );
  if (!sensor) return "";
  const temp = tempUnit === "fahrenheit"
    ? Math.round(sensor.temp * 9 / 5 + 32)
    : Math.round(sensor.temp);
  const unit = tempUnit === "fahrenheit" ? "\u00B0F" : "\u00B0C";
  return `${temp}${unit}`;
}

function gpuTemp(info: SystemInfo, tempUnit: string): string {
  const sensor = info.components.find((c) =>
    /^edge$|^junction$|gpu/i.test(c.label),
  );
  if (!sensor) return "";
  const temp = tempUnit === "fahrenheit"
    ? Math.round(sensor.temp * 9 / 5 + 32)
    : Math.round(sensor.temp);
  const unit = tempUnit === "fahrenheit" ? "\u00B0F" : "\u00B0C";
  return `${temp}${unit}`;
}

// ── Hook ────────────────────────────────────────────────────────

export function useWidgetTickerData(
  widgetPrefs: WidgetPrefs,
): WidgetTickerData {
  const [data, setData] = useState<WidgetTickerData>(EMPTY);
  const sysInfoRef = useRef<SystemInfo | null>(null);
  const enabledSet = new Set(widgetPrefs.widgetsOnTicker);

  // ── Build clock + timer chips ─────────────────────────────────
  const buildClockChips = useCallback((): ClockChipData[] => {
    if (!enabledSet.has("clock")) return [];
    const cfg = widgetPrefs.clock;
    const chips: ClockChipData[] = [];
    const now = new Date();
    const format = localStorage.getItem(LS_FORMAT) ?? "12h";

    // Local time
    if (cfg.ticker.localTime) {
      chips.push({
        id: "clock-local",
        kind: "clock",
        label: "Local",
        value: formatTime(now, undefined, format),
        detail: formatDetail(now, undefined),
      });
    }

    // Configured timezones (gated by showTimezones, then filtered by excludedTimezones)
    if (cfg.ticker.showTimezones) {
      try {
        const raw = localStorage.getItem(LS_TIMEZONES);
        const tzs: string[] = raw ? JSON.parse(raw) : [];
        for (const tz of tzs) {
          if (cfg.ticker.excludedTimezones.includes(tz)) continue;
          chips.push({
            id: `clock-${tz}`,
            kind: "clock",
            label: tzShortLabel(tz),
            value: formatTime(now, tz, format),
            detail: formatDetail(now, tz),
          });
        }
      } catch { /* ignore corrupt localStorage */ }
    }

    // Active timer
    if (cfg.ticker.activeTimer) {
      try {
        const raw = localStorage.getItem(LS_TIMER_STATE);
        if (raw) {
          const state = JSON.parse(raw) as TimerState;
          const chip = getTimerChipData(state);
          if (chip) chips.push(chip);
        }
      } catch { /* ignore */ }
    }

    return chips;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetPrefs.clock, widgetPrefs.widgetsOnTicker]);

  // ── Build weather chips ───────────────────────────────────────
  const buildWeatherChips = useCallback((): WeatherChipData[] => {
    if (!enabledSet.has("weather")) return [];
    const cfg = widgetPrefs.weather;
    const chips: WeatherChipData[] = [];
    const unit = localStorage.getItem(LS_UNIT) ?? "fahrenheit";

    try {
      const raw = localStorage.getItem(LS_CITIES);
      const cities: SavedCity[] = raw ? JSON.parse(raw) : [];

      for (const city of cities) {
        const name = city.location.name;
        if (cfg.ticker.excludedCities.includes(name)) continue;

        const w = city.weather;
        const temp = formatTemp(w?.temperature, unit);
        const feelsLike = formatTemp(w?.apparent_temperature, unit);
        const icon = weatherIcon(w?.weather_code);
        const condition = weatherCondition(w?.weather_code);

        chips.push({
          id: `weather-${name}`,
          label: name.length > 12 ? name.slice(0, 10) + "\u2026" : name,
          temp,
          icon,
          detail: condition ? `${condition} \u00B7 Feels ${feelsLike}` : undefined,
        });
      }
    } catch { /* ignore corrupt localStorage */ }

    return chips;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetPrefs.weather, widgetPrefs.widgetsOnTicker]);

  // ── Build sysmon chips ────────────────────────────────────────
  const buildSysmonChips = useCallback((): SysmonChipData[] => {
    if (!enabledSet.has("sysmon")) return [];
    const info = sysInfoRef.current;
    if (!info) return [];

    const cfg = widgetPrefs.sysmon;
    const chips: SysmonChipData[] = [];
    const tu = cfg.tempUnit;

    if (cfg.ticker.cpu) {
      const pct = Math.round(info.cpuUsage);
      const freq = info.cpuFreqMhz ? `${(info.cpuFreqMhz / 1000).toFixed(1)} GHz` : "";
      const temp = cpuTemp(info, tu);
      chips.push({
        id: "sysmon-cpu",
        label: "CPU",
        value: `${pct}%`,
        detail: [freq, temp].filter(Boolean).join(" \u00B7 ") || undefined,
        hot: pct >= 80,
      });
    }

    if (cfg.ticker.memory) {
      const pct = Math.round((info.memUsed / info.memTotal) * 100);
      const used = formatBytes(info.memUsed);
      const total = formatBytes(info.memTotal);
      chips.push({
        id: "sysmon-mem",
        label: "RAM",
        value: `${pct}%`,
        detail: `${used} / ${total}`,
        hot: pct >= 85,
      });
    }

    if (cfg.ticker.gpu && info.gpuUsage != null) {
      const pct = Math.round(info.gpuUsage);
      const clock = info.gpuClockMhz ? `${info.gpuClockMhz} MHz` : "";
      const temp = gpuTemp(info, tu);
      chips.push({
        id: "sysmon-gpu",
        label: "GPU",
        value: `${pct}%`,
        detail: [clock, temp].filter(Boolean).join(" \u00B7 ") || undefined,
        hot: pct >= 80,
      });
    }

    if (cfg.ticker.gpuPower && info.gpuPowerWatts != null) {
      const watts = Math.round(info.gpuPowerWatts);
      const cap = info.gpuPowerCapWatts ? `/ ${Math.round(info.gpuPowerCapWatts)}W` : "";
      chips.push({
        id: "sysmon-pwr",
        label: "GPU",
        value: `${watts}W`,
        detail: cap ? `${watts}W ${cap} TDP` : undefined,
        hot: false,
      });
    }

    return chips;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetPrefs.sysmon, widgetPrefs.widgetsOnTicker]);

  // ── Polling intervals ─────────────────────────────────────────

  useEffect(() => {
    const hasClock = enabledSet.has("clock");
    const hasWeather = enabledSet.has("weather");
    const hasSysmon = enabledSet.has("sysmon");

    if (!hasClock && !hasWeather && !hasSysmon) {
      setData(EMPTY);
      return;
    }

    // Build initial data
    const refresh = () => {
      setData({
        clock: buildClockChips(),
        weather: buildWeatherChips(),
        sysmon: buildSysmonChips(),
      });
    };

    // Clock + timer: update every second (timer needs 1s resolution)
    const clockInterval = hasClock ? setInterval(() => {
      setData((prev) => ({ ...prev, clock: buildClockChips() }));
    }, 1000) : null;

    // Weather: update every 30s (reads cached localStorage data)
    const weatherInterval = hasWeather ? setInterval(() => {
      setData((prev) => ({ ...prev, weather: buildWeatherChips() }));
    }, 30_000) : null;

    // Sysmon: poll Tauri IPC at the configured interval
    const sysmonMs = (widgetPrefs.sysmon.refreshInterval || 2) * 1000;
    const sysmonInterval = hasSysmon ? setInterval(async () => {
      try {
        sysInfoRef.current = await fetchSysmonData();
        setData((prev) => ({ ...prev, sysmon: buildSysmonChips() }));
      } catch { /* ignore IPC failures */ }
    }, sysmonMs) : null;

    // Initial fetch for sysmon
    if (hasSysmon) {
      fetchSysmonData()
        .then((info) => { sysInfoRef.current = info; })
        .catch(() => {})
        .finally(refresh);
    } else {
      refresh();
    }

    return () => {
      if (clockInterval) clearInterval(clockInterval);
      if (weatherInterval) clearInterval(weatherInterval);
      if (sysmonInterval) clearInterval(sysmonInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    widgetPrefs.widgetsOnTicker.join(","),
    widgetPrefs.sysmon.refreshInterval,
    buildClockChips,
    buildWeatherChips,
    buildSysmonChips,
  ]);

  return data;
}
