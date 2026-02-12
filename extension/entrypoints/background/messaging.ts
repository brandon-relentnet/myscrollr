import type { ClientMessage, BackgroundMessage, StateSnapshotMessage } from '~/utils/messaging';
import type { CDCRecord } from '~/utils/types';
import { FRONTEND_URL } from '~/utils/constants';
import {
  deliveryMode as deliveryModeStorage,
  subscriptionTier as subscriptionTierStorage,
} from '~/utils/storage';
import { getConnectionStatus, getLastDashboard, setOnStatusChange, setOnCDCRecords } from './sse';
import { login, logout, isAuthenticated } from './auth';
import { refreshDashboard } from './dashboard';
import { startPolling, stopPolling } from './polling';

// ── Per-tab CDC subscriptions ─────────────────────────────────────
// Maps tab ID → set of table names the tab wants CDC records for.
// The popup uses `undefined` as its tab ID (it's not a tab).

const tabSubscriptions = new Map<number | undefined, Set<string>>();

function addSubscription(tabId: number | undefined, tables: string[]) {
  let subs = tabSubscriptions.get(tabId);
  if (!subs) {
    subs = new Set();
    tabSubscriptions.set(tabId, subs);
  }
  for (const t of tables) subs.add(t);
}

function removeSubscription(tabId: number | undefined, tables: string[]) {
  const subs = tabSubscriptions.get(tabId);
  if (!subs) return;
  for (const t of tables) subs.delete(t);
  if (subs.size === 0) tabSubscriptions.delete(tabId);
}

/** Clean up subscriptions when a tab is closed. */
function setupTabCleanup() {
  browser.tabs.onRemoved?.addListener((tabId) => {
    tabSubscriptions.delete(tabId);
  });
}

// ── Delivery mode helpers ─────────────────────────────────────────

/**
 * Starts the appropriate delivery mode for an authenticated user based
 * on their subscription tier (already synced to storage by refreshDashboard).
 */
export async function startAuthenticatedDelivery(): Promise<void> {
  const tier = await subscriptionTierStorage.getValue();

  if (tier === 'uplink') {
    // Uplink tier gets real-time SSE + CDC push
    await deliveryModeStorage.setValue('sse');
    startSSE();
  } else {
    // Free tier gets polling at 30s intervals
    await deliveryModeStorage.setValue('polling');
    startPolling();
  }
}

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

/**
 * Send a CDC batch only to tabs that subscribed to the given table.
 */
function sendCDCBatch(table: string, records: CDCRecord[]) {
  const message: BackgroundMessage = {
    type: 'CDC_BATCH',
    table,
    records,
  };

  // Check popup subscription (tabId = undefined)
  if (tabSubscriptions.get(undefined)?.has(table)) {
    browser.runtime.sendMessage(message).catch(() => {});
  }

  // Send to subscribed tabs only
  for (const [tabId, subs] of tabSubscriptions) {
    if (tabId != null && subs.has(table)) {
      browser.tabs.sendMessage(tabId, message).catch(() => {});
    }
  }
}

// ── SSE callback wiring ──────────────────────────────────────────

export function setupBroadcasting() {
  setOnStatusChange((status) => {
    broadcast({ type: 'CONNECTION_STATUS', status });
  });

  setOnCDCRecords((table, records) => {
    sendCDCBatch(table, records);
  });
}

// ── Message listeners ────────────────────────────────────────────

export function setupMessageListeners() {
  setupTabCleanup();

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      const msg = message as ClientMessage;
      const tabId = sender.tab?.id ?? undefined;

      switch (msg.type) {
        case 'GET_STATE': {
          Promise.all([isAuthenticated(), deliveryModeStorage.getValue()]).then(
            ([authed, mode]) => {
              const snapshot: StateSnapshotMessage = {
                type: 'STATE_SNAPSHOT',
                dashboard: getLastDashboard(),
                connectionStatus: getConnectionStatus(),
                authenticated: authed,
                deliveryMode: mode,
              };
              sendResponse(snapshot);
            },
          );
          return true; // Keep channel open for async response
        }

        case 'SUBSCRIBE_CDC': {
          addSubscription(tabId, msg.tables);
          sendResponse({ ok: true });
          return false;
        }

        case 'UNSUBSCRIBE_CDC': {
          removeSubscription(tabId, msg.tables);
          sendResponse({ ok: true });
          return false;
        }

        case 'LOGIN': {
          login().then(async (success) => {
            broadcast({ type: 'AUTH_STATUS', authenticated: success });
            sendResponse({ type: 'AUTH_STATUS', authenticated: success });

            if (success) {
              browser.tabs.create({ url: `${FRONTEND_URL}/dashboard` }).catch(() => {});

              // Stop anonymous polling before switching to authenticated mode
              stopPolling();

              // Fetch dashboard first — this syncs subscription_tier to storage
              await refreshDashboard();

              // Now start the appropriate delivery mode based on tier
              await startAuthenticatedDelivery();
            }
          });
          return true;
        }

        case 'LOGOUT': {
          logout().then(async () => {
            // Tear down authenticated connections
            stopSSE();
            stopPolling();

            // Reset to anonymous mode
            await deliveryModeStorage.setValue('polling');
            await subscriptionTierStorage.setValue('anonymous');

            broadcast({ type: 'AUTH_STATUS', authenticated: false });
            sendResponse({ type: 'AUTH_STATUS', authenticated: false });

            // Start anonymous polling
            startPolling();
          });
          return true;
        }

        case 'FORCE_REFRESH': {
          // Content script bridge: website changed config, immediately re-fetch
          refreshDashboard().then(() => {
            sendResponse({ ok: true });
          });
          return true;
        }

        default:
          return false;
      }
    },
  );
}

// Lazy imports to avoid circular dependency with sse.ts
import { startSSE, stopSSE } from './sse';
