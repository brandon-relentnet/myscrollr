import { useState } from "react";
import { clsx } from "clsx";
import type { SubscriptionTier } from "../auth";
import type { AppPreferences } from "../preferences";
import { resetCategory, resetAll, savePrefs } from "../preferences";
import AppearanceSettings from "./settings/AppearanceSettings";
import BehaviorSettings from "./settings/BehaviorSettings";
import AccountSettings from "./settings/AccountSettings";

// ── Sidebar categories ──────────────────────────────────────────

type SettingsCategory = "appearance" | "behavior" | "account";

const CATEGORIES: { id: SettingsCategory; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "behavior", label: "Behavior" },
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
  const [active, setActive] = useState<SettingsCategory>("appearance");

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
    <div className="dashboard-content h-full flex flex-col items-center">
      {/* Centered container for header + body */}
      <div className="w-full max-w-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-edge/50 shrink-0">
          <span className="text-[13px] font-semibold text-fg-2">Settings</span>
          <button
            onClick={onClose}
            className="text-fg-4 hover:text-fg-2 transition-colors text-[14px] leading-none w-6 h-6 flex items-center justify-center rounded-md hover:bg-base-250/50 cursor-pointer"
            title="Close settings"
          >
            &#x2715;
          </button>
        </div>

        {/* Sidebar + Content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <nav className="w-[120px] shrink-0 border-r border-edge/30 py-3 px-2 flex flex-col gap-0.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActive(cat.id)}
                className={clsx(
                  "text-left px-3 py-2 rounded-lg text-[11px] font-medium transition-all duration-150 cursor-pointer",
                  active === cat.id
                    ? "bg-accent/10 text-accent"
                    : "text-fg-3 hover:text-fg-2 hover:bg-base-250/30",
                )}
              >
                {cat.label}
              </button>
            ))}
          </nav>

          {/* Content pane */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin py-4 px-6">
          {active === "appearance" && (
            <AppearanceSettings
              appearance={prefs.appearance}
              ticker={prefs.ticker}
              onAppearanceChange={(appearance) =>
                updatePrefs({ ...prefs, appearance })
              }
              onTickerChange={(ticker) => updatePrefs({ ...prefs, ticker })}
              onResetAppearance={() => handleResetCategory("appearance")}
              onResetTicker={() => handleResetCategory("ticker")}
            />
          )}

          {active === "behavior" && (
            <BehaviorSettings
              startup={prefs.startup}
              window_={prefs.window}
              taskbar={prefs.taskbar}
              onStartupChange={(startup) =>
                updatePrefs({ ...prefs, startup })
              }
              onWindowChange={(window_) =>
                updatePrefs({ ...prefs, window: window_ })
              }
              onTaskbarChange={(taskbar) =>
                updatePrefs({ ...prefs, taskbar })
              }
              onResetStartup={() => handleResetCategory("startup")}
              onResetWindow={() => handleResetCategory("window")}
              onResetTaskbar={() => handleResetCategory("taskbar")}
              autostartEnabled={autostartEnabled}
              onAutostartChange={onAutostartChange}
            />
          )}

          {active === "account" && (
            <AccountSettings
              authenticated={authenticated}
              tier={tier}
              onLogin={onLogin}
              onLogout={onLogout}
              onResetAll={handleResetAll}
            />
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
