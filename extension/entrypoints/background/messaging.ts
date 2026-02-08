import type { ClientMessage, BackgroundMessage, StateSnapshotMessage } from '~/utils/messaging';
import type { ConnectionStatus } from '~/utils/types';
import { FRONTEND_URL } from '~/utils/constants';
import { getState, setOnUpdate, startSSE, stopSSE } from './sse';
import { login, logout, isAuthenticated } from './auth';
import { refreshDashboard } from './dashboard';

// ── Broadcast to all listeners ───────────────────────────────────

export function broadcast(message: BackgroundMessage) {
  // Send to popup / options (extension pages)
  browser.runtime.sendMessage(message).catch(() => {
    // No listeners — popup/options not open, ignore
  });

  // Send to all content scripts in all tabs
  browser.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) {
        browser.tabs.sendMessage(tab.id, message).catch(() => {
          // Content script not injected in this tab, ignore
        });
      }
    }
  });
}

// ── SSE update callback ──────────────────────────────────────────

export function setupBroadcasting() {
  setOnUpdate((type, data) => {
    if (type === 'stream') {
      // Broadcast pre-processed state instead of raw CDC payloads
      const state = getState();
      broadcast({
        type: 'STATE_UPDATE',
        trades: state.trades,
        games: state.games,
        rssItems: state.rssItems,
      });
    } else if (type === 'status') {
      broadcast({
        type: 'CONNECTION_STATUS',
        status: data as ConnectionStatus,
      });
    }
  });
}

// ── Message listeners ────────────────────────────────────────────

export function setupMessageListeners() {
  browser.runtime.onMessage.addListener(
    (message: unknown, _sender, sendResponse) => {
      const msg = message as ClientMessage;

      switch (msg.type) {
        case 'GET_STATE': {
          const state = getState();
          isAuthenticated().then((authed) => {
            const snapshot: StateSnapshotMessage = {
              type: 'STATE_SNAPSHOT',
              trades: state.trades,
              games: state.games,
              rssItems: state.rssItems,
              connectionStatus: state.connectionStatus,
              authenticated: authed,
            };
            sendResponse(snapshot);
          });
          return true; // Keep channel open for async response
        }

        case 'LOGIN': {
          login().then((success) => {
            broadcast({ type: 'AUTH_STATUS', authenticated: success });
            sendResponse({ type: 'AUTH_STATUS', authenticated: success });

            if (success) {
              startSSE();
              browser.tabs.create({ url: `${FRONTEND_URL}/dashboard` }).catch(() => {});
              refreshDashboard();
            }
          });
          return true;
        }

        case 'LOGOUT': {
          logout().then(() => {
            // Tear down authenticated SSE connection before broadcasting
            stopSSE();
            broadcast({ type: 'AUTH_STATUS', authenticated: false });
            sendResponse({ type: 'AUTH_STATUS', authenticated: false });
          });
          return true;
        }

        default:
          return false;
      }
    },
  );
}
