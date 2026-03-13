import type {
  AppearancePrefs,
  WindowPrefs,
  Theme,
} from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  ResetButton,
} from "./SettingsControls";

// ── Props ───────────────────────────────────────────────────────

interface GeneralSettingsProps {
  appearance: AppearancePrefs;
  window_: WindowPrefs;
  onAppearanceChange: (prefs: AppearancePrefs) => void;
  onWindowChange: (prefs: WindowPrefs) => void;
  onResetAppearance: () => void;
  onResetWindow: () => void;
  autostartEnabled: boolean;
  onAutostartChange: (enabled: boolean) => void;
}

// ── Options ─────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
];

const SCALE_PRESETS: { value: string; label: string }[] = [
  { value: "85", label: "85%" },
  { value: "100", label: "100%" },
  { value: "115", label: "115%" },
  { value: "130", label: "130%" },
];

// ── Component ───────────────────────────────────────────────────

export default function GeneralSettings({
  appearance,
  window_,
  onAppearanceChange,
  onWindowChange,
  onResetAppearance,
  onResetWindow,
  autostartEnabled,
  onAutostartChange,
}: GeneralSettingsProps) {
  const setApp = <K extends keyof AppearancePrefs>(
    key: K,
    value: AppearancePrefs[K],
  ) => {
    onAppearanceChange({ ...appearance, [key]: value });
  };

  return (
    <div>
      <Section title="Appearance">
        <SegmentedRow
          label="Color mode"
          description="Choose light or dark colors"
          value={appearance.theme}
          options={THEME_OPTIONS}
          onChange={(v) => setApp("theme", v)}
        />
        <SegmentedRow
          label="Display size"
          description="Make everything bigger or smaller"
          value={String(appearance.uiScale)}
          options={SCALE_PRESETS}
          onChange={(v) => setApp("uiScale", Number(v) as AppearancePrefs["uiScale"])}
        />
      </Section>

      <Section title="Window">
        <ToggleRow
          label="Always on top"
          description="Keep the ticker above all other windows"
          checked={window_.pinned}
          onChange={(v) => onWindowChange({ ...window_, pinned: v })}
        />
      </Section>

      <Section title="Startup">
        <ToggleRow
          label="Launch on system startup"
          description="Automatically open Scrollr when you start your computer"
          checked={autostartEnabled}
          onChange={onAutostartChange}
        />
      </Section>

      <div className="flex items-center gap-2 justify-end pt-2">
        <ResetButton label="Reset appearance settings" onClick={onResetAppearance} />
        <ResetButton label="Reset window settings" onClick={onResetWindow} />
      </div>
    </div>
  );
}
