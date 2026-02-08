import type {
  Trade,
  Game,
  RssItem,
  DashboardResponse,
  ConnectionStatus,
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

export interface StateUpdateMessage {
  type: 'STATE_UPDATE';
  trades: Trade[];
  games: Game[];
  rssItems: RssItem[];
}

export interface StateSnapshotMessage {
  type: 'STATE_SNAPSHOT';
  trades: Trade[];
  games: Game[];
  rssItems: RssItem[];
  connectionStatus: ConnectionStatus;
  authenticated: boolean;
}

export type BackgroundMessage =
  | ConnectionStatusMessage
  | InitialDataMessage
  | AuthStatusMessage
  | StateUpdateMessage
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

export type ClientMessage =
  | GetStateMessage
  | LoginMessage
  | LogoutMessage;
