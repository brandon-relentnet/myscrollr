/**
 * RSS FeedTab — desktop-native.
 *
 * Renders a list of RSS articles sorted by publish date, with
 * real-time updates via the desktop CDC/SSE pipeline. Shows source
 * name, title, description, and relative timestamps.
 */
import { useMemo, useCallback } from "react";
import { Rss } from "lucide-react";
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import type {
  RssItem as RssItemType,
  FeedTabProps,
  FeedMode,
  ChannelManifest,
} from "../../types";

// ── Channel manifest ─────────────────────────────────────────────

export const rssChannel: ChannelManifest = {
  id: "rss",
  name: "RSS",
  tabLabel: "RSS",
  description: "Articles from your favorite feeds",
  hex: "#a855f7",
  icon: Rss,
  info: {
    about:
      "Aggregate articles from any RSS or Atom feed into a single stream. " +
      "New articles appear in real-time via CDC as they are ingested.",
    usage: [
      "Add feed URLs from the Setup tab.",
      "Articles are sorted by publish date, newest first.",
      "Tap any article to open it in your browser.",
    ],
  },
  FeedTab: RssFeedTab,
};

// ── FeedTab ──────────────────────────────────────────────────────

function RssFeedTab({ mode, channelConfig }: FeedTabProps) {
  const initialItems = useMemo(() => {
    const items = channelConfig.__initialItems as RssItemType[] | undefined;
    return items ?? [];
  }, [channelConfig]);

  const dashboardLoaded = channelConfig.__dashboardLoaded as
    | boolean
    | undefined;

  const keyOf = useCallback(
    (r: RssItemType) => `${r.feed_url}:${r.guid}`,
    [],
  );
  const validate = useCallback(
    (record: Record<string, unknown>) =>
      typeof record.feed_url === "string" && typeof record.guid === "string",
    [],
  );
  const sort = useCallback((a: RssItemType, b: RssItemType) => {
    const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
    const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
    return tb - ta;
  }, []);

  const { items: rssItems } = useScrollrCDC<RssItemType>({
    table: "rss_items",
    initialItems,
    keyOf,
    validate,
    sort,
  });

  return (
    <div className="grid gap-px bg-edge grid-cols-1">
      {rssItems.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center gap-2 py-12 bg-surface">
          <Rss size={28} className="text-fg-4/40" />
          {dashboardLoaded && initialItems.length === 0 ? (
            <>
              <p className="text-sm font-medium text-fg-3">
                No feeds added yet
              </p>
              <p className="text-xs text-fg-4">
                Go to the <span className="text-fg-3 font-medium">Setup</span> tab to add RSS feeds.
              </p>
            </>
          ) : (
            <p className="text-xs text-fg-4">Waiting for RSS articles&hellip;</p>
          )}
        </div>
      )}
      {rssItems.map((item) => (
        <RssArticle
          key={`${item.feed_url}:${item.guid}`}
          item={item}
          mode={mode}
        />
      ))}
    </div>
  );
}

// ── RssArticle ──────────────────────────────────────────────────

interface RssArticleProps {
  item: RssItemType;
  mode: FeedMode;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return "";

  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;

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

function RssArticle({ item, mode }: RssArticleProps) {
  const ago = timeAgo(item.published_at);

  if (mode === "compact") {
    return (
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-1.5 bg-surface text-xs hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <span className="font-mono text-[9px] text-accent/70 shrink-0 min-w-[56px] max-w-[80px] truncate uppercase tracking-wider font-bold">
          {item.source_name}
        </span>
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
      {item.description && (
        <p className="mt-1 text-xs text-fg-2 leading-relaxed line-clamp-2">
          {truncate(item.description, 160)}
        </p>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[9px] font-mono font-bold text-accent/60 uppercase tracking-wider">
          {item.source_name}
        </span>
        {ago && (
          <span className="text-[9px] font-mono text-fg-4 tabular-nums">
            {ago}
          </span>
        )}
      </div>
    </a>
  );
}
