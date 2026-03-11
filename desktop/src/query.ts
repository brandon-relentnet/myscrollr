/**
 * TanStack Query client configuration.
 *
 * Shared between both windows (each gets its own instance since
 * they are separate browser contexts in Tauri).
 */
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 10s stale time — matches the previous manual 10s throttle
        staleTime: 10_000,
        // 5 min garbage collection
        gcTime: 5 * 60 * 1000,
        // Refetch when the window regains focus
        refetchOnWindowFocus: true,
        // Retry once on failure
        retry: 1,
      },
    },
  });
}
