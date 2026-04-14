import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import MyFeeds from "./MyFeeds";
import FeedCatalog from "./FeedCatalog";
import { rssCatalogOptions } from "../../api/queries";
import { useChannelConfig } from "../../hooks/useChannelConfig";
import { getLimit } from "../../tierLimits";
import type { Channel, RssChannelConfig } from "../../api/client";
import type { SubscriptionTier } from "../../auth";

// ── Types ────────────────────────────────────────────────────────

interface RssConfigPanelProps {
  channel: Channel;
  subscriptionTier: SubscriptionTier;
  hex: string;
}

// ── Component ────────────────────────────────────────────────────

export default function RssConfigPanel({
  channel,
  subscriptionTier,
}: RssConfigPanelProps) {
  const { error, setError, saving, updateItems } = useChannelConfig<
    Array<{ name: string; url: string; is_custom?: boolean }>
  >("rss", "feeds");

  // User's subscribed feeds from channel config
  const rssConfig = channel.config as RssChannelConfig;
  const feeds = Array.isArray(rssConfig?.feeds) ? rssConfig.feeds : [];
  const feedUrlSet = useMemo(() => new Set(feeds.map((f) => f.url)), [feeds]);

  // Tier limits
  const maxFeeds = getLimit(subscriptionTier, "feeds");
  const maxCustomFeeds = getLimit(subscriptionTier, "customFeeds");
  const customFeedCount = useMemo(
    () => feeds.filter((f) => f.is_custom).length,
    [feeds],
  );

  // Catalog queries — clean (for browsing) and full (for health data)
  const {
    data: catalog = [],
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery(rssCatalogOptions());

  const { data: catalogAll = [] } = useQuery(
    rssCatalogOptions({ includeFailing: true }),
  );

  // ── Handlers ───────────────────────────────────────────────────

  const addCatalogFeed = useCallback(
    (url: string) => {
      if (feeds.length >= maxFeeds) return;
      // Look in both catalogs (clean + full) to find the feed
      const allFeeds = [...catalog, ...catalogAll];
      const feed = allFeeds.find((f) => f.url === url);
      if (!feed || feedUrlSet.has(url)) return;
      updateItems([...feeds, { name: feed.name, url: feed.url }]);
    },
    [catalog, catalogAll, feeds, feedUrlSet, updateItems, maxFeeds],
  );

  const removeFeed = useCallback(
    (url: string) => {
      updateItems(feeds.filter((f) => f.url !== url));
    },
    [feeds, updateItems],
  );

  const addCustomFeed = useCallback(
    (name: string, url: string) => {
      if (feeds.length >= maxFeeds) return;
      if (customFeedCount >= maxCustomFeeds) return;
      if (feedUrlSet.has(url)) {
        toast.error("This feed is already added");
        return;
      }
      updateItems([...feeds, { name, url, is_custom: true }]);
    },
    [feeds, feedUrlSet, updateItems, maxFeeds, maxCustomFeeds, customFeedCount],
  );

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-8">
      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-[11px] text-error flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-error/60 hover:text-error cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Section 1: My Feeds */}
      <MyFeeds
        feeds={feeds}
        catalogAll={catalogAll}
        onRemove={removeFeed}
        onAddCustom={addCustomFeed}
        feedCount={feeds.length}
        maxFeeds={maxFeeds}
        customCount={customFeedCount}
        maxCustomFeeds={maxCustomFeeds}
        subscriptionTier={subscriptionTier}
        saving={saving}
      />

      {/* Divider */}
      <div className="h-px bg-edge/10" />

      {/* Section 2: Add Feeds (Catalog) */}
      <FeedCatalog
        catalog={catalog}
        subscribedUrls={feedUrlSet}
        onAdd={addCatalogFeed}
        loading={catalogLoading}
        error={catalogError}
        atLimit={feeds.length >= maxFeeds}
      />
    </div>
  );
}
