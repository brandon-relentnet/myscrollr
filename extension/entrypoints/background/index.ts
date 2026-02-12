import { startSSE, stopSSE, setupKeepAlive } from './sse';
import {
  setupBroadcasting,
  setupMessageListeners,
  startAuthenticatedDelivery,
  broadcast,
} from './messaging';
import { setOnAuthExpired, isAuthenticated } from './auth';
import { setOnStreamChanged } from './preferences';
import { setBroadcast, refreshDashboard, refreshPublicFeed } from './dashboard';
import { startPolling, stopPolling, setOnPoll, setupPollingAlarm } from './polling';
import { deliveryMode as deliveryModeStorage, subscriptionTier as subscriptionTierStorage } from '~/utils/storage';

export default defineBackground({
  type: 'module',

  main() {
    // Wire up dashboard → broadcast (avoids circular import)
    setBroadcast(broadcast);

    // Wire up stream changes → dashboard refresh (avoids circular import)
    setOnStreamChanged(() => refreshDashboard());

    // Wire up SSE → broadcast pipeline
    setupBroadcasting();

    // Wire up polling → fetch callback (decides anon vs auth based on current state)
    setOnPoll(async () => {
      const authed = await isAuthenticated();
      if (authed) {
        await refreshDashboard();
      } else {
        await refreshPublicFeed();
      }
    });

    // Set up the alarm listener for polling (must be registered synchronously)
    setupPollingAlarm();

    // Notify all UIs when auth silently expires during token refresh,
    // and tear down the authenticated SSE connection.
    setOnAuthExpired(async () => {
      stopSSE();
      stopPolling();
      broadcast({ type: 'AUTH_STATUS', authenticated: false });

      // Fall back to anonymous polling
      await deliveryModeStorage.setValue('polling');
      await subscriptionTierStorage.setValue('anonymous');
      startPolling();
    });

    // Listen for messages from popup / content scripts
    setupMessageListeners();

    // Keep MV3 service worker alive (also reconnects SSE if needed for uplink)
    setupKeepAlive();

    // ── Startup: determine initial delivery mode ─────────────────
    isAuthenticated().then(async (authed) => {
      if (authed) {
        // Authenticated user: fetch dashboard (syncs tier), then start delivery
        await refreshDashboard();
        await startAuthenticatedDelivery();
      } else {
        // Anonymous user: start polling the public feed
        await deliveryModeStorage.setValue('polling');
        await subscriptionTierStorage.setValue('anonymous');
        startPolling();
      }
    });

    console.log('[Scrollr] Background started');
  },
});
