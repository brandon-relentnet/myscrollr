package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/yahoo"
)

// =============================================================================
// Registration Constants
// =============================================================================

const (
	// RegistrationKey is the Redis key where this channel registers itself.
	RegistrationKey = "channel:fantasy"

	// RegistrationTTL is how long the registration lives in Redis before expiring.
	RegistrationTTL = 30 * time.Second

	// RegistrationRefresh is how often we refresh the registration.
	RegistrationRefresh = 20 * time.Second

	// DefaultPort is the default HTTP listen port.
	DefaultPort = "8084"

	// DefaultChannelURL is the default internal URL for this service.
	DefaultChannelURL = "http://localhost:8084"
)

// registrationPayload is the JSON structure stored in Redis for service discovery.
type registrationPayload struct {
	Name         string              `json:"name"`
	DisplayName  string              `json:"display_name"`
	InternalURL  string              `json:"internal_url"`
	Capabilities []string            `json:"capabilities"`
	CDCTables    []string            `json:"cdc_tables"`
	Routes       []registrationRoute `json:"routes"`
}

type registrationRoute struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Auth   bool   `json:"auth"`
}

// =============================================================================
// Main
// =============================================================================

func main() {
	// Load .env (optional — don't fatal if missing)
	_ = godotenv.Load()

	// -------------------------------------------------------------------------
	// Connect to PostgreSQL
	// -------------------------------------------------------------------------
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("[Fantasy] DATABASE_URL is required")
	}

	// Clean up DATABASE_URL
	dbURL = strings.TrimSpace(dbURL)
	dbURL = strings.Trim(dbURL, "\"")
	dbURL = strings.Trim(dbURL, "'")
	if strings.HasPrefix(dbURL, "postgres:") && !strings.HasPrefix(dbURL, "postgres://") {
		dbURL = strings.Replace(dbURL, "postgres:", "postgres://", 1)
	} else if strings.HasPrefix(dbURL, "postgresql:") && !strings.HasPrefix(dbURL, "postgresql://") {
		dbURL = strings.Replace(dbURL, "postgresql:", "postgresql://", 1)
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("[Fantasy] Failed to connect to PostgreSQL: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		log.Fatalf("[Fantasy] PostgreSQL ping failed: %v", err)
	}
	log.Println("[Fantasy] Connected to PostgreSQL")

	// -------------------------------------------------------------------------
	// Connect to Redis
	// -------------------------------------------------------------------------
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatal("[Fantasy] REDIS_URL is required")
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("[Fantasy] Invalid REDIS_URL: %v", err)
	}

	rdb := redis.NewClient(opts)
	defer rdb.Close()

	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("[Fantasy] Redis ping failed: %v", err)
	}
	log.Println("[Fantasy] Connected to Redis")

	// -------------------------------------------------------------------------
	// Yahoo OAuth2 Config
	// -------------------------------------------------------------------------
	clientID := os.Getenv("YAHOO_CLIENT_ID")
	clientSecret := os.Getenv("YAHOO_CLIENT_SECRET")

	// Derive callback URL from env
	redirectURL := os.Getenv("YAHOO_CALLBACK_URL")
	if redirectURL == "" {
		if fqdn := CleanFQDN(); fqdn != "" {
			redirectURL = fmt.Sprintf("https://%s/yahoo/callback", fqdn)
		}
	}

	if clientID != "" {
		log.Printf("[Fantasy] Yahoo Client ID: %s... Redirect URI: %s", clientID[:min(5, len(clientID))], redirectURL)
	} else {
		log.Println("[Fantasy] Warning: YAHOO_CLIENT_ID not set")
	}

	yahooConfig := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint: oauth2.Endpoint{
			AuthURL:   yahoo.Endpoint.AuthURL,
			TokenURL:  yahoo.Endpoint.TokenURL,
			AuthStyle: oauth2.AuthStyleInHeader,
		},
		RedirectURL: redirectURL,
	}

	// NOTE: We do NOT create the yahoo_users table here.
	// The Python yahoo_service owns that table and creates it on startup.

	// -------------------------------------------------------------------------
	// Start Redis self-registration heartbeat
	// -------------------------------------------------------------------------
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go startRegistration(ctx, rdb)

	// -------------------------------------------------------------------------
	// Fiber HTTP Server
	// -------------------------------------------------------------------------
	app := &App{db: pool, rdb: rdb, yahooConfig: yahooConfig}

	fiberApp := fiber.New(fiber.Config{
		AppName:               "Scrollr Fantasy API",
		DisableStartupMessage: false,
	})

	// Public routes (proxied by core gateway, no auth required)
	fiberApp.Get("/yahoo/start", app.YahooStart)
	fiberApp.Get("/yahoo/callback", app.YahooCallback)
	fiberApp.Get("/yahoo/health", app.healthHandler)

	// Protected routes (core gateway sets X-User-Sub header)
	fiberApp.Get("/users/me/yahoo-status", app.GetYahooStatus)
	fiberApp.Get("/users/me/yahoo-leagues", app.GetMyYahooLeagues)
	fiberApp.Post("/users/me/yahoo-leagues/discover", app.DiscoverYahooLeagues)
	fiberApp.Post("/users/me/yahoo-leagues/import", app.ImportYahooLeague)
	fiberApp.Delete("/users/me/yahoo", app.DisconnectYahoo)

	// Internal routes (called by core gateway directly, not proxied)
	fiberApp.Post("/internal/cdc", app.handleInternalCDC)
	fiberApp.Get("/internal/dashboard", app.handleInternalDashboard)
	fiberApp.Get("/internal/health", app.handleInternalHealth)

	// -------------------------------------------------------------------------
	// Start server with graceful shutdown
	// -------------------------------------------------------------------------
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	go func() {
		if err := fiberApp.Listen(":" + port); err != nil {
			log.Fatalf("[Fantasy] Server failed: %v", err)
		}
	}()

	log.Printf("[Fantasy] Fantasy API listening on port %s", port)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[Fantasy] Shutting down Fantasy API...")
	cancel()

	// Deregister from Redis on shutdown
	rdb.Del(context.Background(), RegistrationKey)
	log.Println("[Fantasy] Removed registration from Redis")

	if err := fiberApp.Shutdown(); err != nil {
		log.Printf("[Fantasy] Fiber shutdown error: %v", err)
	}
}

