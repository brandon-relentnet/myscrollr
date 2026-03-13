import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTauriListener } from "./useTauriListener";
import { dashboardQueryOptions, queryKeys } from "../api/queries";
import type { DashboardResponse } from "../types";

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
  /** Dashboard data key to read initial items from (e.g. 'finance', 'sports', 'rss'). */
  dataKey: string;
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
 * Desktop CDC hook — merges real-time SSE mutations directly into
 * the TanStack Query dashboard cache.
 *
 * In polling mode (no SSE connection), items come from the dashboard
 * query snapshot that TanStack Query manages automatically.
 *
 * In SSE mode, CDC events update the dashboard cache in-place via
 * queryClient.setQueryData, so there is no parallel state and no
 * visual flash on refetch.
 */
export function useScrollrCDC<T>({
  table,
  dataKey,
  keyOf,
  sort,
  maxItems = 50,
  validate,
}: UseScrollrCDCOptions<T>): UseScrollrCDCResult<T> {
  const queryClient = useQueryClient();

  // Read items from the dashboard query cache
  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const items = ((dashboard?.data?.[dataKey] as T[] | undefined) ?? []);

  // Listen for CDC events from the Rust SSE client and merge into cache
  useTauriListener<SSEPayload>(
    "sse-event",
    (event) => {
      const payload = event.payload;
      if (!payload?.data) return;

      // Filter records for this hook's table
      const relevant = payload.data.filter(
        (r) => r.metadata?.table_name === table,
      );
      if (relevant.length === 0) return;

      // Update the dashboard cache in-place
      queryClient.setQueryData<DashboardResponse>(
        queryKeys.dashboard,
        (old) => {
          if (!old) return old;

          let currentItems = ((old.data?.[dataKey] as T[] | undefined) ?? []);
          let next = [...currentItems];

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

          return {
            ...old,
            data: {
              ...old.data,
              [dataKey]: next,
            },
          };
        },
      );
    },
    [table, dataKey, keyOf, sort, maxItems, validate, queryClient],
  );

  return { items };
}
