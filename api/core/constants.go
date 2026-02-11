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
	RedisStreamSubscribersPrefix = "stream:subscribers:"
	RedisEventsUserPrefix        = "events:user:"
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
