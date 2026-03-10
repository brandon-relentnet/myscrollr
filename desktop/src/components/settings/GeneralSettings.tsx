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
  showAppTicker: boolean;
  onToggleAppTicker: (enabled: boolean) => void;
  showTaskbar: boolean;
  onToggleTaskbar: (enabled: boolean) => void;
}

// ── Options ─────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
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
  showAppTicker,
  onToggleAppTicker,
  showTaskbar,
  onToggleTaskbar,
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
          description="Switch between light and dark interface"
          value={appearance.theme}
          options={THEME_OPTIONS}
          onChange={(v) => setApp("theme", v)}
        />
        <SegmentedRow
          label="Interface scale"
          description="Adjust the size of all UI elements"
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
        <ToggleRow
          label="Show taskbar"
          description="Quick action bar below the ticker"
          checked={showTaskbar}
          onChange={onToggleTaskbar}
        />
        <ToggleRow
          label="Show in-app ticker"
          description="Display the scrolling ticker strip in this window"
          checked={showAppTicker}
          onChange={onToggleAppTicker}
        />
      </Section>

      <Section title="Startup">
        <ToggleRow
          label="Launch on system startup"
          description="Automatically start Scrollr when you log in"
          checked={autostartEnabled}
          onChange={onAutostartChange}
        />
      </Section>

      <div className="flex items-center gap-2 justify-end pt-2">
        <ResetButton label="Reset appearance" onClick={onResetAppearance} />
        <ResetButton label="Reset window" onClick={onResetWindow} />
      </div>
    </div>
  );
}
