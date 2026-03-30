import { useState, useMemo, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Store } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

import { getMarketplaceItems, CATEGORY_LABELS } from "../marketplace";
import type { MarketplaceCategory, MarketplaceItem } from "../marketplace";
import { channelsApi } from "../api/client";
import type { ChannelType } from "../api/client";
import { dashboardQueryOptions, queryKeys } from "../api/queries";
import { useShell, useShellData } from "../shell-context";
import { CHANNEL_ORDER } from "../channels/registry";
import { WIDGET_ORDER } from "../widgets/registry";
import MarketplaceCard from "../components/marketplace/MarketplaceCard";
import QueryErrorBanner from "../components/QueryErrorBanner";

export const Route = createFileRoute("/marketplace")({
  component: MarketplacePage,
});

// ── Category filter options ─────────────────────────────────────

type FilterTab = "all" | MarketplaceCategory;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "data-feed", label: CATEGORY_LABELS["data-feed"] },
  { key: "utility", label: CATEGORY_LABELS["utility"] },
];

// ── Sort order: enabled first, then canonical order ─────────────

const CANONICAL_ORDER = [...CHANNEL_ORDER, ...WIDGET_ORDER];

function sortItems(items: MarketplaceItem[], enabledIds: Set<string>): MarketplaceItem[] {
  return [...items].sort((a, b) => {
    const aEnabled = enabledIds.has(a.id) ? 0 : 1;
    const bEnabled = enabledIds.has(b.id) ? 0 : 1;
    if (aEnabled !== bEnabled) return aEnabled - bEnabled;
    return CANONICAL_ORDER.indexOf(a.id) - CANONICAL_ORDER.indexOf(b.id);
  });
}

// ── Page component ──────────────────────────────────────────────

function MarketplacePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { prefs, onPrefsChange, authenticated, tier, onLogin } = useShell();
  const { channels } = useShellData();
  const { error: dashboardError, isLoading } = useQuery(dashboardQueryOptions());

  const [filter, setFilter] = useState<FilterTab>("all");

  // All marketplace items (static, computed once)
  const allItems = useMemo(() => getMarketplaceItems(), []);

  // Enabled IDs
  const enabledChannelIds = useMemo(
    () => new Set(channels.map((ch) => ch.channel_type)),
    [channels],
  );
  const enabledWidgetIds = useMemo(
    () => new Set(prefs.widgets.enabledWidgets),
    [prefs.widgets.enabledWidgets],
  );
  const allEnabledIds = useMemo(
    () => new Set([...enabledChannelIds, ...enabledWidgetIds]),
    [enabledChannelIds, enabledWidgetIds],
  );

  // Filtered + sorted items
  const visibleItems = useMemo(() => {
    const filtered = filter === "all"
      ? allItems
      : allItems.filter((item) => item.category === filter);
    return sortItems(filtered, allEnabledIds);
  }, [allItems, filter, allEnabledIds]);

  // ── Add handler ─────────────────────────────────────────────

  const handleAdd = useCallback(
    async (item: MarketplaceItem) => {
      if (item.kind === "channel") {
        await channelsApi.create(item.id as ChannelType);
        await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        toast.success(`${item.name} added`);
        navigate({ to: "/channel/$type/$tab", params: { type: item.id, tab: "feed" } });
      } else {
        const nextEnabled = [...prefs.widgets.enabledWidgets, item.id];
        const nextOnTicker = [...prefs.widgets.widgetsOnTicker, item.id];
        onPrefsChange({
          ...prefs,
          widgets: { ...prefs.widgets, enabledWidgets: nextEnabled, widgetsOnTicker: nextOnTicker },
        });
        toast.success(`${item.name} added`);
        navigate({ to: "/widget/$id/$tab", params: { id: item.id, tab: "feed" } });
      }
    },
    [navigate, queryClient, prefs, onPrefsChange],
  );

  // ── Remove handler ──────────────────────────────────────────

  const handleRemove = useCallback(
    async (item: MarketplaceItem) => {
      if (item.kind === "channel") {
        await channelsApi.delete(item.id as ChannelType);
        await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        toast.success(`${item.name} removed`);
      } else {
        const nextEnabled = prefs.widgets.enabledWidgets.filter((id) => id !== item.id);
        const nextOnTicker = prefs.widgets.widgetsOnTicker.filter((id) => id !== item.id);
        onPrefsChange({
          ...prefs,
          widgets: { ...prefs.widgets, enabledWidgets: nextEnabled, widgetsOnTicker: nextOnTicker },
        });
        toast.success(`${item.name} removed`);
      }
    },
    [queryClient, prefs, onPrefsChange],
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Store size={20} className="text-fg-3" />
          <h1 className="text-lg font-bold text-fg">Marketplace</h1>
        </div>
        <p className="text-xs text-fg-4 ml-8">
          Add data feeds and utilities to your ticker
        </p>
      </div>

      {/* Dashboard error banner */}
      {dashboardError && (
        <div className="mb-4">
          <QueryErrorBanner error={dashboardError} />
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-edge/20 pb-px">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={clsx(
              "px-3 py-1.5 text-xs font-medium rounded-t transition-colors",
              filter === tab.key
                ? "text-fg border-b-2 border-accent"
                : "text-fg-4 hover:text-fg-3",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleItems.map((item) => (
          <MarketplaceCard
            key={item.id}
            item={item}
            enabled={allEnabledIds.has(item.id)}
            tier={tier}
            authenticated={authenticated}
            dashboardLoading={isLoading}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onLogin={onLogin}
          />
        ))}
      </div>
    </div>
  );
}
