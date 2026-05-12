import { createFileRoute } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import PageLayout from "../components/layout/PageLayout";
import AccountSettings from "../components/settings/AccountSettings";
import { resetAll } from "../preferences";
import { useShell } from "../shell-context";

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
    <PageLayout title="Account" width="wide">
      <AccountSettings
        authenticated={shell.authenticated}
        tier={shell.tier}
        subscriptionInfo={shell.subscriptionInfo}
        onLogin={shell.onLogin}
        onLogout={shell.onLogout}
        onResetAll={handleResetAll}
      />
    </PageLayout>
  );
}
