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
  errorComponent: SettingsError,
});

function SettingsError({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
      <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center mb-1">
        <span className="text-error text-lg font-bold">!</span>
      </div>
      <h2 className="text-base font-semibold text-fg">Something went wrong</h2>
      <p className="text-sm text-fg-3 leading-relaxed">{error.message}</p>
    </div>
  );
}

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
