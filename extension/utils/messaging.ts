import type {
  DashboardResponse,
  ConnectionStatus,
  CDCRecord,
} from './types';

// ── Background → Content Scripts / Popup ─────────────────────────

export interface ConnectionStatusMessage {
  type: 'CONNECTION_STATUS';
  status: ConnectionStatus;
}

export interface InitialDataMessage {
  type: 'INITIAL_DATA';
  payload: DashboardResponse;
}

export interface AuthStatusMessage {
  type: 'AUTH_STATUS';
  authenticated: boolean;
}

/**
 * A batch of CDC records for a specific table, forwarded from the
 * background's SSE stream to content scripts that subscribed to it.
 */
export interface CDCBatchMessage {
  type: 'CDC_BATCH';
  table: string;
  records: CDCRecord[];
}

/**
 * Full state snapshot sent in response to GET_STATE.
 * Includes connection status, auth state, and the raw dashboard
 * payload so each FeedTab can extract its own initial data.
 */
export interface StateSnapshotMessage {
  type: 'STATE_SNAPSHOT';
  dashboard: DashboardResponse | null;
  connectionStatus: ConnectionStatus;
  authenticated: boolean;
}

export type BackgroundMessage =
  | ConnectionStatusMessage
  | InitialDataMessage
  | AuthStatusMessage
  | CDCBatchMessage
  | StateSnapshotMessage;

// ── Content Script / Popup → Background ──────────────────────────

export interface GetStateMessage {
  type: 'GET_STATE';
}

export interface LoginMessage {
  type: 'LOGIN';
}

export interface LogoutMessage {
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

export type ClientMessage =
  | GetStateMessage
  | LoginMessage
  | LogoutMessage
  | SubscribeCDCMessage
  | UnsubscribeCDCMessage;
