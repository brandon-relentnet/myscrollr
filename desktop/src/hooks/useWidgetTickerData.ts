import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { WidgetPrefs } from "../preferences";
import type { TempUnit } from "../preferences";
import { fetchSysmonData } from "./useSysmonData";
import type { SystemInfo } from "./useSysmonData";
import { LS_CLOCK_TIMEZONES, LS_CLOCK_FORMAT, LS_TIMER_STATE, LS_WEATHER_CITIES, LS_WEATHER_UNIT, LS_UPTIME_MONITORS } from "../constants";
import { formatBytes, timeAgo } from "../utils/format";
import { weatherCodeToIcon, weatherCodeToLabel, formatTemp } from "../widgets/weather/types";
import { findCpuTemp, findGpuTemp, formatComponentTemp } from "../widgets/sysmon/utils";
import type { ClockChipData, WeatherChipData, SysmonChipData, UptimeChipData, GitHubChipData, WidgetTickerData } from "../types";
import type { TimerState } from "../widgets/clock/types";
import type { SavedCity } from "../widgets/weather/types";
import { loadMonitors } from "../widgets/uptime/types";
import { loadRepoData, repoKey } from "../widgets/github/types";

const EMPTY: WidgetTickerData = { clock: [], weather: [], sysmon: [], uptime: [], github: [] };

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

// ── Hook ────────────────────────────────────────────────────────

