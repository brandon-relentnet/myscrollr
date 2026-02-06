import { startSSE, setupKeepAlive, mergeDashboardData } from './sse';
import { setupBroadcasting, setupMessageListeners, broadcast } from './messaging';
import { setOnAuthExpired, isAuthenticated, getValidToken } from './auth';
import { applyServerPreferences } from './preferences';
import { API_URL } from '~/utils/constants';
import type { DashboardResponse } from '~/utils/types';

export default defineBackground({
  type: 'module',

  main() {
    // Wire up SSE → broadcast pipeline
    setupBroadcasting();

    // Notify all UIs when auth silently expires during token refresh
    setOnAuthExpired(() => {
      broadcast({ type: 'AUTH_STATUS', authenticated: false });
    });

    // Start the SSE connection to the API
    startSSE();

    // Listen for messages from popup / content scripts
    setupMessageListeners();

    // Keep MV3 service worker alive
    setupKeepAlive();

    // If already authenticated (e.g., token persisted from previous session), sync preferences
    isAuthenticated().then(async (authed) => {
      if (!authed) return;
      try {
        const token = await getValidToken();
        if (!token) return;
        const response = await fetch(`${API_URL}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data: DashboardResponse = await response.json();
        mergeDashboardData(data.finance || [], data.sports || []);
        broadcast({ type: 'INITIAL_DATA', payload: data });
        if (data.preferences) {
          await applyServerPreferences(data.preferences);
        }
      } catch {
        // Non-critical — preferences will sync on next login or CDC event
      }
    });

    console.log('[Scrollr] Background started');
  },
});
