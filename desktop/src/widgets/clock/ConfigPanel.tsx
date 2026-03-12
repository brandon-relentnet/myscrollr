import { useState, useEffect, useCallback } from "react";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
  ResetButton,
} from "../../components/settings/SettingsControls";
import type {
  AppPreferences,
  ClockWidgetConfig,
  ClockTickerConfig,
  ClockPomodoroConfig,
  PinSide,
} from "../../preferences";
import { DEFAULT_CLOCK_TICKER, DEFAULT_CLOCK_POMODORO } from "../../preferences";
import { savePrefs } from "../../preferences";

// ── localStorage keys (shared with the Clock FeedTab) ───────────
const LS_FORMAT = "scrollr:widget:clock:format";
const LS_TIMEZONES = "scrollr:widget:clock:timezones";

type ClockFormat = "12h" | "24h";

interface ClockConfigPanelProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
}

/** Read the user's configured timezones from widget localStorage. */
function loadTimezones(): string[] {
  try {
    const raw = localStorage.getItem(LS_TIMEZONES);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return ["America/New_York", "Europe/London", "Asia/Tokyo"];
}

function loadFormat(): ClockFormat {
  return (localStorage.getItem(LS_FORMAT) as ClockFormat) ?? "12h";
}

/** Human-readable label for an IANA timezone. */
function tzLabel(tz: string): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  return city;
}

const FORMAT_OPTIONS: { value: ClockFormat; label: string }[] = [
  { value: "12h", label: "12h" },
  { value: "24h", label: "24h" },
];

