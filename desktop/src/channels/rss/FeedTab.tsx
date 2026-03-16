/**
 * RSS FeedTab — desktop-native.
 *
 * Renders a list of RSS articles sorted by publish date, with
 * real-time updates via the desktop CDC/SSE pipeline. Shows source
 * name, title, description, and relative timestamps.
 */
import { memo, useMemo, useCallback } from "react";
import { Rss } from "lucide-react";
import { clsx } from "clsx";
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import { timeAgo, truncate } from "../../utils/format";
import EmptyChannelState from "../../components/EmptyChannelState";
import type {
  RssItem as RssItemType,
  FeedTabProps,
  FeedMode,
  ChannelManifest,
} from "../../types";

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

// ── FeedTab ──────────────────────────────────────────────────────

function RssFeedTab({ mode, feedContext }: FeedTabProps) {
  const dashboardLoaded = feedContext.__dashboardLoaded as
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
    dataKey: "rss",
    keyOf,
    validate,
    sort,
  });

  return (
    <div
      className={clsx(
        "grid gap-px bg-edge",
        mode === "compact"
          ? "grid-cols-1"
          : "grid-cols-1 sm:grid-cols-2",
      )}
    >
      {rssItems.length === 0 && (
        <EmptyChannelState
          icon={Rss}
          noun="feeds"
          hasConfig={!!feedContext.__hasConfig}
          dashboardLoaded={!!dashboardLoaded}
          loadingNoun="articles"
          actionHint="add websites"
        />
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

const RssArticle = memo(function RssArticle({ item, mode }: RssArticleProps) {
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
}, (prev, next) =>
  prev.mode === next.mode &&
  prev.item.guid === next.item.guid &&
  prev.item.feed_url === next.item.feed_url &&
  prev.item.title === next.item.title &&
  prev.item.description === next.item.description &&
  prev.item.link === next.item.link &&
  prev.item.source_name === next.item.source_name &&
  prev.item.published_at === next.item.published_at
);