// startRegistration registers this service in Redis with a TTL and refreshes
// the registration on a ticker. This allows the core gateway to discover
// available channel services.
func startRegistration(ctx context.Context, rdb *redis.Client) {
	channelURL := os.Getenv("CHANNEL_URL")
	if channelURL == "" {
		channelURL = DefaultChannelURL
	}

	payload := registrationPayload{
		Name:         "fantasy",
		DisplayName:  "Fantasy Sports",
		InternalURL:  channelURL,
		Capabilities: []string{"cdc_handler", "dashboard_provider", "health_checker"},
		CDCTables:    []string{"yahoo_leagues", "yahoo_standings", "yahoo_matchups", "yahoo_rosters"},
		Routes: []registrationRoute{
			// Public (no auth)
			{Method: "GET", Path: "/yahoo/start", Auth: false},
			{Method: "GET", Path: "/yahoo/callback", Auth: false},
			{Method: "GET", Path: "/yahoo/health", Auth: false},
			// Protected (auth required)
			{Method: "GET", Path: "/users/me/yahoo-status", Auth: true},
			{Method: "GET", Path: "/users/me/yahoo-leagues", Auth: true},
			{Method: "POST", Path: "/users/me/yahoo-leagues/discover", Auth: true},
			{Method: "POST", Path: "/users/me/yahoo-leagues/import", Auth: true},
			{Method: "DELETE", Path: "/users/me/yahoo", Auth: true},
		},
	}

	data, err := json.Marshal(payload)
	if err != nil {
		log.Fatalf("[Fantasy] Failed to marshal registration payload: %v", err)
	}

	// Register immediately on startup
	if err := rdb.Set(ctx, RegistrationKey, data, RegistrationTTL).Err(); err != nil {
		log.Printf("[Fantasy] Initial registration failed: %v", err)
	} else {
		log.Printf("[Fantasy] Registered as %s (TTL %s)", RegistrationKey, RegistrationTTL)
	}

	ticker := time.NewTicker(RegistrationRefresh)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[Fantasy] Stopping registration heartbeat")
			return
		case <-ticker.C:
			if err := rdb.Set(ctx, RegistrationKey, data, RegistrationTTL).Err(); err != nil {
				log.Printf("[Fantasy] Registration heartbeat failed: %v", err)
			}
		}
	}
}
