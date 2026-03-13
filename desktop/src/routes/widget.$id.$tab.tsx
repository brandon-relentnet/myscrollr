/**
 * Widget route — renders widget feed, info, or configuration.
 *
 * URL: /widget/:id/:tab
 *   - id: "clock" | "weather" | "sysmon"
 *   - tab: "feed" | "info" | "configuration"
 */
import { useState, useRef, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { getWidget } from "../widgets/registry";
import WidgetConfigPanel from "../widgets/WidgetConfigPanel";
import { useShell } from "../shell-context";
import { Trash2 } from "lucide-react";
import clsx from "clsx";

const VALID_TABS = ["feed", "info", "configuration"] as const;
type WidgetTab = (typeof VALID_TABS)[number];

const TABS: { key: WidgetTab; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "info", label: "About" },
  { key: "configuration", label: "Settings" },
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
      {/* Breadcrumb header */}
      <header className="flex items-center justify-between px-5 h-12 border-b border-edge shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          <button
            onClick={() => navigate({ to: "/feed" })}
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
        {tab === "info" && <WidgetInfoTab widget={widget} />}
        {tab === "configuration" && (
          <WidgetConfigTab
            id={id}
            tickerEnabled={tickerEnabled}
            onToggleTicker={() => shell.onToggleWidgetTicker(id)}
            onDelete={() => shell.onToggleWidget(id)}
            hex={widget.hex}
          />
        )}
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

function WidgetConfigTab({
  id,
  tickerEnabled,
  onToggleTicker,
  onDelete,
  hex,
}: {
  id: string;
  tickerEnabled: boolean;
  onToggleTicker: () => void;
  onDelete: () => void;
  hex: string;
}) {
  const shell = useShell();

  // Delete confirmation state
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  function handleDeleteClick() {
    if (deleteArmed) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      onDelete();
      setDeleteArmed(false);
    } else {
      setDeleteArmed(true);
      deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
      <WidgetConfigPanel
        widgetId={id}
        prefs={shell.prefs}
        onPrefsChange={shell.onPrefsChange}
      />

      {/* Source management — ticker toggle + remove */}
      <div className="border-t border-edge mt-6 pt-4 max-w-2xl">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3 mb-3 px-3">
          Source
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={tickerEnabled}
          onClick={onToggleTicker}
          className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg hover:bg-base-250/50 transition-colors cursor-pointer group"
        >
          <div className="flex flex-col gap-0.5 text-left">
            <span className="text-[12px] text-fg-2 group-hover:text-fg leading-tight">
              Show on ticker
            </span>
            <span className="text-[11px] text-fg-4 leading-tight">
              Display updates from this widget in the ticker
            </span>
          </div>
          <span
            className="block h-4 w-7 rounded-full relative transition-colors shrink-0 ml-4"
            style={{ background: tickerEnabled ? hex : undefined }}
          >
            {!tickerEnabled && (
              <span className="absolute inset-0 rounded-full bg-fg-4/25" />
            )}
            <span
              className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-200"
              style={{ transform: tickerEnabled ? "translateX(12px)" : "translateX(0)" }}
            />
          </span>
        </button>
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-fg-2 leading-tight">Remove widget</span>
            <span className="text-[11px] text-fg-4 leading-tight">
              Remove this widget from your dashboard
            </span>
          </div>
          <button
            onClick={handleDeleteClick}
            className={clsx(
              "text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ml-4",
              deleteArmed
                ? "bg-red-500/10 text-red-500"
                : "bg-base-250 text-fg-3 hover:text-red-400 hover:bg-red-500/10",
            )}
          >
            <Trash2 size={12} />
            {deleteArmed ? "Confirm?" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
