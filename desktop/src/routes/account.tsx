/**
 * Account route — profile, billing, updates.
 *
 * Moved from Settings > Account tab to a top-level destination.
 */
import { createFileRoute } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { useShell } from "../shell-context";
import AccountSettings from "../components/settings/AccountSettings";
import { resetAll } from "../preferences";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
  errorComponent: RouteError,
});

function AccountRoute() {
  const shell = useShell();

  const handleResetAll = () => {
    const next = resetAll();
    shell.onPrefsChange(next);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-[13px] font-mono font-semibold text-fg-4 uppercase tracking-wider mb-6">
        Account
      </h2>
      <AccountSettings
        authenticated={shell.authenticated}
        tier={shell.tier}
        onLogin={shell.onLogin}
        onLogout={shell.onLogout}
        onResetAll={handleResetAll}
        appVersion={shell.appVersion}
      />
    </div>
  );
}
