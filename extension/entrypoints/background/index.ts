import { startSSE, setupKeepAlive } from './sse';
import { setupBroadcasting, setupMessageListeners, broadcast } from './messaging';
import { setOnAuthExpired } from './auth';

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

    console.log('[Scrollr] Background started');
  },
});
