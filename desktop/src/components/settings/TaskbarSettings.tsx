import type { TaskbarPrefs, TaskbarHeight } from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  ResetButton,
} from "./SettingsControls";

interface TaskbarSettingsProps {
  prefs: TaskbarPrefs;
  onChange: (prefs: TaskbarPrefs) => void;
  onReset: () => void;
}

const HEIGHT_OPTIONS: { value: TaskbarHeight; label: string }[] = [
  { value: "compact", label: "28px" },
  { value: "default", label: "36px" },
  { value: "comfortable", label: "44px" },
];

export default function TaskbarSettings({
  prefs,
  onChange,
  onReset,
}: TaskbarSettingsProps) {
  const set = <K extends keyof TaskbarPrefs>(
    key: K,
    value: TaskbarPrefs[K],
  ) => {
    onChange({ ...prefs, [key]: value });
  };

  return (
    <div className="space-y-4">
      <Section title="Layout">
        <SegmentedRow
          label="Taskbar height"
          description="Height of the header bar"
          value={prefs.taskbarHeight}
          options={HEIGHT_OPTIONS}
          onChange={(v) => set("taskbarHeight", v)}
        />
      </Section>

      <Section title="Visible elements">
        <ToggleRow
          label="Channel icons"
          description="Show icons next to channel tab names"
          checked={prefs.showChannelIcons}
          onChange={(v) => set("showChannelIcons", v)}
        />
        <ToggleRow
          label="Connection indicator"
          description="Show the status dot and delivery mode label"
          checked={prefs.showConnectionIndicator}
          onChange={(v) => set("showConnectionIndicator", v)}
        />
        <ToggleRow
          label="Feed / Dash toggle"
          description="Show the segmented pill to switch views"
          checked={prefs.showCanvasToggle}
          onChange={(v) => set("showCanvasToggle", v)}
        />
        <ToggleRow
          label="Ticker toggle button"
          description="Show the button to hide/show the ticker strip"
          checked={prefs.showTickerToggle}
          onChange={(v) => set("showTickerToggle", v)}
        />
        <ToggleRow
          label="Width toggle button"
          description="Show the button to switch between full and narrow width"
          checked={prefs.showWidthToggle}
          onChange={(v) => set("showWidthToggle", v)}
        />
        <ToggleRow
          label="Pin button"
          description="Show the always-on-top toggle button"
          checked={prefs.showPinButton}
          onChange={(v) => set("showPinButton", v)}
        />
      </Section>

      <div className="flex justify-end pt-1">
        <ResetButton onClick={onReset} />
      </div>
    </div>
  );
}
