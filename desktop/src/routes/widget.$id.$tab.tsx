/**
 * Widget route — renders widget feed or configuration.
 *
 * URL: /widget/:id/:tab
 *   - id: "clock" | "weather" | "sysmon"
 *   - tab: "feed" | "configuration"
 *
 * Management actions (ticker toggle, remove) live on the dashboard
 * card, not here. This route is for viewing data and configuring.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import SourcePageLayout from "../components/SourcePageLayout";
import { getWidget } from "../widgets/registry";
import WidgetConfigPanel from "../widgets/WidgetConfigPanel";
import { useShell } from "../shell-context";

const VALID_TABS = ["feed", "configuration"] as const;
type WidgetTab = (typeof VALID_TABS)[number];

export const Route = createFileRoute("/widget/$id/$tab")({
  component: WidgetRoute,
  errorComponent: RouteError,
});

function WidgetRoute() {
  const { id, tab: rawTab } = Route.useParams();
  const navigate = useNavigate();
  const tab: WidgetTab = (VALID_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as WidgetTab)
    : "feed";

  const widget = getWidget(id);

  if (!widget) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
        <h2 className="text-base font-semibold text-fg">Widget not found</h2>
        <p className="text-sm text-fg-3">
          The widget &ldquo;{id}&rdquo; is not installed.
        </p>
      </div>
    );
  }

  return (
    <SourcePageLayout
      name={widget.name}
      activeTab={tab}
      onTabChange={(t) =>
        navigate({ to: "/widget/$id/$tab", params: { id, tab: t } })
      }
      onBack={() => navigate({ to: "/feed" })}
    >
      {tab === "feed" && <WidgetFeedTab widget={widget} />}
      {tab === "configuration" && <WidgetConfigTab id={id} />}
    </SourcePageLayout>
  );
}

function WidgetFeedTab({
  widget,
}: {
  widget: NonNullable<ReturnType<typeof getWidget>>;
}) {
  const feedContext = {
    __dashboardLoaded: true,
  };
  return <widget.FeedTab mode="comfort" feedContext={feedContext} />;
}

function WidgetConfigTab({ id }: { id: string }) {
  const shell = useShell();

  return (
    <div className="p-4">
      <WidgetConfigPanel
        widgetId={id}
        prefs={shell.prefs}
        onPrefsChange={shell.onPrefsChange}
      />
    </div>
  );
}
