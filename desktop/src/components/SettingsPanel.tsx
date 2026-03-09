import type { SubscriptionTier } from "../auth";
import type { AppPreferences } from "../preferences";
import { resetCategory, resetAll, savePrefs } from "../preferences";
import type { SettingsTab } from "./Sidebar";
import AppearanceSettings from "./settings/AppearanceSettings";
import BehaviorSettings from "./settings/BehaviorSettings";
import AccountSettings from "./settings/AccountSettings";

// ── Props ───────────────────────────────────────────────────────

interface SettingsPanelProps {
  activeTab: SettingsTab;
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
  authenticated: boolean;
  tier: SubscriptionTier;
  onLogin: () => void;
  onLogout: () => void;
  autostartEnabled: boolean;
  onAutostartChange: (enabled: boolean) => void;
  showAppTicker: boolean;
  onToggleAppTicker: (enabled: boolean) => void;
  showTaskbar: boolean;
  onToggleTaskbar: (enabled: boolean) => void;
}

// ── Component ───────────────────────────────────────────────────

export default function SettingsPanel({
  activeTab,
  prefs,
  onPrefsChange,
  authenticated,
  tier,
  onLogin,
  onLogout,
  autostartEnabled,
  onAutostartChange,
  showAppTicker,
  onToggleAppTicker,
  showTaskbar,
  onToggleTaskbar,
}: SettingsPanelProps) {
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
    <div className="dashboard-content w-full max-w-2xl mx-auto">
      {activeTab === "appearance" && (
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

      {activeTab === "behavior" && (
        <BehaviorSettings
          window_={prefs.window}
          onWindowChange={(window_) =>
            updatePrefs({ ...prefs, window: window_ })
          }
          onResetWindow={() => handleResetCategory("window")}
          autostartEnabled={autostartEnabled}
          onAutostartChange={onAutostartChange}
          showAppTicker={showAppTicker}
          onToggleAppTicker={onToggleAppTicker}
          showTaskbar={showTaskbar}
          onToggleTaskbar={onToggleTaskbar}
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
