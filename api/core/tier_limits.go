package core

import "github.com/gofiber/fiber/v2"

// ChannelLimits is the per-tier cap for every channel feature the frontend
// lets users configure. A nil pointer means "unlimited" — this lets us
// round-trip cleanly through JSON (where Go's Infinity has no analogue)
// and lets clients treat null as "no cap."
type ChannelLimits struct {
	Symbols     *int `json:"symbols"`
	Feeds       *int `json:"feeds"`
	CustomFeeds *int `json:"custom_feeds"`
	Leagues     *int `json:"leagues"`
	Fantasy     *int `json:"fantasy"`
}

// TierLimitsResponse is the payload of GET /tier-limits.
type TierLimitsResponse struct {
	Tiers map[string]ChannelLimits `json:"tiers"`
}

// DefaultTierLimits is the authoritative source of truth for per-tier caps.
//
// SOURCE OF TRUTH — any change here MUST also propagate to:
//   - desktop/src/tierLimits.ts     (kept in sync manually; synchronous
//     reads required by config panels during render)
//   - myscrollr.com/src/routes/uplink.tsx (`FALLBACK_LIMITS` constant,
//     used only for first-paint while the API response is in flight)
//   - api/core/tier_limits_test.go  (assertion protecting this table
//     from silent edits — run `go test ./core/...` after any change)
//
// Once Sprint 3 wires backend enforcement on POST/PUT /users/me/channels,
// these values directly gate what the DB will accept, so drift is
// unforgiving.
var DefaultTierLimits = map[string]ChannelLimits{
	"free":            {Symbols: intPtr(5), Feeds: intPtr(1), CustomFeeds: intPtr(0), Leagues: intPtr(1), Fantasy: intPtr(0)},
	"uplink":          {Symbols: intPtr(25), Feeds: intPtr(25), CustomFeeds: intPtr(1), Leagues: intPtr(8), Fantasy: intPtr(1)},
	"uplink_pro":      {Symbols: intPtr(75), Feeds: intPtr(100), CustomFeeds: intPtr(3), Leagues: intPtr(20), Fantasy: intPtr(3)},
	"uplink_ultimate": {Symbols: nil, Feeds: nil, CustomFeeds: intPtr(10), Leagues: nil, Fantasy: intPtr(10)},
	"super_user":      {Symbols: nil, Feeds: nil, CustomFeeds: nil, Leagues: nil, Fantasy: nil},
}

// HandleGetTierLimits serves the tier limits map to any caller — clients
// render pricing/comparison UIs from this, and integration tests use it
// to confirm desktop and marketing values agree with the backend.
//
// Unauthenticated on purpose: these numbers are marketing-visible, and
// we want the pricing page to load without a session.
func HandleGetTierLimits(c *fiber.Ctx) error {
	// Short browser + CDN cache. The pricing page fetches this on mount;
	// a 5-minute cache is generous enough to reduce load while still
	// letting us ship a limit change without waiting hours.
	c.Set("Cache-Control", "public, max-age=300")
	return c.JSON(TierLimitsResponse{Tiers: DefaultTierLimits})
}

// intPtr returns a pointer to an int literal — convenience for the table
// above so each row stays readable.
func intPtr(n int) *int {
	return &n
}
