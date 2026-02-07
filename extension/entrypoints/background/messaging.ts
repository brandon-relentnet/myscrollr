import type { ClientMessage, BackgroundMessage, StateSnapshotMessage } from '~/utils/messaging';
import type { ConnectionStatus, DashboardResponse } from '~/utils/types';
import { API_URL, FRONTEND_URL } from '~/utils/constants';
import { getState, setOnUpdate, mergeDashboardData, startSSE, stopSSE } from './sse';
import { login, logout, getValidToken, isAuthenticated } from './auth';
import { applyServerPreferences, initStreamsVisibility } from './preferences';

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

// ── Fetch dashboard data with auth ───────────────────────────────

async function fetchDashboardData() {
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
 * Fetches the full dashboard state and merges it into the background's
 * in-memory data. Used on login, startup, and when stream config changes
 * (so that existing items for newly-subscribed feeds are loaded immediately).
 */
export async function refreshDashboard(): Promise<void> {
  try {
    const data: DashboardResponse = await fetchDashboardData();
    mergeDashboardData(data.finance || [], data.sports || [], data.rss || []);
    broadcast({ type: 'INITIAL_DATA', payload: data });

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

        case 'REQUEST_STATUS': {
          const state = getState();
          sendResponse({
            type: 'CONNECTION_STATUS',
            status: state.connectionStatus,
          });
          return false;
        }

        case 'LOGIN': {
          login().then((success) => {
            const authed = success;
            broadcast({ type: 'AUTH_STATUS', authenticated: authed });
            sendResponse({ type: 'AUTH_STATUS', authenticated: authed });

            // If login succeeded, start SSE, fetch dashboard data, and open frontend
            if (success) {
              // Start authenticated SSE connection
              startSSE();

              // Open the frontend dashboard — Logto session cookie is shared,
              // so the frontend will auto-authenticate instantly.
              browser.tabs.create({ url: `${FRONTEND_URL}/dashboard` }).catch(() => {
                // Tab creation failed (e.g. in tests), non-critical
              });

              fetchDashboardData()
                .then((data: DashboardResponse) => {
                  mergeDashboardData(data.finance || [], data.sports || [], data.rss || []);
                  broadcast({ type: 'INITIAL_DATA', payload: data });

                  // Apply server preferences to local storage
                  if (data.preferences) {
                    applyServerPreferences(data.preferences);
                  }

                  // Initialise stream visibility from server state
                  if (data.streams) {
                    initStreamsVisibility(data.streams);
                  }
                })
                .catch((err) => {
                  console.error('[Scrollr] Dashboard fetch failed:', err);
                });
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

        case 'REQUEST_INITIAL_DATA': {
          fetchDashboardData()
            .then((data: DashboardResponse) => {
              mergeDashboardData(data.finance || [], data.sports || [], data.rss || []);
              sendResponse({ type: 'INITIAL_DATA', payload: data });

              // Apply server preferences to local storage
              if (data.preferences) {
                applyServerPreferences(data.preferences);
              }

              // Initialise stream visibility from server state
              if (data.streams) {
                initStreamsVisibility(data.streams);
              }
            })
            .catch((err) => {
              console.error('[Scrollr] Dashboard fetch failed:', err);
              sendResponse(null);
            });
          return true;
        }

        default:
          return false;
      }
    },
  );
}
