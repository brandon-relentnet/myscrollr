/**
 * Channel route — renders channel feed or configuration.
 *
 * URL: /channel/:type/:tab
 *   - type: "finance" | "sports" | "rss" | "fantasy"
 *   - tab: "feed" | "configuration"
 *
 * Management actions (ticker toggle, remove) live on the dashboard
 * card, not here. This route is for viewing data and configuring.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import SourcePageLayout from "../components/SourcePageLayout";
import { useQuery } from "@tanstack/react-query";
import { getChannel, getAllChannels } from "../channels/registry";
import { dashboardQueryOptions } from "../api/queries";
import { getTier } from "../auth";
import ChannelConfigPanel from "../channels/ChannelConfigPanel";
import type { Channel } from "../api/client";
import type { DashboardResponse, DeliveryMode } from "../types";
import { loadPref } from "../preferences";

const VALID_TABS = ["feed", "configuration"] as const;
type ChannelTab = (typeof VALID_TABS)[number];

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
  const tab: ChannelTab = (VALID_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as ChannelTab)
    : "feed";

  const channel = getChannel(type);
  const { data: dashboard } = useQuery(dashboardQueryOptions());

  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
        <h2 className="text-base font-semibold text-fg">Channel not found</h2>
        <p className="text-sm text-fg-3">
          The channel &ldquo;{type}&rdquo; is not installed.
        </p>
      </div>
    );
  }

  return (
    <SourcePageLayout
      name={channel.name}
      activeTab={tab}
      onTabChange={(t) =>
        navigate({ to: "/channel/$type/$tab", params: { type, tab: t } })
      }
      onBack={() => navigate({ to: "/feed" })}
    >
      {tab === "feed" && <ChannelFeedTab type={type} dashboard={dashboard} channel={channel} />}
      {tab === "configuration" && <ChannelConfigTab type={type} dashboard={dashboard} />}
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
        subscriptionTier={getTier()}
        connected={deliveryMode === "sse"}
        hex={manifest?.hex ?? "var(--color-accent)"}
      />
    </div>
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
