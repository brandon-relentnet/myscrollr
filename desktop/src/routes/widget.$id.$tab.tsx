/**
 * Widget route — renders widget feed, info, or configuration.
 *
 * URL: /widget/:id/:tab
 *   - id: "clock" | "weather" | "sysmon"
 *   - tab: "feed" | "info" | "configuration"
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getWidget } from "../widgets/registry";
import WidgetConfigPanel from "../widgets/WidgetConfigPanel";
import ContentHeader from "../components/ContentHeader";
import { useShell } from "../shell-context";

const VALID_TABS = ["feed", "info", "configuration"] as const;
type WidgetTab = (typeof VALID_TABS)[number];

export const Route = createFileRoute("/widget/$id/$tab")({
  component: WidgetRoute,
});

function WidgetRoute() {
  const { id, tab: rawTab } = Route.useParams();
  const navigate = useNavigate();
  const tab: WidgetTab = (VALID_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as WidgetTab)
    : "feed";

  const widget = getWidget(id);
  const shell = useShell();

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

  const tickerEnabled = shell.prefs.widgets.widgetsOnTicker.includes(id);

  return (
    <div className="flex flex-col h-full">
      <ContentHeader
        name={widget.name}
        icon={widget.icon}
        hex={widget.hex}
        activeTab={tab}
        onTabChange={(t) =>
          navigate({
            to: "/widget/$id/$tab",
            params: { id, tab: t },
          })
        }
        tickerEnabled={tickerEnabled}
        onToggleTicker={() => shell.onToggleWidgetTicker(id)}
        onDelete={() => shell.onToggleWidget(id)}
        onBack={() => navigate({ to: "/feed" })}
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "feed" && <WidgetFeedTab widget={widget} />}
        {tab === "info" && <WidgetInfoTab widget={widget} />}
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
    __initialItems: [],
    __dashboardLoaded: true,
  };
  return <widget.FeedTab mode="comfort" channelConfig={channelConfig} />;
}

function WidgetInfoTab({
  widget,
}: {
  widget: NonNullable<ReturnType<typeof getWidget>>;
}) {
  const Icon = widget.icon;
  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <span
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ backgroundColor: `${widget.hex}15`, color: widget.hex }}
        >
          <Icon size={20} />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{widget.name}</h2>
          <p className="text-sm text-fg-3">{widget.description}</p>
        </div>
      </div>

      <div className="space-y-4">
        <section>
          <h3 className="text-xs font-mono font-bold text-fg-3 uppercase tracking-wider mb-2">
            About
          </h3>
          <p className="text-sm text-fg-2 leading-relaxed">
            {widget.info.about}
          </p>
        </section>

        <section>
          <h3 className="text-xs font-mono font-bold text-fg-3 uppercase tracking-wider mb-2">
            How to use
          </h3>
          <ul className="space-y-2">
            {widget.info.usage.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-fg-2">
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold shrink-0 mt-0.5"
                  style={{
                    backgroundColor: `${widget.hex}15`,
                    color: widget.hex,
                  }}
                >
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Extracted so useShell() is called unconditionally. */
function WidgetConfigTab({ id }: { id: string }) {
  const shell = useShell();

  return (
    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
      <WidgetConfigPanel
        widgetId={id}
        prefs={shell.prefs}
        onPrefsChange={shell.onPrefsChange}
      />
    </div>
  );
}
