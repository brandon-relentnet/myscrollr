import { SSE_URL, SSE_RECONNECT_BASE, SSE_RECONNECT_MAX, MAX_ITEMS } from '~/utils/constants';
import type { Trade, Game, ConnectionStatus, SSEPayload, CDCRecord } from '~/utils/types';

// ── In-memory state ──────────────────────────────────────────────

let trades: Trade[] = [];
let games: Game[] = [];
let connectionStatus: ConnectionStatus = 'disconnected';

let eventSource: EventSource | null = null;
let reconnectDelay = SSE_RECONNECT_BASE;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ── Callback for broadcasting updates ────────────────────────────

type OnUpdate = (
  type: 'stream' | 'status',
  data: SSEPayload | ConnectionStatus,
) => void;

let onUpdate: OnUpdate | null = null;

export function setOnUpdate(cb: OnUpdate) {
  onUpdate = cb;
}

// ── State accessors ──────────────────────────────────────────────

export function getState() {
  return { trades, games, connectionStatus };
}

export function mergeDashboardData(newTrades: Trade[], newGames: Game[]) {
  for (const trade of newTrades) {
    upsertTrade(trade as unknown as Record<string, unknown>);
  }
  for (const game of newGames) {
    upsertGame(game as unknown as Record<string, unknown>);
  }
}

// ── Upsert helpers ───────────────────────────────────────────────

function upsertTrade(record: Record<string, unknown>) {
  if (typeof record.symbol !== 'string') {
    console.warn('[Scrollr] Skipping trade record with missing symbol:', record);
    return;
  }
  const trade = record as unknown as Trade;
  const idx = trades.findIndex((t) => t.symbol === trade.symbol);
  if (idx >= 0) {
    trades[idx] = trade;
  } else {
    trades.push(trade);
    if (trades.length > MAX_ITEMS) trades.shift();
  }
}

function upsertGame(record: Record<string, unknown>) {
  if (record.id == null) {
    console.warn('[Scrollr] Skipping game record with missing id:', record);
    return;
  }
  const game = record as unknown as Game;
  const idx = games.findIndex((g) => String(g.id) === String(game.id));
  if (idx >= 0) {
    games[idx] = game;
  } else {
    games.push(game);
    if (games.length > MAX_ITEMS) games.shift();
  }
}

function removeGame(record: Record<string, unknown>) {
  if (record.id == null) return;
  const game = record as unknown as Game;
  games = games.filter((g) => String(g.id) !== String(game.id));
}

function removeTrade(record: Record<string, unknown>) {
  if (typeof record.symbol !== 'string') return;
  const trade = record as unknown as Trade;
  trades = trades.filter((t) => t.symbol !== trade.symbol);
}

// ── Process a single CDC record ──────────────────────────────────

function processCDCRecord(cdc: CDCRecord) {
  const table = cdc.metadata.table_name;

  if (table === 'trades') {
    if (cdc.action === 'delete') {
      removeTrade(cdc.record);
    } else {
      upsertTrade(cdc.record);
    }
  } else if (table === 'games') {
    if (cdc.action === 'delete') {
      removeGame(cdc.record);
    } else {
      upsertGame(cdc.record);
    }
  }
  // Ignore unknown tables silently (yahoo_* etc. for future use)
}

// ── SSE lifecycle ────────────────────────────────────────────────

function setStatus(status: ConnectionStatus) {
  connectionStatus = status;
  onUpdate?.('status', status);
}

export function startSSE() {
  if (eventSource) return; // Already connected

  try {
    eventSource = new EventSource(SSE_URL);

    eventSource.onopen = () => {
      reconnectDelay = SSE_RECONNECT_BASE; // Reset backoff
      setStatus('connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const payload: SSEPayload = JSON.parse(event.data);

        if (payload.data && Array.isArray(payload.data)) {
          for (const record of payload.data) {
            processCDCRecord(record);
          }
          onUpdate?.('stream', payload);
        }
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
    startSSE();
  }, reconnectDelay);
}

// ── Keepalive for MV3 service worker ─────────────────────────────

export function setupKeepAlive() {
  // Create a periodic alarm to keep the service worker alive
  browser.alarms?.create('scrollr-keepalive', { periodInMinutes: 0.5 });

  browser.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === 'scrollr-keepalive') {
      // If SSE got disconnected, reconnect
      if (connectionStatus === 'disconnected') {
        startSSE();
      }
    }
  });
}
