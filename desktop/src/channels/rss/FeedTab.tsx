/**
 * RSS FeedTab — desktop-native.
 *
 * Renders a filterable, sortable list of RSS articles with per-source
 * limiting, category badges, and real-time updates via the desktop
 * CDC/SSE pipeline.
 */
import { memo, useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Rss, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";
import { dashboardQueryOptions, rssCatalogOptions } from "../../api/queries";
import { timeAgo, truncate } from "../../utils/format";
import EmptyChannelState from "../../components/EmptyChannelState";
import CategoryFilter from "./CategoryFilter";
import { useShell } from "../../shell-context";
import type {
  RssItem as RssItemType,
  FeedTabProps,
  FeedMode,
  ChannelManifest,
} from "../../types";
import type { RssDisplayPrefs } from "../../preferences";

// ── Channel manifest ─────────────────────────────────────────────

export const rssChannel: ChannelManifest = {
  id: "rss",
  name: "News",
  tabLabel: "News",
  description: "Articles from your favorite feeds",
  hex: "#a855f7",
  icon: Rss,
  info: {
    about:
      "Collect articles from your favorite websites into one place. " +
      "New articles appear automatically as they are published.",
    usage: [
      "Add news sources from the Settings tab.",
      "Articles are sorted by publish date, newest first.",
      "Click any article to open it in your browser.",
    ],
  },
  FeedTab: RssFeedTab,
};

// ── Sort type ────────────────────────────────────────────────────

type SortOrder = "newest" | "oldest" | "by-source";

// ── SourceFilter ─────────────────────────────────────────────────

interface SourceFilterProps {
  sources: string[];
  selected: Set<string>;
  onToggle: (source: string) => void;
  onClearAll: () => void;
}

function SourceFilter({ sources, selected, onToggle, onClearAll }: SourceFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const activeCount = selected.size;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] transition-colors cursor-pointer whitespace-nowrap",
          activeCount > 0
            ? "border-accent/30 text-accent"
            : "border-edge/30 text-fg-4 hover:text-fg-3 hover:border-edge/50",
        )}
      >
        <Rss size={12} />
        <span>Sources</span>
        {activeCount > 0 && (
          <span className="bg-accent/20 text-accent rounded-full px-1.5 text-[10px] font-medium">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-52 bg-surface-2 border border-edge/30 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
          {sources.map((source) => {
            const isActive = selected.has(source);
            return (
              <button
                key={source}
                onClick={() => onToggle(source)}
                className={clsx(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-left text-[12px] transition-colors cursor-pointer",
                  isActive
                    ? "text-fg-2"
                    : "text-fg-4 hover:text-fg-3",
                )}
              >
                <span
                  className={clsx(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] shrink-0",
                    isActive
                      ? "bg-accent/20 border-accent/40 text-accent"
                      : "border-edge/40",
                  )}
                >
                  {isActive && "\u2713"}
                </span>
                <span className="flex-1 truncate">{source}</span>
              </button>
            );
          })}
          {activeCount > 0 && (
            <>
              <div className="h-px bg-edge/20 my-1" />
              <button
                onClick={() => {
                  onClearAll();
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-fg-4 hover:text-fg-3 transition-colors cursor-pointer"
              >
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── FeedTab ──────────────────────────────────────────────────────

function RssFeedTab({ mode, feedContext, onConfigure }: FeedTabProps) {
  const { prefs } = useShell();
  const dp = prefs.channelDisplay.rss;

  const dashboardLoaded = feedContext.__dashboardLoaded as boolean | undefined;

  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const { data: catalog } = useQuery(rssCatalogOptions());

  const rssItems = useMemo(
    () => (dashboard?.data?.rss as RssItemType[] | undefined) ?? [],
    [dashboard?.data?.rss],
  );

  // Build category map: feed_url → category
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    if (catalog) {
      for (const feed of catalog) {
        if (feed.category) {
          map.set(feed.url, feed.category);
        }
      }
    }
    return map;
  }, [catalog]);

  // Derive all unique source names (sorted alphabetically)
  const allSources = useMemo(() => {
    const set = new Set<string>();
    for (const item of rssItems) {
      set.add(item.source_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rssItems]);

  // Derive categories with counts from current items
  const categoryList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of rssItems) {
      const cat = categoryMap.get(item.feed_url);
      if (cat) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rssItems, categoryMap]);

  // ── Filter / sort state ──────────────────────────────────────
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  const toggleSource = useCallback((source: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  const clearSources = useCallback(() => setSelectedSources(new Set()), []);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const clearCategories = useCallback(() => setSelectedCategories(new Set()), []);

  const clearAllFilters = useCallback(() => {
    setSelectedSources(new Set());
    setSelectedCategories(new Set());
  }, []);

  const toggleExpanded = useCallback((source: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  const hasFilters = selectedSources.size > 0 || selectedCategories.size > 0;

  // ── Data pipeline ────────────────────────────────────────────
  const { visibleItems, overflowCounts } = useMemo(() => {
    let items = rssItems;

    // Source filter
    if (selectedSources.size > 0) {
      items = items.filter((i) => selectedSources.has(i.source_name));
    }

    // Category filter
    if (selectedCategories.size > 0) {
      items = items.filter((i) => {
        const cat = categoryMap.get(i.feed_url);
        return cat != null && selectedCategories.has(cat);
      });
    }

    // Sort
    if (sortOrder === "oldest") {
      items = [...items].sort((a, b) => {
        const aTime = a.published_at ?? a.created_at;
        const bTime = b.published_at ?? b.created_at;
        return aTime.localeCompare(bTime);
      });
    } else if (sortOrder === "by-source") {
      items = [...items].sort((a, b) => {
        const cmp = a.source_name.localeCompare(b.source_name, undefined, { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        // Within source: newest first
        const aTime = a.published_at ?? a.created_at;
        const bTime = b.published_at ?? b.created_at;
        return bTime.localeCompare(aTime);
      });
    }
    // "newest" is the default order from the dashboard/CDC pipeline — no re-sort needed

    // Per-source limit
    const limit = dp.articlesPerSource;
    const overflow = new Map<string, number>();

    if (limit > 0) {
      const sourceCounts = new Map<string, number>();
      const limited: RssItemType[] = [];

      for (const item of items) {
        const count = sourceCounts.get(item.source_name) ?? 0;
        const isExpanded = expandedSources.has(item.source_name);

        if (isExpanded || count < limit) {
          limited.push(item);
        }
        sourceCounts.set(item.source_name, count + 1);
      }

      // Calculate overflow for each source
      for (const [source, total] of sourceCounts) {
        if (total > limit && !expandedSources.has(source)) {
          overflow.set(source, total - limit);
        }
      }

      return { visibleItems: limited, overflowCounts: overflow };
    }

    return { visibleItems: items, overflowCounts: overflow };
  }, [rssItems, selectedSources, selectedCategories, sortOrder, dp.articlesPerSource, categoryMap, expandedSources]);

  // ── Build render list with interleaved show-more/collapse rows ─
  type RenderEntry =
    | { kind: "article"; item: RssItemType; category?: string }
    | { kind: "show-more"; source: string; count: number }
    | { kind: "collapse"; source: string };

  const renderList = useMemo(() => {
    const entries: RenderEntry[] = [];

    // First, add all articles
    for (const item of visibleItems) {
      entries.push({
        kind: "article",
        item,
        category: categoryMap.get(item.feed_url),
      });
    }

    // Then append one "show more" or "collapse" row per source that needs it.
    // These appear at the end of the list (not interleaved) to avoid duplicates
    // when articles from the same source are scattered across chronological sorts.
    for (const [source, count] of overflowCounts) {
      entries.push({ kind: "show-more", source, count });
    }
    for (const source of expandedSources) {
      // Only show collapse if this source was actually limited (has enough articles)
      const total = rssItems.filter((i) => i.source_name === source).length;
      if (total > dp.articlesPerSource && dp.articlesPerSource > 0) {
        entries.push({ kind: "collapse", source });
      }
    }

    return entries;
  }, [visibleItems, overflowCounts, expandedSources, categoryMap, rssItems, dp.articlesPerSource]);

  // ── Empty state (no data at all) ─────────────────────────────
  if (rssItems.length === 0) {
    return (
      <EmptyChannelState
        icon={Rss}
        noun="feeds"
        hasConfig={!!feedContext.__hasConfig}
        dashboardLoaded={!!dashboardLoaded}
        loadingNoun="articles"
        actionHint="add websites"
        onConfigure={onConfigure}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="sticky top-0 z-20 bg-surface border-b border-edge/20 px-3 py-2 flex items-center gap-2 flex-wrap">
        <SourceFilter
          sources={allSources}
          selected={selectedSources}
          onToggle={toggleSource}
          onClearAll={clearSources}
        />
        <CategoryFilter
          categories={categoryList}
          selected={selectedCategories}
          onToggle={toggleCategory}
          onClearAll={clearCategories}
        />
        <div className="ml-auto">
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="bg-surface-2 border border-edge/30 rounded-md px-2 py-1.5 text-[11px] text-fg-3 cursor-pointer outline-none focus:border-accent/40"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="by-source">By Source</option>
          </select>
        </div>
      </div>

      {/* Filter chips */}
      {hasFilters && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border-b border-edge/10 flex-wrap">
          {Array.from(selectedSources).map((s) => (
            <button
              key={`src:${s}`}
              onClick={() => toggleSource(s)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] hover:bg-accent/20 transition-colors cursor-pointer"
            >
              <span className="truncate max-w-[120px]">{s}</span>
              <span className="text-accent/60">&times;</span>
            </button>
          ))}
          {Array.from(selectedCategories).map((c) => (
            <button
              key={`cat:${c}`}
              onClick={() => toggleCategory(c)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[10px] hover:bg-purple-500/20 transition-colors cursor-pointer"
            >
              <span className="truncate max-w-[120px]">{c}</span>
              <span className="text-purple-400/60">&times;</span>
            </button>
          ))}
          <button
            onClick={clearAllFilters}
            className="px-2 py-0.5 text-[10px] text-fg-4 hover:text-fg-3 transition-colors cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* No-results state */}
      {visibleItems.length === 0 && hasFilters && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Rss size={28} className="text-fg-4/40" />
          <p className="text-sm text-fg-4">No articles match your filters</p>
          <button
            onClick={clearAllFilters}
            className="text-xs text-accent hover:text-accent/80 transition-colors cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Article list */}
      {visibleItems.length > 0 && (
        <div
          className={clsx(
            "grid gap-px bg-edge flex-1",
            mode === "compact"
              ? "grid-cols-1"
              : "grid-cols-1 sm:grid-cols-2",
          )}
        >
          {renderList.map((entry) => {
            if (entry.kind === "show-more") {
              return (
                <ShowMoreRow
                  key={`more:${entry.source}`}
                  source={entry.source}
                  count={entry.count}
                  onExpand={() => toggleExpanded(entry.source)}
                />
              );
            }
            if (entry.kind === "collapse") {
              return (
                <CollapseRow
                  key={`collapse:${entry.source}`}
                  source={entry.source}
                  onCollapse={() => toggleExpanded(entry.source)}
                />
              );
            }
            return (
              <RssArticle
                key={`${entry.item.feed_url}:${entry.item.guid}`}
                item={entry.item}
                mode={mode}
                display={dp}
                category={entry.category}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ShowMoreRow ──────────────────────────────────────────────────

interface ShowMoreRowProps {
  source: string;
  count: number;
  onExpand: () => void;
}

function ShowMoreRow({ source, count, onExpand }: ShowMoreRowProps) {
  return (
    <button
      onClick={onExpand}
      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-hover transition-colors cursor-pointer text-[10px] text-fg-4 hover:text-fg-3 col-span-full"
    >
      <ChevronDown size={12} />
      <span>
        {count} more from <span className="font-medium text-fg-3">{source}</span>
      </span>
    </button>
  );
}

// ── CollapseRow ─────────────────────────────────────────────────

interface CollapseRowProps {
  source: string;
  onCollapse: () => void;
}

function CollapseRow({ source, onCollapse }: CollapseRowProps) {
  return (
    <button
      onClick={onCollapse}
      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-hover transition-colors cursor-pointer text-[10px] text-fg-4 hover:text-fg-3 col-span-full"
    >
      <ChevronUp size={12} />
      <span>
        Collapse <span className="font-medium text-fg-3">{source}</span>
      </span>
    </button>
  );
}

// ── RssArticle ──────────────────────────────────────────────────

interface RssArticleProps {
  item: RssItemType;
  mode: FeedMode;
  display: RssDisplayPrefs;
  category?: string;
}

const RssArticle = memo(function RssArticle({ item, mode, display, category }: RssArticleProps) {
  const ago = display.showTimestamps ? timeAgo(item.published_at) : null;

  const categoryBadge = display.showSource && category ? (
    <span className="px-1.5 py-px rounded text-[8px] text-fg-4/50 bg-accent/5 shrink-0 whitespace-nowrap">
      {category}
    </span>
  ) : null;

  if (mode === "compact") {
    return (
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-1.5 bg-surface text-xs hover:bg-surface-hover transition-colors cursor-pointer"
      >
        {display.showSource && (
          <span className="font-mono text-[9px] text-accent/70 shrink-0 min-w-[56px] max-w-[80px] truncate uppercase tracking-wider font-bold">
            {item.source_name}
          </span>
        )}
        {categoryBadge}
        <span className="text-fg truncate flex-1">{item.title}</span>
        {ago && (
          <span className="text-fg-4 shrink-0 text-[9px] font-mono tabular-nums">
            {ago}
          </span>
        )}
      </a>
    );
  }

  // Comfort mode
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-3 py-2.5 bg-surface hover:bg-surface-hover transition-colors cursor-pointer border-l-2 border-l-accent/10 hover:border-l-accent/30"
    >
      <span className="text-sm font-medium text-fg leading-snug line-clamp-2">
        {item.title}
      </span>
      {display.showDescription && item.description && (
        <p className="mt-1 text-xs text-fg-2 leading-relaxed line-clamp-2">
          {truncate(item.description, 160)}
        </p>
      )}
      {(display.showSource || ago) && (
        <div className="flex items-center gap-2 mt-1.5">
          {display.showSource && (
            <span className="text-[9px] font-mono font-bold text-accent/60 uppercase tracking-wider">
              {item.source_name}
            </span>
          )}
          {categoryBadge}
          {ago && (
            <span className="text-[9px] font-mono text-fg-4 tabular-nums">
              {ago}
            </span>
          )}
        </div>
      )}
    </a>
  );
}, (prev, next) =>
  prev.mode === next.mode &&
  prev.display === next.display &&
  prev.category === next.category &&
  prev.item.guid === next.item.guid &&
  prev.item.feed_url === next.item.feed_url &&
  prev.item.title === next.item.title &&
  prev.item.description === next.item.description &&
  prev.item.link === next.item.link &&
  prev.item.source_name === next.item.source_name &&
  prev.item.published_at === next.item.published_at
);
