/**
 * _template/FeedTab.tsx — Scaffold for a new extension FeedTab integration.
 *
 * To create a new integration:
 *  1. Copy this directory to integrations/official/<yourname>/
 *     (or integrations/verified/ / integrations/community/)
 *  2. Find/replace "example" with your integration's short name
 *  3. Replace ExampleItem type with your data model
 *  4. Implement the rendering logic
 *  5. Register in integrations/registry.ts (see bottom of this file)
 *
 * Official integrations use useScrollrCDC to subscribe to CDC records
 * from the SSE pipeline. Verified/community integrations typically fetch
 * their own data and don't use useScrollrCDC.
 */

import { useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import type { FeedTabProps } from '../../types';
import { useScrollrCDC } from '../../hooks/useScrollrCDC';

// ─── Data Model ──────────────────────────────────────────────────
// Replace this with your actual data type from utils/types.ts

interface ExampleItem {
  id: string;
  title: string;
  value: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Extract initial items from the dashboard response.
 * The dashboard stores initial data in streamConfig.__initialItems
 * (injected by FeedBar.tsx via DASHBOARD_KEY_MAP).
 */
function getInitialItems(config: Record<string, unknown>): ExampleItem[] {
  const items = config.__initialItems as ExampleItem[] | undefined;
  return items ?? [];
}

// ─── FeedTab Component ───────────────────────────────────────────

export default function ExampleFeedTab({ mode, streamConfig }: FeedTabProps) {
  const initialItems = useMemo(() => getInitialItems(streamConfig), [streamConfig]);

  // keyOf: return a unique identifier for upsert/dedup
  const keyOf = useCallback((item: ExampleItem) => item.id, []);

  // validate: return false to skip invalid CDC records
  const validate = useCallback(
    (record: Record<string, unknown>) => typeof record.id === 'string',
    [],
  );

  // sort (optional): return negative if a should come before b
  // const sort = useCallback(
  //   (a: ExampleItem, b: ExampleItem) => a.title.localeCompare(b.title),
  //   [],
  // );

  const { items } = useScrollrCDC<ExampleItem>({
    // TODO: Replace with your CDC table name (e.g. 'trades', 'games', 'rss_items')
    table: 'example_items',
    initialItems,
    keyOf,
    validate,
    // sort,
  });

  return (
    <div
      className={clsx(
        'grid gap-px bg-zinc-800',
        mode === 'compact' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2',
      )}
    >
      {items.length === 0 && (
        <div className="col-span-full text-center py-8 text-zinc-500 text-sm">
          Waiting for data...
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className="bg-zinc-900 p-3 flex items-center justify-between"
        >
          <span className="text-xs text-zinc-300 truncate">{item.title}</span>
          <span className="text-xs font-mono text-zinc-400">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Registration ────────────────────────────────────────────────
//
// Add the following to integrations/registry.ts:
//
//   import ExampleFeedTab from './official/example/FeedTab';
//
//   const example: IntegrationManifest = {
//     id: 'example',
//     name: 'Example',
//     tabLabel: 'Example',
//     tier: 'official',       // or 'verified' / 'community'
//     FeedTab: ExampleFeedTab,
//   };
//
// Then add to the integrations Map:
//   [example.id, example],
//
// And optionally add 'example' to TAB_ORDER if you want a fixed position.
//
// ─── Dashboard Key Map ───────────────────────────────────────────
//
// If your integration provides dashboard data, add a mapping in
// entrypoints/scrollbar.content/FeedBar.tsx's DASHBOARD_KEY_MAP:
//
//   example: 'example',    // maps integration id → dashboard response key
//
// This ensures initial items from GET /dashboard are passed to your
// FeedTab via streamConfig.__initialItems on first load.
