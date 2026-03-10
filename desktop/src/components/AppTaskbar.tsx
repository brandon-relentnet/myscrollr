import { useState, useEffect, useRef } from "react";
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
  /** Navigate to a widget's full feed view */
  onNavigateToWidget?: (widgetId: string) => void;
}

// ── Mini widget chip storage keys ───────────────────────────────

const TIMER_STORAGE_KEY = "scrollr:widget:timer:state";
const WEATHER_STORAGE_KEY = "scrollr:widget:weather:cities";
const WEATHER_UNIT_KEY = "scrollr:widget:weather:unit";

// ── Mini Clock Chip ─────────────────────────────────────────────

function MiniClockChip({ onClick }: { onClick: () => void }) {
  const [time, setTime] = useState(() => formatTime());

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      onClick={onClick}
      title="World Clock"
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
    >
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--color-widget-clock)" }} />
      <span className="text-fg-2">{time}</span>
    </button>
  );
}

function formatTime(): string {
  const d = new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// ── Mini Timer Chip ─────────────────────────────────────────────

interface TimerState {
  mode: "pomodoro" | "countdown" | "stopwatch";
  startedAt: number | null;
  bankedMs: number;
  targetSecs: number;
}

function MiniTimerChip({ onClick }: { onClick: () => void }) {
  const [display, setDisplay] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    function update() {
      try {
        const raw = localStorage.getItem(TIMER_STORAGE_KEY);
        if (!raw) { setDisplay(null); return; }
        const state = JSON.parse(raw) as TimerState;
        const running = state.startedAt !== null;
        setIsRunning(running);

        if (!running && state.bankedMs === 0) {
          setDisplay(null);
          return;
        }

        const elapsedMs = running
          ? state.bankedMs + (Date.now() - state.startedAt!)
          : state.bankedMs;

        if (state.mode === "stopwatch") {
          const totalSecs = Math.floor(elapsedMs / 1000);
          setDisplay(fmtShort(totalSecs));
        } else {
          const remainMs = Math.max(0, state.targetSecs * 1000 - elapsedMs);
          const remainSecs = Math.ceil(remainMs / 1000);
          setDisplay(fmtShort(remainSecs));
        }
      } catch {
        setDisplay(null);
      }
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (display === null) return null;

  return (
    <button
      onClick={onClick}
      title="Timer"
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
    >
      <div
        className={clsx(
          "w-1.5 h-1.5 rounded-full shrink-0",
          isRunning && "motion-safe:animate-pulse",
        )}
        style={{ background: "var(--color-widget-timer)" }}
      />
      <span className={clsx("text-fg-2", isRunning && "text-[var(--color-widget-timer)]")}>
        {display}
      </span>
    </button>
  );
}

function fmtShort(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Mini Weather Chip ───────────────────────────────────────────

interface SavedCity {
  location: { name: string };
  weather: { temperature: number } | null;
}

function MiniWeatherChip({ onClick }: { onClick: () => void }) {
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    function update() {
      try {
        const raw = localStorage.getItem(WEATHER_STORAGE_KEY);
        if (!raw) { setDisplay(null); return; }
        const cities = JSON.parse(raw) as SavedCity[];
        const first = cities?.[0];
        if (!first?.weather) { setDisplay(null); return; }

        const unitRaw = localStorage.getItem(WEATHER_UNIT_KEY);
        const unit = unitRaw === "celsius" ? "celsius" : "fahrenheit";
        const tempC = first.weather.temperature;
        const temp = unit === "fahrenheit" ? (tempC * 9) / 5 + 32 : tempC;

        setDisplay(`${Math.round(temp)}\u00B0`);
      } catch {
        setDisplay(null);
      }
    }

    update();
    // Weather data changes infrequently; check every 30s
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  if (display === null) return null;

  return (
    <button
      onClick={onClick}
      title="Weather"
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
    >
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--color-widget-weather)" }} />
      <span className="text-fg-2">{display}</span>
    </button>
  );
}

// ── Mini System Monitor Chip ────────────────────────────────────

function MiniSysmonChip({ onClick }: { onClick: () => void }) {
  const [cpuPct, setCpuPct] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function poll() {
      try {
        const info = await invoke<{ cpuUsage: number }>("get_system_info");
        if (mountedRef.current) setCpuPct(Math.round(info.cpuUsage));
      } catch {
        if (mountedRef.current) setCpuPct(null);
      }
    }

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  if (cpuPct === null) return null;

  return (
    <button
      onClick={onClick}
      title="System Monitor"
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
    >
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--color-widget-sysmon)" }} />
      <span className={clsx("text-fg-2", cpuPct > 80 && "text-error")}>
        {cpuPct}%
      </span>
    </button>
  );
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
  onNavigateToWidget,
}: AppTaskbarProps) {
  const isDark = resolveTheme(prefs.appearance.theme) === "dark";

  const isPinned = prefs.window.pinned;
  const rows = prefs.appearance.tickerRows;
  const taskbarH = TASKBAR_HEIGHTS[prefs.taskbar.taskbarHeight];

  const enabledWidgets = prefs.widgets.enabledWidgets;
  const hasClock = enabledWidgets.includes("clock");
  const hasTimer = enabledWidgets.includes("timer");
  const hasWeather = enabledWidgets.includes("weather");
  const hasSysmon = enabledWidgets.includes("sysmon");
  const hasAnyChip = hasClock || hasTimer || hasWeather || hasSysmon;

  const nav = (id: string) => onNavigateToWidget?.(id);

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
      <div className="flex items-center gap-3 select-none shrink-0">
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

      {/* Center: mini widget chips */}
      {hasAnyChip && (
        <>
          <div className="w-px h-3 bg-edge mx-1.5 shrink-0" />
          <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
            {hasClock && <MiniClockChip onClick={() => nav("clock")} />}
            {hasTimer && <MiniTimerChip onClick={() => nav("timer")} />}
            {hasWeather && <MiniWeatherChip onClick={() => nav("weather")} />}
            {hasSysmon && <MiniSysmonChip onClick={() => nav("sysmon")} />}
          </div>
          <div className="w-px h-3 bg-edge mx-1.5 shrink-0" />
        </>
      )}

      {/* Spacer when no chips */}
      {!hasAnyChip && <div className="flex-1" />}

      {/* Right: actions */}
      <div className="flex items-center gap-0.5 shrink-0">
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
    </div>
  );
}
