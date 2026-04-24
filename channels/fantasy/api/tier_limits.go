package main

import "github.com/gofiber/fiber/v2"

// =============================================================================
// Tier Limits — Fantasy League Imports
// =============================================================================
//
// Mirrors the `Fantasy` column of api/core/tier_limits.go DefaultTierLimits.
// Kept package-local on purpose: each Go module is independently deployable
// and cross-module imports are banned by AGENTS.md. When the authoritative
// table in api/core/tier_limits.go changes, update this file too.
//
// Semantics:
//   - Positive integer: hard cap on league count.
//   - -1: unlimited (used for super_user and matches the JSON `null` cap
//     contract exposed by /tier-limits).
//
// Unknown tiers fall through to "free" as a defensive default — an attacker
// sending a bogus X-User-Tier header should get the strictest cap, not a
// higher one.

const (
	TierFree           = "free"
	TierUplink         = "uplink"
	TierUplinkPro      = "uplink_pro"
	TierUplinkUltimate = "uplink_ultimate"
	TierSuperUser      = "super_user"
)

// FantasyLeagueCap returns the league cap for a tier. -1 means unlimited.
func FantasyLeagueCap(tier string) int {
	switch tier {
	case TierSuperUser:
		return -1
	case TierUplinkUltimate:
		return 10
	case TierUplinkPro:
		return 3
	case TierUplink:
		return 1
	case TierFree:
		return 0
	default:
		// Unknown / missing header — apply the strictest cap.
		return 0
	}
}

// GetUserTier reads the X-User-Tier header set by the core gateway for
// authenticated requests. Returns "free" if the header is not present —
// callers should treat a missing tier as the least-privileged one.
func GetUserTier(c *fiber.Ctx) string {
	tier := c.Get("X-User-Tier")
	if tier == "" {
		return TierFree
	}
	return tier
}
