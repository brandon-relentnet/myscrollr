import { useState, useMemo, useCallback } from "react";
import { Plus, X } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import Tooltip from "../../components/Tooltip";
import UpgradePrompt from "../../components/UpgradePrompt";
import type { TrackedFeed } from "../../api/client";
import type { SubscriptionTier } from "../../auth";

// ── Types ────────────────────────────────────────────────────────

interface SubscribedFeed {
  name: string;
  url: string;
  is_custom?: boolean;
}

interface MyFeedsProps {
  feeds: SubscribedFeed[];
  /** Full catalog (with health data) for cross-referencing */
  catalogAll: TrackedFeed[];
  onRemove: (url: string) => void;
  onAddCustom: (name: string, url: string) => void;
  feedCount: number;
  maxFeeds: number;
  customCount: number;
  maxCustomFeeds: number;
  subscriptionTier: SubscriptionTier;
  saving: boolean;
}

type SortKey = "name" | "activity" | "category" | "health";

// ── Health Logic ─────────────────────────────────────────────────

function feedHealth(
  feed: SubscribedFeed,
  catalogMap: Map<string, TrackedFeed>,
): "healthy" | "stale" | "failing" {
  const catalogEntry = catalogMap.get(feed.url);
  if (!catalogEntry) return "stale"; // not in catalog = unknown health
  if (catalogEntry.consecutive_failures > 0) return "failing";
  if (!catalogEntry.last_success_at) return "stale";
  const hoursSince =
    (Date.now() - new Date(catalogEntry.last_success_at).getTime()) / 3600000;
  if (hoursSince > 72) return "stale";
  return "healthy";
}

