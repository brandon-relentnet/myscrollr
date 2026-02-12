import type {
  DashboardResponse,
  ConnectionStatus,
  CDCRecord,
  DeliveryMode,
} from './types';

// ── Background → Content Scripts / Popup ─────────────────────────

interface ConnectionStatusMessage {
  type: 'CONNECTION_STATUS';
  status: ConnectionStatus;
}

interface InitialDataMessage {
  type: 'INITIAL_DATA';
  payload: DashboardResponse;
}

interface AuthStatusMessage {
  type: 'AUTH_STATUS';
  authenticated: boolean;
}

/**
 * A batch of CDC records for a specific table, forwarded from the
 * background's SSE stream to content scripts that subscribed to it.
 */
interface CDCBatchMessage {
  type: 'CDC_BATCH';
  table: string;
  records: CDCRecord[];
}

/**
 * Full state snapshot sent in response to GET_STATE.
 * Includes connection status, auth state, delivery mode, and the raw dashboard
 * payload so each FeedTab can extract its own initial data.
 */
export interface StateSnapshotMessage {
  type: 'STATE_SNAPSHOT';
  dashboard: DashboardResponse | null;
  connectionStatus: ConnectionStatus;
  authenticated: boolean;
  deliveryMode: DeliveryMode;
}

export type BackgroundMessage =
  | ConnectionStatusMessage
  | InitialDataMessage
  | AuthStatusMessage
  | CDCBatchMessage
  | StateSnapshotMessage;

// ── Content Script / Popup → Background ──────────────────────────

interface GetStateMessage {
  type: 'GET_STATE';
}

interface LoginMessage {
  type: 'LOGIN';
}

interface LogoutMessage {
  type: 'LOGOUT';
}

/**
 * Content script tells the background which CDC tables it wants
 * to receive records for. Sent when a FeedTab mounts/unmounts.
 */
export interface SubscribeCDCMessage {
  type: 'SUBSCRIBE_CDC';
  tables: string[];
}

export interface UnsubscribeCDCMessage {
  type: 'UNSUBSCRIBE_CDC';
  tables: string[];
}

/**
 * Sent by content scripts when the website dispatches a config-changed
 * event (e.g. stream CRUD or preference update). Background immediately
 * fetches fresh dashboard data and broadcasts INITIAL_DATA.
 */
interface ForceRefreshMessage {
  type: 'FORCE_REFRESH';
}

export type ClientMessage =
  | GetStateMessage
  | LoginMessage
  | LogoutMessage
  | SubscribeCDCMessage
  | UnsubscribeCDCMessage
  | ForceRefreshMessage;
