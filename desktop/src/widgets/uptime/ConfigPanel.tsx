import { useCallback } from "react";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
} from "../../components/settings/SettingsControls";
import ConfigPanelLayout from "../../components/settings/ConfigPanelLayout";
import TickerPinSection from "../../components/settings/TickerPinSection";
import { useWidgetConfig } from "../../hooks/useWidgetConfig";
import { useStoreData } from "../../hooks/useStoreData";
import { DEFAULT_UPTIME_TICKER } from "../../preferences";
import { formatPollInterval } from "../../utils/format";
import { LS_UPTIME_MONITORS } from "../../constants";
import { loadMonitors } from "./types";
import type { KumaMonitor } from "./types";
import type { WidgetConfigPanelProps } from "../../hooks/useWidgetConfig";

export default function UptimeConfigPanel({
  prefs,
  onPrefsChange,
}: WidgetConfigPanelProps) {
  const { config, update, setTicker } = useWidgetConfig("uptime", prefs, onPrefsChange);
  const [monitors] = useStoreData(LS_UPTIME_MONITORS, loadMonitors);

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

  const upCount = monitors.filter((m) => m.status === "up").length;
  const downCount = monitors.filter((m) => m.status === "down").length;

  const uptimeIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-widget-uptime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  );

  return (
    <ConfigPanelLayout
      icon={uptimeIcon}
      hex="var(--color-widget-uptime)"
      title="Uptime Settings"
      subtitle="Monitor status from Uptime Kuma"
      onReset={resetAll}
    >
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
        <TickerPinSection widgetId="uptime" prefs={prefs} onPrefsChange={onPrefsChange} />
      </Section>

      <Section title="Polling">
        <SliderRow
          label="Refresh interval"
          description="How often to check monitor status"
          value={config.pollInterval}
          min={30}
          max={300}
          step={30}
          displayValue={formatPollInterval(config.pollInterval)}
          onChange={(v) => update({ pollInterval: v })}
        />
      </Section>
    </ConfigPanelLayout>
  );
}
