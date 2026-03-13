/**
 * RssSummary — dashboard card content for the RSS channel.
 *
 * Shows latest article titles with source and time.
 * Respects per-card display preferences from the dashboard editor.
 */
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import type { RssItem, DashboardResponse } from "../../types";
import type { RssCardPrefs } from "./dashboardPrefs";

interface RssSummaryProps {
  dashboard: DashboardResponse | undefined;
  prefs: RssCardPrefs;
  onConfigure?: () => void;
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
  return `${days}d`;
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

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-1">
        <p className="text-[11px] text-fg-4">No feeds added yet</p>
        {onConfigure && (
          <button
            onClick={onConfigure}
            className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors self-start"
          >
            Add feeds &rarr;
          </button>
        )}
      </div>
    );
  }

  const latest = items.slice(0, prefs.itemCount);
  const sources = new Set(items.map((r) => r.source_name));

  return (
    <div className="space-y-1.5">
      {prefs.headlines &&
        latest.map((article, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <p className="text-[11px] text-fg-2 leading-tight line-clamp-1">
              {article.title}
            </p>
            {(prefs.showSource || prefs.showTime) && (
              <div className="flex items-center gap-1.5">
                {prefs.showSource && (
                  <span className="text-[9px] font-mono text-accent-purple uppercase truncate max-w-[100px]">
                    {article.source_name}
                  </span>
                )}
                {prefs.showTime && (
                  <span className="text-[9px] text-fg-4">
                    {timeAgo(article.published_at)}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}

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
