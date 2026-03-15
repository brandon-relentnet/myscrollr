/**
 * Settings route — general app settings.
 *
 * Covers appearance, window, and startup preferences.
 * Ticker settings have their own dedicated page at /ticker.
 */
import { createFileRoute } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { useShell } from "../shell-context";
import GeneralSettings from "../components/settings/GeneralSettings";
import { resetCategory } from "../preferences";

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
  errorComponent: RouteError,
});

// ── Component ───────────────────────────────────────────────────

function SettingsRoute() {
  const shell = useShell();
  const { prefs, onPrefsChange } = shell;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-[13px] font-mono font-semibold text-fg-4 uppercase tracking-wider mb-6">
        Settings
      </h2>

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
      />
    </div>
  );
}
