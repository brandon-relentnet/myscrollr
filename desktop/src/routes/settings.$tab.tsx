/**
 * Settings route — renders the appropriate settings sub-panel.
 *
 * URL: /settings/:tab where tab is "general" | "ticker" | "account"
 */
import { createFileRoute } from "@tanstack/react-router";
import SettingsPanel from "../components/SettingsPanel";
import { useShell } from "../shell-context";

const VALID_TABS = ["general", "ticker", "account"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

export const Route = createFileRoute("/settings/$tab")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const { tab } = Route.useParams();
  const validTab: SettingsTab = (VALID_TABS as readonly string[]).includes(tab)
    ? (tab as SettingsTab)
    : "general";

  const shell = useShell();

  return (
    <div className="p-6">
      <SettingsPanel
        activeTab={validTab}
        prefs={shell.prefs}
        onPrefsChange={shell.onPrefsChange}
        authenticated={shell.authenticated}
        tier={shell.tier}
        onLogin={shell.onLogin}
        onLogout={shell.onLogout}
        autostartEnabled={shell.autostartEnabled}
        onAutostartChange={shell.onAutostartChange}
        showAppTicker={shell.showAppTicker}
        onToggleAppTicker={shell.onToggleAppTicker}
        showTaskbar={shell.showTaskbar}
        onToggleTaskbar={shell.onToggleTaskbar}
        appVersion={shell.appVersion}
      />
    </div>
  );
}
