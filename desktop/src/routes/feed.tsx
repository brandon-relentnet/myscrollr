/**
 * Feed route — the dashboard.
 *
 * Two-panel layout: channels on the left (responsive 1–2 column grid),
 * widgets stacked on the right (240px). Both use natural card heights.
 * In edit mode, arrow buttons let users reorder cards within each panel.
 * Order persists to localStorage.
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { Pencil, Check, ChevronDown, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { useShell, useShellData } from "../shell-context";
import DashboardCard, { GhostCard } from "../components/dashboard/DashboardCard";
import FinanceSummary from "../components/dashboard/FinanceSummary";
import SportsSummary from "../components/dashboard/SportsSummary";
import RssSummary from "../components/dashboard/RssSummary";
import FantasySummary from "../components/dashboard/FantasySummary";
import ClockSummary from "../components/dashboard/ClockSummary";
import WeatherSummary from "../components/dashboard/WeatherSummary";
import SysmonSummary from "../components/dashboard/SysmonSummary";
import {
  loadCardPrefs,
  saveCardPrefs,
  loadShowAddMore,
  saveShowAddMore,
  loadCardOrder,
  saveCardOrder,
  FINANCE_SCHEMA,
  SPORTS_SCHEMA,
  RSS_SCHEMA,
  FANTASY_SCHEMA,
  CLOCK_SCHEMA,
  WEATHER_SCHEMA,
  SYSMON_SCHEMA,
} from "../components/dashboard/dashboardPrefs";
import type { ChannelType } from "../api/client";
import type { ChannelManifest, WidgetManifest, DashboardResponse } from "../types";
import type {
  DashboardCardPrefs,
  CardOrder,
  EditorField,
} from "../components/dashboard/dashboardPrefs";

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
      return <SportsSummary dashboard={dashboard} prefs={cardPrefs.sports} onConfigure={onConfigure} />;
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
    default:
      return null;
  }
}

// ── Schema map ──────────────────────────────────────────────────

const CHANNEL_SCHEMAS: Record<string, EditorField[]> = {
  finance: FINANCE_SCHEMA,
  sports: SPORTS_SCHEMA,
  rss: RSS_SCHEMA,
  fantasy: FANTASY_SCHEMA,
};

const WIDGET_SCHEMAS: Record<string, EditorField[]> = {
  clock: CLOCK_SCHEMA,
  weather: WEATHER_SCHEMA,
  sysmon: SYSMON_SCHEMA,
};

// ── Prefs key map (card type → prefs key) ───────────────────────

const CHANNEL_PREFS_KEY: Record<string, keyof DashboardCardPrefs> = {
  finance: "finance",
  sports: "sports",
  rss: "rss",
  fantasy: "fantasy",
};

const WIDGET_PREFS_KEY: Record<string, keyof DashboardCardPrefs> = {
  clock: "clock",
  weather: "weather",
  sysmon: "sysmon",
};

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
    onAddChannel,
    onToggleWidget,
    onLogin,
  } = shell;

  const enabledWidgets = shell.prefs.widgets.enabledWidgets;

  // ── Edit mode ───────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [cardPrefs, setCardPrefs] = useState<DashboardCardPrefs>(loadCardPrefs);

  const handleCardPrefChange = useCallback(
    (cardKey: keyof DashboardCardPrefs, fieldKey: string, value: boolean | number) => {
      setCardPrefs((prev) => {
        const next = {
          ...prev,
          [cardKey]: { ...prev[cardKey], [fieldKey]: value },
        };
        saveCardPrefs(next);
        return next;
      });
    },
    [],
  );

  // ── Ghost section collapse ──────────────────────────────────
  const [showAddMore, setShowAddMore] = useState(loadShowAddMore);

  const toggleAddMore = useCallback(() => {
    setShowAddMore((prev) => {
      const next = !prev;
      saveShowAddMore(next);
      return next;
    });
  }, []);

  // ── Card order ──────────────────────────────────────────────
  const activeChannelIds = useMemo(
    () => channels.map((ch) => ch.channel_type),
    [channels],
  );
  const activeWidgetIds = useMemo(() => enabledWidgets, [enabledWidgets]);

  const [cardOrder, setCardOrder] = useState<CardOrder>(() =>
    loadCardOrder(activeChannelIds, activeWidgetIds),
  );

  // Re-merge when active sources change (channel added/removed)
  const mergedOrder = useMemo(
    () => loadCardOrder(activeChannelIds, activeWidgetIds),
    [activeChannelIds, activeWidgetIds],
  );

  // Keep order in sync — only update if the set of active IDs changed
  const channelOrder = useMemo(() => {
    const activeSet: Set<string> = new Set(activeChannelIds);
    const current = cardOrder.channels.filter((id) => activeSet.has(id));
    const merged = mergedOrder.channels;
    return current.length === merged.length &&
      current.every((id) => activeSet.has(id))
      ? current
      : merged;
  }, [cardOrder.channels, mergedOrder.channels, activeChannelIds]);

  const widgetOrder = useMemo(() => {
    const activeSet = new Set(activeWidgetIds);
    const current = cardOrder.widgets.filter((id) => activeSet.has(id));
    const merged = mergedOrder.widgets;
    return current.length === merged.length &&
      current.every((id) => activeSet.has(id))
      ? current
      : merged;
  }, [cardOrder.widgets, mergedOrder.widgets, activeWidgetIds]);

  // Arrow-button move helper
  const moveItem = useCallback(
    (list: string[], index: number, direction: -1 | 1, isChannel: boolean) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= list.length) return;
      const next = [...list];
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      const updated = isChannel
        ? { channels: next, widgets: widgetOrder }
        : { channels: channelOrder, widgets: next };
      setCardOrder(updated);
      saveCardOrder(updated);
    },
    [channelOrder, widgetOrder],
  );

  // ── Resolve ordered sources ─────────────────────────────────
  const orderedChannels = useMemo(
    () =>
      channelOrder
        .map((id) => {
          const ch = channels.find((c) => c.channel_type === id);
          const manifest = allChannelManifests.find((m) => m.id === id);
          return ch && manifest ? { ch, manifest } : null;
        })
        .filter(Boolean) as { ch: (typeof channels)[0]; manifest: ChannelManifest }[],
    [channelOrder, channels, allChannelManifests],
  );

  const orderedWidgets = useMemo(
    () =>
      widgetOrder
        .map((id) => allWidgets.find((w) => w.id === id))
        .filter(Boolean) as WidgetManifest[],
    [widgetOrder, allWidgets],
  );

  // ── Ghost cards ─────────────────────────────────────────────
  const availableChannels = useMemo(() => {
    const addedTypes = new Set(channels.map((ch) => ch.channel_type));
    return allChannelManifests.filter(
      (m) => !addedTypes.has(m.id as ChannelType),
    );
  }, [channels, allChannelManifests]);

  const availableWidgets = useMemo(() => {
    const enabledSet = new Set(enabledWidgets);
    return allWidgets.filter((w) => !enabledSet.has(w.id));
  }, [enabledWidgets, allWidgets]);

  const hasGhosts = availableChannels.length > 0 || availableWidgets.length > 0;

  const hasAnySources =
    orderedChannels.length > 0 || orderedWidgets.length > 0;

  // Reset edit mode when all sources are removed
  useEffect(() => {
    if (!hasAnySources) setEditing(false);
  }, [hasAnySources]);

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

      {/* Header row — title + edit toggle */}
      {hasAnySources && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-mono font-semibold text-fg-4 uppercase tracking-wider">
            Dashboard
          </h2>
          <button
            onClick={() => setEditing((p) => !p)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors bg-surface-3/50 hover:bg-surface-3 text-fg-3 hover:text-fg"
          >
            {editing ? (
              <>
                <Check size={12} />
                Done
              </>
            ) : (
              <>
                <Pencil size={11} />
                Edit
              </>
            )}
          </button>
        </div>
      )}

      {/* Two-panel layout */}
      {hasAnySources && (
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          {/* Left panel — channels */}
          {orderedChannels.length > 0 && (
            <div className={clsx("flex-1 min-w-0 grid gap-3", editing ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2")}>
              {orderedChannels.map(({ ch, manifest }, index) => {
                const schema = CHANNEL_SCHEMAS[ch.channel_type];
                const prefsKey = CHANNEL_PREFS_KEY[ch.channel_type];
                const prefs = prefsKey ? cardPrefs[prefsKey] : undefined;

                return (
                  <DashboardCard
                    key={ch.channel_type}
                    name={manifest.name}
                    icon={manifest.icon}
                    hex={manifest.hex}
                    headerClickOnly
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
                    editing={editing}
                    schema={schema}
                    editorValues={prefs as Record<string, boolean | number> | undefined}
                    onEditorChange={
                      prefsKey
                        ? (key: string, value: boolean | number) =>
                            handleCardPrefChange(prefsKey, key, value)
                        : undefined
                    }
                    onMoveUp={
                      editing && index > 0
                        ? () => moveItem(channelOrder, index, -1, true)
                        : undefined
                    }
                    onMoveDown={
                      editing && index < orderedChannels.length - 1
                        ? () => moveItem(channelOrder, index, 1, true)
                        : undefined
                    }
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
                );
              })}
            </div>
          )}

          {/* Right panel — widgets */}
          {orderedWidgets.length > 0 && (
            <div className="w-full md:w-[240px] shrink-0 flex flex-col gap-3">
              {orderedWidgets.map((widget, index) => {
                const schema = WIDGET_SCHEMAS[widget.id];
                const prefsKey = WIDGET_PREFS_KEY[widget.id];
                const prefs = prefsKey ? cardPrefs[prefsKey] : undefined;

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
                    editing={editing}
                    schema={schema}
                    editorValues={prefs as Record<string, boolean | number> | undefined}
                    onEditorChange={
                      prefsKey
                        ? (key: string, value: boolean | number) =>
                            handleCardPrefChange(prefsKey, key, value)
                        : undefined
                    }
                    onMoveUp={
                      editing && index > 0
                        ? () => moveItem(widgetOrder, index, -1, false)
                        : undefined
                    }
                    onMoveDown={
                      editing && index < orderedWidgets.length - 1
                        ? () => moveItem(widgetOrder, index, 1, false)
                        : undefined
                    }
                  >
                    {renderWidgetSummary(widget.id, cardPrefs) ?? (
                      <p className="text-[11px] text-fg-4 italic">No preview</p>
                    )}
                  </DashboardCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Ghost cards — available to add */}
      {hasGhosts && (
        <>
          <button
            onClick={toggleAddMore}
            className="flex items-center gap-1.5 mb-3 group/add"
          >
            {showAddMore ? (
              <ChevronDown size={12} className="text-fg-4 group-hover/add:text-fg-3 transition-colors" />
            ) : (
              <ChevronRight size={12} className="text-fg-4 group-hover/add:text-fg-3 transition-colors" />
            )}
            <span className="text-[11px] font-mono font-semibold text-fg-4 uppercase tracking-wider group-hover/add:text-fg-3 transition-colors">
              Add more
            </span>
            {!showAddMore && (
              <span className="text-[10px] text-fg-4 font-normal normal-case tracking-normal">
                ({availableChannels.length + availableWidgets.length} available)
              </span>
            )}
          </button>

          {showAddMore && (
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
          )}
        </>
      )}
    </div>
  );
}
