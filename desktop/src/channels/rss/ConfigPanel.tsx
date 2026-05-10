import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import FeedManager from "./FeedManager";
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

  const rssConfig = channel.config as RssChannelConfig;
  const feeds = Array.isArray(rssConfig?.feeds) ? rssConfig.feeds : [];
  const feedUrlSet = useMemo(() => new Set(feeds.map((f) => f.url)), [feeds]);

  const maxFeeds = getLimit(subscriptionTier, "feeds");
  const maxCustomFeeds = getLimit(subscriptionTier, "customFeeds");
  const customFeedCount = useMemo(
    () => feeds.filter((f) => f.is_custom).length,
    [feeds],
  );

  // Two catalogs: "clean" (curated, healthy feeds for browsing) and
  // "all" (includes failing feeds + the user's customs, used for
  // health badges on rows the user has already subscribed to).
  const {
    data: catalog = [],
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery(rssCatalogOptions());

  const { data: catalogAll = [] } = useQuery(
    rssCatalogOptions({ includeFailing: true }),
  );

  const addCatalogFeed = useCallback(
    (url: string) => {
      if (feeds.length >= maxFeeds) return;
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

  return (
    <div className="w-full max-w-2xl mx-auto h-full flex flex-col min-h-0 gap-3 pt-1">
      {error && (
        <div className="shrink-0 px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-[11px] text-error flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="text-error/60 hover:text-error cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <FeedManager
          feeds={feeds}
          catalog={catalog}
          catalogAll={catalogAll}
          onAddCatalog={addCatalogFeed}
          onAddCustom={addCustomFeed}
          onRemove={removeFeed}
          loading={catalogLoading}
          error={catalogError}
          maxFeeds={maxFeeds}
          maxCustomFeeds={maxCustomFeeds}
          customCount={customFeedCount}
          subscriptionTier={subscriptionTier}
          saving={saving}
        />
      </div>
    </div>
  );
}
