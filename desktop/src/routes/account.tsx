/**
 * Account route — profile, billing, updates.
 *
 * Moved from Settings > Account tab to a top-level destination.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useShell } from "../shell-context";
import AccountSettings from "../components/settings/AccountSettings";
import { resetAll } from "../preferences";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
  errorComponent: AccountError,
});

function AccountError({ error }: { error: Error }) {
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

function AccountRoute() {
  const shell = useShell();

  const handleResetAll = () => {
    const next = resetAll();
    shell.onPrefsChange(next);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
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
