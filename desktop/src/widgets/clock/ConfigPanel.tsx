import { useState, useEffect, useCallback } from "react";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
} from "../../components/settings/SettingsControls";
import ConfigPanelLayout from "../../components/settings/ConfigPanelLayout";
import TickerPinSection from "../../components/settings/TickerPinSection";
import { useWidgetConfig } from "../../hooks/useWidgetConfig";
import { getStore, setStore, onStoreChange } from "../../lib/store";
import { DEFAULT_CLOCK_TICKER, DEFAULT_CLOCK_POMODORO } from "../../preferences";
import { LS_CLOCK_FORMAT, LS_CLOCK_TIMEZONES } from "../../constants";
import type { ClockPomodoroConfig } from "../../preferences";
import type { WidgetConfigPanelProps } from "../../hooks/useWidgetConfig";

type ClockFormat = "12h" | "24h";

function loadTimezones(): string[] {
  const tzs = getStore<string[]>(LS_CLOCK_TIMEZONES, ["America/New_York", "Europe/London", "Asia/Tokyo"]);
  return Array.isArray(tzs) ? tzs : ["America/New_York", "Europe/London", "Asia/Tokyo"];
}

function loadFormat(): ClockFormat {
  const f = getStore<string>(LS_CLOCK_FORMAT, "12h");
  return f === "12h" || f === "24h" ? (f as ClockFormat) : "12h";
}

function tzLabel(tz: string): string {
  return tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
}

const FORMAT_OPTIONS: { value: ClockFormat; label: string }[] = [
  { value: "12h", label: "12h" },
  { value: "24h", label: "24h" },
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
}: WidgetConfigPanelProps) {
  const { config, update, setTicker } = useWidgetConfig("clock", prefs, onPrefsChange);
  const [format, setFormatState] = useState<ClockFormat>(loadFormat);
  const [timezones, setTimezones] = useState<string[]>(loadTimezones);

  // Re-read timezones when store changes (e.g., user adds a TZ in the widget)
  useEffect(() => {
    const unsub1 = onStoreChange(LS_CLOCK_TIMEZONES, () => setTimezones(loadTimezones()));
    const unsub2 = onStoreChange(LS_CLOCK_FORMAT, () => setFormatState(loadFormat()));
    return () => { unsub1(); unsub2(); };
  }, []);

  const setPomodoro = useCallback(
    (patch: Partial<ClockPomodoroConfig>) => {
      update({ pomodoro: { ...config.pomodoro, ...patch } });
    },
    [update, config.pomodoro],
  );

  const handleFormatChange = useCallback(
    (v: ClockFormat) => {
      setFormatState(v);
      setStore(LS_CLOCK_FORMAT, v);
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

  const resetAll = useCallback(() => {
    update({
      ticker: { ...DEFAULT_CLOCK_TICKER },
      pomodoro: { ...DEFAULT_CLOCK_POMODORO },
    });
    setStore(LS_CLOCK_FORMAT, "12h");
    setFormatState("12h");
  }, [update]);

  const clockIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-widget-clock)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );

  return (
    <ConfigPanelLayout
      icon={clockIcon}
      hex="var(--color-widget-clock)"
      title="Clock Settings"
      subtitle="World clocks and Pomodoro timer"
      onReset={resetAll}
    >
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
        <TickerPinSection widgetId="clock" prefs={prefs} onPrefsChange={onPrefsChange} />
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
    </ConfigPanelLayout>
  );
}
