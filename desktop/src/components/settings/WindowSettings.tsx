import type { WindowPrefs } from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
  ResetButton,
} from "./SettingsControls";

interface WindowSettingsProps {
  prefs: WindowPrefs;
  onChange: (prefs: WindowPrefs) => void;
  onReset: () => void;
}

export default function WindowSettings({
  prefs,
  onChange,
  onReset,
}: WindowSettingsProps) {
  const set = <K extends keyof WindowPrefs>(
    key: K,
    value: WindowPrefs[K],
  ) => {
    onChange({ ...prefs, [key]: value });
  };

  return (
    <div className="space-y-4">
      <Section title="Behavior">
        <ToggleRow
          label="Always on top"
          description="Keep the window above all other windows"
          checked={prefs.pinned}
          onChange={(v) => set("pinned", v)}
        />
        <ToggleRow
          label="Show in system taskbar"
          description="Display Scrollr in the OS taskbar / dock"
          checked={!prefs.skipTaskbar}
          onChange={(v) => set("skipTaskbar", !v)}
        />
      </Section>

      <Section title="Size">
        <SegmentedRow
          label="Default width"
          description="Window width when the app starts"
          value={prefs.defaultWidth}
          options={[
            { value: "full" as const, label: "Full" },
            { value: "narrow" as const, label: "Narrow" },
          ]}
          onChange={(v) => set("defaultWidth", v)}
        />
        {prefs.defaultWidth === "narrow" && (
          <SliderRow
            label="Narrow width"
            value={prefs.narrowWidth}
            min={400}
            max={1600}
            step={50}
            displayValue={`${prefs.narrowWidth}px`}
            onChange={(v) => set("narrowWidth", v)}
          />
        )}
      </Section>

      <div className="flex justify-end pt-1">
        <ResetButton onClick={onReset} />
      </div>
    </div>
  );
}
