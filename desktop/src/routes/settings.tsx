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
    <div className="p-5 max-w-6xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 className="text-[11px] font-mono font-semibold text-fg-4 uppercase tracking-wider mb-1">
          Settings
        </h1>
        <p className="text-xs text-fg-4">
          Appearance, ticker, and account preferences
        </p>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5">
        {VALID_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
              tab === t
                ? "bg-accent/10 text-accent"
                : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────── */}
      <div className="max-w-2xl">
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
            showSetupOnLogin={prefs.showSetupOnLogin}
            onShowSetupChange={(enabled) =>
              onPrefsChange({ ...prefs, showSetupOnLogin: enabled })
            }
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
            subscriptionInfo={shell.subscriptionInfo}
            onLogin={shell.onLogin}
            onLogout={shell.onLogout}
            onResetAll={handleResetAll}
          />
        )}
      </div>
    </div>
  );
}
