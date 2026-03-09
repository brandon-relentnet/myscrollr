import type { GeneralPrefs, DefaultView } from "../../preferences";
import { DEFAULT_GENERAL } from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
  ResetButton,
} from "./SettingsControls";

interface GeneralSettingsProps {
  prefs: GeneralPrefs;
  onChange: (prefs: GeneralPrefs) => void;
  onReset: () => void;
  autostartEnabled: boolean;
  onAutostartChange: (enabled: boolean) => void;
}

const VIEW_OPTIONS: { value: DefaultView; label: string }[] = [
  { value: "last", label: "Last" },
  { value: "feed", label: "Feed" },
  { value: "dashboard", label: "Dash" },
];

const INTERVAL_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "SSE" },
  { value: "10000", label: "10s" },
  { value: "30000", label: "30s" },
  { value: "60000", label: "60s" },
];

function smoothnessLabel(lerp: number): string {
  if (lerp >= 0.25) return "Snappy";
  if (lerp >= 0.15) return "Normal";
  if (lerp >= 0.08) return "Smooth";
  return "Buttery";
}

export default function GeneralSettings({
  prefs,
  onChange,
  onReset,
  autostartEnabled,
  onAutostartChange,
}: GeneralSettingsProps) {
  const set = <K extends keyof GeneralPrefs>(
    key: K,
    value: GeneralPrefs[K],
  ) => {
    onChange({ ...prefs, [key]: value });
  };

  return (
    <div className="space-y-4">
      <Section title="Startup">
        <ToggleRow
          label="Launch on system startup"
          description="Automatically start Scrollr when you log in"
          checked={autostartEnabled}
          onChange={onAutostartChange}
        />
        <SegmentedRow
          label="Default view"
          description="Which view to show when the app opens"
          value={prefs.defaultView}
          options={VIEW_OPTIONS}
          onChange={(v) => set("defaultView", v)}
        />
      </Section>

      <Section title="Data">
        <SegmentedRow
          label="Refresh interval"
          description="How often to poll for new data (non-SSE tiers)"
          value={String(prefs.refreshInterval)}
          options={INTERVAL_OPTIONS}
          onChange={(v) => set("refreshInterval", Number(v))}
        />
      </Section>

      <Section title="Scrolling">
        <ToggleRow
          label="Smooth scrolling"
          description="Interpolated scroll for feed and dashboard content"
          checked={prefs.smoothScroll}
          onChange={(v) => set("smoothScroll", v)}
        />
        {prefs.smoothScroll && (
          <SliderRow
            label="Scroll smoothness"
            value={prefs.scrollSmoothness}
            min={0.03}
            max={0.3}
            step={0.01}
            displayValue={smoothnessLabel(prefs.scrollSmoothness)}
            onChange={(v) => set("scrollSmoothness", v)}
          />
        )}
      </Section>

      <div className="flex justify-end pt-1">
        <ResetButton
          onClick={() => {
            onReset();
            // Autostart is handled separately — reset to default (off)
            if (autostartEnabled && !DEFAULT_GENERAL.autostart) {
              onAutostartChange(false);
            }
          }}
        />
      </div>
    </div>
  );
}
