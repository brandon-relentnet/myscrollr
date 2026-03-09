import type { WindowPrefs } from "../../preferences";
import { Section, ToggleRow, ResetButton } from "./SettingsControls";

// ── Props ───────────────────────────────────────────────────────

interface BehaviorSettingsProps {
  window_: WindowPrefs;
  onWindowChange: (prefs: WindowPrefs) => void;
  onResetWindow: () => void;
  autostartEnabled: boolean;
  onAutostartChange: (enabled: boolean) => void;
}

// ── Component ───────────────────────────────────────────────────

export default function BehaviorSettings({
  window_,
  onWindowChange,
  onResetWindow,
  autostartEnabled,
  onAutostartChange,
}: BehaviorSettingsProps) {
  return (
    <div>
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
          description="Automatically start Scrollr when you log in"
          checked={autostartEnabled}
          onChange={onAutostartChange}
        />
      </Section>

      {/* Reset */}
      <div className="flex items-center gap-2 justify-end pt-2">
        <ResetButton label="Reset" onClick={onResetWindow} />
      </div>
    </div>
  );
}
