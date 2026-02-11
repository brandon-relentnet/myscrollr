import { useMemo, useCallback } from 'react';
import type { RssItem as RssItemType } from '~/utils/types';
import type { FeedTabProps } from '~/integrations/types';
import { useScrollrCDC } from '~/integrations/hooks/useScrollrCDC';
import RssItem from './RssItem';

/** Extract initial RSS items from the dashboard response stored in streamConfig. */
function getInitialRssItems(config: Record<string, unknown>): RssItemType[] {
  const items = config.__initialItems as RssItemType[] | undefined;
  return items ?? [];
}

export default function RssFeedTab({ mode, streamConfig }: FeedTabProps) {
  const initialItems = useMemo(() => getInitialRssItems(streamConfig), [streamConfig]);

  const keyOf = useCallback(
    (r: RssItemType) => `${r.feed_url}:${r.guid}`,
    [],
  );
  const validate = useCallback(
    (record: Record<string, unknown>) =>
      typeof record.feed_url === 'string' && typeof record.guid === 'string',
    [],
  );
  const sort = useCallback((a: RssItemType, b: RssItemType) => {
    const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
    const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
    return tb - ta;
  }, []);

  const { items: rssItems } = useScrollrCDC<RssItemType>({
    table: 'rss_items',
    initialItems,
    keyOf,
    validate,
    sort,
  });

  return (
    <div className="grid gap-px bg-zinc-800 grid-cols-1">
      {rssItems.length === 0 && (
        <div className="col-span-full text-center py-8 text-zinc-500 text-sm">
          Waiting for RSS articles...
        </div>
      )}
      {rssItems.map((item) => (
        <RssItem key={`${item.feed_url}:${item.guid}`} item={item} mode={mode} />
      ))}
    </div>
  );
}
