// ── Finance ──────────────────────────────────────────────────────

export interface Trade {
  id?: number;
  symbol: string;
  price: number | string;
  previous_close?: number;
  price_change?: number | string;
  percentage_change?: number | string;
  direction?: "up" | "down";
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

// ── RSS ─────────────────────────────────────────────────────────

export interface RssItem {
  id: number;
  feed_url: string;
  guid: string;
  title: string;
  link: string;
  description: string;
  source_name: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── User Preferences ─────────────────────────────────────────────

export interface UserPreferences {
  feed_mode: FeedMode;
  feed_position: FeedPosition;
  feed_behavior: FeedBehavior;
  feed_enabled: boolean;
  enabled_sites: string[];
  disabled_sites: string[];
  subscription_tier?: SubscriptionTier;
  updated_at: string;
}

// ── User Channels ────────────────────────────────────────────────

export interface UserChannel {
  id: number;
  logto_sub: string;
  channel_type: "finance" | "sports" | "fantasy" | "rss";
  enabled: boolean;
  visible: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── API Responses ────────────────────────────────────────────────

export interface DashboardResponse {
  data: {
    finance?: Trade[];
    sports?: Game[];
    rss?: RssItem[];
    [key: string]: unknown;
  };
  preferences?: UserPreferences;
  channels?: UserChannel[];
}

/**
 * Response from GET /public/feed for anonymous users.
 * Contains only finance + sports data, no preferences or channels.
 */
export interface PublicFeedResponse {
  data: {
    finance?: Trade[];
    sports?: Game[];
    [key: string]: unknown;
  };
}

// ── SSE / CDC Payloads ───────────────────────────────────────────

export interface CDCRecord {
  action: "insert" | "update" | "delete";
  changes: Record<string, unknown>;
  metadata: { table_name: string };
  record: Record<string, unknown>;
}

export interface SSEPayload {
  data: CDCRecord[];
}

// ── Connection ───────────────────────────────────────────────────

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

// ── Preferences ──────────────────────────────────────────────────

export type FeedPosition = "top" | "bottom";
export type FeedMode = "comfort" | "compact";
export type FeedBehavior = "overlay" | "push";

// ── Tiered delivery ──────────────────────────────────────────────

export type DeliveryMode = "polling" | "sse";
export type SubscriptionTier = "anonymous" | "free" | "uplink";
