package fantasy

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/brandon-relentnet/myscrollr/api/core"
	"github.com/brandon-relentnet/myscrollr/api/integration"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
)

// Integration implements the integration.Integration interface for Yahoo Fantasy Sports.
type Integration struct {
	db          *pgxpool.Pool
	rdb         *redis.Client
	sendToUser  integration.SendToUserFunc
	yahooConfig *oauth2.Config
}

// New creates a new Fantasy integration.
func New(db *pgxpool.Pool, rdb *redis.Client, sendToUser integration.SendToUserFunc) *Integration {
	return &Integration{
		db:         db,
		rdb:        rdb,
		sendToUser: sendToUser,
	}
}

func (f *Integration) Name() string        { return "fantasy" }
func (f *Integration) DisplayName() string  { return "Fantasy Sports" }
func (f *Integration) InternalServiceURL() string { return os.Getenv("INTERNAL_YAHOO_URL") }
func (f *Integration) ConfigSchema() json.RawMessage { return nil }

// Init initialises the Yahoo OAuth2 config and ensures the yahoo_users table exists.
// Must be called after core.ConnectDB().
func (f *Integration) Init() {
	f.initYahoo()
	f.ensureTables()
}

func (f *Integration) initYahoo() {
	clientID := os.Getenv("YAHOO_CLIENT_ID")
	clientSecret := os.Getenv("YAHOO_CLIENT_SECRET")

	// Use pre-derived YAHOO_CALLBACK_URL from Dockerfile, or fallback to derivation
	redirectURL := os.Getenv("YAHOO_CALLBACK_URL")
	if redirectURL == "" {
		if fqdn := core.CleanFQDN(); fqdn != "" {
			redirectURL = fmt.Sprintf("https://%s/yahoo/callback", fqdn)
		}
	}

	if clientID != "" {
		log.Printf("[Yahoo Init] Client ID: %s... Redirect URI: %s", clientID[:min(5, len(clientID))], redirectURL)
	} else {
		log.Println("[Yahoo Init] Warning: YAHOO_CLIENT_ID not set")
	}

	f.yahooConfig = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Scopes:       []string{"fspt-r"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://api.login.yahoo.com/oauth2/request_auth",
			TokenURL: "https://api.login.yahoo.com/oauth2/get_token",
		},
		RedirectURL: redirectURL,
	}
}

func (f *Integration) ensureTables() {
	_, err := f.db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS yahoo_users (
			guid VARCHAR(100) PRIMARY KEY,
			logto_sub VARCHAR(255) UNIQUE,
			refresh_token TEXT NOT NULL,
			last_sync TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		log.Printf("Warning: Failed to create yahoo_users table: %v", err)
	}
}

// RegisterRoutes mounts Yahoo-specific routes.
func (f *Integration) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	// Public routes
	router.Get("/yahoo/start", f.YahooStart)
	router.Get("/yahoo/callback", f.YahooCallback)
	router.Get("/yahoo/health", f.healthHandler)

	// Protected routes
	router.Get("/yahoo/leagues", authMiddleware, f.YahooLeagues)
	router.Get("/yahoo/league/:league_key/standings", authMiddleware, f.YahooStandings)
	router.Get("/yahoo/team/:team_key/matchups", authMiddleware, f.YahooMatchups)
	router.Get("/yahoo/team/:team_key/roster", authMiddleware, f.YahooRoster)

	// User Yahoo management
	router.Get("/users/me/yahoo-status", authMiddleware, f.GetYahooStatus)
	router.Get("/users/me/yahoo-leagues", authMiddleware, f.GetMyYahooLeagues)
	router.Delete("/users/me/yahoo", authMiddleware, f.DisconnectYahoo)
}

// HandlesTable returns true for yahoo-owned tables.
func (f *Integration) HandlesTable(tableName string) bool {
	switch tableName {
	case "yahoo_leagues", "yahoo_standings", "yahoo_matchups", "yahoo_rosters":
		return true
	}
	return false
}

// RouteCDCRecord routes a CDC event from a yahoo table to the correct user.
func (f *Integration) RouteCDCRecord(ctx context.Context, record integration.CDCRecord, payload []byte) error {
	switch record.Metadata.TableName {
	case "yahoo_leagues":
		f.routeYahooByGuid(ctx, record.Record, payload)
	case "yahoo_standings":
		f.routeYahooByLeagueKey(ctx, record.Record, payload)
	case "yahoo_matchups":
		f.routeYahooByTeamKey(ctx, record.Record, payload)
	case "yahoo_rosters":
		f.routeYahooByTeamKey(ctx, record.Record, payload)
	}
	return nil
}

// GetDashboardData fetches the user's Yahoo leagues from cache or DB.
func (f *Integration) GetDashboardData(ctx context.Context, userSub string, stream integration.StreamInfo) (interface{}, error) {
	// Resolve logto_sub → guid
	var guid string
	err := f.db.QueryRow(ctx, "SELECT guid FROM yahoo_users WHERE logto_sub = $1", userSub).Scan(&guid)
	if err != nil {
		// User hasn't connected Yahoo — return nil (no data)
		return nil, nil
	}

	cacheKey := core.CacheKeyYahooLeaguesPrefix + guid

	var content FantasyContent
	if core.GetCache(cacheKey, &content) {
		return content, nil
	}

	// Try Database (Active Sync data)
	var data []byte
	err = f.db.QueryRow(ctx, "SELECT data FROM yahoo_leagues WHERE guid = $1 LIMIT 1", guid).Scan(&data)
	if err == nil {
		if err := json.Unmarshal(data, &content); err == nil {
			core.SetCache(cacheKey, content, core.YahooCacheTTL)
			return content, nil
		}
	}

	// No cached or DB data — return nil
	return nil, nil
}

// --- Stream Lifecycle Hooks ---

func (f *Integration) OnStreamCreated(ctx context.Context, userSub string, config map[string]interface{}) error {
	return nil
}

func (f *Integration) OnStreamUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) error {
	return nil
}

func (f *Integration) OnStreamDeleted(ctx context.Context, userSub string, config map[string]interface{}) error {
	return nil
}

func (f *Integration) OnSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) error {
	return nil
}

// HealthCheck returns the health status of the Yahoo ingestion service.
func (f *Integration) HealthCheck(ctx context.Context) (*integration.HealthStatus, error) {
	return &integration.HealthStatus{Status: "healthy"}, nil
}

func (f *Integration) healthHandler(c *fiber.Ctx) error {
	return core.ProxyInternalHealth(c, f.InternalServiceURL())
}

// --- Database ---

// UpsertYahooUser inserts or updates a Yahoo user with an encrypted refresh token.
func (f *Integration) UpsertYahooUser(guid, logtoSub, refreshToken string) error {
	encryptedToken, err := core.Encrypt(refreshToken)
	if err != nil {
		log.Printf("[Security Error] Failed to encrypt refresh token for user %s: %v", guid, err)
		return err
	}

	_, err = f.db.Exec(context.Background(), `
		INSERT INTO yahoo_users (guid, logto_sub, refresh_token)
		VALUES ($1, $2, $3)
		ON CONFLICT (guid) DO UPDATE
		SET logto_sub = EXCLUDED.logto_sub, refresh_token = EXCLUDED.refresh_token;
	`, guid, logtoSub, encryptedToken)

	return err
}


