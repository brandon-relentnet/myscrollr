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
import { getWidget } from "../widgets/registry";
import WidgetConfigPanel from "../widgets/WidgetConfigPanel";
import { useShell } from "../shell-context";
import clsx from "clsx";

const VALID_TABS = ["feed", "configuration"] as const;
type WidgetTab = (typeof VALID_TABS)[number];

const TABS: { key: WidgetTab; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "configuration", label: "Configure" },
];

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
    <div className="flex flex-col h-full">
      {/* Breadcrumb header */}
      <header className="flex items-center justify-between px-5 h-12 border-b border-edge shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          <button
            onClick={() => navigate({ to: "/feed" })}
            aria-label="Back to dashboard"
            className="text-fg-3 hover:text-fg-2 transition-colors shrink-0"
          >
            Dashboard
          </button>
          <span className="text-fg-4">/</span>
          <span className="font-medium truncate">{widget.name}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() =>
                navigate({
                  to: "/widget/$id/$tab",
                  params: { id, tab: key },
                })
              }
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
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "feed" && <WidgetFeedTab widget={widget} />}
        {tab === "configuration" && <WidgetConfigTab id={id} />}
      </div>
    </div>
  );
}

function WidgetFeedTab({
  widget,
}: {
  widget: NonNullable<ReturnType<typeof getWidget>>;
}) {
  const channelConfig = {
    __dashboardLoaded: true,
  };
  return <widget.FeedTab mode="comfort" channelConfig={channelConfig} />;
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
