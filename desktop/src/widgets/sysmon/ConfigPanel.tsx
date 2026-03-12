import { useCallback } from "react";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  ResetButton,
} from "../../components/settings/SettingsControls";
import type {
  AppPreferences,
  SysmonWidgetConfig,
  SysmonTickerConfig,
  TaskbarMetric,
  TempUnit,
  PinSide,
} from "../../preferences";
import { DEFAULT_SYSMON_TICKER, savePrefs } from "../../preferences";

interface SysmonConfigPanelProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
}

const METRIC_OPTIONS: { value: TaskbarMetric; label: string }[] = [
  { value: "cpu", label: "CPU" },
  { value: "memory", label: "Memory" },
  { value: "gpu", label: "GPU" },
];

const REFRESH_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "1s" },
  { value: "2", label: "2s" },
  { value: "3", label: "3s" },
  { value: "5", label: "5s" },
];

const TEMP_OPTIONS: { value: TempUnit; label: string }[] = [
  { value: "celsius", label: "\u00B0C" },
  { value: "fahrenheit", label: "\u00B0F" },
];

const PIN_SIDE_OPTIONS: { value: PinSide; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export default function SysmonConfigPanel({
  prefs,
  onPrefsChange,
}: SysmonConfigPanelProps) {
  const config = prefs.widgets.sysmon;

  const update = useCallback(
    (patch: Partial<SysmonWidgetConfig>) => {
      const next: AppPreferences = {
        ...prefs,
        widgets: {
          ...prefs.widgets,
          sysmon: { ...config, ...patch },
        },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, config, onPrefsChange],
  );

  const setTicker = useCallback(
    (patch: Partial<SysmonTickerConfig>) => {
      update({ ticker: { ...config.ticker, ...patch } });
    },
    [update, config.ticker],
  );

  const isPinned = !!prefs.widgets.pinnedWidgets.sysmon;
  const pinSide = prefs.widgets.pinnedWidgets.sysmon?.side ?? "left";

  const togglePin = useCallback(
    (pinned: boolean) => {
      const pw = { ...prefs.widgets.pinnedWidgets };
      if (pinned) {
        pw.sysmon = { side: pinSide };
      } else {
        delete pw.sysmon;
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
      const pw = { ...prefs.widgets.pinnedWidgets, sysmon: { side } };
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
      taskbarMetric: "cpu",
      refreshInterval: 2,
      tempUnit: "celsius",
      ticker: { ...DEFAULT_SYSMON_TICKER },
    });
  }, [update]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--color-widget-sysmon) 15%, transparent)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-widget-sysmon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <path d="M15 2v2" /><path d="M15 20v2" />
            <path d="M2 15h2" /><path d="M2 9h2" />
            <path d="M20 15h2" /><path d="M20 9h2" />
            <path d="M9 2v2" /><path d="M9 20v2" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">System Monitor Setup</h2>
          <p className="text-[11px] text-fg-4">CPU, memory, GPU, and network stats</p>
        </div>
      </div>

      {/* Taskbar */}
      <Section title="Taskbar Chip">
        <SegmentedRow
          label="Metric shown"
          description="Which stat to display on the taskbar"
          value={config.taskbarMetric}
          options={METRIC_OPTIONS}
          onChange={(v) => update({ taskbarMetric: v })}
        />
      </Section>

      {/* Ticker */}
      <Section title="Ticker">
        <ToggleRow
          label="CPU usage"
          description="Show processor load on the ticker"
          checked={config.ticker.cpu}
          onChange={(v) => setTicker({ cpu: v })}
        />
        <ToggleRow
          label="Memory usage"
          description="Show RAM consumption on the ticker"
          checked={config.ticker.memory}
          onChange={(v) => setTicker({ memory: v })}
        />
        <ToggleRow
          label="GPU usage"
          description="Show graphics card load on the ticker"
          checked={config.ticker.gpu}
          onChange={(v) => setTicker({ gpu: v })}
        />
        <ToggleRow
          label="GPU power draw"
          description="Show graphics card wattage on the ticker"
          checked={config.ticker.gpuPower}
          onChange={(v) => setTicker({ gpuPower: v })}
        />
        <ToggleRow
          label="Pin to ticker edge"
          description="Fix the chip to the side of the ticker instead of scrolling"
          checked={isPinned}
          onChange={togglePin}
        />
        {isPinned && (
          <SegmentedRow
            label="Pin side"
            value={pinSide}
            options={PIN_SIDE_OPTIONS}
            onChange={setPinSide}
          />
        )}
      </Section>

      {/* Display */}
      <Section title="Display">
        <SegmentedRow
          label="Refresh rate"
          description="How often system stats update"
          value={String(config.refreshInterval)}
          options={REFRESH_OPTIONS}
          onChange={(v) => update({ refreshInterval: Number(v) })}
        />
        <SegmentedRow
          label="Temperature"
          value={config.tempUnit}
          options={TEMP_OPTIONS}
          onChange={(v) => update({ tempUnit: v })}
        />
      </Section>

      {/* Reset */}
      <div className="flex items-center justify-end pt-2 px-3">
        <ResetButton onClick={resetAll} />
      </div>
    </div>
  );
}
