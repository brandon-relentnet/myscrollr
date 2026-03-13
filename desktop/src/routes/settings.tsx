/**
 * Settings route — consolidated settings with tabbed navigation.
 *
 * Tabs: General (appearance, window, startup) and Ticker (layout,
 * playback, style). Source management lives in each channel/widget's
 * own config tab, not here.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { useShell } from "../shell-context";
import GeneralSettings from "../components/settings/GeneralSettings";
import TickerSettings from "../components/settings/TickerSettings";
import { resetCategory } from "../preferences";
import clsx from "clsx";

// ── Route ───────────────────────────────────────────────────────

type SettingsTab = "general" | "ticker";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { tab: SettingsTab } => ({
    tab: search.tab === "ticker" ? "ticker" : "general",
  }),
  component: SettingsRoute,
  errorComponent: RouteError,
});

// ── Tab config ──────────────────────────────────────────────────

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "ticker", label: "Ticker" },
];

// ── Component ───────────────────────────────────────────────────

function SettingsRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const shell = useShell();
  const { prefs, onPrefsChange } = shell;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Tab pills */}
      <div className="flex gap-1 mb-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => navigate({ to: "/settings", search: { tab: key } })}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              tab === key
                ? "bg-accent/10 text-accent"
                : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "general" && (
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
      )}
      {tab === "ticker" && (
        <TickerSettings
          prefs={prefs}
          onPrefsChange={onPrefsChange}
        />
      )}
    </div>
  );
}
