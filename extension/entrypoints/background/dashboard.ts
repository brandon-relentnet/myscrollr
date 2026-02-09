import type { BackgroundMessage } from '~/utils/messaging';
import type { DashboardResponse } from '~/utils/types';
import { API_URL } from '~/utils/constants';
import { getValidToken } from './auth';
import { setLastDashboard } from './sse';
import { applyServerPreferences, initStreamsVisibility } from './preferences';

// ── Broadcast callback (set by index.ts to avoid circular imports) ──

let broadcastFn: ((message: BackgroundMessage) => void) | null = null;

export function setBroadcast(fn: (message: BackgroundMessage) => void) {
  broadcastFn = fn;
}

// ── Dashboard data fetching ──────────────────────────────────────────

async function fetchDashboardData(): Promise<DashboardResponse> {
  const token = await getValidToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_URL}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('[Scrollr] Dashboard fetch failed:', response.status, body);
    throw new Error(`Dashboard fetch failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetches the full dashboard state and stores it as the latest snapshot.
 * Used on login, startup, and when stream config changes (so that
 * existing items for newly-subscribed feeds are loaded immediately).
 */
export async function refreshDashboard(): Promise<void> {
  try {
    const data: DashboardResponse = await fetchDashboardData();

    // Store as latest snapshot so GET_STATE can return it
    setLastDashboard(data);

    // Broadcast to all content scripts / popup
    broadcastFn?.({ type: 'INITIAL_DATA', payload: data });

    if (data.preferences) {
      applyServerPreferences(data.preferences);
    }
    if (data.streams) {
      initStreamsVisibility(data.streams);
    }
  } catch (err) {
    console.error('[Scrollr] Dashboard refresh failed:', err);
  }
}
