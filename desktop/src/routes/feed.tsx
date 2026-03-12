/**
 * Feed route — the dashboard.
 *
 * Shows a responsive grid of summary cards for all enabled channels
 * and widgets, plus a collapsible section of ghost cards for un-added
 * sources. An edit mode lets users toggle what data each card displays.
 */
import { useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pencil, Check, ChevronDown, ChevronRight } from "lucide-react";
import { useShell } from "../shell-context";
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
  FINANCE_SCHEMA,
  SPORTS_SCHEMA,
  RSS_SCHEMA,
  FANTASY_SCHEMA,
  CLOCK_SCHEMA,
  WEATHER_SCHEMA,
  SYSMON_SCHEMA,
} from "../components/dashboard/dashboardPrefs";
import type { ChannelType } from "../api/client";
import type { ChannelManifest, WidgetManifest } from "../types";
import type {
  DashboardCardPrefs,
  EditorField,
} from "../components/dashboard/dashboardPrefs";

// ── Display orders ──────────────────────────────────────────────

const CHANNEL_ORDER = ["finance", "sports", "rss", "fantasy"];
const WIDGET_ORDER = ["clock", "weather", "sysmon"];

// ── Summary component map ───────────────────────────────────────

const CHANNEL_SUMMARIES: Record<
  string,
  React.ComponentType<{ dashboard: any; prefs: any }>
> = {
  finance: FinanceSummary,
  sports: SportsSummary,
  rss: RssSummary,
  fantasy: FantasySummary,
};

const WIDGET_SUMMARIES: Record<string, React.ComponentType<{ prefs: any }>> = {
  clock: ClockSummary,
  weather: WeatherSummary,
  sysmon: SysmonSummary,
};

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

  // ── Sorted sources ──────────────────────────────────────────
  const sortedChannels = [...channels]
    .filter((ch) => ch.enabled)
    .sort(
      (a, b) =>
        CHANNEL_ORDER.indexOf(a.channel_type) -
        CHANNEL_ORDER.indexOf(b.channel_type),
    );

  const sortedEnabledWidgets = enabledWidgets
    .map((id) => allWidgets.find((w) => w.id === id))
    .filter((w): w is WidgetManifest => w != null)
    .sort(
      (a, b) => WIDGET_ORDER.indexOf(a.id) - WIDGET_ORDER.indexOf(b.id),
    );

  // ── Ghost cards ─────────────────────────────────────────────
  const addedTypes = new Set(channels.map((ch) => ch.channel_type));
  const availableChannels = allChannelManifests.filter(
    (m) => !addedTypes.has(m.id as ChannelType),
  );
  const enabledSet = new Set(enabledWidgets);
  const availableWidgets = allWidgets.filter((w) => !enabledSet.has(w.id));
  const hasGhosts = availableChannels.length > 0 || availableWidgets.length > 0;

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
            const schema = CHANNEL_SCHEMAS[ch.channel_type];
            const prefsKey = CHANNEL_PREFS_KEY[ch.channel_type];
            const prefs = prefsKey ? cardPrefs[prefsKey] : undefined;

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
                editing={editing}
                schema={schema}
                editorValues={prefs as Record<string, boolean | number> | undefined}
                onEditorChange={
                  prefsKey
                    ? (key, value) => handleCardPrefChange(prefsKey, key, value)
                    : undefined
                }
              >
                {SummaryComponent ? (
                  <SummaryComponent dashboard={dashboard} prefs={prefs} />
                ) : (
                  <p className="text-[11px] text-fg-4 italic">No preview</p>
                )}
              </DashboardCard>
            );
          })}

          {/* Widget cards */}
          {sortedEnabledWidgets.map((widget) => {
            const SummaryComponent = WIDGET_SUMMARIES[widget.id];
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
                    ? (key, value) => handleCardPrefChange(prefsKey, key, value)
                    : undefined
                }
              >
                {SummaryComponent ? (
                  <SummaryComponent prefs={prefs} />
                ) : (
                  <p className="text-[11px] text-fg-4 italic">No preview</p>
                )}
              </DashboardCard>
            );
          })}
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
