import type { TickerPrefs, TickerGap, TickerMode } from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
  ResetButton,
} from "./SettingsControls";

interface TickerSettingsProps {
  prefs: TickerPrefs;
  onChange: (prefs: TickerPrefs) => void;
  onReset: () => void;
}

const MODE_OPTIONS: { value: TickerMode; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfort", label: "Comfort" },
];

const GAP_OPTIONS: { value: TickerGap; label: string }[] = [
  { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" },
  { value: "spacious", label: "Wide" },
];

function speedLabel(speed: number): string {
  if (speed <= 20) return "Slow";
  if (speed <= 50) return "Normal";
  if (speed <= 80) return "Fast";
  return "Blazing";
}

export default function TickerSettings({
  prefs,
  onChange,
  onReset,
}: TickerSettingsProps) {
  const set = <K extends keyof TickerPrefs>(
    key: K,
    value: TickerPrefs[K],
  ) => {
    onChange({ ...prefs, [key]: value });
  };

  return (
    <div className="space-y-4">
      <Section title="Display">
        <ToggleRow
          label="Show ticker"
          description="Horizontal scrolling strip above the taskbar"
          checked={prefs.showTicker}
          onChange={(v) => set("showTicker", v)}
        />
        {prefs.showTicker && (
          <SegmentedRow
            label="Density"
            description="Comfort shows extra detail in a taller 2-row chip"
            value={prefs.tickerMode}
            options={MODE_OPTIONS}
            onChange={(v) => set("tickerMode", v)}
          />
        )}
      </Section>

      {prefs.showTicker && (
        <>
          <Section title="Scrolling">
            <SliderRow
              label="Scroll speed"
              value={prefs.tickerSpeed}
              min={10}
              max={100}
              step={5}
              displayValue={speedLabel(prefs.tickerSpeed)}
              onChange={(v) => set("tickerSpeed", v)}
            />
            <ToggleRow
              label="Pause on hover"
              description="Slow down the ticker when hovering over it"
              checked={prefs.pauseOnHover}
              onChange={(v) => set("pauseOnHover", v)}
            />
            {prefs.pauseOnHover && (
              <SliderRow
                label="Hover speed"
                description="How much the ticker slows on hover"
                value={prefs.hoverSpeed}
                min={0}
                max={0.8}
                step={0.05}
                displayValue={
                  prefs.hoverSpeed === 0
                    ? "Pause"
                    : `${Math.round(prefs.hoverSpeed * 100)}%`
                }
                onChange={(v) => set("hoverSpeed", v)}
              />
            )}
          </Section>

          <Section title="Spacing">
            <SegmentedRow
              label="Gap between items"
              value={prefs.tickerGap}
              options={GAP_OPTIONS}
              onChange={(v) => set("tickerGap", v)}
            />
          </Section>
        </>
      )}

      <div className="flex justify-end pt-1">
        <ResetButton onClick={onReset} />
      </div>
    </div>
  );
}
