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

/**
 * Sent by the background to content scripts on myscrollr.com tabs after an
 * extension-initiated login or logout. The content script relays the event
 * to the website via CustomEvent so the website can sync its auth state.
 */
interface DispatchAuthEventMessage {
  type: 'DISPATCH_AUTH_EVENT';
  event: 'login' | 'logout';
  tokens?: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number;
  };
}

export type BackgroundMessage =
  | ConnectionStatusMessage
  | InitialDataMessage
  | AuthStatusMessage
  | CDCBatchMessage
  | StateSnapshotMessage
  | DispatchAuthEventMessage;

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

/**
 * Sent by the content script on myscrollr.com when the website dispatches
 * a scrollr:auth-login CustomEvent after a successful Logto sign-in.
 * Contains the website's access token (and optional refresh token) so the
 * extension can authenticate without a separate PKCE flow.
 */
export interface AuthSyncLoginMessage {
  type: 'AUTH_SYNC_LOGIN';
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

/**
 * Sent by the content script on myscrollr.com when the website dispatches
 * a scrollr:auth-logout CustomEvent before the user signs out.
 */
interface AuthSyncLogoutMessage {
  type: 'AUTH_SYNC_LOGOUT';
}

export type ClientMessage =
  | GetStateMessage
  | LoginMessage
  | LogoutMessage
  | SubscribeCDCMessage
  | UnsubscribeCDCMessage
  | ForceRefreshMessage
  | AuthSyncLoginMessage
  | AuthSyncLogoutMessage;
