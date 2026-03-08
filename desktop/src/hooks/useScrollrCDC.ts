import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

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

/** Shape of each CDC record inside an SSE payload. */
interface CDCRecord {
  action: "insert" | "update" | "delete";
  record: Record<string, unknown>;
  changes: Record<string, unknown>;
  metadata: { table_name: string };
}

/** SSE payload emitted by the Rust SSE client as `sse-event`. */
interface SSEPayload {
  data: CDCRecord[];
}

/**
 * Desktop CDC hook — manages an in-memory array of items with
 * real-time upsert/delete from the Rust SSE client.
 *
 * In polling mode (no SSE connection), items are driven entirely
 * by the dashboard snapshot that App.tsx fetches on interval.
 *
 * In SSE mode, the hook listens for `sse-event` Tauri events,
 * filters by table name, and applies CDC mutations to the array.
 */
export function useScrollrCDC<T>({
  table,
  initialItems,
  keyOf,
  sort,
  maxItems = 50,
  validate,
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

  // Listen for CDC events from the Rust SSE client
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<SSEPayload>("sse-event", (event) => {
      const payload = event.payload;
      if (!payload?.data) return;

      // Filter records for this hook's table
      const relevant = payload.data.filter(
        (r) => r.metadata?.table_name === table,
      );
      if (relevant.length === 0) return;

      setItems((prev) => {
        let next = [...prev];

        for (const cdc of relevant) {
          const record = cdc.record as unknown as T;

          if (cdc.action === "delete") {
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
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [table, keyOf, sort, maxItems, validate]);

  return { items };
}
