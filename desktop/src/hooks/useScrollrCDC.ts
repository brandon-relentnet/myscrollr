import { useState, useEffect, useRef } from "react";

/**
 * Uniqueness key extractor — given a record, returns a string key
 * used to identify it for upsert/remove operations.
 */
type KeyExtractor<T> = (item: T) => string;

/**
 * Optional comparator for sorting items after upsert.
 * Return negative if a should come before b.
 */
type ItemComparator<T> = (a: T, b: T) => number;

interface UseScrollrCDCOptions<T> {
  /** CDC table name to subscribe to (e.g. 'trades', 'games', 'rss_items'). */
  table: string;
  /** Initial items from the dashboard snapshot. */
  initialItems: T[];
  /** Extract a unique key from a record for upsert/dedup. */
  keyOf: KeyExtractor<T>;
  /** Optional sort comparator applied after every upsert. */
  sort?: ItemComparator<T>;
  /** Max items to keep in memory. Defaults to 50. */
  maxItems?: number;
  /**
   * Optional validator — return false to skip a CDC record.
   * Useful for skipping records with missing required fields.
   */
  validate?: (record: Record<string, unknown>) => boolean;
}

interface UseScrollrCDCResult<T> {
  items: T[];
}

/**
 * Desktop version of the CDC hook.
 *
 * Phase 1: Polling mode only — items are driven entirely by the
 * dashboard/public-feed snapshot that App.tsx fetches on interval.
 * The hook simply returns initialItems and syncs when they change.
 *
 * Phase 2 will add direct EventSource subscription for SSE mode.
 */
export function useScrollrCDC<T>({
  initialItems,
}: UseScrollrCDCOptions<T>): UseScrollrCDCResult<T> {
  const [items, setItems] = useState<T[]>(initialItems);
  const initializedRef = useRef(false);

  // Sync when initialItems changes (e.g., polling refresh arrives)
  useEffect(() => {
    // Skip the very first empty array (dashboard hasn't loaded yet)
    if (!initializedRef.current && initialItems.length === 0) return;
    initializedRef.current = true;
    setItems(initialItems);
  }, [initialItems]);

  return { items };
}
