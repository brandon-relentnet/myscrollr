/**
 * Channel route — renders channel feed, info, or configuration.
 *
 * URL: /channel/:type/:tab
 *   - type: "finance" | "sports" | "rss" | "fantasy"
 *   - tab: "feed" | "info" | "configuration"
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { useQuery } from "@tanstack/react-query";
import { getChannel, getAllChannels } from "../channels/registry";
import { dashboardQueryOptions } from "../api/queries";
import { getTier } from "../auth";
import ChannelConfigPanel from "../channels/ChannelConfigPanel";
import ContentHeader from "../components/ContentHeader";
import { useShell } from "../shell-context";
import type { Channel, ChannelType } from "../api/client";
import type { DashboardResponse, DeliveryMode } from "../types";
import { loadPref } from "../preferences";

const VALID_TABS = ["feed", "info", "configuration"] as const;
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
  const shell = useShell();
  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const channelData = (dashboard?.channels ?? []).find(
    (ch) => ch.channel_type === type,
  );

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

  const tickerEnabled = channelData?.visible ?? false;

  return (
    <div className="flex flex-col h-full">
      <ContentHeader
        name={channel.name}
        icon={channel.icon}
        hex={channel.hex}
        activeTab={tab}
        onTabChange={(t) =>
          navigate({
            to: "/channel/$type/$tab",
            params: { type, tab: t },
          })
        }
        tickerEnabled={tickerEnabled}
        onToggleTicker={() =>
          shell.onToggleChannelTicker(type as ChannelType, !tickerEnabled)
        }
        onDelete={() => shell.onDeleteChannel(type as ChannelType)}
        onBack={() => navigate({ to: "/feed" })}
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "feed" && <ChannelFeedTab type={type} dashboard={dashboard} channel={channel} />}
        {tab === "info" && <ChannelInfoTab channel={channel} />}
        {tab === "configuration" && <ChannelConfigTab type={type} dashboard={dashboard} />}
      </div>
    </div>
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
  const channelConfig = {
    __dashboardLoaded: dashboard !== undefined,
    __hasConfig: (dashboard?.channels ?? []).some(
      (ch) => ch.channel_type === type && ch.enabled,
    ),
  };

  return <channel.FeedTab mode="comfort" channelConfig={channelConfig} />;
}

function ChannelInfoTab({
  channel,
}: {
  channel: NonNullable<ReturnType<typeof getChannel>>;
}) {
  const Icon = channel.icon;
  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <span
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ backgroundColor: `${channel.hex}15`, color: channel.hex }}
        >
          <Icon size={20} />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{channel.name}</h2>
          <p className="text-sm text-fg-3">{channel.description}</p>
        </div>
      </div>

      <div className="space-y-4">
        <section>
          <h3 className="text-xs font-mono font-bold text-fg-3 uppercase tracking-wider mb-2">
            About
          </h3>
          <p className="text-sm text-fg-2 leading-relaxed">
            {channel.info.about}
          </p>
        </section>

        <section>
          <h3 className="text-xs font-mono font-bold text-fg-3 uppercase tracking-wider mb-2">
            How to use
          </h3>
          <ul className="space-y-2">
            {channel.info.usage.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-fg-2">
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold shrink-0 mt-0.5"
                  style={{
                    backgroundColor: `${channel.hex}15`,
                    color: channel.hex,
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

  const manifest = getAllChannels().find((m) => m.id === type);
  const deliveryMode = loadPref<DeliveryMode>("deliveryMode", "polling");

  return (
    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
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


