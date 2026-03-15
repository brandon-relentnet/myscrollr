import { useState, useEffect, useCallback } from "react";
import {
  Section,
  ToggleRow,
  SliderRow,
  ResetButton,
} from "../../components/settings/SettingsControls";
import type {
  AppPreferences,
  UptimeWidgetConfig,
  UptimeTickerConfig,
} from "../../preferences";
import { DEFAULT_UPTIME_TICKER, savePrefs } from "../../preferences";
import { useWidgetPin } from "../../hooks/useWidgetPin";
import { LS_UPTIME_MONITORS, PIN_SIDE_OPTIONS } from "../../constants";
import { loadMonitors } from "./types";
import { SegmentedRow } from "../../components/settings/SettingsControls";
import type { KumaMonitor } from "./types";

interface UptimeConfigPanelProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
}

export default function UptimeConfigPanel({
  prefs,
  onPrefsChange,
}: UptimeConfigPanelProps) {
  const config = prefs.widgets.uptime;
  const [monitors, setMonitors] = useState<KumaMonitor[]>(loadMonitors);

  const { isPinned, pinSide, togglePin, setPinSide } = useWidgetPin("uptime", prefs, onPrefsChange);

  // Re-read when localStorage changes (user connects/refreshes in FeedTab)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_UPTIME_MONITORS) setMonitors(loadMonitors());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback(
    (patch: Partial<UptimeWidgetConfig>) => {
      const next: AppPreferences = {
        ...prefs,
        widgets: {
          ...prefs.widgets,
          uptime: { ...config, ...patch },
        },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, config, onPrefsChange],
  );

  const setTicker = useCallback(
    (patch: Partial<UptimeTickerConfig>) => {
      update({ ticker: { ...config.ticker, ...patch } });
    },
    [update, config.ticker],
  );

  const isMonitorExcluded = (id: number) =>
    config.ticker.excludedMonitors.includes(id);

  const toggleMonitor = useCallback(
    (id: number) => {
      const excluded = config.ticker.excludedMonitors;
      const next = excluded.includes(id)
        ? excluded.filter((m) => m !== id)
        : [...excluded, id];
      setTicker({ excludedMonitors: next });
    },
    [config.ticker.excludedMonitors, setTicker],
  );

  const resetAll = useCallback(() => {
    update({
      pollInterval: 60,
      ticker: { ...DEFAULT_UPTIME_TICKER },
    });
  }, [update]);

  // Status summary for toolbar preview
  const upCount = monitors.filter((m) => m.status === "up").length;
  const downCount = monitors.filter((m) => m.status === "down").length;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--color-widget-uptime) 15%, transparent)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-widget-uptime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">Uptime Settings</h2>
          <p className="text-[11px] text-fg-4">Monitor status from Uptime Kuma</p>
        </div>
      </div>

      {/* Toolbar Preview */}
      <Section title="Toolbar Preview">
        {monitors.length > 0 ? (
          <div className="px-3 py-2.5 text-[11px] text-fg-3 font-mono">
            {monitors.length} monitor{monitors.length !== 1 ? "s" : ""}
            {" \u2014 "}
            <span className="text-up">{upCount} up</span>
            {downCount > 0 && (
              <>, <span className="text-down">{downCount} down</span></>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 text-[11px] text-fg-4">
            Connect to Uptime Kuma in the feed tab to see monitors.
          </div>
        )}
      </Section>

      {/* Ticker */}
      <Section title="Ticker">
        {monitors.map((monitor) => {
          const statusLabel = monitor.status.charAt(0).toUpperCase() + monitor.status.slice(1);
          const uptime = monitor.uptimePercent != null ? `${monitor.uptimePercent.toFixed(1)}%` : "";
          return (
            <ToggleRow
              key={monitor.id}
              label={monitor.name}
              description={[statusLabel, uptime].filter(Boolean).join(" \u00B7 ")}
              checked={!isMonitorExcluded(monitor.id)}
              onChange={() => toggleMonitor(monitor.id)}
            />
          );
        })}
        {monitors.length === 0 && (
          <div className="px-3 py-2.5 text-[11px] text-fg-4">
            Connect to Uptime Kuma in the feed tab to choose what shows on the ticker.
          </div>
        )}
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

      {/* Polling */}
      <Section title="Polling">
        <SliderRow
          label="Refresh interval"
          description="How often to check monitor status"
          value={config.pollInterval}
          min={30}
          max={300}
          step={30}
          displayValue={config.pollInterval >= 60
            ? `${Math.floor(config.pollInterval / 60)}m${config.pollInterval % 60 ? ` ${config.pollInterval % 60}s` : ""}`
            : `${config.pollInterval}s`}
          onChange={(v) => update({ pollInterval: v })}
        />
      </Section>

      {/* Reset */}
      <div className="flex items-center justify-end pt-2 px-3">
        <ResetButton onClick={resetAll} />
      </div>
    </div>
  );
}