export function useWidgetTickerData(
  widgetPrefs: WidgetPrefs,
): WidgetTickerData {
  const [data, setData] = useState<WidgetTickerData>(EMPTY);
  const sysInfoRef = useRef<SystemInfo | null>(null);

  const enabledWidgets = useMemo(
    () => new Set(widgetPrefs.widgetsOnTicker),
    [widgetPrefs.widgetsOnTicker],
  );

  // ── Build clock + timer chips ─────────────────────────────────
  const buildClockChips = useCallback((): ClockChipData[] => {
    if (!enabledWidgets.has("clock")) return [];
    const cfg = widgetPrefs.clock;
    const chips: ClockChipData[] = [];
    const now = new Date();
    const format = localStorage.getItem(LS_CLOCK_FORMAT) ?? "12h";

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
        const raw = localStorage.getItem(LS_CLOCK_TIMEZONES);
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
  }, [widgetPrefs.clock, enabledWidgets]);

  // ── Build weather chips ───────────────────────────────────────
  const buildWeatherChips = useCallback((): WeatherChipData[] => {
    if (!enabledWidgets.has("weather")) return [];
    const cfg = widgetPrefs.weather;
    const chips: WeatherChipData[] = [];
    const unit = localStorage.getItem(LS_WEATHER_UNIT) ?? "fahrenheit";

    try {
      const raw = localStorage.getItem(LS_WEATHER_CITIES);
      const cities: SavedCity[] = raw ? JSON.parse(raw) : [];

      for (const city of cities) {
        const name = city.location.name;
        if (cfg.ticker.excludedCities.includes(name)) continue;

        const w = city.weather;
        const temp = w?.temperature != null ? formatTemp(w.temperature, unit as TempUnit, true) : "--";
        const feelsLike = w?.feelsLike != null ? formatTemp(w.feelsLike, unit as TempUnit, true) : "--";
        const icon = w?.weatherCode != null ? weatherCodeToIcon(w.weatherCode) : "\u2601";
        const condition = w?.weatherCode != null ? weatherCodeToLabel(w.weatherCode) : "";

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
  }, [widgetPrefs.weather, enabledWidgets]);

  // ── Build sysmon chips ────────────────────────────────────────
  const buildSysmonChips = useCallback((): SysmonChipData[] => {
    if (!enabledWidgets.has("sysmon")) return [];
    const info = sysInfoRef.current;
    if (!info) return [];

    const cfg = widgetPrefs.sysmon;
    const chips: SysmonChipData[] = [];
    const tu = cfg.tempUnit;

    if (cfg.ticker.cpu) {
      const pct = Math.round(info.cpuUsage);
      const freq = info.cpuFreqMhz ? `${(info.cpuFreqMhz / 1000).toFixed(1)} GHz` : "";
      const sensor = findCpuTemp(info.components);
      const temp = sensor ? formatComponentTemp(sensor.temp, tu) : "";
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
      const sensor = findGpuTemp(info.components);
      const temp = sensor ? formatComponentTemp(sensor.temp, tu) : "";
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
  }, [widgetPrefs.sysmon, enabledWidgets]);

  // ── Build uptime chips ────────────────────────────────────────
  const buildUptimeChips = useCallback((): UptimeChipData[] => {
    if (!enabledWidgets.has("uptime")) return [];
    const monitors = loadMonitors();
    if (monitors.length === 0) return [];

    const cfg = widgetPrefs.uptime;
    const chips: UptimeChipData[] = [];

    for (const mon of monitors) {
      if (cfg.ticker.excludedMonitors.includes(mon.id)) continue;

      const uptimeStr = mon.uptimePercent != null
        ? `${mon.uptimePercent.toFixed(mon.uptimePercent === 100 ? 0 : 1)}%`
        : "--";

      const statusLabel = mon.status.charAt(0).toUpperCase() + mon.status.slice(1);
      const respTime = mon.responseTime != null ? `${mon.responseTime}ms` : "";
      const checked = timeAgo(mon.lastChecked, { suffix: true });
      const detail = [statusLabel, respTime, checked].filter(Boolean).join(" \u00B7 ");

      chips.push({
        id: `uptime-${mon.id}`,
        label: mon.name.length > 20 ? mon.name.slice(0, 18) + "\u2026" : mon.name,
        status: mon.status,
        uptime: uptimeStr,
        detail: detail || undefined,
        heartbeats: mon.recentHeartbeats.length > 0 ? mon.recentHeartbeats : undefined,
      });
    }

    return chips;
  }, [widgetPrefs.uptime, enabledWidgets]);

  // ── Build github chips ────────────────────────────────────────
  const buildGithubChips = useCallback((): GitHubChipData[] => {
    if (!enabledWidgets.has("github")) return [];
    const repos = loadRepoData();
    if (repos.length === 0) return [];

    const cfg = widgetPrefs.github;
    const chips: GitHubChipData[] = [];

    for (const repo of repos) {
      const key = repoKey(repo);
      if (cfg.ticker.excludedRepos.includes(key)) continue;

      const repoLabel = repo.repo.length > 20 ? repo.repo.slice(0, 18) + "\u2026" : repo.repo;
      const workflow = repo.workflowName ?? "CI";

      // Comfort detail: first line of commit message + time ago
      const firstLine = repo.commitMessage?.split("\n")[0] ?? "";
      const commit = firstLine.length > 30 ? firstLine.slice(0, 28) + "\u2026" : firstLine;
      const checked = timeAgo(repo.updatedAt, { suffix: true });
      const detail = [commit, checked].filter(Boolean).join(" \u00B7 ");

      chips.push({
        id: `github-${key}`,
        label: repoLabel,
        status: repo.status,
        workflowName: workflow,
        detail: detail || undefined,
      });
    }

    return chips;
  }, [widgetPrefs.github, enabledWidgets]);

  // ── Polling intervals ─────────────────────────────────────────

  useEffect(() => {
    const hasClock = enabledWidgets.has("clock");
    const hasWeather = enabledWidgets.has("weather");
    const hasSysmon = enabledWidgets.has("sysmon");
    const hasUptime = enabledWidgets.has("uptime");
    const hasGithub = enabledWidgets.has("github");

    if (!hasClock && !hasWeather && !hasSysmon && !hasUptime && !hasGithub) {
      setData(EMPTY);
      return;
    }

    // Build initial data
    const refresh = () => {
      setData({
        clock: buildClockChips(),
        weather: buildWeatherChips(),
        sysmon: buildSysmonChips(),
        uptime: buildUptimeChips(),
        github: buildGithubChips(),
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

    // Uptime: re-read cached localStorage data at poll cadence (FeedTab does the actual fetching)
    const uptimeMs = (widgetPrefs.uptime.pollInterval || 60) * 1000;
    const uptimeInterval = hasUptime ? setInterval(() => {
      setData((prev) => ({ ...prev, uptime: buildUptimeChips() }));
    }, uptimeMs) : null;

    // GitHub: re-read cached localStorage data at poll cadence (FeedTab does the actual fetching)
    const githubMs = (widgetPrefs.github.pollInterval || 120) * 1000;
    const githubInterval = hasGithub ? setInterval(() => {
      setData((prev) => ({ ...prev, github: buildGithubChips() }));
    }, githubMs) : null;

    // Initial fetch for sysmon (only widget that needs async init)
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
      if (uptimeInterval) clearInterval(uptimeInterval);
      if (githubInterval) clearInterval(githubInterval);
    };
  // Suppressed: JSON.stringify stabilizes the dep by value instead of reference,
  // so the effect only re-runs when the array contents actually change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(widgetPrefs.widgetsOnTicker),
    widgetPrefs.sysmon.refreshInterval,
    widgetPrefs.uptime.pollInterval,
    widgetPrefs.github.pollInterval,
    buildClockChips,
    buildWeatherChips,
    buildSysmonChips,
    buildUptimeChips,
    buildGithubChips,
  ]);

  return data;
}
