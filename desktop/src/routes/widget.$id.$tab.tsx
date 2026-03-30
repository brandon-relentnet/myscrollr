/**
 * Widget route — renders widget feed, configuration, or display prefs.
 *
 * URL: /widget/:id/:tab
 *   - id: "clock" | "weather" | "sysmon" | "uptime" | "github"
 *   - tab: "feed" | "configuration" | "display"
 *
 * Source-level actions (ticker toggle, remove) are in the header bar.
 */
import { useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import SourcePageLayout, { parseSourceTab, SourceNotFound } from "../components/SourcePageLayout";
import { getWidget } from "../widgets/registry";
import WidgetConfigPanel from "../widgets/WidgetConfigPanel";
import { useShell } from "../shell-context";
import { Section, ToggleRow, SliderRow, ResetButton } from "../components/settings/SettingsControls";
import {
  WIDGET_SCHEMAS,
  WIDGET_PREFS_KEY,
  DEFAULT_CARD_PREFS,
  loadCardPrefs,
  saveCardPrefs,
} from "../components/dashboard/dashboardPrefs";
import type { DashboardCardPrefs, EditorField } from "../components/dashboard/dashboardPrefs";

export const Route = createFileRoute("/widget/$id/$tab")({
  component: WidgetRoute,
  errorComponent: RouteError,
});

function WidgetRoute() {
  const { id, tab: rawTab } = Route.useParams();
  const navigate = useNavigate();
  const tab = parseSourceTab(rawTab);

  const widget = getWidget(id);
  const { onToggleWidgetTicker, onToggleWidget, prefs } = useShell();

  if (!widget) {
    return <SourceNotFound kind="Widget" name={id} />;
  }

  const tickerEnabled = prefs.widgets.widgetsOnTicker.includes(id);

  return (
    <SourcePageLayout
      name={widget.name}
      activeTab={tab}
      onTabChange={(t) =>
        navigate({ to: "/widget/$id/$tab", params: { id, tab: t } })
      }
      onBack={() => navigate({ to: "/feed" })}
      tickerEnabled={tickerEnabled}
      onToggleTicker={() => onToggleWidgetTicker(id)}
      onRemove={() => {
        onToggleWidget(id);
        navigate({ to: "/feed" });
      }}
      sourceKind="widget"
    >
      {tab === "feed" && <WidgetFeedTab widget={widget} />}
      {tab === "configuration" && <WidgetConfigTab id={id} />}
      {tab === "display" && <WidgetDisplayTab id={id} />}
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

function WidgetDisplayTab({ id }: { id: string }) {
  const schema = WIDGET_SCHEMAS[id];
  const prefsKey = WIDGET_PREFS_KEY[id];

  const [cardPrefs, setCardPrefs] = useState<DashboardCardPrefs>(loadCardPrefs);

  const handleChange = useCallback(
    (key: string, value: boolean | number) => {
      if (!prefsKey) return;
      setCardPrefs((prev) => {
        const next = {
          ...prev,
          [prefsKey]: { ...prev[prefsKey], [key]: value },
        };
        saveCardPrefs(next);
        return next;
      });
    },
    [prefsKey],
  );

  const handleReset = useCallback(() => {
    if (!prefsKey) return;
    setCardPrefs((prev) => {
      const next = { ...prev, [prefsKey]: DEFAULT_CARD_PREFS[prefsKey] };
      saveCardPrefs(next);
      return next;
    });
  }, [prefsKey]);

  if (!schema || !prefsKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
        <h2 className="text-base font-semibold text-fg">No display settings</h2>
        <p className="text-sm text-fg-3 leading-relaxed">
          This widget does not have customizable display preferences.
        </p>
      </div>
    );
  }

  const values = cardPrefs[prefsKey] as unknown as Record<string, boolean | number>;

  return (
    <div className="p-4 max-w-lg">
      <Section title="Dashboard Card">
        <DisplayFields schema={schema} values={values} onChange={handleChange} />
      </Section>
      <ResetButton label="Reset display settings" onClick={handleReset} />
    </div>
  );
}

/** Render schema fields using SettingsControls. */
function DisplayFields({
  schema,
  values,
  onChange,
}: {
  schema: EditorField[];
  values: Record<string, boolean | number>;
  onChange: (key: string, value: boolean | number) => void;
}) {
  return (
    <>
      {schema.map((field) => {
        const parentOff = field.parent ? !values[field.parent] : false;

        if (field.type === "toggle") {
          return (
            <div key={field.key} className={parentOff ? "opacity-40 pointer-events-none" : ""}>
              <ToggleRow
                label={field.label}
                checked={Boolean(values[field.key])}
                onChange={(checked) => onChange(field.key, checked)}
              />
            </div>
          );
        }

        if (field.type === "stepper") {
          return (
            <div key={field.key} className={parentOff ? "opacity-40 pointer-events-none" : ""}>
              <SliderRow
                label={field.label}
                value={Number(values[field.key]) || field.min}
                min={field.min}
                max={field.max}
                step={1}
                onChange={(v) => onChange(field.key, v)}
              />
            </div>
          );
        }

        return null;
      })}
    </>
  );
}
