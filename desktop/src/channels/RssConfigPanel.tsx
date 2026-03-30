import { useState, useCallback, useMemo } from "react";
import { Plus, Rss, Trash2 } from "lucide-react";
import Tooltip from "../components/Tooltip";
import UpgradePrompt from "../components/UpgradePrompt";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SetupBrowser } from "../components/settings/SetupBrowser";
import { rssApi } from "../api/client";
import { toast } from "sonner";
import { useChannelConfig } from "../hooks/useChannelConfig";
import { rssCatalogOptions, queryKeys } from "../api/queries";
import { getLimit, maxItemsForBrowser } from "../tierLimits";
import type { Channel, TrackedFeed, RssChannelConfig } from "../api/client";
import type { SubscriptionTier } from "../auth";

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
  hex,
}: RssConfigPanelProps) {
  const queryClient = useQueryClient();
  const { error, setError, saving, updateItems } = useChannelConfig<Array<{ name: string; url: string; is_custom?: boolean }>>("rss", "feeds");
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const rssConfig = channel.config as RssChannelConfig;
  const feeds = Array.isArray(rssConfig?.feeds) ? rssConfig.feeds : [];
  const feedUrlSet = useMemo(() => new Set(feeds.map((f) => f.url)), [feeds]);

  const maxFeeds = getLimit(subscriptionTier, "feeds");
  const maxCustomFeeds = getLimit(subscriptionTier, "customFeeds");
  const customFeedCount = useMemo(() => feeds.filter((f) => f.is_custom).length, [feeds]);
  const atFeedLimit = feeds.length >= maxFeeds;
  const atCustomLimit = customFeedCount >= maxCustomFeeds;

  // ── Catalog query ──────────────────────────────────────────────
  const {
    data: catalog = [],
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery(rssCatalogOptions());

  // ── Delete catalog feed mutation ───────────────────────────────
  const deleteCatalogMutation = useMutation({
    mutationFn: (url: string) => rssApi.deleteFeed(url),
    onError: () => {
      setError("Failed to remove feed from catalog");
    },
  });

  const addCatalogFeed = useCallback(
    (url: string) => {
      if (feeds.length >= maxFeeds) return;
      const feed = catalog.find((f) => f.url === url);
      if (!feed || feedUrlSet.has(url)) return;
      updateItems([...feeds, { name: feed.name, url: feed.url }]);
    },
    [catalog, feeds, feedUrlSet, updateItems, maxFeeds],
  );

  const removeFeed = useCallback(
    (url: string) => {
      updateItems(feeds.filter((f) => f.url !== url));
    },
    [feeds, updateItems],
  );

  const deleteCatalogFeed = useCallback(
    async (feed: TrackedFeed) => {
      if (feed.is_default) return;
      try {
        await deleteCatalogMutation.mutateAsync(feed.url);
        queryClient.invalidateQueries({ queryKey: queryKeys.catalogs.rss });
        // Also remove from user's feed list if subscribed
        if (feedUrlSet.has(feed.url)) {
          updateItems(feeds.filter((f) => f.url !== feed.url));
        }
        toast.success("Feed removed from catalog");
      } catch {
        // onError in mutation config handles the UI
      }
    },
    [deleteCatalogMutation, queryClient, feedUrlSet, feeds, updateItems],
  );

  const addCustomFeed = useCallback(() => {
    const name = newFeedName.trim();
    const url = newFeedUrl.trim();
    if (!name || !url) return;
    if (feeds.length >= maxFeeds) return;
    if (feeds.filter((f) => f.is_custom).length >= maxCustomFeeds) return;
    if (!/^https?:\/\/.+/.test(url)) {
      setUrlError("Please enter a full web address (starting with http:// or https://)");
      return;
    }
    setUrlError(null);
    if (feedUrlSet.has(url)) return;
    updateItems([...feeds, { name, url, is_custom: true }]);
    setNewFeedName("");
    setNewFeedUrl("");
  }, [newFeedName, newFeedUrl, feeds, feedUrlSet, updateItems, maxFeeds, maxCustomFeeds]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {atFeedLimit && (
        <div className="mb-4 px-3">
          <UpgradePrompt
            current={feeds.length}
            max={maxFeeds}
            noun="feeds"
            tier={subscriptionTier}
          />
        </div>
      )}
      <SetupBrowser
        title="News"
        subtitle="News and articles from your favorite sites"
        icon={Rss}
        hex={hex}
        items={catalog}
        selectedKeys={feedUrlSet}
        getKey={(f: TrackedFeed) => f.url}
        getCategory={(f: TrackedFeed) => f.category}
        matchesSearch={(f: TrackedFeed, q: string) => {
          const lower = q.toLowerCase();
          return (
            f.name.toLowerCase().includes(lower) ||
            f.url.toLowerCase().includes(lower)
          );
        }}
        renderItem={(item: TrackedFeed, isSelected: boolean) => (
          <>
            <div className="min-w-0 mr-2">
              <div className="text-[12px] font-bold text-fg-2 truncate">
                {item.name}
              </div>
              <div className="text-[10px] text-fg-4">
                {item.category}
                {!item.is_default && (
                  <span className="ml-1 text-fg-4/50">(custom)</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="text-[10px] font-medium"
                style={isSelected ? { color: hex } : undefined}
              >
                {isSelected ? "✓ Added" : "+ Add"}
              </span>
              {!item.is_default && !isSelected && (
                <Tooltip content="Delete this feed">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCatalogFeed(item);
                    }}
                    className="p-0.5 rounded hover:bg-error/10 text-fg-4 hover:text-error transition-colors cursor-pointer"
                  >
                    <Trash2 size={11} />
                  </button>
                </Tooltip>
              )}
            </div>
          </>
        )}
        searchPlaceholder="Search feeds..."
        maxItems={maxItemsForBrowser(subscriptionTier, "feeds")}
        renderBeforeList={() => (
          <AddCustomFeed
            name={newFeedName}
            url={newFeedUrl}
            urlError={urlError}
            saving={saving}
            disabled={atCustomLimit || atFeedLimit}
            customCount={customFeedCount}
            maxCustom={maxCustomFeeds}
            tier={subscriptionTier}
            onNameChange={setNewFeedName}
            onUrlChange={setNewFeedUrl}
            onSubmit={addCustomFeed}
          />
        )}
        error={error}
        onDismissError={() => setError(null)}
        loading={catalogLoading}
        catalogError={catalogError}
        saving={saving}
        onAdd={addCatalogFeed}
        onRemove={removeFeed}
        onClearAll={() => updateItems([])}
      />
    </div>
  );
}

// ── Add Custom Feed ──────────────────────────────────────────────

interface AddCustomFeedProps {
  name: string;
  url: string;
  urlError: string | null;
  saving: boolean;
  disabled: boolean;
  customCount: number;
  maxCustom: number;
  tier: SubscriptionTier;
  onNameChange: (v: string) => void;
  onUrlChange: (v: string) => void;
  onSubmit: () => void;
}

function AddCustomFeed({
  name,
  url,
  urlError,
  saving,
  disabled,
  customCount,
  maxCustom,
  tier,
  onNameChange,
  onUrlChange,
  onSubmit,
}: AddCustomFeedProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-wider font-bold text-fg-4">
          Add your own feed
        </h3>
        {maxCustom > 0 && maxCustom !== Infinity && (
          <span className="text-[10px] text-fg-4 tabular-nums">
            {customCount}/{maxCustom} custom
          </span>
        )}
      </div>
      {disabled ? (
        <UpgradePrompt
          current={customCount}
          max={maxCustom}
          noun="custom feeds"
          tier={tier}
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Feed name"
              className="flex-1 px-3 py-2 rounded-lg bg-base-200 border border-edge/30 text-[12px] font-mono text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/40 transition-colors"
            />
            <input
              type="url"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmit();
              }}
              placeholder="https://..."
              className="flex-[2] px-3 py-2 rounded-lg bg-base-200 border border-edge/30 text-[12px] font-mono text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/40 transition-colors"
            />
            <button
              onClick={onSubmit}
              disabled={saving || !name.trim() || !url.trim()}
              className="px-3 py-2 rounded-lg bg-base-250 border border-edge/30 text-fg-3 hover:text-accent hover:border-accent/30 transition-colors flex items-center gap-1.5 disabled:opacity-30 cursor-pointer"
            >
              <Plus size={13} />
              <span className="text-[11px] font-medium">Add</span>
            </button>
          </div>
          {urlError && (
            <p className="text-[11px] text-error/70">{urlError}</p>
          )}
        </>
      )}
    </div>
  );
}
