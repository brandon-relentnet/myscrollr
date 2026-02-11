package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
)

// =============================================================================
// Registration
// =============================================================================

// registrationPayload is the JSON structure written to Redis so the core
// gateway can discover this integration at runtime.
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

const (
	registrationKey = "integration:fantasy"
	registrationTTL = 30 * time.Second
	heartbeatTick   = 20 * time.Second
)

// =============================================================================
// Main
// =============================================================================

func main() {
	// Load .env if present (optional, for local dev)
	_ = godotenv.Load()

	ctx := context.Background()

	// -------------------------------------------------------------------------
	// PostgreSQL
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

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("[Fantasy] Failed to connect to PostgreSQL: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("[Fantasy] PostgreSQL ping failed: %v", err)
	}
	log.Println("[Fantasy] Connected to PostgreSQL")

	// -------------------------------------------------------------------------
	// Redis
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
	if err := rdb.Ping(ctx).Err(); err != nil {
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
		Scopes:       []string{"fspt-r"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://api.login.yahoo.com/oauth2/request_auth",
			TokenURL: "https://api.login.yahoo.com/oauth2/get_token",
		},
		RedirectURL: redirectURL,
	}

	// NOTE: We do NOT create the yahoo_users table here.
	// The Rust yahoo_service owns that table and creates it on startup.

	// -------------------------------------------------------------------------
	// Self-Registration
	// -------------------------------------------------------------------------
	integrationURL := os.Getenv("INTEGRATION_URL")
	if integrationURL == "" {
		integrationURL = "http://localhost:8084"
	}

	payload := registrationPayload{
		Name:         "fantasy",
		DisplayName:  "Fantasy Sports",
		InternalURL:  integrationURL,
		Capabilities: []string{"cdc_handler", "dashboard_provider", "health_checker"},
		CDCTables:    []string{"yahoo_leagues", "yahoo_standings", "yahoo_matchups", "yahoo_rosters"},
		Routes: []registrationRoute{
			{Method: "GET", Path: "/yahoo/start", Auth: false},
			{Method: "GET", Path: "/yahoo/callback", Auth: false},
			{Method: "GET", Path: "/yahoo/health", Auth: false},
			{Method: "GET", Path: "/yahoo/leagues", Auth: true},
			{Method: "GET", Path: "/yahoo/league/:league_key/standings", Auth: true},
			{Method: "GET", Path: "/yahoo/team/:team_key/matchups", Auth: true},
			{Method: "GET", Path: "/yahoo/team/:team_key/roster", Auth: true},
			{Method: "GET", Path: "/users/me/yahoo-status", Auth: true},
			{Method: "GET", Path: "/users/me/yahoo-leagues", Auth: true},
			{Method: "DELETE", Path: "/users/me/yahoo", Auth: true},
		},
	}

	regJSON, err := json.Marshal(payload)
	if err != nil {
		log.Fatalf("[Fantasy] Failed to marshal registration payload: %v", err)
	}

	// Initial registration
	if err := rdb.Set(ctx, registrationKey, regJSON, registrationTTL).Err(); err != nil {
		log.Fatalf("[Fantasy] Failed to register in Redis: %v", err)
	}
	log.Printf("[Fantasy] Registered as %s (TTL %s)", registrationKey, registrationTTL)

	// Heartbeat goroutine — refresh registration before TTL expires
	go func() {
		ticker := time.NewTicker(heartbeatTick)
		defer ticker.Stop()
		for range ticker.C {
			if err := rdb.Set(context.Background(), registrationKey, regJSON, registrationTTL).Err(); err != nil {
				log.Printf("[Fantasy] Registration heartbeat failed: %v", err)
			}
		}
	}()

	// -------------------------------------------------------------------------
	// Fiber HTTP Server
	// -------------------------------------------------------------------------
	app := &App{db: pool, rdb: rdb, yahooConfig: yahooConfig}

	fiberApp := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	// Public routes (proxied by core gateway)
	fiberApp.Get("/yahoo/start", app.YahooStart)
	fiberApp.Get("/yahoo/callback", app.YahooCallback)
	fiberApp.Get("/yahoo/health", app.healthHandler)

	// Protected routes (core gateway sets X-User-Sub header)
	fiberApp.Get("/yahoo/leagues", app.YahooLeagues)
	fiberApp.Get("/yahoo/league/:league_key/standings", app.YahooStandings)
	fiberApp.Get("/yahoo/team/:team_key/matchups", app.YahooMatchups)
	fiberApp.Get("/yahoo/team/:team_key/roster", app.YahooRoster)

	// User management (core gateway sets X-User-Sub header)
	fiberApp.Get("/users/me/yahoo-status", app.GetYahooStatus)
	fiberApp.Get("/users/me/yahoo-leagues", app.GetMyYahooLeagues)
	fiberApp.Delete("/users/me/yahoo", app.DisconnectYahoo)

	// Internal routes (called by core gateway directly)
	fiberApp.Post("/internal/cdc", app.handleInternalCDC)
	fiberApp.Get("/internal/dashboard", app.handleInternalDashboard)
	fiberApp.Get("/internal/health", app.handleInternalHealth)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}

	log.Printf("[Fantasy] Starting server on :%s", port)
	if err := fiberApp.Listen(":" + port); err != nil {
		log.Fatalf("[Fantasy] Server failed: %v", err)
	}
}
