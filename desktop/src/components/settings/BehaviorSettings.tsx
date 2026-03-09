import type { WindowPrefs } from "../../preferences";
import { Section, ToggleRow, ResetButton } from "./SettingsControls";

// ── Props ───────────────────────────────────────────────────────

interface BehaviorSettingsProps {
  window_: WindowPrefs;
  onWindowChange: (prefs: WindowPrefs) => void;
  onResetWindow: () => void;
  autostartEnabled: boolean;
  onAutostartChange: (enabled: boolean) => void;
  showAppTicker: boolean;
  onToggleAppTicker: (enabled: boolean) => void;
  showTaskbar: boolean;
  onToggleTaskbar: (enabled: boolean) => void;
}

// ── Component ───────────────────────────────────────────────────

export default function BehaviorSettings({
  window_,
  onWindowChange,
  onResetWindow,
  autostartEnabled,
  onAutostartChange,
  showAppTicker,
  onToggleAppTicker,
  showTaskbar,
  onToggleTaskbar,
}: BehaviorSettingsProps) {
  return (
    <div>
      <Section title="App window">
        <ToggleRow
          label="Show ticker"
          description="Display the scrolling ticker strip in this window"
          checked={showAppTicker}
          onChange={onToggleAppTicker}
        />
        <ToggleRow
          label="Show taskbar"
          description="Quick action bar below the ticker"
          checked={showTaskbar}
          onChange={onToggleTaskbar}
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
