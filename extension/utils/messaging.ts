import type {
  Trade,
  Game,
  SSEPayload,
  DashboardResponse,
  ConnectionStatus,
} from './types';

// ── Background → Content Scripts / Popup ─────────────────────────

export interface StreamDataMessage {
  type: 'STREAM_DATA';
  payload: SSEPayload;
}

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
}

export interface StateSnapshotMessage {
  type: 'STATE_SNAPSHOT';
  trades: Trade[];
  games: Game[];
  connectionStatus: ConnectionStatus;
  authenticated: boolean;
}

export type BackgroundMessage =
  | StreamDataMessage
  | ConnectionStatusMessage
  | InitialDataMessage
  | AuthStatusMessage
  | StateUpdateMessage
  | StateSnapshotMessage;

// ── Content Script / Popup → Background ──────────────────────────

export interface GetStateMessage {
  type: 'GET_STATE';
}

export interface RequestStatusMessage {
  type: 'REQUEST_STATUS';
}

export interface RequestInitialDataMessage {
  type: 'REQUEST_INITIAL_DATA';
}

export interface LoginMessage {
  type: 'LOGIN';
}

export interface LogoutMessage {
  type: 'LOGOUT';
}

export type ClientMessage =
  | GetStateMessage
  | RequestStatusMessage
  | RequestInitialDataMessage
  | LoginMessage
  | LogoutMessage;
