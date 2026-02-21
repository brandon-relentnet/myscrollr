package core

import "time"

// =============================================================================
// Auth (JWKS)
// =============================================================================

const (
	JWKSRefreshInterval  = time.Hour
	JWKSRefreshRateLimit = 5 * time.Minute
	JWKSRefreshTimeout   = 10 * time.Second
)

// =============================================================================
// HTTP Timeouts
// =============================================================================

const (
	HealthCheckTimeout = 2 * time.Second
	LogtoProxyTimeout  = 10 * time.Second
)

// =============================================================================
// Database Pool
// =============================================================================

const (
	DBMaxConns        = 20
	DBMinConns        = 2
	DBMaxConnIdleTime = 30 * time.Minute
	DBMaxRetries      = 5
	DBRetryDelay      = 2 * time.Second
)

// =============================================================================
// SSE
// =============================================================================

const (
	SSEHeartbeatInterval = 15 * time.Second
	SSERetryIntervalMs   = 3000
	SSEClientBufferSize  = 100
)

// =============================================================================
// Rate Limiting
// =============================================================================

const (
	RateLimitMax        = 120
	RateLimitExpiration = 1 * time.Minute
)

// =============================================================================
// Redis Key Prefixes
// =============================================================================

const (
	RedisChannelSubscribersPrefix = "channel:subscribers:"
	RedisEventsUserPrefix         = "events:user:"
	RedisDashboardCachePrefix     = "cache:dashboard:"

	// SportsLeagueSubscribersPrefix is the per-league subscriber set prefix.
	// Keys: sports:subscribers:league:{NFL}, sports:subscribers:league:{NBA}, etc.
	// Used by the core API for subscriber management and the sports channel for
	// per-league CDC fan-out routing.
	SportsLeagueSubscribersPrefix = "sports:subscribers:league:"
)

// SportsLeagues is the set of league identifiers used in the games table.
// Must match the `league` column values written by the Rust sports ingestion service.
var SportsLeagues = []string{
	"NFL", "NBA", "NHL", "MLB",
	"COLLEGE-FOOTBALL", "MENS-COLLEGE-BASKETBALL",
	"WOMENS-COLLEGE-BASKETBALL", "COLLEGE-BASEBALL",
}

// =============================================================================
// Dashboard Cache
// =============================================================================

const (
	DashboardCacheTTL = 30 * time.Second
)

// =============================================================================
// Billing / Stripe
// =============================================================================

const (
	// Logto M2M token is cached and refreshed before expiry.
	LogtoM2MTokenBufferSecs = 60
	LogtoM2MTokenTimeout    = 10 * time.Second

	// Stripe webhook signature tolerance.
	StripeWebhookTolerance = 300 // seconds
)

// =============================================================================
// Miscellaneous
// =============================================================================

const (
	HSTSMaxAge            = 5184000
	DefaultPort           = "8080"
	DefaultAllowedOrigins = "https://myscrollr.com,https://api.myscrollr.relentnet.dev"
	DefaultFrontendURL    = "https://myscrollr.com"
)
