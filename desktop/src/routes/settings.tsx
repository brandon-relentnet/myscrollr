/**
 * Settings route — flat app settings page.
 *
 * Ticker and Account now live as top-level sidebar destinations; this
 * route owns only appearance, window, startup, shortcuts, updates, and
 * about settings.
 */
import { createFileRoute } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { useShell } from "../shell-context";
import GeneralSettings from "../components/settings/GeneralSettings";
import PageLayout from "../components/layout/PageLayout";
import { resetCategory, type AppPreferences } from "../preferences";

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
    <PageLayout
      title="Settings"
      width="wide"
    >
      <GeneralSettings
        appearance={prefs.appearance}
        window_={prefs.window}
        startup={prefs.startup}
        onAppearanceChange={(appearance) =>
          onPrefsChange({ ...prefs, appearance })
        }
        onWindowChange={(window_) =>
          onPrefsChange({ ...prefs, window: window_ })
        }
        onStartupChange={(startup) =>
          onPrefsChange({ ...prefs, startup })
        }
        onReset={() => {
          let next: AppPreferences = resetCategory(prefs, "appearance");
          next = resetCategory(next, "window");
          onPrefsChange(next);
        }}
        autostartEnabled={shell.autostartEnabled}
        onAutostartChange={shell.onAutostartChange}
        appVersion={shell.appVersion}
      />
    </PageLayout>
  );
}
