/**
 * RssSummary — dashboard card content for the News channel.
 *
 * Featured article layout: one primary article in a detailed card
 * (title, description snippet, source, time) with remaining articles
 * as compact clickable headlines below. Clicking a compact headline
 * swaps it into the primary slot (pinned via localStorage).
 *
 * Auto-selects the most recent article as primary. Articles published
 * within the last hour get a subtle "new" highlight.
 */
import { useState, useMemo, useCallback } from "react";
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import { loadPref, savePref } from "../../preferences";
import clsx from "clsx";
import type { RssItem, DashboardResponse } from "../../types";
import type { RssCardPrefs } from "./dashboardPrefs";

// ── Pinned article storage ──────────────────────────────────────

const PINNED_KEY = "dashboard:rss:pinnedArticle";

function loadPinnedKey(): string | null {
  return loadPref<string | null>(PINNED_KEY, null);
}

function savePinnedKey(key: string | null): void {
  savePref(PINNED_KEY, key);
}

// ── Helpers ─────────────────────────────────────────────────────

function articleKey(r: RssItem): string {
  return `${r.feed_url}::${r.guid}`;
}

const ONE_HOUR = 60 * 60 * 1000;

function isNew(r: RssItem): boolean {
  if (!r.published_at) return false;
  return Date.now() - new Date(r.published_at).getTime() < ONE_HOUR;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function truncate(text: string, maxLen: number): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "\u2026";
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
    <button
      onClick={(e) => {
        e.stopPropagation();
        onPromote();
      }}
      className="flex items-center gap-1.5 w-full text-left px-1 py-1 rounded hover:bg-surface-3/40 transition-colors cursor-pointer group/headline"
      title="Click to feature this article"
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
  );
}

// ── Component ───────────────────────────────────────────────────

interface RssSummaryProps {
  dashboard: DashboardResponse | undefined;
  prefs: RssCardPrefs;
  onConfigure?: () => void;
}

export default function RssSummary({ dashboard, prefs, onConfigure }: RssSummaryProps) {
  const initialItems = (dashboard?.data?.rss ?? []) as RssItem[];
  const { items } = useScrollrCDC<RssItem>({
    table: "rss_items",
    initialItems,
    keyOf: (r) => `${r.feed_url}::${r.guid}`,
    sort: (a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
      return bTime - aTime;
    },
    maxItems: 50,
  });

  const [pinnedKey, setPinnedKey] = useState<string | null>(loadPinnedKey);

  const handlePin = useCallback((key: string) => {
    setPinnedKey((prev) => {
      // Toggle off if already pinned
      const next = prev === key ? null : key;
      savePinnedKey(next);
      return next;
    });
  }, []);

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
      <div className="flex flex-col gap-2 py-1">
        <p className="text-[11px] text-fg-4">No feeds added yet</p>
        {onConfigure && (
          <button
            onClick={onConfigure}
            className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors self-start"
          >
            Add news sources &rarr;
          </button>
        )}
      </div>
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
