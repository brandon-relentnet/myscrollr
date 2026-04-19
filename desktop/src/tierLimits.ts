import type { SubscriptionTier } from "./auth";

// =====================================================================
// Tier Limits
//
// SOURCE OF TRUTH: api/core/tier_limits.go (DefaultTierLimits)
//
// Channel config panels and the onboarding wizard read these synchronously
// during render, so we keep a hardcoded mirror of the backend values here
// rather than fetching them asynchronously from GET /tier-limits. Drift
// between this file and the Go source becomes a billing-trust problem.
//
// If you change a number here, you MUST also update:
//   - api/core/tier_limits.go        (the Go map)
//   - api/core/tier_limits_test.go   (the assertion)
//   - myscrollr.com/src/routes/uplink.tsx (the FALLBACK_LIMITS constant,
//     for first-paint before the runtime fetch resolves)
//
// Infinity here corresponds to `null` on the wire (null round-trips
// through JSON; Infinity does not).
// =====================================================================

interface ChannelLimits {
  symbols: number;
  feeds: number;
  customFeeds: number;
  leagues: number;
  fantasy: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, ChannelLimits> = {
  free: { symbols: 5, feeds: 1, customFeeds: 0, leagues: 1, fantasy: 0 },
  uplink: { symbols: 25, feeds: 25, customFeeds: 1, leagues: 8, fantasy: 1 },
  uplink_pro: { symbols: 75, feeds: 100, customFeeds: 3, leagues: 20, fantasy: 3 },
  uplink_ultimate: {
    symbols: Infinity,
    feeds: Infinity,
    customFeeds: 10,
    leagues: Infinity,
    fantasy: 10,
  },
  super_user: {
    symbols: Infinity,
    feeds: Infinity,
    customFeeds: Infinity,
    leagues: Infinity,
    fantasy: Infinity,
  },
};

type LimitKey = keyof ChannelLimits;

/** Get the numeric limit for a tier + channel feature. */
export function getLimit(tier: SubscriptionTier, key: LimitKey): number {
  return TIER_LIMITS[tier][key];
}

/** True when the tier has no cap (Infinity) for the given feature. */
export function isUnlimited(tier: SubscriptionTier, key: LimitKey): boolean {
  return TIER_LIMITS[tier][key] === Infinity;
}

/**
 * Returns `maxItems` for SetupBrowser: a finite number or undefined (unlimited).
 * Passing undefined means SetupBrowser won't enforce any cap.
 */
export function maxItemsForBrowser(
  tier: SubscriptionTier,
  key: LimitKey
): number | undefined {
  const limit = TIER_LIMITS[tier][key];
  return limit === Infinity ? undefined : limit;
}
