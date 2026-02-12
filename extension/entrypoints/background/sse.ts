import { SSE_URL, SSE_RECONNECT_BASE, SSE_RECONNECT_MAX } from '~/utils/constants';
import type { ConnectionStatus, SSEPayload, CDCRecord, DashboardResponse } from '~/utils/types';
import { handlePreferenceUpdate, handleStreamUpdate, handleStreamDelete } from './preferences';
import { getValidToken, isAuthenticated } from './auth';
import { deliveryMode as deliveryModeStorage } from '~/utils/storage';

// ── Connection state ──────────────────────────────────────────────

let connectionStatus: ConnectionStatus = 'disconnected';
let eventSource: EventSource | null = null;
let reconnectDelay = SSE_RECONNECT_BASE;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ── Dashboard snapshot ────────────────────────────────────────────
// Stored so we can hand it to new content scripts via GET_STATE.

let lastDashboard: DashboardResponse | null = null;

export function getLastDashboard(): DashboardResponse | null {
  return lastDashboard;
}

export function setLastDashboard(data: DashboardResponse) {
  lastDashboard = data;
}

// ── Callbacks ─────────────────────────────────────────────────────

type OnStatusChange = (status: ConnectionStatus) => void;
type OnCDCRecords = (table: string, records: CDCRecord[]) => void;

let onStatusChange: OnStatusChange | null = null;
let onCDCRecords: OnCDCRecords | null = null;

export function setOnStatusChange(cb: OnStatusChange) {
  onStatusChange = cb;
}

export function setOnCDCRecords(cb: OnCDCRecords) {
  onCDCRecords = cb;
}

// ── State accessors ──────────────────────────────────────────────

export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

// ── Process SSE payload ──────────────────────────────────────────

function processPayload(payload: SSEPayload) {
  if (!payload.data || !Array.isArray(payload.data)) return;

  // Group CDC records by table for efficient batching
  const byTable = new Map<string, CDCRecord[]>();

  for (const cdc of payload.data) {
    const table = cdc.metadata.table_name;

    // Framework tables are handled internally, not forwarded
    if (table === 'user_preferences') {
      if (cdc.action === 'insert' || cdc.action === 'update') {
        handlePreferenceUpdate(cdc.record);
      }
      continue;
    }

    if (table === 'user_streams') {
      if (cdc.action === 'insert' || cdc.action === 'update') {
        handleStreamUpdate(cdc.record);
      } else if (cdc.action === 'delete') {
        handleStreamDelete(cdc.record);
      }
      continue;
    }

    // Integration CDC records — batch by table for forwarding
    if (!byTable.has(table)) {
      byTable.set(table, []);
    }
    byTable.get(table)!.push(cdc);
  }

  // Forward each table's batch to the messaging layer
  for (const [table, records] of byTable) {
    onCDCRecords?.(table, records);
  }
}

// ── SSE lifecycle ────────────────────────────────────────────────

function setStatus(status: ConnectionStatus) {
  connectionStatus = status;
  onStatusChange?.(status);
}

/**
 * Starts an authenticated SSE connection. Acquires a valid JWT token
 * and passes it as a query parameter since EventSource does not support
 * custom headers. If not authenticated, does nothing.
 */
export async function startSSE() {
  if (eventSource) return; // Already connected

  // Require authentication — don't connect without a valid token
  const authed = await isAuthenticated();
  if (!authed) {
    setStatus('disconnected');
    return;
  }

  const token = await getValidToken();
  if (!token) {
    setStatus('disconnected');
    return;
  }

  try {
    eventSource = new EventSource(`${SSE_URL}?token=${encodeURIComponent(token)}`);

    eventSource.onopen = () => {
      reconnectDelay = SSE_RECONNECT_BASE; // Reset backoff
      setStatus('connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const payload: SSEPayload = JSON.parse(event.data);
        processPayload(payload);
      } catch (err) {
        console.warn('[Scrollr] Malformed SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      cleanup();
      setStatus('reconnecting');
      scheduleReconnect();
    };
  } catch (err) {
    console.warn('[Scrollr] SSE connection failed:', err);
    setStatus('disconnected');
    scheduleReconnect();
  }
}

export function stopSSE() {
  cleanup();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDelay = SSE_RECONNECT_BASE; // Reset backoff on explicit stop
  setStatus('disconnected');
}

function cleanup() {
  if (eventSource) {
    eventSource.onopen = null;
    eventSource.onmessage = null;
    eventSource.onerror = null;
    eventSource.close();
    eventSource = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, SSE_RECONNECT_MAX);
    startSSE(); // Will re-acquire token automatically
  }, reconnectDelay);
}

// ── Keepalive for MV3 service worker ─────────────────────────────

export function setupKeepAlive() {
  // Create a periodic alarm to keep the service worker alive
  browser.alarms?.create('scrollr-keepalive', { periodInMinutes: 0.5 });

  browser.alarms?.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'scrollr-keepalive') {
      // Only try to reconnect SSE for uplink users
      const mode = await deliveryModeStorage.getValue();
      if (mode === 'sse' && connectionStatus === 'disconnected') {
        startSSE();
      }
    }
  });
}
