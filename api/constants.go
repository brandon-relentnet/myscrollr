package main

import "time"

// =============================================================================
// Cache TTLs
// =============================================================================

const (
	SportsCacheTTL    = 30 * time.Second
	FinanceCacheTTL   = 30 * time.Second
	RSSItemsCacheTTL  = 60 * time.Second
	RSSCatalogCacheTTL = 5 * time.Minute
	YahooCacheTTL     = 5 * time.Minute
)

// =============================================================================
// Auth / OAuth
// =============================================================================

const (
	JWKSRefreshInterval      = time.Hour
	JWKSRefreshRateLimit     = 5 * time.Minute
	JWKSRefreshTimeout       = 10 * time.Second
	OAuthStateExpiry         = 10 * time.Minute
	OAuthStateBytes          = 16
	YahooAuthCookieExpiry    = 24 * time.Hour
	YahooRefreshCookieExpiry = 30 * 24 * time.Hour
	TokenToGuidTTL           = 24 * time.Hour
)

// =============================================================================
// HTTP Timeouts
// =============================================================================

const (
	HealthProxyTimeout = 5 * time.Second
	HealthCheckTimeout = 2 * time.Second
	YahooAPITimeout    = 10 * time.Second
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
// Query Limits
// =============================================================================

const (
	DefaultSportsLimit   = 50
	DashboardSportsLimit = 20
	DefaultRSSItemsLimit = 50
)

// =============================================================================
// Redis Key Prefixes
// =============================================================================

const (
	CacheKeySports               = "cache:sports"
	CacheKeyFinance              = "cache:finance"
	CacheKeyRSSPrefix            = "cache:rss:"
	CacheKeyRSSCatalog           = "cache:rss:catalog"
	CacheKeyYahooLeaguesPrefix   = "cache:yahoo:leagues:"
	CacheKeyYahooStandingsPrefix = "cache:yahoo:standings:"
	CacheKeyYahooMatchupsPrefix  = "cache:yahoo:matchups:"
	CacheKeyYahooRosterPrefix    = "cache:yahoo:roster:"
	RedisStreamSubscribersPrefix = "stream:subscribers:"
	RedisRSSSubscribersPrefix    = "rss:subscribers:"
	RedisEventsUserPrefix        = "events:user:"
	RedisCSRFPrefix              = "csrf:"
	RedisYahooStateLogtoPrefix   = "yahoo_state_logto:"
	RedisTokenToGuidPrefix       = "token_to_guid:"
)

// =============================================================================
// Miscellaneous
// =============================================================================

const (
	HSTSMaxAge             = 5184000
	DefaultPort            = "8080"
	MaxConsecutiveFailures = 3
	RedisScanCount         = 100
	DefaultAllowedOrigins  = "https://myscrollr.com,https://api.myscrollr.relentnet.dev"
	DefaultFrontendURL     = "https://myscrollr.com"
	AuthPopupCloseDelayMs  = 1500
	TokenCacheKeyPrefixLen = 10
)
