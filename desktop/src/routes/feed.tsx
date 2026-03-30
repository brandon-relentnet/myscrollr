/**
 * Feed route — the dashboard.
 *
 * Two-panel layout: channels on the left (responsive 1–2 column grid),
 * widgets stacked on the right (240px). Cards use canonical order.
 * Source-level actions (ticker toggle, configure, remove) are inline
 * on each card. Discovery happens in the Catalog (/catalog).
 */
import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { useShell, useShellData } from "../shell-context";
import DashboardCard from "../components/dashboard/DashboardCard";
import FinanceSummary from "../components/dashboard/FinanceSummary";
import SportsSummary from "../components/dashboard/SportsSummary";
import RssSummary from "../components/dashboard/RssSummary";
import FantasySummary from "../components/dashboard/FantasySummary";
import ClockSummary from "../components/dashboard/ClockSummary";
import WeatherSummary from "../components/dashboard/WeatherSummary";
import SysmonSummary from "../components/dashboard/SysmonSummary";
import UptimeSummary from "../components/dashboard/UptimeSummary";
import GitHubSummary from "../components/dashboard/GitHubSummary";
import { loadCardPrefs } from "../components/dashboard/dashboardPrefs";
import { CHANNEL_ORDER } from "../channels/registry";
import { WIDGET_ORDER } from "../widgets/registry";
import type { ChannelType } from "../api/client";
import type { ChannelManifest, WidgetManifest, DashboardResponse } from "../types";
import type { DashboardCardPrefs } from "../components/dashboard/dashboardPrefs";

// ── Summary renderers (type-safe, no casts) ────────────────────

function renderChannelSummary(
  type: string,
  dashboard: DashboardResponse | undefined,
  cardPrefs: DashboardCardPrefs,
  onConfigure: () => void,
): React.ReactNode {
  switch (type) {
    case "finance":
      return <FinanceSummary dashboard={dashboard} prefs={cardPrefs.finance} onConfigure={onConfigure} />;
    case "sports":
      return <SportsSummary dashboard={dashboard} onConfigure={onConfigure} />;
    case "rss":
      return <RssSummary dashboard={dashboard} prefs={cardPrefs.rss} onConfigure={onConfigure} />;
    case "fantasy":
      return <FantasySummary dashboard={dashboard} prefs={cardPrefs.fantasy} onConfigure={onConfigure} />;
    default:
      return null;
  }
}

function renderWidgetSummary(
  id: string,
  cardPrefs: DashboardCardPrefs,
): React.ReactNode {
  switch (id) {
    case "clock":
      return <ClockSummary prefs={cardPrefs.clock} />;
    case "weather":
      return <WeatherSummary prefs={cardPrefs.weather} />;
    case "sysmon":
      return <SysmonSummary prefs={cardPrefs.sysmon} />;
    case "uptime":
      return <UptimeSummary prefs={cardPrefs.uptime} />;
    case "github":
      return <GitHubSummary prefs={cardPrefs.github} />;
    default:
      return null;
  }
}

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute("/feed")({
  component: FeedDashboard,
  errorComponent: RouteError,
});

function FeedDashboard() {
  const navigate = useNavigate();
  const shell = useShell();
  const { channels, dashboard } = useShellData();
  const {
    allChannelManifests,
    allWidgets,
    authenticated,
    onDeleteChannel,
    onToggleChannelTicker,
    onToggleWidgetTicker,
    onToggleWidget,
    onLogin,
  } = shell;

  const enabledWidgets = shell.prefs.widgets.enabledWidgets;
  const widgetsOnTicker = shell.prefs.widgets.widgetsOnTicker;

  // ── Card display prefs (read-only here; edited on Display tab) ──
  const [cardPrefs] = useState<DashboardCardPrefs>(loadCardPrefs);

  // ── Canonical-ordered sources ───────────────────────────────
  const orderedChannels = useMemo(
    () =>
      CHANNEL_ORDER
        .map((id) => {
          const ch = channels.find((c) => c.channel_type === id);
          const manifest = allChannelManifests.find((m) => m.id === id);
          return ch && manifest ? { ch, manifest } : null;
        })
        .filter(Boolean) as { ch: (typeof channels)[0]; manifest: ChannelManifest }[],
    [channels, allChannelManifests],
  );

  const orderedWidgets = useMemo(
    () =>
      WIDGET_ORDER
        .map((id) => {
          if (!enabledWidgets.includes(id)) return null;
          return allWidgets.find((w) => w.id === id) ?? null;
        })
        .filter(Boolean) as WidgetManifest[],
    [enabledWidgets, allWidgets],
  );

  const hasAnySources =
    orderedChannels.length > 0 || orderedWidgets.length > 0;

  return (
    <div className="p-5">
      {/* Empty state */}
      {!hasAnySources && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h2 className="text-base font-semibold text-fg mb-2">
            Welcome to Scrollr
          </h2>
          <p className="text-sm text-fg-3 mb-6 max-w-sm">
            Add channels and widgets from the Catalog to build your personalized dashboard.
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

      {/* Header row */}
      {hasAnySources && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-mono font-semibold text-fg-4 uppercase tracking-wider">
            Dashboard
          </h2>
        </div>
      )}

      {/* Two-panel layout */}
      {hasAnySources && (
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          {/* Left panel — channels */}
          {orderedChannels.length > 0 && (
            <div className="flex-1 min-w-0 grid gap-3 grid-cols-1 lg:grid-cols-2">
              {orderedChannels.map(({ ch, manifest }) => (
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
                  tickerEnabled={ch.visible}
                  onToggleTicker={() =>
                    onToggleChannelTicker(ch.channel_type as ChannelType, !ch.visible)
                  }
                  onRemove={() => onDeleteChannel(ch.channel_type as ChannelType)}
                >
                  {renderChannelSummary(
                    ch.channel_type,
                    dashboard,
                    cardPrefs,
                    () =>
                      navigate({
                        to: "/channel/$type/$tab",
                        params: { type: ch.channel_type, tab: "configuration" },
                      }),
                  ) ?? (
                    <p className="text-[11px] text-fg-4 italic">No preview</p>
                  )}
                </DashboardCard>
              ))}
            </div>
          )}

          {/* Right panel — widgets */}
          {orderedWidgets.length > 0 && (
            <div className="w-full md:w-[240px] shrink-0 flex flex-col gap-3">
              {orderedWidgets.map((widget) => (
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
                  tickerEnabled={widgetsOnTicker.includes(widget.id)}
                  onToggleTicker={() => onToggleWidgetTicker(widget.id)}
                  onRemove={() => onToggleWidget(widget.id)}
                >
                  {renderWidgetSummary(widget.id, cardPrefs) ?? (
                    <p className="text-[11px] text-fg-4 italic">No preview</p>
                  )}
                </DashboardCard>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
