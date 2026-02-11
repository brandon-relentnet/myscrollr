import { clsx } from 'clsx';
import type { RssItem as RssItemType, FeedMode } from '~/utils/types';

interface RssItemProps {
  item: RssItemType;
  mode: FeedMode;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';

  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;

  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '\u2026';
}

export default function RssItem({ item, mode }: RssItemProps) {
  const ago = timeAgo(item.published_at);

  if (mode === 'compact') {
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
        <span className="text-fg truncate flex-1">
          {item.title}
        </span>
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
