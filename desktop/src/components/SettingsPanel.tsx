import { AnimatePresence, motion } from "motion/react";
import type { SubscriptionTier } from "../auth";
import type { AppPreferences } from "../preferences";
import { resetCategory, resetAll } from "../preferences";
import type { SettingsTab } from "./Sidebar";
import GeneralSettings from "./settings/GeneralSettings";
import TickerSettings from "./settings/TickerSettings";
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
  appVersion: string;
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
  appVersion,
}: SettingsPanelProps) {
  const handleResetCategory = (category: keyof AppPreferences) => {
    const next = resetCategory(prefs, category);
    onPrefsChange(next);
  };

  const handleResetAll = () => {
    const next = resetAll();
    onPrefsChange(next);
  };

  return (
    <div className="w-full max-w-2xl mx-auto relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === "general" && (
            <GeneralSettings
              appearance={prefs.appearance}
              window_={prefs.window}
              onAppearanceChange={(appearance) =>
                onPrefsChange({ ...prefs, appearance })
              }
              onWindowChange={(window_) =>
                onPrefsChange({ ...prefs, window: window_ })
              }
              onResetAppearance={() => handleResetCategory("appearance")}
              onResetWindow={() => handleResetCategory("window")}
              autostartEnabled={autostartEnabled}
              onAutostartChange={onAutostartChange}
              showAppTicker={showAppTicker}
              onToggleAppTicker={onToggleAppTicker}
              showTaskbar={showTaskbar}
              onToggleTaskbar={onToggleTaskbar}
            />
          )}

          {activeTab === "ticker" && (
            <TickerSettings
              appearance={prefs.appearance}
              ticker={prefs.ticker}
              onAppearanceChange={(appearance) =>
                onPrefsChange({ ...prefs, appearance })
              }
              onTickerChange={(ticker) => onPrefsChange({ ...prefs, ticker })}
              onResetAppearance={() => handleResetCategory("appearance")}
              onResetTicker={() => handleResetCategory("ticker")}
            />
          )}

          {activeTab === "account" && (
            <AccountSettings
              authenticated={authenticated}
              tier={tier}
              onLogin={onLogin}
              onLogout={onLogout}
              onResetAll={handleResetAll}
              appVersion={appVersion}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
