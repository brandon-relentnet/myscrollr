/**
 * RssSummary — dashboard card content for the News channel.
 *
 * Featured article layout: one primary article in a detailed card
 * (title, description snippet, source, time) with remaining articles
 * as compact clickable headlines below. Clicking a compact headline
 * swaps it into the primary slot (pinned via store).
 *
 * Auto-selects the most recent article as primary. Articles published
 * within the last hour get a subtle "new" highlight.
 */
import { useMemo, useCallback } from "react";
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import { useDashboardPin } from "../../hooks/useDashboardPin";
import clsx from "clsx";
import Tooltip from "../Tooltip";
import { timeAgo, truncate } from "../../utils/format";
import type { RssItem, DashboardResponse } from "../../types";
import type { RssCardPrefs } from "./dashboardPrefs";
import DashboardEmptyState from "./DashboardEmptyState";

// ── Helpers ─────────────────────────────────────────────────────

function articleKey(r: RssItem): string {
  return `${r.feed_url}::${r.guid}`;
}

const ONE_HOUR = 60 * 60 * 1000;

function isNew(r: RssItem): boolean {
  if (!r.published_at) return false;
  return Date.now() - new Date(r.published_at).getTime() < ONE_HOUR;
}

// ── Primary article (detailed card) ─────────────────────────────

interface PrimaryArticleProps {
  article: RssItem;
  prefs: RssCardPrefs;
}

function PrimaryArticle({ article, prefs }: PrimaryArticleProps) {
  const fresh = isNew(article);
  const ago = timeAgo(article.published_at);

  return (
    <div
      className={clsx(
        "rounded-lg px-3 py-2.5 transition-colors",
        fresh
          ? "bg-accent/5 border border-accent/15"
          : "bg-surface-3/30 border border-edge/30",
      )}
    >
      <p className="text-[12px] font-medium text-fg leading-snug line-clamp-2">
        {article.title}
      </p>

      {article.description && (
        <p className="mt-1 text-[11px] text-fg-3 leading-relaxed line-clamp-2">
          {truncate(article.description, 160)}
        </p>
      )}

      {(prefs.showSource || prefs.showTime) && (
        <div className="flex items-center gap-2 mt-1.5">
          {fresh && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 animate-pulse" />
          )}
          {prefs.showSource && (
            <span className="text-[9px] font-mono font-bold text-accent-purple uppercase tracking-wider">
              {article.source_name}
            </span>
          )}
          {prefs.showTime && ago && (
            <span className="text-[9px] font-mono text-fg-4 tabular-nums">
              {ago}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Compact headline (clickable, promotes to primary) ───────────

interface CompactHeadlineProps {
  article: RssItem;
  prefs: RssCardPrefs;
  onPromote: () => void;
}

function CompactHeadline({ article, prefs, onPromote }: CompactHeadlineProps) {
  const fresh = isNew(article);
  const ago = timeAgo(article.published_at);

  return (
    <Tooltip content="Click to feature this article">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPromote();
        }}
        className="flex items-center gap-1.5 w-full text-left px-1 py-1 rounded hover:bg-surface-3/40 transition-colors cursor-pointer group/headline"
      >
        {fresh && (
          <span className="w-1 h-1 rounded-full bg-accent shrink-0 animate-pulse" />
        )}
        {prefs.showSource && (
          <span className="text-[9px] font-mono font-bold text-accent-purple uppercase tracking-wider shrink-0 max-w-[64px] truncate">
            {article.source_name}
          </span>
        )}
        <span className="text-[11px] text-fg-3 group-hover/headline:text-fg-2 truncate flex-1 transition-colors">
          {article.title}
        </span>
        {prefs.showTime && ago && (
          <span className="text-[9px] font-mono text-fg-4 tabular-nums shrink-0">
            {ago}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

// ── Component ───────────────────────────────────────────────────

interface RssSummaryProps {
  dashboard: DashboardResponse | undefined;
  prefs: RssCardPrefs;
  onConfigure?: () => void;
}

export default function RssSummary({ dashboard, prefs, onConfigure }: RssSummaryProps) {
  const { items } = useScrollrCDC<RssItem>({
    table: "rss_items",
    dataKey: "rss",
    keyOf: (r) => `${r.feed_url}::${r.guid}`,
    sort: (a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
      return bTime - aTime;
    },
    maxItems: 50,
  });

  const [pinnedKey, setPinnedKey] = useDashboardPin<string | null>("dashboard:rss:pinnedArticle", null);

  const handlePin = useCallback((key: string) => {
    // Toggle off if already pinned
    setPinnedKey(pinnedKey === key ? null : key);
  }, [pinnedKey, setPinnedKey]);

  // Determine primary article
  const { primary, compactItems } = useMemo(() => {
    if (items.length === 0) return { primary: null, compactItems: [] };

    const pinned = pinnedKey
      ? items.find((r) => articleKey(r) === pinnedKey)
      : undefined;
    const selected = pinned ?? items[0]; // items already sorted by published_at desc
    const others = items.filter((r) => r !== selected);

    return {
      primary: selected,
      compactItems: others.slice(0, prefs.itemCount),
    };
  }, [items, pinnedKey, prefs.itemCount]);

  if (items.length === 0) {
    return (
      <DashboardEmptyState
        message="No feeds added yet"
        actionLabel={onConfigure ? "Add news sources \u2192" : undefined}
        onAction={onConfigure}
      />
    );
  }

  const sources = new Set(items.map((r) => r.source_name));

  return (
    <div className="space-y-2">
      {/* Primary article */}
      {primary && <PrimaryArticle article={primary} prefs={prefs} />}

      {/* Compact headlines */}
      {prefs.headlines && compactItems.length > 0 && (
        <div className="flex flex-col">
          {compactItems.map((article) => (
            <CompactHeadline
              key={articleKey(article)}
              article={article}
              prefs={prefs}
              onPromote={() => handlePin(articleKey(article))}
            />
          ))}
        </div>
      )}

      {/* Stats footer */}
      {prefs.stats && (
        <div className="flex items-center gap-3 pt-1 border-t border-edge/30">
          <span className="text-[10px] text-fg-4">
            {sources.size} feed{sources.size !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-fg-4">
            {items.length} articles
          </span>
        </div>
      )}
    </div>
  );
}
