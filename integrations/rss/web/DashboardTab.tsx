import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Rss,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import type { RssChannelConfig, TrackedFeed } from "@/api/client";
import { rssApi, channelsApi } from "@/api/client";
import type { ChannelManifest, DashboardTabProps } from "@/channels/types";
import { ChannelHeader, InfoCard } from "@/channels/shared";

const FEEDS_PER_PAGE = 24;
const HEX = "#00b8db";

function RssDashboardTab({
  channel,
  getToken,
  hex,
  onToggle,
  onDelete,
  onChannelUpdate,
}: DashboardTabProps) {
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Array<TrackedFeed>>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rssConfig = channel.config as RssChannelConfig;
  const feeds = Array.isArray(rssConfig?.feeds) ? rssConfig.feeds : [];
  const feedUrlSet = new Set(feeds.map((f) => f.url));

  // Auto-dismiss errors
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // Fetch catalog on mount
  useEffect(() => {
    rssApi
      .getCatalog()
      .then(setCatalog)
      .catch(() => setCatalogError(true))
      .finally(() => setCatalogLoading(false));
  }, []);

  const categories = [
    "All",
    ...Array.from(new Set(catalog.map((f) => f.category))),
  ];
  const filteredCatalog = catalog.filter((f) => {
    const matchesCategory =
      activeCategory === "All" || f.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.url.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCatalog.length / FEEDS_PER_PAGE),
  );
  const paginatedCatalog = filteredCatalog.slice(
    (currentPage - 1) * FEEDS_PER_PAGE,
    currentPage * FEEDS_PER_PAGE,
  );

  const updateFeeds = async (
    nextFeeds: Array<{ name: string; url: string }>,
  ) => {
    setSaving(true);
    try {
      const updated = await channelsApi.update(
        "rss",
        { config: { feeds: nextFeeds } },
        getToken,
      );
      onChannelUpdate(updated);
    } catch {
      setError("Failed to save feed changes");
    } finally {
      setSaving(false);
    }
  };

  const addFeed = () => {
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
  };

  const addCatalogFeed = (feed: TrackedFeed) => {
    if (feedUrlSet.has(feed.url)) return;
    updateFeeds([...feeds, { name: feed.name, url: feed.url }]);
  };

  const deleteCatalogFeed = async (feed: TrackedFeed) => {
    if (feed.is_default) return;
    try {
      await rssApi.deleteFeed(feed.url, getToken);
      // Remove from local catalog state
      setCatalog((prev) => prev.filter((f) => f.url !== feed.url));
      // Also remove from user's active feeds if subscribed
      if (feedUrlSet.has(feed.url)) {
        const nextFeeds = feeds.filter((f) => f.url !== feed.url);
        updateFeeds(nextFeeds);
      }
    } catch {
      setError("Failed to delete feed from catalog");
    }
  };

  const removeFeed = (idx: number) => {
    const next = [...feeds];
    next.splice(idx, 1);
    updateFeeds(next);
  };

  return (
    <div className="space-y-6">
      <ChannelHeader
        channel={channel}
        icon={<Rss size={16} className="text-base-content/80" />}
        title="RSS Channel"
        subtitle="Custom news feeds on your ticker"
        hex={hex}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-error text-xs">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="p-0.5 hover:bg-error/10 rounded"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="Your Feeds" value={String(feeds.length)} hex={hex} />
        <InfoCard
          label="Catalog Size"
          value={String(catalog.length)}
          hex={hex}
        />
        <InfoCard label="Poll Interval" value="5 min" hex={hex} />
      </div>

      {/* Current Feeds */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest px-1">
          Your Feeds ({feeds.length} active)
        </p>
        {feeds.map((feed, i) => (
          <motion.div
            key={feed.url}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center justify-between p-3.5 bg-base-200/50 border border-base-300/25 rounded-lg"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: `${hex}15`,
                  boxShadow: `0 0 0 1px ${hex}20`,
                }}
              >
                <Rss size={12} className="text-base-content/80" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">{feed.name}</div>
                <div className="text-[10px] text-base-content/30 font-mono truncate max-w-[280px]">
                  {feed.url}
                </div>
              </div>
            </div>
            <button
              onClick={() => removeFeed(i)}
              disabled={saving}
              className="p-2 rounded hover:bg-error/10 text-base-content/20 hover:text-error transition-colors shrink-0 disabled:opacity-30"
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        ))}
        {feeds.length === 0 && (
          <div className="text-center py-6">
            <Rss size={28} className="mx-auto text-base-content/15 mb-2" />
            <p className="text-[10px] text-base-content/25 uppercase tracking-wide">
              No feeds yet — browse the catalog or add a custom feed
            </p>
          </div>
        )}
      </div>

      {/* Add Custom Feed Form */}
      <div className="bg-base-200/30 border border-base-300/25 rounded-lg p-4 space-y-3 relative overflow-hidden">
        {/* Accent top line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${hex} 50%, transparent)`,
          }}
        />
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
          Add Custom Feed
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newFeedName}
            onChange={(e) => setNewFeedName(e.target.value)}
            placeholder="Feed name"
            className="flex-1 px-3 py-2 rounded bg-base-200/50 border border-base-300/25 text-xs font-mono text-base-content/60 placeholder:text-base-content/20 focus:outline-none transition-colors"
            onFocus={(e) => (e.currentTarget.style.borderColor = `${hex}4D`)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
          <input
            type="url"
            value={newFeedUrl}
            onChange={(e) => setNewFeedUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addFeed();
            }}
            placeholder="https://example.com/feed.xml"
            className="flex-[2] px-3 py-2 rounded bg-base-200/50 border border-base-300/25 text-xs font-mono text-base-content/60 placeholder:text-base-content/20 focus:outline-none transition-colors"
            onFocus={(e) => (e.currentTarget.style.borderColor = `${hex}4D`)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
          <button
            onClick={addFeed}
            disabled={saving || !newFeedName.trim() || !newFeedUrl.trim()}
            className="px-4 py-2 rounded border border-base-300/25 text-base-content/30 transition-colors flex items-center gap-2 disabled:opacity-30"
            onMouseEnter={(e) => {
              e.currentTarget.style.color = hex;
              e.currentTarget.style.borderColor = `${hex}4D`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "";
              e.currentTarget.style.borderColor = "";
            }}
          >
            <Plus size={14} />
            <span className="text-xs uppercase tracking-wide">Add</span>
          </button>
        </div>
        {urlError && <p className="text-[10px] text-error/70">{urlError}</p>}
      </div>

      {/* Feed Catalog Browser */}
      <div className="space-y-4">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest px-1">
          Browse Feed Catalog
        </p>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/20"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by feed name or URL..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-base-200/50 border border-base-300/25 text-xs font-mono text-base-content/60 placeholder:text-base-content/20 focus:outline-none transition-colors"
            onFocus={(e) => (e.currentTarget.style.borderColor = `${hex}4D`)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-base-200/60 border border-base-300/25">
          {categories.map((cat) => {
            const catTotal = catalog.filter(
              (f) => cat === "All" || f.category === cat,
            ).length;
            const catSelected = catalog.filter(
              (f) =>
                (cat === "All" || f.category === cat) && feedUrlSet.has(f.url),
            ).length;
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setCurrentPage(1);
                }}
                className={`relative px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  isActive
                    ? ""
                    : "text-base-content/30 hover:text-base-content/50"
                }`}
                style={isActive ? { color: hex } : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="rss-category-bg"
                    className="absolute inset-0 rounded-md border"
                    style={{
                      background: `${hex}10`,
                      borderColor: `${hex}33`,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative">
                  {cat}
                  <span className="ml-1 text-[8px] opacity-60">
                    {catSelected}/{catTotal}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Catalog Grid */}
        {catalogLoading ? (
          <div className="text-center py-8">
            <motion.span
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-[10px] font-mono text-base-content/30 uppercase"
            >
              Loading catalog...
            </motion.span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {paginatedCatalog.map((feed) => {
                const isAdded = feedUrlSet.has(feed.url);
                return (
                  <motion.div
                    key={feed.url}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      isAdded
                        ? ""
                        : "bg-base-200/30 border-base-300/25 hover:border-base-300/40"
                    }`}
                    style={
                      isAdded
                        ? {
                            background: `${hex}0D`,
                            borderColor: `${hex}33`,
                          }
                        : undefined
                    }
                  >
                    <div className="min-w-0 mr-2">
                      <div className="text-xs font-bold truncate">
                        {feed.name}
                      </div>
                      <div className="text-[9px] text-base-content/30 uppercase tracking-wide">
                        {feed.category}
                        {!feed.is_default && (
                          <span className="ml-1 text-base-content/20">
                            (custom)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isAdded ? (
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded"
                          style={{
                            color: hex,
                            background: `${hex}1A`,
                          }}
                        >
                          Added
                        </span>
                      ) : (
                        <button
                          onClick={() => addCatalogFeed(feed)}
                          disabled={saving}
                          className="text-[9px] font-bold text-base-content/40 uppercase tracking-widest px-2 py-1 rounded border border-base-300/25 transition-colors disabled:opacity-30"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = hex;
                            e.currentTarget.style.borderColor = `${hex}4D`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "";
                            e.currentTarget.style.borderColor = "";
                          }}
                        >
                          + Add
                        </button>
                      )}
                      {!feed.is_default && (
                        <button
                          onClick={() => deleteCatalogFeed(feed)}
                          title="Remove custom feed from catalog"
                          className="p-1 rounded hover:bg-error/10 text-base-content/20 hover:text-error transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-base-300/25 text-[10px] font-bold uppercase tracking-widest text-base-content/40 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = hex;
                    e.currentTarget.style.borderColor = `${hex}4D`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.borderColor = "";
                  }}
                >
                  <ChevronLeft size={12} />
                  Prev
                </button>
                <span className="text-[10px] font-mono text-base-content/30">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-base-300/25 text-[10px] font-bold uppercase tracking-widest text-base-content/40 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = hex;
                    e.currentTarget.style.borderColor = `${hex}4D`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.borderColor = "";
                  }}
                >
                  Next
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
          </>
        )}

        {!catalogLoading && catalogError && catalog.length === 0 && (
          <p className="text-center text-[10px] text-error/60 uppercase tracking-wide py-4">
            Failed to load feed catalog — check your connection
          </p>
        )}

        {!catalogLoading && !catalogError && filteredCatalog.length === 0 && (
          <p className="text-center text-[10px] text-base-content/25 uppercase tracking-wide py-4">
            {searchQuery
              ? "No feeds match your search"
              : "No feeds in this category"}
          </p>
        )}
      </div>
    </div>
  );
}

export const rssChannel: ChannelManifest = {
  id: "rss",
  name: "RSS Feeds",
  tabLabel: "RSS Feeds",
  description: "Custom news streams",
  hex: HEX,
  icon: Rss,
  DashboardTab: RssDashboardTab,
};
