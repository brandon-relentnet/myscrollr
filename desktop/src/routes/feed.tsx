/**
 * Home route — source list overview.
 *
 * Clean list of active channels and widgets with live preview text,
 * ticker visibility toggle, and click-to-navigate. Discovery happens
 * in the Catalog (/catalog).
 */
import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, ChevronRight } from "lucide-react";
import clsx from "clsx";
import RouteError from "../components/RouteError";
import { useShell, useShellData } from "../shell-context";
import { CHANNEL_ORDER } from "../channels/registry";
import { WIDGET_ORDER } from "../widgets/registry";
import type { ChannelType } from "../api/client";
import type { ChannelManifest, WidgetManifest, DashboardResponse } from "../types";
import type { Trade, Game, RssItem } from "../types";

// ── Channel preview helpers ────────────────────────────────────

function financePreview(dashboard: DashboardResponse | undefined): string {
  const trades = dashboard?.data?.finance as Trade[] | undefined;
  if (!trades?.length) return "No data yet";
  const top = trades.slice(0, 3);
  return top
    .map((t) => {
      const pct = Number(t.percentage_change) || 0;
      const dir = pct >= 0 ? "+" : "";
      return `${t.symbol} ${dir}${pct.toFixed(1)}%`;
    })
    .join(", ");
}

function sportsPreview(dashboard: DashboardResponse | undefined): string {
  const games = dashboard?.data?.sports as Game[] | undefined;
  if (!games?.length) return "No games";
  const live = games.filter((g) => g.state === "in").length;
  const upcoming = games.filter((g) => g.state === "pre").length;
  const parts: string[] = [];
  if (live > 0) parts.push(`${live} live`);
  if (upcoming > 0) parts.push(`${upcoming} upcoming`);
  if (parts.length === 0) parts.push(`${games.length} games`);
  return parts.join(", ");
}

function rssPreview(dashboard: DashboardResponse | undefined): string {
  const items = dashboard?.data?.rss as RssItem[] | undefined;
  if (!items?.length) return "No articles";
  return items[0].title.slice(0, 60) + (items[0].title.length > 60 ? "..." : "");
}

function fantasyPreview(dashboard: DashboardResponse | undefined): string {
  const data = dashboard?.data?.fantasy;
  if (!Array.isArray(data) || !data.length) return "No leagues";
  return `${data.length} league${data.length === 1 ? "" : "s"}`;
}

function channelPreview(type: string, dashboard: DashboardResponse | undefined): string {
  switch (type) {
    case "finance": return financePreview(dashboard);
    case "sports": return sportsPreview(dashboard);
    case "rss": return rssPreview(dashboard);
    case "fantasy": return fantasyPreview(dashboard);
    default: return "";
  }
}

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute("/feed")({
  component: HomePage,
  errorComponent: RouteError,
});

function HomePage() {
  const navigate = useNavigate();
  const shell = useShell();
  const { channels, dashboard } = useShellData();
  const {
    allChannelManifests,
    allWidgets,
    authenticated,
    onToggleChannelTicker,
    onToggleWidgetTicker,
    onLogin,
  } = shell;

  const enabledWidgets = shell.prefs.widgets.enabledWidgets;
  const widgetsOnTicker = shell.prefs.widgets.widgetsOnTicker;

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

  const hasAnySources = orderedChannels.length > 0 || orderedWidgets.length > 0;

  return (
    <div className="p-5 max-w-2xl mx-auto">
      {/* Empty state */}
      {!hasAnySources && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h2 className="text-base font-semibold text-fg mb-2">
            Welcome to Scrollr
          </h2>
          <p className="text-sm text-fg-3 mb-6 max-w-sm">
            Add channels and widgets from the Catalog to build your personalized ticker.
          </p>
          {!authenticated && (
            <button
              onClick={onLogin}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent text-surface hover:bg-accent/90 transition-colors"
            >
              Sign in to get started
            </button>
          )}
        </div>
      )}

      {/* Channels section */}
      {orderedChannels.length > 0 && (
        <section className="mb-6">
          <h3 className="text-[11px] font-mono font-semibold text-fg-4 uppercase tracking-wider mb-2 px-1">
            Channels
          </h3>
          <div className="flex flex-col gap-1">
            {orderedChannels.map(({ ch, manifest }) => (
              <SourceRow
                key={ch.channel_type}
                icon={manifest.icon}
                name={manifest.name}
                hex={manifest.hex}
                preview={channelPreview(ch.channel_type, dashboard)}
                tickerEnabled={ch.visible}
                onToggleTicker={() =>
                  onToggleChannelTicker(ch.channel_type as ChannelType, !ch.visible)
                }
                onClick={() =>
                  navigate({
                    to: "/channel/$type/$tab",
                    params: { type: ch.channel_type, tab: "feed" },
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Widgets section */}
      {orderedWidgets.length > 0 && (
        <section>
          <h3 className="text-[11px] font-mono font-semibold text-fg-4 uppercase tracking-wider mb-2 px-1">
            Widgets
          </h3>
          <div className="flex flex-col gap-1">
            {orderedWidgets.map((widget) => (
              <SourceRow
                key={widget.id}
                icon={widget.icon}
                name={widget.name}
                hex={widget.hex}
                preview={widget.description}
                tickerEnabled={widgetsOnTicker.includes(widget.id)}
                onToggleTicker={() => onToggleWidgetTicker(widget.id)}
                onClick={() =>
                  navigate({
                    to: "/widget/$id/$tab",
                    params: { id: widget.id, tab: "feed" },
                  })
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Source row ──────────────────────────────────────────────────

interface SourceRowProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  name: string;
  hex: string;
  preview: string;
  tickerEnabled: boolean;
  onToggleTicker: () => void;
  onClick: () => void;
}

function SourceRow({
  icon: Icon,
  name,
  hex,
  preview,
  tickerEnabled,
  onToggleTicker,
  onClick,
}: SourceRowProps) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-hover/50 transition-colors w-full text-left cursor-pointer"
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${hex}15`, color: hex }}
      >
        <Icon size={16} />
      </div>

      {/* Name + preview */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-fg truncate">{name}</div>
        <div className="text-xs text-fg-4 truncate">{preview}</div>
      </div>

      {/* Ticker toggle */}
      <div
        role="switch"
        aria-checked={tickerEnabled}
        aria-label={tickerEnabled ? `Hide ${name} from ticker` : `Show ${name} on ticker`}
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onToggleTicker();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onToggleTicker();
          }
        }}
        className={clsx(
          "w-7 h-7 flex items-center justify-center rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100",
          tickerEnabled
            ? "text-fg-3 hover:text-fg hover:bg-surface-hover"
            : "text-fg-4/60 hover:text-fg-2 hover:bg-surface-hover",
        )}
      >
        {tickerEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
      </div>

      {/* Arrow */}
      <div className="w-6 h-6 flex items-center justify-center text-fg-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight size={14} />
      </div>
    </button>
  );
}
