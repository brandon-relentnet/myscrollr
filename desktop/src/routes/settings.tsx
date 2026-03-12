/**
 * Settings route — general settings only.
 *
 * Ticker and Account have been moved to their own top-level routes.
 * This page now contains Appearance, Window, and Startup settings.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useShell } from "../shell-context";
import GeneralSettings from "../components/settings/GeneralSettings";
import { resetCategory } from "../preferences";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const shell = useShell();
  const { prefs, onPrefsChange } = shell;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <GeneralSettings
        appearance={prefs.appearance}
        window_={prefs.window}
        onAppearanceChange={(appearance) =>
          onPrefsChange({ ...prefs, appearance })
        }
        onWindowChange={(window_) =>
          onPrefsChange({ ...prefs, window: window_ })
        }
        onResetAppearance={() =>
          onPrefsChange(resetCategory(prefs, "appearance"))
        }
        onResetWindow={() =>
          onPrefsChange(resetCategory(prefs, "window"))
        }
        autostartEnabled={shell.autostartEnabled}
        onAutostartChange={shell.onAutostartChange}
        showAppTicker={shell.showAppTicker}
        onToggleAppTicker={shell.onToggleAppTicker}
        showTaskbar={shell.showTaskbar}
        onToggleTaskbar={shell.onToggleTaskbar}
      />
    </div>
  );
}
