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
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

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
        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 text-xs hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        <span className="font-medium text-indigo-400 shrink-0 min-w-[60px] max-w-[80px] truncate">
          {item.source_name}
        </span>
        <span className="text-zinc-200 truncate flex-1">
          {item.title}
        </span>
        {ago && (
          <span className="text-zinc-500 shrink-0 text-[10px]">
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
      className="block px-3 py-2 bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-zinc-100 leading-snug line-clamp-2">
          {item.title}
        </span>
      </div>
      {item.description && (
        <p className="mt-0.5 text-xs text-zinc-400 leading-relaxed line-clamp-2">
          {truncate(item.description, 160)}
        </p>
      )}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] font-medium text-indigo-400 uppercase tracking-wide">
          {item.source_name}
        </span>
        {ago && (
          <span className={clsx('text-[10px] text-zinc-500')}>
            {ago}
          </span>
        )}
      </div>
    </a>
  );
}
