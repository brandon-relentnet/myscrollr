import type {
  StartupPrefs,
  WindowPrefs,
  TaskbarPrefs,
  DefaultView,
  TaskbarHeight,
} from "../../preferences";
import { DEFAULT_STARTUP, PINNABLE_ACTIONS } from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
  ResetButton,
} from "./SettingsControls";

// ── Props ───────────────────────────────────────────────────────

interface BehaviorSettingsProps {
  startup: StartupPrefs;
  window_: WindowPrefs;
  taskbar: TaskbarPrefs;
  onStartupChange: (prefs: StartupPrefs) => void;
  onWindowChange: (prefs: WindowPrefs) => void;
  onTaskbarChange: (prefs: TaskbarPrefs) => void;
  onResetStartup: () => void;
  onResetWindow: () => void;
  onResetTaskbar: () => void;
  autostartEnabled: boolean;
  onAutostartChange: (enabled: boolean) => void;
}

// ── Options ─────────────────────────────────────────────────────

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

const HEIGHT_OPTIONS: { value: TaskbarHeight; label: string }[] = [
  { value: "compact", label: "28px" },
  { value: "default", label: "36px" },
  { value: "comfortable", label: "44px" },
];

// ── Component ───────────────────────────────────────────────────

export default function BehaviorSettings({
  startup,
  window_,
  taskbar,
  onStartupChange,
  onWindowChange,
  onTaskbarChange,
  onResetStartup,
  onResetWindow,
  onResetTaskbar,
  autostartEnabled,
  onAutostartChange,
}: BehaviorSettingsProps) {
  const setStartup = <K extends keyof StartupPrefs>(
    key: K,
    value: StartupPrefs[K],
  ) => {
    onStartupChange({ ...startup, [key]: value });
  };

  const setWindow = <K extends keyof WindowPrefs>(
    key: K,
    value: WindowPrefs[K],
  ) => {
    onWindowChange({ ...window_, [key]: value });
  };

  const setTaskbar = <K extends keyof TaskbarPrefs>(
    key: K,
    value: TaskbarPrefs[K],
  ) => {
    onTaskbarChange({ ...taskbar, [key]: value });
  };

  return (
    <div>
      {/* Startup */}
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
          value={startup.defaultView}
          options={VIEW_OPTIONS}
          onChange={(v) => setStartup("defaultView", v)}
        />
      </Section>

      {/* Data */}
      <Section title="Data">
        <SegmentedRow
          label="Refresh interval"
          description="How often to poll for new data (non-SSE tiers)"
          value={String(startup.refreshInterval)}
          options={INTERVAL_OPTIONS}
          onChange={(v) => setStartup("refreshInterval", Number(v))}
        />
      </Section>

      {/* Window */}
      <Section title="Window">
        <ToggleRow
          label="Always on top"
          description="Keep the window above all other windows"
          checked={window_.pinned}
          onChange={(v) => setWindow("pinned", v)}
        />
        <ToggleRow
          label="Show in system taskbar"
          description="Display Scrollr in the OS taskbar / dock"
          checked={!window_.skipTaskbar}
          onChange={(v) => setWindow("skipTaskbar", !v)}
        />
        <SegmentedRow
          label="Default width"
          description="Window width when the app starts"
          value={window_.defaultWidth}
          options={[
            { value: "full" as const, label: "Full" },
            { value: "narrow" as const, label: "Narrow" },
          ]}
          onChange={(v) => setWindow("defaultWidth", v)}
        />
        {window_.defaultWidth === "narrow" && (
          <SliderRow
            label="Narrow width"
            value={window_.narrowWidth}
            min={400}
            max={1600}
            step={50}
            displayValue={`${window_.narrowWidth}px`}
            onChange={(v) => setWindow("narrowWidth", v)}
          />
        )}
      </Section>

      {/* Taskbar */}
      <Section title="Taskbar">
        <SegmentedRow
          label="Height"
          description="Height of the header bar"
          value={taskbar.taskbarHeight}
          options={HEIGHT_OPTIONS}
          onChange={(v) => setTaskbar("taskbarHeight", v)}
        />
        <ToggleRow
          label="Channel icons"
          description="Show icons next to channel tab names"
          checked={taskbar.showChannelIcons}
          onChange={(v) => setTaskbar("showChannelIcons", v)}
        />
        <ToggleRow
          label="Connection indicator"
          description="Show the status dot and delivery mode label"
          checked={taskbar.showConnectionIndicator}
          onChange={(v) => setTaskbar("showConnectionIndicator", v)}
        />
        <ToggleRow
          label="Feed / Dash toggle"
          description="Show the view switcher in the taskbar"
          checked={taskbar.showCanvasToggle}
          onChange={(v) => setTaskbar("showCanvasToggle", v)}
        />
      </Section>

      {/* Quick actions */}
      <Section title="Quick actions">
        {PINNABLE_ACTIONS.map((action) => {
          const isPinned = taskbar.pinnedActions.includes(action.id);
          return (
            <ToggleRow
              key={action.id}
              label={action.label}
              description={`Add a ${action.label.toLowerCase()} toggle to the taskbar`}
              checked={isPinned}
              onChange={(v) => {
                const next = v
                  ? [...taskbar.pinnedActions, action.id]
                  : taskbar.pinnedActions.filter((id) => id !== action.id);
                setTaskbar("pinnedActions", next);
              }}
            />
          );
        })}
      </Section>

      {/* Reset buttons */}
      <div className="flex items-center gap-2 justify-end pt-2">
        <ResetButton
          label="Reset startup"
          onClick={() => {
            onResetStartup();
            if (autostartEnabled && !DEFAULT_STARTUP.autostart) {
              onAutostartChange(false);
            }
          }}
        />
        <ResetButton label="Reset window" onClick={onResetWindow} />
        <ResetButton label="Reset taskbar" onClick={onResetTaskbar} />
      </div>
    </div>
  );
}
