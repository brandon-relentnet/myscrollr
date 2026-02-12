import { storage } from '#imports';
import type {
  FeedPosition,
  FeedMode,
  FeedBehavior,
  DeliveryMode,
  SubscriptionTier,
} from './types';

// ── Feed bar position & layout ───────────────────────────────────

export const feedPosition = storage.defineItem<FeedPosition>(
  'local:feedPosition',
  { fallback: 'bottom', version: 1 },
);

export const feedHeight = storage.defineItem<number>('local:feedHeight', {
  fallback: 200,
  version: 1,
});

export const feedMode = storage.defineItem<FeedMode>('local:feedMode', {
  fallback: 'comfort',
  version: 1,
});

export const feedCollapsed = storage.defineItem<boolean>(
  'local:feedCollapsed',
  { fallback: false, version: 1 },
);

export const feedBehavior = storage.defineItem<FeedBehavior>(
  'local:feedBehavior',
  { fallback: 'overlay', version: 1 },
);

// ── Global toggle ────────────────────────────────────────────────

export const feedEnabled = storage.defineItem<boolean>('local:feedEnabled', {
  fallback: true,
  version: 1,
});

// ── Site filtering ───────────────────────────────────────────────

/** URL patterns where the feed is shown (empty = all sites). */
export const enabledSites = storage.defineItem<string[]>(
  'local:enabledSites',
  { fallback: [], version: 1 },
);

/** URL patterns where the feed is explicitly hidden. */
export const disabledSites = storage.defineItem<string[]>(
  'local:disabledSites',
  { fallback: [], version: 1 },
);

// ── Active feed categories ───────────────────────────────────────

export const activeFeedTabs = storage.defineItem<string[]>(
  'local:activeFeedTabs',
  { fallback: ['finance', 'sports'], version: 1 },
);

// ── User identity ────────────────────────────────────────────────

/** Logto user ID (sub claim), used to filter CDC records. */
export const userSub = storage.defineItem<string | null>('local:userSub', {
  fallback: null,
  version: 1,
});

// ── Auth ─────────────────────────────────────────────────────────

export const authToken = storage.defineItem<string | null>(
  'local:authToken',
  { fallback: null, version: 1 },
);

export const authTokenExpiry = storage.defineItem<number | null>(
  'local:authTokenExpiry',
  { fallback: null, version: 1 },
);

export const authRefreshToken = storage.defineItem<string | null>(
  'local:authRefreshToken',
  { fallback: null, version: 1 },
);

// ── Tiered delivery ──────────────────────────────────────────────

/** Current data delivery mode: polling for anonymous/free, sse for uplink. */
export const deliveryMode = storage.defineItem<DeliveryMode>(
  'local:deliveryMode',
  { fallback: 'polling', version: 1 },
);

/** User's subscription tier — determines delivery mode and available features. */
export const subscriptionTier = storage.defineItem<SubscriptionTier>(
  'local:subscriptionTier',
  { fallback: 'free', version: 1 },
);
