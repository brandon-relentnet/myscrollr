/**
 * Home route — source card grid.
 *
 * Cards show a brief description of what each source does, plus a
 * small config indicator (e.g. "5 symbols", "3 leagues"). When
 * nothing is configured yet the card says so and links to the
 * configure page. Discovery happens in the Catalog (/catalog).
 */
import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Pin, PinOff } from "lucide-react";
import clsx from "clsx";
import RouteError from "../components/RouteError";
import { useShell, useShellData } from "../shell-context";
import { CHANNEL_ORDER } from "../channels/registry";
import { WIDGET_ORDER } from "../widgets/registry";
import type { ChannelType, Channel } from "../api/client";
import type { ChannelManifest, WidgetManifest, DashboardResponse } from "../types";

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
  const pinnedSources = shell.prefs.pinnedSources;

  function togglePin(id: string) {
    const next = pinnedSources.includes(id)
      ? pinnedSources.filter((s) => s !== id)
      : [...pinnedSources, id];
    shell.onPrefsChange({ ...shell.prefs, pinnedSources: next });
  }

  const orderedChannels = useMemo(
    () =>
      CHANNEL_ORDER
        .map((id) => {
          const ch = channels.find((c) => c.channel_type === id);
          const manifest = allChannelManifests.find((m) => m.id === id);
          return ch && manifest ? { ch, manifest } : null;
        })
        .filter(Boolean) as { ch: Channel; manifest: ChannelManifest }[],
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
    <div className="p-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[11px] font-mono font-semibold text-fg-4 uppercase tracking-wider mb-1">
          Home
        </h1>
        <p className="text-xs text-fg-4">
          Your active channels and widgets
        </p>
      </div>

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
          <h3 className="text-[11px] font-mono font-semibold text-fg-4 uppercase tracking-wider mb-3">
            Channels
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {orderedChannels.map(({ ch, manifest }) => {
              const indicator = getChannelIndicator(ch, dashboard);
              const hasConfig = indicator.count > 0;
              return (
                <SourceCard
                  key={ch.channel_type}
                  icon={manifest.icon}
                  name={manifest.name}
                  hex={manifest.hex}
                  description={manifest.description}
                  indicator={hasConfig ? indicator.label : undefined}
                  emptyHint={!hasConfig ? "Nothing configured yet" : undefined}
                  tickerEnabled={ch.visible}
                  onToggleTicker={() =>
                    onToggleChannelTicker(ch.channel_type as ChannelType, !ch.visible)
                  }
                  pinned={pinnedSources.includes(ch.channel_type)}
                  onTogglePin={() => togglePin(ch.channel_type)}
                  onClick={() =>
                    navigate({
                      to: "/channel/$type/$tab",
                      params: {
                        type: ch.channel_type,
                        tab: hasConfig ? "feed" : "configuration",
                      },
                    })
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Widgets section */}
      {orderedWidgets.length > 0 && (
        <section>
          <h3 className="text-[11px] font-mono font-semibold text-fg-4 uppercase tracking-wider mb-3">
            Widgets
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {orderedWidgets.map((widget) => (
              <SourceCard
                key={widget.id}
                icon={widget.icon}
                name={widget.name}
                hex={widget.hex}
                description={widget.description}
                tickerEnabled={widgetsOnTicker.includes(widget.id)}
                onToggleTicker={() => onToggleWidgetTicker(widget.id)}
                pinned={pinnedSources.includes(widget.id)}
                onTogglePin={() => togglePin(widget.id)}
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

// ── Source card ────────────────────────────────────────────────

interface SourceCardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  name: string;
  hex: string;
  description: string;
  indicator?: string;
  emptyHint?: string;
  tickerEnabled: boolean;
  onToggleTicker: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  onClick: () => void;
}

function SourceCard({
  icon: Icon,
  name,
  hex,
  description,
  indicator,
  emptyHint,
  tickerEnabled,
  onToggleTicker,
  pinned,
  onTogglePin,
  onClick,
}: SourceCardProps) {
  return (
    <button
      onClick={onClick}
      className="group rounded-lg border bg-base-200/40 border-edge/20 hover:bg-base-200/60 p-4 transition-colors text-left cursor-pointer w-full flex flex-col"
    >
      {/* Header: icon + name + actions */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${hex}15`, color: hex }}
        >
          <Icon size={20} />
        </div>
        <span className="text-sm font-semibold text-fg truncate flex-1">{name}</span>

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
            "w-7 h-7 flex items-center justify-center rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0",
            tickerEnabled
              ? "text-fg-3 hover:text-fg hover:bg-surface-hover"
              : "text-fg-4/60 hover:text-fg-2 hover:bg-surface-hover",
          )}
        >
          {tickerEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
        </div>

        {/* Pin to sidebar */}
        <div
          role="switch"
          aria-checked={pinned}
          aria-label={pinned ? `Unpin ${name} from sidebar` : `Pin ${name} to sidebar`}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onTogglePin();
            }
          }}
          className={clsx(
            "w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0",
            pinned
              ? "text-accent"
              : "text-fg-4/60 hover:text-fg-2 hover:bg-surface-hover opacity-0 group-hover:opacity-100 focus:opacity-100",
          )}
        >
          {pinned ? <Pin size={14} /> : <PinOff size={14} />}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-fg-3 leading-relaxed mb-2">{description}</p>

      {/* Indicator or empty hint */}
      {indicator && (
        <span className="text-[10px] font-medium text-fg-4">{indicator}</span>
      )}
      {emptyHint && (
        <span className="text-[10px] font-medium text-accent/70">{emptyHint}</span>
      )}
    </button>
  );
}

// ── Channel config indicators ─────────────────────────────────

function getChannelIndicator(
  ch: Channel,
  dashboard: DashboardResponse | undefined,
): { count: number; label: string } {
  const config = ch.config as Record<string, unknown>;

  switch (ch.channel_type) {
    case "finance": {
      const symbols = Array.isArray(config.symbols) ? config.symbols : [];
      return {
        count: symbols.length,
        label: `${symbols.length} symbol${symbols.length === 1 ? "" : "s"} tracked`,
      };
    }
    case "sports": {
      const leagues = Array.isArray(config.leagues) ? config.leagues : [];
      return {
        count: leagues.length,
        label: `${leagues.length} league${leagues.length === 1 ? "" : "s"} selected`,
      };
    }
    case "rss": {
      const feeds = Array.isArray(config.feeds) ? config.feeds : [];
      return {
        count: feeds.length,
        label: `${feeds.length} feed${feeds.length === 1 ? "" : "s"} subscribed`,
      };
    }
    case "fantasy": {
      const data = dashboard?.data?.fantasy;
      const leagues = Array.isArray(data) ? data : [];
      return {
        count: leagues.length,
        label: `${leagues.length} league${leagues.length === 1 ? "" : "s"} connected`,
      };
    }
    default:
      return { count: 0, label: "" };
  }
}
