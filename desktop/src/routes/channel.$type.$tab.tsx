/**
 * Channel route — renders channel feed, info, or configuration.
 *
 * URL: /channel/:type/:tab
 *   - type: "finance" | "sports" | "rss" | "fantasy"
 *   - tab: "feed" | "info" | "configuration"
 */
import { useState, useRef, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { useQuery } from "@tanstack/react-query";
import { getChannel, getAllChannels } from "../channels/registry";
import { dashboardQueryOptions } from "../api/queries";
import { getTier } from "../auth";
import ChannelConfigPanel from "../channels/ChannelConfigPanel";
import { useShell } from "../shell-context";
import { Trash2 } from "lucide-react";
import clsx from "clsx";
import type { Channel, ChannelType } from "../api/client";
import type { DashboardResponse, DeliveryMode } from "../types";
import { loadPref } from "../preferences";

const VALID_TABS = ["feed", "info", "configuration"] as const;
type ChannelTab = (typeof VALID_TABS)[number];

const TABS: { key: ChannelTab; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "info", label: "About" },
  { key: "configuration", label: "Settings" },
];

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
          <span className="font-medium truncate">{channel.name}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() =>
                navigate({
                  to: "/channel/$type/$tab",
                  params: { type, tab: key },
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
        {tab === "feed" && <ChannelFeedTab type={type} dashboard={dashboard} channel={channel} />}
        {tab === "info" && <ChannelInfoTab channel={channel} />}
        {tab === "configuration" && (
          <ChannelConfigTab
            type={type}
            dashboard={dashboard}
            tickerEnabled={tickerEnabled}
            onToggleTicker={() =>
              shell.onToggleChannelTicker(type as ChannelType, !tickerEnabled)
            }
            onDelete={() => shell.onDeleteChannel(type as ChannelType)}
            hex={channel.hex}
          />
        )}
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
  tickerEnabled,
  onToggleTicker,
  onDelete,
  hex,
}: {
  type: string;
  dashboard: DashboardResponse | undefined;
  tickerEnabled: boolean;
  onToggleTicker: () => void;
  onDelete: () => void;
  hex: string;
}) {
  const channelData = (dashboard?.channels ?? []).find(
    (ch) => ch.channel_type === type,
  );

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

  const manifest = getAllChannels().find((m) => m.id === type);
  const deliveryMode = loadPref<DeliveryMode>("deliveryMode", "polling");

  return (
    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
      {channelData ? (
        <ChannelConfigPanel
          channelType={type}
          channel={channelData as unknown as Channel}
          subscriptionTier={getTier()}
          connected={deliveryMode === "sse"}
          hex={manifest?.hex ?? "var(--color-accent)"}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-center max-w-sm mx-auto gap-3 p-6">
          <h2 className="text-base font-semibold text-fg">
            Configuration unavailable
          </h2>
          <p className="text-sm text-fg-3 leading-relaxed">
            This channel does not have a configuration panel.
          </p>
        </div>
      )}

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
              Display updates from this channel in the ticker
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
            <span className="text-[12px] text-fg-2 leading-tight">Remove channel</span>
            <span className="text-[11px] text-fg-4 leading-tight">
              Remove this channel from your dashboard
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
