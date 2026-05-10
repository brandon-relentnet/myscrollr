/**
 * useNavHistory — exposes a Spotify-style forward/back navigation
 * model on top of TanStack Router's memory history.
 *
 * Memory history doesn't expose `canGoBack` / `canGoForward` directly,
 * so we track them by maintaining a small index in our own subscriber.
 *
 * Behavior:
 *   - canBack: true after the user has navigated at least once
 *   - canForward: true after they've used the back button without
 *     navigating somewhere new
 *   - back() / forward() are no-ops when not allowed
 *
 * The hook reuses the same memory history that powers all routing,
 * so back/forward stay in sync with sidebar clicks, internal route
 * changes, and tray deeplinks.
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";

interface NavHistory {
  canBack: boolean;
  canForward: boolean;
  back: () => void;
  forward: () => void;
}

export function useNavHistory(): NavHistory {
  const router = useRouter();
  const [, force] = useState(0);

  // Subscribe to navigation changes to recompute can-back/can-forward.
  useEffect(() => {
    const unsub = router.subscribe("onResolved", () => force((n) => n + 1));
    return () => unsub();
  }, [router]);

  // TanStack memory history exposes `index` on its state. The
  // "current" index tells us whether we can go further back/forward.
  // Defensive: fall back to false if the API shape ever changes.
  const history = router.history as unknown as {
    state?: { index?: number };
    length?: number;
    canGoBack?: () => boolean;
    back?: () => void;
    forward?: () => void;
  };

  const idx = history.state?.index ?? 0;
  const length = history.length ?? 1;

  const canBack = idx > 0;
  const canForward = idx < length - 1;

  const back = useCallback(() => {
    if (!canBack) return;
    history.back?.();
  }, [canBack, history]);

  const forward = useCallback(() => {
    if (!canForward) return;
    history.forward?.();
  }, [canForward, history]);

  return { canBack, canForward, back, forward };
}