function healthTooltip(
  feed: SubscribedFeed,
  catalogMap: Map<string, TrackedFeed>,
): string {
  const entry = catalogMap.get(feed.url);
  if (!entry) return "Feed status unknown";
  if (entry.consecutive_failures > 0) {
    return entry.last_error
      ? `Feed failing: ${entry.last_error}`
      : `Feed unreachable (${entry.consecutive_failures} failures)`;
  }
  if (!entry.last_success_at) return "No articles received yet";
  const hours = Math.round(
    (Date.now() - new Date(entry.last_success_at).getTime()) / 3600000,
  );
  if (hours < 1) return "Last article: less than 1 hour ago";
  if (hours < 24) return `Last article: ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Last article: ${days}d ago`;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const HEALTH_COLORS = {
  healthy: "bg-green-500",
  stale: "bg-amber-500",
  failing: "bg-red-500",
} as const;

// ── Component ────────────────────────────────────────────────────

export default function MyFeeds({
  feeds,
  catalogAll,
  onRemove,
  onAddCustom,
  feedCount,
  maxFeeds,
  customCount,
  maxCustomFeeds,
  subscriptionTier,
  saving,
}: MyFeedsProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const catalogMap = useMemo(
    () => new Map(catalogAll.map((f) => [f.url, f])),
    [catalogAll],
  );

  const atFeedLimit = feedCount >= maxFeeds;
  const atCustomLimit = customCount >= maxCustomFeeds;

  // Filter + sort feeds
  const sortedFeeds = useMemo(() => {
    let list = feeds;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "activity": {
          const aTime = catalogMap.get(a.url)?.last_success_at ?? "";
          const bTime = catalogMap.get(b.url)?.last_success_at ?? "";
          return bTime.localeCompare(aTime); // newest first
        }
        case "category": {
          const aCat = catalogMap.get(a.url)?.category ?? "zzz";
          const bCat = catalogMap.get(b.url)?.category ?? "zzz";
          return aCat.localeCompare(bCat) || a.name.localeCompare(b.name);
        }
        case "health": {
          const order = { failing: 0, stale: 1, healthy: 2 };
          const aH = order[feedHealth(a, catalogMap)];
          const bH = order[feedHealth(b, catalogMap)];
          return aH - bH || a.name.localeCompare(b.name);
        }
        default:
          return 0;
      }
    });
  }, [feeds, search, sort, catalogMap]);

  const handleAddCustom = useCallback(() => {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) return;
    if (!/^https?:\/\/.+/.test(url)) {
      setUrlError("Enter a full URL starting with http:// or https://");
      return;
    }
    setUrlError(null);
    onAddCustom(name, url);
    setNewName("");
    setNewUrl("");
    setShowCustomForm(false);
  }, [newName, newUrl, onAddCustom]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            My Feeds
            <span className="bg-accent/15 text-accent px-1.5 py-px rounded-full text-[11px] font-medium tabular-nums">
              {feedCount}
            </span>
          </div>
          <p className="text-[11px] text-fg-4 mt-0.5">
            Manage your subscribed news sources
          </p>
        </div>
        {!atFeedLimit && !atCustomLimit && maxCustomFeeds > 0 && (
          <button
            onClick={() => setShowCustomForm(!showCustomForm)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-accent/50 text-accent text-[11px] hover:bg-accent/10 transition-colors cursor-pointer"
          >
            <Plus size={13} />
            Add custom feed
          </button>
        )}
      </div>

      {/* Upgrade prompt when at feed limit */}
      {atFeedLimit && (
        <UpgradePrompt
          current={feedCount}
          max={maxFeeds}
          noun="feeds"
          tier={subscriptionTier}
        />
      )}

      {/* Custom feed form */}
      {showCustomForm && (
        <div className="p-3 rounded-lg border border-edge/40 bg-surface-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-bold text-fg-4">
              Add your own feed
            </span>
            {maxCustomFeeds !== Infinity && (
              <span className="text-[10px] text-fg-4 tabular-nums">
                {customCount}/{maxCustomFeeds} custom
              </span>
            )}
          </div>
          {atCustomLimit ? (
            <UpgradePrompt
              current={customCount}
              max={maxCustomFeeds}
              noun="custom feeds"
              tier={subscriptionTier}
            />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Feed name"
                  className="flex-1 px-3 py-2 rounded-lg bg-base-200 border border-edge/40 text-[12px] font-mono text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/60 transition-colors"
                />
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddCustom();
                  }}
                  placeholder="https://..."
                  className="flex-[2] px-3 py-2 rounded-lg bg-base-200 border border-edge/40 text-[12px] font-mono text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/60 transition-colors"
                />
                <button
                  onClick={handleAddCustom}
                  disabled={saving || !newName.trim() || !newUrl.trim()}
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
      )}

      {/* Search + Sort controls */}
      {feeds.length > 0 && (
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter feeds..."
            className="flex-1 px-2.5 py-1.5 rounded-md bg-base-200 border border-edge/40 text-[11px] text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/60 transition-colors"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="px-2.5 py-1.5 rounded-md bg-base-200 border border-edge/40 text-[11px] text-fg-2 focus:outline-none focus:border-accent/60 transition-colors cursor-pointer appearance-none"
          >
            <option value="name">Sort: Name</option>
            <option value="activity">Sort: Last Activity</option>
            <option value="category">Sort: Category</option>
            <option value="health">Sort: Health</option>
          </select>
        </div>
      )}

      {/* Feed list */}
      {sortedFeeds.length > 0 ? (
        <div className="border border-edge/30 rounded-lg overflow-hidden divide-y divide-edge/20">
          {sortedFeeds.map((feed) => {
            const health = feedHealth(feed, catalogMap);
            const entry = catalogMap.get(feed.url);
            return (
              <div
                key={feed.url}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-base-200/50 transition-colors"
              >
                <Tooltip content={healthTooltip(feed, catalogMap)} side="right">
                  <div
                    className={clsx(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      HEALTH_COLORS[health],
                    )}
                  />
                </Tooltip>
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-medium text-fg-2 truncate block">
                    {feed.name}
                  </span>
                </div>
                {feed.is_custom ? (
                  <span className="px-1.5 py-px rounded text-[9px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/30 shrink-0">
                    custom
                  </span>
                ) : (
                  <span className="px-1.5 py-px rounded text-[9px] text-fg-3 bg-accent/10 shrink-0">
                    {entry?.category ?? ""}
                  </span>
                )}
                <span className="text-[10px] text-fg-3 tabular-nums shrink-0 w-14 text-right">
                  {health === "failing" ? (
                    <span className="text-red-500">failing</span>
                  ) : (
                    relativeTime(entry?.last_success_at)
                  )}
                </span>
                <Tooltip content="Remove feed">
                  <button
                    onClick={() => onRemove(feed.url)}
                    className="p-1 rounded hover:bg-error/10 text-fg-3 hover:text-error transition-colors cursor-pointer shrink-0"
                    aria-label={`Remove ${feed.name}`}
                  >
                    <X size={12} />
                  </button>
                </Tooltip>
              </div>
            );
          })}
        </div>
      ) : feeds.length > 0 ? (
        <p className="text-[11px] text-fg-4 text-center py-4">
          No feeds match your filter
        </p>
      ) : (
        <p className="text-[11px] text-fg-4 text-center py-4">
          No feeds subscribed yet. Browse the catalog below to add some.
        </p>
      )}

      {/* Tier limit footer */}
      {feeds.length > 0 && (
        <p className="text-[10px] text-fg-3 text-right tabular-nums">
          {feedCount} / {maxFeeds === Infinity ? "∞" : maxFeeds} feeds
          {maxCustomFeeds > 0 &&
            ` (${customCount} / ${maxCustomFeeds === Infinity ? "∞" : maxCustomFeeds} custom)`}
        </p>
      )}
    </div>
  );
}
