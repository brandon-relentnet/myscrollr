/**
 * TanStack Router configuration with memory history.
 *
 * The desktop app has no URL bar, so we use createMemoryHistory
 * instead of browser history. Navigation state is persisted to
 * localStorage so the last-visited view is restored on relaunch.
 */
import {
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { QueryClient } from "@tanstack/react-query";

// ── Persistence ──────────────────────────────────────────────────

const HISTORY_KEY = "scrollr:lastRoute";

function getInitialEntry(): string {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) return saved;
  } catch {
    // ignore
  }
  return "/";
}

// ── Router factory ───────────────────────────────────────────────

export function createAppRouter(queryClient: QueryClient) {
  const memoryHistory = createMemoryHistory({
    initialEntries: [getInitialEntry()],
  });

  const router = createRouter({
    routeTree,
    history: memoryHistory,
    context: { queryClient },
    defaultPreload: "intent",
  });

  // Persist the current route on every navigation
  router.subscribe("onResolved", () => {
    try {
      const path = router.state.location.pathname;
      localStorage.setItem(HISTORY_KEY, path);
    } catch {
      // ignore
    }
  });

  return router;
}

// ── Type registration ────────────────────────────────────────────

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
