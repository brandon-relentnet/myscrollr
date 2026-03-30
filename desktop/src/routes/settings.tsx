/**
 * Settings route — consolidated settings page with tabs.
 *
 * Three tabs:
 *   General  — appearance, window, startup
 *   Ticker   — ticker presentation settings with live preview
 *   Account  — profile, billing, updates, reset
 *
 * Tab state is persisted in the URL via ?tab= search param.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import RouteError from "../components/RouteError";
import { useShell } from "../shell-context";
import GeneralSettings from "../components/settings/GeneralSettings";
import TickerSettings from "../components/settings/TickerSettings";
import AccountSettings from "../components/settings/AccountSettings";
import { resetCategory, resetAll, type AppPreferences } from "../preferences";

// ── Types ───────────────────────────────────────────────────────

type SettingsTab = "general" | "ticker" | "account";

const VALID_TABS: SettingsTab[] = ["general", "ticker", "account"];

const TAB_LABELS: Record<SettingsTab, string> = {
  general: "General",
  ticker: "Ticker",
  account: "Account",
};

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { tab: SettingsTab } => ({
    tab: VALID_TABS.includes(search.tab as SettingsTab)
      ? (search.tab as SettingsTab)
      : "general",
  }),
  component: SettingsRoute,
  errorComponent: RouteError,
});

// ── Component ───────────────────────────────────────────────────

function SettingsRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const shell = useShell();
  const { prefs, onPrefsChange } = shell;

  const setTab = (next: SettingsTab) => {
    navigate({ to: "/settings", search: { tab: next }, replace: true });
  };

  const handleResetAll = () => {
    const next = resetAll();
    onPrefsChange(next);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      {/* ── Header + Tabs ──────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-0">
        <h2 className="text-[13px] font-mono font-semibold text-fg-4 uppercase tracking-wider mb-4">
          Settings
        </h2>

        <div className="flex gap-1 border-b border-edge/30">
          {VALID_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "px-3 py-2 text-[12px] font-medium transition-colors relative cursor-pointer",
                tab === t
                  ? "text-fg"
                  : "text-fg-3 hover:text-fg-2",
              )}
            >
              {TAB_LABELS[t]}
              {tab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────── */}
      <div className="px-6 py-6 max-w-2xl w-full mx-auto">
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
            onReset={() => {
              let next: AppPreferences = resetCategory(prefs, "appearance");
              next = resetCategory(next, "window");
              onPrefsChange(next);
            }}
            autostartEnabled={shell.autostartEnabled}
            onAutostartChange={shell.onAutostartChange}
            appVersion={shell.appVersion}
          />
        )}

        {tab === "ticker" && (
          <TickerSettings
            prefs={prefs}
            onPrefsChange={onPrefsChange}
          />
        )}

        {tab === "account" && (
          <AccountSettings
            authenticated={shell.authenticated}
            tier={shell.tier}
            onLogin={shell.onLogin}
            onLogout={shell.onLogout}
            onResetAll={handleResetAll}
          />
        )}
      </div>
    </div>
  );
}
