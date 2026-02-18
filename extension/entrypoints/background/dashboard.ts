import type { BackgroundMessage } from "~/utils/messaging";
import type { DashboardResponse, PublicFeedResponse } from "~/utils/types";
import { API_URL } from "~/utils/constants";
import { getValidToken } from "./auth";
import { setLastDashboard } from "./sse";
import { applyServerPreferences, initChannelsVisibility } from "./preferences";
import { subscriptionTier } from "~/utils/storage";

// ── Broadcast callback (set by index.ts to avoid circular imports) ──

let broadcastFn: ((message: BackgroundMessage) => void) | null = null;

export function setBroadcast(fn: (message: BackgroundMessage) => void) {
  broadcastFn = fn;
}

// ── Dashboard data fetching (authenticated) ──────────────────────────

async function fetchDashboardData(): Promise<DashboardResponse> {
  const token = await getValidToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_URL}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[Scrollr] Dashboard fetch failed:", response.status, body);
    throw new Error(`Dashboard fetch failed: ${response.status}`);
  }

  return response.json();
}

// ── Public feed fetching (anonymous) ─────────────────────────────────

async function fetchPublicFeed(): Promise<DashboardResponse> {
  const response = await fetch(`${API_URL}/public/feed`);

  if (!response.ok) {
    const body = await response.text();
    console.error("[Scrollr] Public feed fetch failed:", response.status, body);
    throw new Error(`Public feed fetch failed: ${response.status}`);
  }

  const publicData: PublicFeedResponse = await response.json();

  // Normalize into DashboardResponse shape so downstream code is unified
  return {
    data: publicData.data,
    // No preferences or channels for anonymous users
  };
}

/**
 * Fetches the full dashboard state and stores it as the latest snapshot.
 * Used on login, startup, and when channel config changes (so that
 * existing items for newly-subscribed feeds are loaded immediately).
 */
export async function refreshDashboard(): Promise<void> {
  try {
    const data: DashboardResponse = await fetchDashboardData();

    // Store as latest snapshot so GET_STATE can return it
    setLastDashboard(data);

    // Broadcast to all content scripts / popup
    broadcastFn?.({ type: "INITIAL_DATA", payload: data });

    if (data.preferences) {
      applyServerPreferences(data.preferences);

      // Sync subscription tier from server to local storage
      if (data.preferences.subscription_tier) {
        await subscriptionTier.setValue(data.preferences.subscription_tier);
      }
    }
    if (data.channels) {
      initChannelsVisibility(data.channels);
    }
  } catch (err) {
    console.error("[Scrollr] Dashboard refresh failed:", err);
  }
}

/**
 * Fetches the public feed (anonymous, no auth) and broadcasts it.
 * Used for anonymous polling — finance + sports data only.
 */
export async function refreshPublicFeed(): Promise<void> {
  try {
    const data: DashboardResponse = await fetchPublicFeed();

    // Store as latest snapshot so GET_STATE can return it
    setLastDashboard(data);

    // Broadcast to all content scripts / popup
    broadcastFn?.({ type: "INITIAL_DATA", payload: data });
  } catch (err) {
    console.error("[Scrollr] Public feed refresh failed:", err);
  }
}
