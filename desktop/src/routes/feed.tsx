/**
 * Feed route — the dashboard.
 *
 * Shows a responsive grid of summary cards for all enabled channels
 * and widgets, plus ghost cards for un-added sources.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useShell } from "../shell-context";
import DashboardCard, { GhostCard } from "../components/dashboard/DashboardCard";
import FinanceSummary from "../components/dashboard/FinanceSummary";
import SportsSummary from "../components/dashboard/SportsSummary";
import RssSummary from "../components/dashboard/RssSummary";
import FantasySummary from "../components/dashboard/FantasySummary";
import ClockSummary from "../components/dashboard/ClockSummary";
import WeatherSummary from "../components/dashboard/WeatherSummary";
import SysmonSummary from "../components/dashboard/SysmonSummary";
import type { ChannelType } from "../api/client";
import type { ChannelManifest, WidgetManifest } from "../types";

// ── Display orders ──────────────────────────────────────────────

const CHANNEL_ORDER = ["finance", "sports", "rss", "fantasy"];
const WIDGET_ORDER = ["clock", "weather", "sysmon"];

// ── Summary component map ───────────────────────────────────────

const CHANNEL_SUMMARIES: Record<string, React.ComponentType<{ dashboard: any }>> = {
  finance: FinanceSummary,
  sports: SportsSummary,
  rss: RssSummary,
  fantasy: FantasySummary,
};

const WIDGET_SUMMARIES: Record<string, React.ComponentType> = {
  clock: ClockSummary,
  weather: WeatherSummary,
  sysmon: SysmonSummary,
};

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute("/feed")({
  component: FeedDashboard,
});

function FeedDashboard() {
  const navigate = useNavigate();
  const shell = useShell();
  const {
    channels,
    dashboard,
    allChannelManifests,
    allWidgets,
    authenticated,
    onAddChannel,
    onToggleWidget,
    onLogin,
  } = shell;

  const enabledWidgets = shell.prefs.widgets.enabledWidgets;

  // Sort enabled channels by canonical order
  const sortedChannels = [...channels]
    .filter((ch) => ch.enabled)
    .sort(
      (a, b) =>
        CHANNEL_ORDER.indexOf(a.channel_type) -
        CHANNEL_ORDER.indexOf(b.channel_type),
    );

  // Sort enabled widgets by canonical order
  const sortedEnabledWidgets = enabledWidgets
    .map((id) => allWidgets.find((w) => w.id === id))
    .filter((w): w is WidgetManifest => w != null)
    .sort(
      (a, b) => WIDGET_ORDER.indexOf(a.id) - WIDGET_ORDER.indexOf(b.id),
    );

  // Ghost cards — channels not yet added
  const addedTypes = new Set(channels.map((ch) => ch.channel_type));
  const availableChannels = allChannelManifests.filter(
    (m) => !addedTypes.has(m.id as ChannelType),
  );

  // Ghost cards — widgets not yet enabled
  const enabledSet = new Set(enabledWidgets);
  const availableWidgets = allWidgets.filter((w) => !enabledSet.has(w.id));

  const hasAnySources =
    sortedChannels.length > 0 || sortedEnabledWidgets.length > 0;

  return (
    <div className="p-5">
      {/* Empty state */}
      {!hasAnySources && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h2 className="text-base font-semibold text-fg mb-2">
            Welcome to Scrollr
          </h2>
          <p className="text-sm text-fg-3 mb-6 max-w-sm">
            Add channels and widgets below to build your personalized dashboard.
          </p>
          {!authenticated && (
            <button
              onClick={onLogin}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent text-surface hover:bg-accent/90 transition-colors mb-8"
            >
              Sign in to get started
            </button>
          )}
        </div>
      )}

      {/* Active cards grid */}
      {hasAnySources && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {/* Channel cards */}
          {sortedChannels.map((ch) => {
            const manifest = allChannelManifests.find(
              (m) => m.id === ch.channel_type,
            ) as ChannelManifest | undefined;
            if (!manifest) return null;
            const SummaryComponent = CHANNEL_SUMMARIES[ch.channel_type];

            return (
              <DashboardCard
                key={ch.channel_type}
                name={manifest.name}
                icon={manifest.icon}
                hex={manifest.hex}
                onClick={() =>
                  navigate({
                    to: "/channel/$type/$tab",
                    params: { type: ch.channel_type, tab: "feed" },
                  })
                }
                onConfigure={() =>
                  navigate({
                    to: "/channel/$type/$tab",
                    params: { type: ch.channel_type, tab: "configuration" },
                  })
                }
              >
                {SummaryComponent ? (
                  <SummaryComponent dashboard={dashboard} />
                ) : (
                  <p className="text-[11px] text-fg-4 italic">No preview</p>
                )}
              </DashboardCard>
            );
          })}

          {/* Widget cards */}
          {sortedEnabledWidgets.map((widget) => {
            const SummaryComponent = WIDGET_SUMMARIES[widget.id];
            return (
              <DashboardCard
                key={widget.id}
                name={widget.name}
                icon={widget.icon}
                hex={widget.hex}
                onClick={() =>
                  navigate({
                    to: "/widget/$id/$tab",
                    params: { id: widget.id, tab: "feed" },
                  })
                }
                onConfigure={() =>
                  navigate({
                    to: "/widget/$id/$tab",
                    params: { id: widget.id, tab: "configuration" },
                  })
                }
              >
                {SummaryComponent ? (
                  <SummaryComponent />
                ) : (
                  <p className="text-[11px] text-fg-4 italic">No preview</p>
                )}
              </DashboardCard>
            );
          })}
        </div>
      )}

      {/* Ghost cards — available to add */}
      {(availableChannels.length > 0 || availableWidgets.length > 0) && (
        <>
          {hasAnySources && (
            <div className="mb-3">
              <span className="text-[11px] font-mono font-semibold text-fg-4 uppercase tracking-wider">
                Add more
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {availableChannels.map((manifest) => (
              <GhostCard
                key={manifest.id}
                name={manifest.name}
                description={manifest.description}
                icon={manifest.icon}
                hex={manifest.hex}
                onClick={() => {
                  if (!authenticated) {
                    onLogin();
                    return;
                  }
                  onAddChannel(manifest.id as ChannelType);
                }}
              />
            ))}
            {availableWidgets.map((widget) => (
              <GhostCard
                key={widget.id}
                name={widget.name}
                description={widget.description}
                icon={widget.icon}
                hex={widget.hex}
                onClick={() => onToggleWidget(widget.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