const PIN_SIDE_OPTIONS: { value: PinSide; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

const LONG_BREAK_OPTIONS = [
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
];

export default function ClockConfigPanel({
  prefs,
  onPrefsChange,
}: ClockConfigPanelProps) {
  const config = prefs.widgets.clock;
  const [format, setFormatState] = useState<ClockFormat>(loadFormat);
  const [timezones, setTimezones] = useState<string[]>(loadTimezones);

  // Re-read timezones when localStorage changes (e.g., user adds a TZ in the widget)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_TIMEZONES) setTimezones(loadTimezones());
      if (e.key === LS_FORMAT) setFormatState(loadFormat());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback(
    (patch: Partial<ClockWidgetConfig>) => {
      const next: AppPreferences = {
        ...prefs,
        widgets: {
          ...prefs.widgets,
          clock: { ...config, ...patch },
        },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, config, onPrefsChange],
  );

  const setTicker = useCallback(
    (patch: Partial<ClockTickerConfig>) => {
      update({ ticker: { ...config.ticker, ...patch } });
    },
    [update, config.ticker],
  );

  const setPomodoro = useCallback(
    (patch: Partial<ClockPomodoroConfig>) => {
      update({ pomodoro: { ...config.pomodoro, ...patch } });
    },
    [update, config.pomodoro],
  );

  const handleFormatChange = useCallback(
    (v: ClockFormat) => {
      setFormatState(v);
      localStorage.setItem(LS_FORMAT, v);
    },
    [],
  );

  const isTimezoneExcluded = (tz: string) =>
    config.ticker.excludedTimezones.includes(tz);

  const toggleTimezone = useCallback(
    (tz: string) => {
      const excluded = config.ticker.excludedTimezones;
      const next = excluded.includes(tz)
        ? excluded.filter((t) => t !== tz)
        : [...excluded, tz];
      setTicker({ excludedTimezones: next });
    },
    [config.ticker.excludedTimezones, setTicker],
  );

  const isPinned = !!prefs.widgets.pinnedWidgets.clock;
  const pinSide = prefs.widgets.pinnedWidgets.clock?.side ?? "left";

  const togglePin = useCallback(
    (pinned: boolean) => {
      const pw = { ...prefs.widgets.pinnedWidgets };
      if (pinned) {
        pw.clock = { side: pinSide };
      } else {
        delete pw.clock;
      }
      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, pinnedWidgets: pw },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, pinSide, onPrefsChange],
  );

  const setPinSide = useCallback(
    (side: PinSide) => {
      const pw = { ...prefs.widgets.pinnedWidgets, clock: { side } };
      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, pinnedWidgets: pw },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, onPrefsChange],
  );

  const resetAll = useCallback(() => {
    update({
      ticker: { ...DEFAULT_CLOCK_TICKER },
      pomodoro: { ...DEFAULT_CLOCK_POMODORO },
    });
    localStorage.setItem(LS_FORMAT, "12h");
    setFormatState("12h");
  }, [update]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--color-widget-clock) 15%, transparent)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-widget-clock)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">Clock Settings</h2>
          <p className="text-[11px] text-fg-4">World clocks and Pomodoro timer</p>
        </div>
      </div>

      {/* Taskbar */}
      <Section title="Toolbar Preview">
        <SegmentedRow
          label="Time format"
          description="Applies to the toolbar and ticker"
          value={format}
          options={FORMAT_OPTIONS}
          onChange={handleFormatChange}
        />
      </Section>

      {/* Ticker */}
      <Section title="Ticker">
        <ToggleRow
          label="Local time"
          description="Show your local clock on the scrolling ticker"
          checked={config.ticker.localTime}
          onChange={(v) => setTicker({ localTime: v })}
        />
        <ToggleRow
          label="Show world clocks"
          description="Include configured timezones on the ticker"
          checked={config.ticker.showTimezones}
          onChange={(v) => setTicker({ showTimezones: v })}
        />
        {config.ticker.showTimezones && timezones.map((tz) => (
          <ToggleRow
            key={tz}
            label={tzLabel(tz)}
            checked={!isTimezoneExcluded(tz)}
            onChange={() => toggleTimezone(tz)}
          />
        ))}
        {config.ticker.showTimezones && timezones.length === 0 && (
          <div className="px-3 py-2.5 text-[11px] text-fg-4">
            Add world clocks in the Clock tab to see them here.
          </div>
        )}
        <ToggleRow
          label="Active timer"
          description="Show running timers on the ticker"
          checked={config.ticker.activeTimer}
          onChange={(v) => setTicker({ activeTimer: v })}
        />
        <ToggleRow
          label="Keep in a fixed spot"
          description="Stay on one side instead of scrolling across"
          checked={isPinned}
          onChange={togglePin}
        />
        {isPinned && (
          <SegmentedRow
            label="Which side"
            value={pinSide}
            options={PIN_SIDE_OPTIONS}
            onChange={setPinSide}
          />
        )}
      </Section>

      {/* Pomodoro */}
      <Section title="Pomodoro">
        <SliderRow
          label="Work session"
          value={config.pomodoro.workMins}
          min={10}
          max={60}
          step={5}
          displayValue={`${config.pomodoro.workMins} min`}
          onChange={(v) => setPomodoro({ workMins: v })}
        />
        <SliderRow
          label="Short break"
          value={config.pomodoro.shortBreakMins}
          min={1}
          max={15}
          step={1}
          displayValue={`${config.pomodoro.shortBreakMins} min`}
          onChange={(v) => setPomodoro({ shortBreakMins: v })}
        />
        <SliderRow
          label="Long break"
          value={config.pomodoro.longBreakMins}
          min={5}
          max={30}
          step={5}
          displayValue={`${config.pomodoro.longBreakMins} min`}
          onChange={(v) => setPomodoro({ longBreakMins: v })}
        />
        <SegmentedRow
          label="Long break every"
          description="Sessions before a long break"
          value={String(config.pomodoro.longBreakEvery)}
          options={LONG_BREAK_OPTIONS}
          onChange={(v) => setPomodoro({ longBreakEvery: Number(v) })}
        />
      </Section>

      {/* Reset */}
      <div className="flex items-center justify-end pt-2 px-3">
        <ResetButton onClick={resetAll} />
      </div>
    </div>
  );
}
