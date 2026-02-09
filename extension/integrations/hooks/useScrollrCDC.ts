import { useState, useEffect, useRef } from 'react';
import type { CDCRecord } from '~/utils/types';
import type { BackgroundMessage, ClientMessage } from '~/utils/messaging';
import { MAX_ITEMS } from '~/utils/constants';

/**
 * Uniqueness key extractor — given a record, returns a string key
 * used to identify it for upsert/remove operations.
 */
export type KeyExtractor<T> = (item: T) => string;

/**
 * Optional comparator for sorting items after upsert.
 * Return negative if a should come before b.
 */
export type ItemComparator<T> = (a: T, b: T) => number;

interface UseScrollrCDCOptions<T> {
  /** CDC table name to subscribe to (e.g. 'trades', 'games', 'rss_items'). */
  table: string;
  /** Initial items from the dashboard snapshot. */
  initialItems: T[];
  /** Extract a unique key from a record for upsert/dedup. */
  keyOf: KeyExtractor<T>;
  /** Optional sort comparator applied after every upsert. */
  sort?: ItemComparator<T>;
  /** Max items to keep in memory. Defaults to MAX_ITEMS (50). */
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
 * Hook for official integrations to subscribe to CDC records from the
 * background SSE connection. Manages an in-memory array with upsert/remove
 * logic and returns the current items.
 *
 * Only used by official Scrollr integrations — community integrations
 * fetch their own data and don't use this hook.
 */
export function useScrollrCDC<T>({
  table,
  initialItems,
  keyOf,
  sort,
  maxItems = MAX_ITEMS,
  validate,
}: UseScrollrCDCOptions<T>): UseScrollrCDCResult<T> {
  const [items, setItems] = useState<T[]>(initialItems);

  // Keep a ref to the latest items so the message handler closure
  // always operates on the current array without re-subscribing.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Track whether we've received initialItems (they may arrive after mount)
  const initializedRef = useRef(false);

  // Sync when initialItems changes (e.g., dashboard response arrives)
  useEffect(() => {
    if (initialItems.length > 0 || !initializedRef.current) {
      initializedRef.current = true;
      setItems(initialItems);
    }
  }, [initialItems]);

  // Subscribe to CDC table and handle incoming records
  useEffect(() => {
    // Tell background we want records for this table
    browser.runtime
      .sendMessage({ type: 'SUBSCRIBE_CDC', tables: [table] } satisfies ClientMessage)
      .catch(() => {});

    const handleMessage = (message: unknown) => {
      const msg = message as BackgroundMessage;
      if (msg.type !== 'CDC_BATCH' || msg.table !== table) return;

      setItems((prev) => {
        let next = [...prev];

        for (const cdc of msg.records) {
          const record = cdc.record as unknown as T;

          if (cdc.action === 'delete') {
            const key = keyOf(record);
            next = next.filter((item) => keyOf(item) !== key);
          } else {
            // insert or update — validate first
            if (validate && !validate(cdc.record)) continue;

            const key = keyOf(record);
            const idx = next.findIndex((item) => keyOf(item) === key);
            if (idx >= 0) {
              next[idx] = record;
            } else {
              next.push(record);
              if (next.length > maxItems) next.shift();
            }
          }
        }

        // Apply sort if provided
        if (sort) {
          next.sort(sort);
        }

        return next;
      });
    };

    browser.runtime.onMessage.addListener(handleMessage);

    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
      // Unsubscribe from CDC table
      browser.runtime
        .sendMessage({ type: 'UNSUBSCRIBE_CDC', tables: [table] } satisfies ClientMessage)
        .catch(() => {});
    };
  }, [table, keyOf, sort, maxItems, validate]);

  return { items };
}
