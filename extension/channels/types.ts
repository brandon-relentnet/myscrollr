import type { FeedMode } from "~/utils/types";

// ── Props passed to every FeedTab component ──────────────────────

export interface FeedTabProps {
  /** Display density — 'comfort' shows more detail, 'compact' is denser. */
  mode: FeedMode;
  /**
   * Per-channel JSONB config from user_channels.config.
   * Each channel decides what goes here (e.g., selected RSS feeds).
   */
  channelConfig: Record<string, unknown>;
}

// ── Channel manifest — one per channel ───────────────────────────

type ChannelTier = "official" | "verified" | "community";

export interface ChannelManifest {
  /** Unique identifier — matches channel_type in the API. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Short label shown on the feed bar tab. */
  tabLabel: string;
  /** Trust tier. */
  tier: ChannelTier;
  /** The React component rendered inside the feed bar for this channel. */
  FeedTab: React.ComponentType<FeedTabProps>;
}
