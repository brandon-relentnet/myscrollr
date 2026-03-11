import { useEffect, useState, useCallback } from "react";
import { Plus, Rss, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { Section, DisplayRow } from "../components/settings/SettingsControls";
import { CatalogBrowser } from "../components/settings/CatalogBrowser";
import { channelsApi, rssApi } from "../api/client";
import type { Channel, TrackedFeed, RssChannelConfig } from "../api/client";

// ── Types ────────────────────────────────────────────────────────

interface RssConfigPanelProps {
  channel: Channel;
  getToken: () => Promise<string | null>;
  onChannelUpdate: (updated: Channel) => void;
  hex: string;
}

// ── Component ────────────────────────────────────────────────────

export default function RssConfigPanel({
  channel,
  getToken,
  onChannelUpdate,
  hex,
}: RssConfigPanelProps) {
  const [catalog, setCatalog] = useState<TrackedFeed[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const rssConfig = channel.config as RssChannelConfig;
  const feeds = Array.isArray(rssConfig?.feeds) ? rssConfig.feeds : [];
  const feedUrlSet = new Set(feeds.map((f) => f.url));

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    rssApi
      .getCatalog()
      .then(setCatalog)
      .catch(() => setCatalogError(true))
      .finally(() => setCatalogLoading(false));
  }, []);

  const updateFeeds = useCallback(
    async (next: Array<{ name: string; url: string }>) => {
      setSaving(true);
      try {
        const updated = await channelsApi.update(
          "rss",
          { config: { feeds: next } },
          getToken,
        );
        onChannelUpdate(updated);
      } catch {
        setError("Failed to save feed changes");
      } finally {
        setSaving(false);
      }
    },
    [getToken, onChannelUpdate],
  );

  const addCatalogFeed = useCallback(
    (url: string) => {
      const feed = catalog.find((f) => f.url === url);
      if (!feed || feedUrlSet.has(url)) return;
      updateFeeds([...feeds, { name: feed.name, url: feed.url }]);
    },
    [catalog, feeds, feedUrlSet, updateFeeds],
  );

  const removeFeed = useCallback(
    (url: string) => {
      updateFeeds(feeds.filter((f) => f.url !== url));
    },
    [feeds, updateFeeds],
  );

  const deleteCatalogFeed = useCallback(
    async (feed: TrackedFeed) => {
      if (feed.is_default) return;
      try {
        await rssApi.deleteFeed(feed.url, getToken);
        setCatalog((prev) => prev.filter((f) => f.url !== feed.url));
        if (feedUrlSet.has(feed.url)) {
          updateFeeds(feeds.filter((f) => f.url !== feed.url));
        }
      } catch {
        setError("Failed to delete feed from catalog");
      }
    },
    [getToken, feedUrlSet, feeds, updateFeeds],
  );

  const addCustomFeed = useCallback(() => {
    const name = newFeedName.trim();
    const url = newFeedUrl.trim();
    if (!name || !url) return;
    if (!/^https?:\/\/.+/.test(url)) {
      setUrlError("URL must start with http:// or https://");
      return;
    }
    setUrlError(null);
    if (feedUrlSet.has(url)) return;
    updateFeeds([...feeds, { name, url }]);
    setNewFeedName("");
    setNewFeedUrl("");
  }, [newFeedName, newFeedUrl, feeds, feedUrlSet, updateFeeds]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: `${hex}15`,
            boxShadow: `0 0 15px ${hex}15, 0 0 0 1px ${hex}20`,
          }}
        >
          <Rss size={16} style={{ color: hex }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">RSS Feeds</h2>
          <p className="text-[11px] text-fg-4">
            Custom news feeds on your ticker
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mb-4 flex items-center justify-between px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-error text-[12px]">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="p-0.5 hover:bg-error/10 rounded cursor-pointer"
          >
            <Rss size={12} />
          </button>
        </div>
      )}

      {/* Status */}
      <Section title="Status">
        <DisplayRow label="Your Feeds" value={String(feeds.length)} />
        <DisplayRow label="Catalog Size" value={String(catalog.length)} />
        <DisplayRow label="Poll Interval" value="5 min" />
      </Section>

      {/* Your feeds */}
      <Section title="Your Feeds">
        <div className="px-3 space-y-1.5">
          {feeds.length > 0 ? (
            feeds.map((feed, i) => (
              <motion.div
                key={feed.url}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center justify-between p-2.5 rounded-lg bg-base-250/30 border border-edge/20 group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                    style={{
                      background: `${hex}15`,
                      boxShadow: `0 0 0 1px ${hex}20`,
                    }}
                  >
                    <Rss size={11} style={{ color: hex }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-fg-2 truncate">
                      {feed.name}
                    </div>
                    <div className="text-[11px] text-fg-4 font-mono truncate max-w-[280px]">
                      {feed.url}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeFeed(feed.url)}
                  disabled={saving}
                  className="p-1.5 rounded-md hover:bg-error/10 text-fg-4 hover:text-error transition-colors shrink-0 opacity-0 group-hover:opacity-100 disabled:opacity-30 cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-5">
              <Rss size={24} className="mx-auto text-fg-4/40 mb-2" />
              <p className="text-[11px] text-fg-4">
                No feeds yet — browse the catalog or add a custom feed
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* Add custom feed */}
      <Section title="Add Custom Feed">
        <div className="px-3 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newFeedName}
              onChange={(e) => setNewFeedName(e.target.value)}
              placeholder="Feed name"
              className="flex-1 px-3 py-2 rounded-lg bg-base-200 border border-edge/30 text-[12px] font-mono text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/40 transition-colors"
            />
            <input
              type="url"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCustomFeed();
              }}
              placeholder="https://example.com/feed.xml"
              className="flex-[2] px-3 py-2 rounded-lg bg-base-200 border border-edge/30 text-[12px] font-mono text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/40 transition-colors"
            />
            <button
              onClick={addCustomFeed}
              disabled={saving || !newFeedName.trim() || !newFeedUrl.trim()}
              className="px-3 py-2 rounded-lg bg-base-250 border border-edge/30 text-fg-3 hover:text-accent hover:border-accent/30 transition-colors flex items-center gap-1.5 disabled:opacity-30 cursor-pointer"
            >
              <Plus size={13} />
              <span className="text-[11px] font-medium">Add</span>
            </button>
          </div>
          {urlError && (
            <p className="text-[11px] text-error/70">{urlError}</p>
          )}
        </div>
      </Section>

      {/* Catalog browser */}
      <CatalogBrowser
        title="Feed Catalog"
        items={catalog}
        getKey={(f) => f.url}
        selectedKeys={feedUrlSet}
        getCategory={(f) => f.category}
        matchesSearch={(f, q) => {
          const lower = q.toLowerCase();
          return (
            f.name.toLowerCase().includes(lower) ||
            f.url.toLowerCase().includes(lower)
          );
        }}
        renderItem={(item, isAdded) => (
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
                style={isAdded ? { color: hex } : undefined}
              >
                {isAdded ? "Added" : "+ Add"}
              </span>
              {!item.is_default && !isAdded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCatalogFeed(item);
                  }}
                  title="Remove custom feed from catalog"
                  className="p-0.5 rounded hover:bg-error/10 text-fg-4 hover:text-error transition-colors cursor-pointer"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </>
        )}
        hex={hex}
        searchPlaceholder="Search by feed name or URL..."
        saving={saving}
        loading={catalogLoading}
        error={catalogError}
        onAdd={addCatalogFeed}
        onRemove={removeFeed}
      />
    </div>
  );
}
