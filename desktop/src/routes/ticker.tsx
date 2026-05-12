import { createFileRoute } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import PageLayout from "../components/layout/PageLayout";
import TickerSettings from "../components/settings/TickerSettings";
import { useShell } from "../shell-context";

export const Route = createFileRoute("/ticker")({
  component: TickerRoute,
  errorComponent: RouteError,
});

function TickerRoute() {
  const { prefs, onPrefsChange } = useShell();

  return (
    <PageLayout title="Ticker" width="wide">
      <TickerSettings prefs={prefs} onPrefsChange={onPrefsChange} />
    </PageLayout>
  );
}
