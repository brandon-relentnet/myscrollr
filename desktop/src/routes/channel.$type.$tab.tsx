/**
 * Channel route — renders channel feed, configuration, or display prefs.
 *
 * URL: /channel/:type/:tab
 *   - type: "finance" | "sports" | "rss" | "fantasy"
 *   - tab: "feed" | "configuration" | "display"
 *
 * Source-level actions (ticker toggle, remove) are in the header bar.
 */
import { useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import SourcePageLayout, { parseSourceTab, SourceNotFound } from "../components/SourcePageLayout";
import { useQuery } from "@tanstack/react-query";
import { getChannel, getAllChannels } from "../channels/registry";
import { dashboardQueryOptions } from "../api/queries";
import ChannelConfigPanel from "../channels/ChannelConfigPanel";
import { useShell, useShellData } from "../shell-context";
import { Section, ToggleRow, SliderRow, ResetButton } from "../components/settings/SettingsControls";
import {
  CHANNEL_SCHEMAS,
  CHANNEL_PREFS_KEY,
  DEFAULT_CARD_PREFS,
  loadCardPrefs,
  saveCardPrefs,
} from "../components/dashboard/dashboardPrefs";
import type { Channel, ChannelType } from "../api/client";
import type { DashboardResponse, DeliveryMode } from "../types";
import type { DashboardCardPrefs, EditorField } from "../components/dashboard/dashboardPrefs";
import { loadPref } from "../preferences";

export const Route = createFileRoute("/channel/$type/$tab")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(dashboardQueryOptions()),
  component: ChannelRoute,
  pendingComponent: ChannelPending,
  errorComponent: RouteError,
});

function ChannelRoute() {
  const { type, tab: rawTab } = Route.useParams();
  const navigate = useNavigate();
  const tab = parseSourceTab(rawTab);

  const channel = getChannel(type);
  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const { onToggleChannelTicker, onDeleteChannel } = useShell();
  const { channels } = useShellData();

  if (!channel) {
    return <SourceNotFound kind="Channel" name={type} />;
  }

  const channelData = channels.find((ch) => ch.channel_type === type);
  const tickerEnabled = channelData?.visible ?? false;

  return (
    <SourcePageLayout
      name={channel.name}
      activeTab={tab}
      onTabChange={(t) =>
        navigate({ to: "/channel/$type/$tab", params: { type, tab: t } })
      }
      onBack={() => navigate({ to: "/feed" })}
      tickerEnabled={tickerEnabled}
      onToggleTicker={() =>
        onToggleChannelTicker(type as ChannelType, !tickerEnabled)
      }
      onRemove={() => {
        onDeleteChannel(type as ChannelType);
        navigate({ to: "/feed" });
      }}
      sourceKind="channel"
    >
      {tab === "feed" && <ChannelFeedTab type={type} dashboard={dashboard} channel={channel} />}
      {tab === "configuration" && <ChannelConfigTab type={type} dashboard={dashboard} />}
      {tab === "display" && <ChannelDisplayTab type={type} />}
    </SourcePageLayout>
  );
}

function ChannelFeedTab({
  type,
  dashboard,
  channel,
}: {
  type: string;
  dashboard: DashboardResponse | undefined;
  channel: NonNullable<ReturnType<typeof getChannel>>;
}) {
  const feedContext = {
    __dashboardLoaded: dashboard !== undefined,
    __hasConfig: (dashboard?.channels ?? []).some(
      (ch) => ch.channel_type === type && ch.enabled,
    ),
  };

  return <channel.FeedTab mode="comfort" feedContext={feedContext} />;
}

function ChannelConfigTab({
  type,
  dashboard,
}: {
  type: string;
  dashboard: DashboardResponse | undefined;
}) {
  const { tier } = useShell();
  const channelData = (dashboard?.channels ?? []).find(
    (ch) => ch.channel_type === type,
  );

  const manifest = getAllChannels().find((m) => m.id === type);
  const deliveryMode = loadPref<DeliveryMode>("deliveryMode", "polling");

  if (!channelData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
        <h2 className="text-base font-semibold text-fg">
          Configuration unavailable
        </h2>
        <p className="text-sm text-fg-3 leading-relaxed">
          This channel does not have a configuration panel.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <ChannelConfigPanel
        channelType={type}
        channel={channelData as unknown as Channel}
        subscriptionTier={tier}
        connected={deliveryMode === "sse"}
        hex={manifest?.hex ?? "var(--color-accent)"}
      />
    </div>
  );
}

function ChannelDisplayTab({ type }: { type: string }) {
  const schema = CHANNEL_SCHEMAS[type];
  const prefsKey = CHANNEL_PREFS_KEY[type];

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
          This channel does not have customizable display preferences.
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

/** Render schema fields using SettingsControls. Shared by channel + widget Display tabs. */
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

function ChannelPending() {
  return (
    <div className="flex flex-col gap-3 p-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 motion-safe:animate-pulse"
        >
          <div className="w-8 h-8 rounded-lg bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div
              className="h-3 rounded bg-surface-2"
              style={{ width: `${55 + ((i * 17) % 35)}%` }}
            />
            <div
              className="h-2 rounded bg-surface-2/60"
              style={{ width: `${30 + ((i * 23) % 40)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
