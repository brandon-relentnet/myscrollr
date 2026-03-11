/**
 * Desktop-local type definitions.
 *
 * Consolidated from extension/utils/types, extension/channels/types,
 * extension/widgets/types, and myscrollr.com/src/channels/types.
 * The desktop is a standalone codebase — no cross-project imports.
 */

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
  sport: string;
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
  status_short?: string;
  status_long?: string;
  timer?: string;
  venue?: string;
  season?: string;
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

// ── API Responses ────────────────────────────────────────────────

export interface DashboardResponse {
  data: {
    finance?: Trade[];
    sports?: Game[];
    rss?: RssItem[];
    [key: string]: unknown;
  };
  preferences?: {
    feed_mode: FeedMode;
    feed_position: "top" | "bottom";
    feed_behavior: "overlay" | "push";
    feed_enabled: boolean;
    enabled_sites: string[];
    disabled_sites: string[];
    subscription_tier?: "anonymous" | "free" | "uplink" | "uplink_unlimited";
    updated_at: string;
  };
  channels?: Array<{
    id: number;
    logto_sub: string;
    channel_type: "finance" | "sports" | "fantasy" | "rss";
    enabled: boolean;
    visible: boolean;
    config: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>;
}

// ── Enums ────────────────────────────────────────────────────────

export type FeedMode = "comfort" | "compact";
export type DeliveryMode = "polling" | "sse";

// ── Component Contracts ──────────────────────────────────────────

/** Props passed to every FeedTab component (channels and widgets). */
export interface FeedTabProps {
  /** Display density — 'comfort' shows more detail, 'compact' is denser. */
  mode: FeedMode;
  /**
   * Per-channel JSONB config from user_channels.config.
   * Each channel decides what goes here (e.g., selected RSS feeds).
   */
  channelConfig: Record<string, unknown>;
}

/** Structured info content for the Info tab. */
interface SourceInfo {
  /** What this source is and what it does. */
  about: string;
  /** How to use it (rendered as bullet points). */
  usage: string[];
}

/** Manifest describing a single channel. */
export interface ChannelManifest {
  /** Unique channel identifier (matches channel_type). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Short label for sidebar tabs. */
  tabLabel: string;
  /** Brief description. */
  description: string;
  /** Channel accent hex color for icon badges, active states, and accents. */
  hex: string;
  /** Lucide icon component rendered at size 14 for sidebar, 20 for header. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Info tab content — what this channel is and how to use it. */
  info: SourceInfo;
  /** The React component rendered for this channel's feed view. */
  FeedTab: React.ComponentType<FeedTabProps>;
}

/** Manifest describing a single widget. */
export interface WidgetManifest {
  /** Unique identifier (e.g. "clock", "weather"). Must not collide with channel IDs. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Short label shown on the feed bar tab. */
  tabLabel: string;
  /** Brief description of the widget. */
  description: string;
  /** Brand hex color for the widget. */
  hex: string;
  /** Lucide icon component for sidebar and header display. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Info tab content — what this widget is and how to use it. */
  info: SourceInfo;
  /** When true, this widget only works in the desktop app (e.g. system monitor). */
  desktopOnly?: boolean;
  /** The React component rendered inside the feed bar for this widget. */
  FeedTab: React.ComponentType<FeedTabProps>;
}
