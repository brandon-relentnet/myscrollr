import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Rss, Trash2 } from "lucide-react";
import { SetupBrowser } from "../components/settings/SetupBrowser";
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
  const feedUrlSet = useMemo(() => new Set(feeds.map((f) => f.url)), [feeds]);

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
        setError("Failed to save — try again");
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
        setError("Failed to remove feed from catalog");
      }
    },
    [getToken, feedUrlSet, feeds, updateFeeds],
  );

  const addCustomFeed = useCallback(() => {
    const name = newFeedName.trim();
    const url = newFeedUrl.trim();
    if (!name || !url) return;
    if (!/^https?:\/\/.+/.test(url)) {
      setUrlError("Please enter a full web address (starting with http:// or https://)");
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
      <SetupBrowser
        title="RSS"
        subtitle="News and articles from your favorite sites"
        icon={Rss}
        hex={hex}
        items={catalog}
        selectedKeys={feedUrlSet}
        getKey={(f) => f.url}
        getCategory={(f) => f.category}
        matchesSearch={(f, q) => {
          const lower = q.toLowerCase();
          return (
            f.name.toLowerCase().includes(lower) ||
            f.url.toLowerCase().includes(lower)
          );
        }}
        renderItem={(item, isSelected) => (
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCatalogFeed(item);
                  }}
                  title="Delete this feed"
                  className="p-0.5 rounded hover:bg-error/10 text-fg-4 hover:text-error transition-colors cursor-pointer"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </>
        )}
        searchPlaceholder="Search feeds..."
        renderBeforeList={() => (
          <AddCustomFeed
            name={newFeedName}
            url={newFeedUrl}
            urlError={urlError}
            saving={saving}
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
        onClearAll={() => updateFeeds([])}
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
  onNameChange: (v: string) => void;
  onUrlChange: (v: string) => void;
  onSubmit: () => void;
}

function AddCustomFeed({
  name,
  url,
  urlError,
  saving,
  onNameChange,
  onUrlChange,
  onSubmit,
}: AddCustomFeedProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-wider font-bold text-fg-4">
        Add your own feed
      </h3>
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
    </div>
  );
}
