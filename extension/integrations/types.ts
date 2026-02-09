import type { FeedMode } from '~/utils/types';

// ── Props passed to every FeedTab component ──────────────────────

export interface FeedTabProps {
  /** Display density — 'comfort' shows more detail, 'compact' is denser. */
  mode: FeedMode;
  /**
   * Per-stream JSONB config from user_streams.config.
   * Each integration decides what goes here (e.g., selected RSS feeds).
   */
  streamConfig: Record<string, unknown>;
}

// ── Integration manifest — one per integration ───────────────────

export type IntegrationTier = 'official' | 'verified' | 'community';

export interface IntegrationManifest {
  /** Unique identifier — matches stream_type in the API. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Short label shown on the feed bar tab. */
  tabLabel: string;
  /** Trust tier. */
  tier: IntegrationTier;
  /** The React component rendered inside the feed bar for this integration. */
  FeedTab: React.ComponentType<FeedTabProps>;
}
