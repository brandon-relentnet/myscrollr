import { useState } from "react";
import { clsx } from "clsx";
import type { SubscriptionTier } from "../auth";
import type { AppPreferences } from "../preferences";
import { resetCategory, resetAll, savePrefs } from "../preferences";
import GeneralSettings from "./settings/GeneralSettings";
import TaskbarSettings from "./settings/TaskbarSettings";
import TickerSettings from "./settings/TickerSettings";
import WindowSettings from "./settings/WindowSettings";
import AccountSettings from "./settings/AccountSettings";

// ── Tab definitions ─────────────────────────────────────────────

type SettingsTab = "general" | "taskbar" | "ticker" | "window" | "account";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "taskbar", label: "Taskbar" },
  { id: "ticker", label: "Ticker" },
  { id: "window", label: "Window" },
  { id: "account", label: "Account" },
];

// ── Props ───────────────────────────────────────────────────────

interface SettingsPanelProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
  authenticated: boolean;
  tier: SubscriptionTier;
  onLogin: () => void;
  onLogout: () => void;
  onClose: () => void;
  autostartEnabled: boolean;
  onAutostartChange: (enabled: boolean) => void;
}

// ── Component ───────────────────────────────────────────────────

export default function SettingsPanel({
  prefs,
  onPrefsChange,
  authenticated,
  tier,
  onLogin,
  onLogout,
  onClose,
  autostartEnabled,
  onAutostartChange,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // Update prefs and persist
  const updatePrefs = (next: AppPreferences) => {
    onPrefsChange(next);
    savePrefs(next);
  };

  const handleResetCategory = (category: keyof AppPreferences) => {
    const next = resetCategory(prefs, category);
    updatePrefs(next);
  };

  const handleResetAll = () => {
    const next = resetAll();
    onPrefsChange(next);
  };

  return (
    <div className="dashboard-content max-w-4xl mx-auto py-4 px-6">
      {/* Header: title + close */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[13px] font-mono font-semibold uppercase tracking-widest text-fg-2">
          Settings
        </span>
        <button
          onClick={onClose}
          className="text-fg-3 hover:text-fg-1 transition-colors text-[16px] leading-none px-1 cursor-pointer"
          title="Close settings"
        >
          &#x2715;
        </button>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-5 rounded bg-base-200 border border-edge p-0.5 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded transition-colors cursor-pointer leading-none whitespace-nowrap",
              activeTab === tab.id
                ? "bg-accent/15 text-accent"
                : "text-fg-3 hover:text-fg-2",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "general" && (
        <GeneralSettings
          prefs={prefs.general}
          onChange={(general) => updatePrefs({ ...prefs, general })}
          onReset={() => handleResetCategory("general")}
          autostartEnabled={autostartEnabled}
          onAutostartChange={onAutostartChange}
        />
      )}

      {activeTab === "taskbar" && (
        <TaskbarSettings
          prefs={prefs.taskbar}
          onChange={(taskbar) => updatePrefs({ ...prefs, taskbar })}
          onReset={() => handleResetCategory("taskbar")}
        />
      )}

      {activeTab === "ticker" && (
        <TickerSettings
          prefs={prefs.ticker}
          onChange={(ticker) => updatePrefs({ ...prefs, ticker })}
          onReset={() => handleResetCategory("ticker")}
        />
      )}

      {activeTab === "window" && (
        <WindowSettings
          prefs={prefs.window}
          onChange={(window_) => updatePrefs({ ...prefs, window: window_ })}
          onReset={() => handleResetCategory("window")}
        />
      )}

      {activeTab === "account" && (
        <AccountSettings
          authenticated={authenticated}
          tier={tier}
          onLogin={onLogin}
          onLogout={onLogout}
          onResetAll={handleResetAll}
        />
      )}
    </div>
  );
}
