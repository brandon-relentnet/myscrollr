// ── Finance ──────────────────────────────────────────────────────

export interface Trade {
  id?: number;
  symbol: string;
  price: number | string;
  previous_close?: number;
  price_change?: number | string;
  percentage_change?: number | string;
  direction?: 'up' | 'down';
  last_updated?: string;
}

// ── Sports ───────────────────────────────────────────────────────

export interface Game {
  id: number | string;
  league: string;
  external_game_id: string;
  link: string;
  home_team_name: string;
  home_team_logo: string;
  home_team_score: number | string;
  away_team_name: string;
  away_team_logo: string;
  away_team_score: number | string;
  start_time: string;
  short_detail?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
}

// ── User Preferences ─────────────────────────────────────────────

export interface UserPreferences {
  feed_mode: FeedMode;
  feed_position: FeedPosition;
  feed_behavior: FeedBehavior;
  feed_enabled: boolean;
  active_tabs: FeedCategory[];
  enabled_sites: string[];
  disabled_sites: string[];
  updated_at: string;
}

// ── API Responses ────────────────────────────────────────────────

export interface DashboardResponse {
  finance: Trade[];
  sports: Game[];
  preferences?: UserPreferences;
}

// ── SSE / CDC Payloads ───────────────────────────────────────────

export interface CDCRecord {
  action: 'insert' | 'update' | 'delete';
  changes: Record<string, unknown>;
  metadata: { table_name: string };
  record: Record<string, unknown>;
}

export interface SSEPayload {
  data: CDCRecord[];
}

// ── Connection ───────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

// ── Preferences ──────────────────────────────────────────────────

export type FeedPosition = 'top' | 'bottom';
export type FeedMode = 'comfort' | 'compact';
export type FeedBehavior = 'overlay' | 'push';
export type FeedCategory = 'finance' | 'sports';
