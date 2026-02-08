import { startSSE, stopSSE, setupKeepAlive } from './sse';
import { setupBroadcasting, setupMessageListeners, broadcast } from './messaging';
import { setOnAuthExpired, isAuthenticated } from './auth';
import { setOnStreamChanged } from './preferences';
import { setBroadcast, refreshDashboard } from './dashboard';

export default defineBackground({
  type: 'module',

  main() {
    // Wire up dashboard → broadcast (avoids circular import)
    setBroadcast(broadcast);

    // Wire up stream changes → dashboard refresh (avoids circular import)
    setOnStreamChanged(() => refreshDashboard());

    // Wire up SSE → broadcast pipeline
    setupBroadcasting();

    // Notify all UIs when auth silently expires during token refresh,
    // and tear down the authenticated SSE connection.
    setOnAuthExpired(() => {
      stopSSE();
      broadcast({ type: 'AUTH_STATUS', authenticated: false });
    });

    // Listen for messages from popup / content scripts
    setupMessageListeners();

    // Keep MV3 service worker alive
    setupKeepAlive();

    // If already authenticated (e.g., token persisted from previous session),
    // start SSE and sync preferences from the server.
    isAuthenticated().then(async (authed) => {
      if (!authed) return;
      startSSE();
      await refreshDashboard();
    });

    console.log('[Scrollr] Background started');
  },
});
