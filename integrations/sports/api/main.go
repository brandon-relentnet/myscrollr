package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
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
	registrationKey = "integration:sports"
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
		log.Fatal("[Sports] DATABASE_URL is required")
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("[Sports] Failed to connect to PostgreSQL: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("[Sports] PostgreSQL ping failed: %v", err)
	}
	log.Println("[Sports] Connected to PostgreSQL")

	// -------------------------------------------------------------------------
	// Redis
	// -------------------------------------------------------------------------
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatal("[Sports] REDIS_URL is required")
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("[Sports] Invalid REDIS_URL: %v", err)
	}

	rdb := redis.NewClient(opts)
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("[Sports] Redis ping failed: %v", err)
	}
	log.Println("[Sports] Connected to Redis")

	// -------------------------------------------------------------------------
	// Self-Registration
	// -------------------------------------------------------------------------
	integrationURL := os.Getenv("INTEGRATION_URL")
	if integrationURL == "" {
		integrationURL = "http://localhost:8082"
	}

	payload := registrationPayload{
		Name:         "sports",
		DisplayName:  "Sports",
		InternalURL:  integrationURL,
		Capabilities: []string{"cdc_handler", "dashboard_provider", "health_checker"},
		CDCTables:    []string{"games"},
		Routes: []registrationRoute{
			{Method: "GET", Path: "/sports", Auth: true},
			{Method: "GET", Path: "/sports/health", Auth: false},
		},
	}

	regJSON, err := json.Marshal(payload)
	if err != nil {
		log.Fatalf("[Sports] Failed to marshal registration payload: %v", err)
	}

	// Initial registration
	if err := rdb.Set(ctx, registrationKey, regJSON, registrationTTL).Err(); err != nil {
		log.Fatalf("[Sports] Failed to register in Redis: %v", err)
	}
	log.Printf("[Sports] Registered as %s (TTL %s)", registrationKey, registrationTTL)

	// Heartbeat goroutine — refresh registration before TTL expires
	go func() {
		ticker := time.NewTicker(heartbeatTick)
		defer ticker.Stop()
		for range ticker.C {
			if err := rdb.Set(context.Background(), registrationKey, regJSON, registrationTTL).Err(); err != nil {
				log.Printf("[Sports] Registration heartbeat failed: %v", err)
			}
		}
	}()

	// -------------------------------------------------------------------------
	// Fiber HTTP Server
	// -------------------------------------------------------------------------
	app := &App{db: pool, rdb: rdb}

	fiberApp := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	// Public routes (proxied by core gateway)
	fiberApp.Get("/sports", app.getSports)
	fiberApp.Get("/sports/health", app.healthHandler)

	// Internal routes (called by core gateway)
	fiberApp.Post("/internal/cdc", app.handleInternalCDC)
	fiberApp.Get("/internal/dashboard", app.handleInternalDashboard)
	fiberApp.Get("/internal/health", app.handleInternalHealth)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}

	log.Printf("[Sports] Starting server on :%s", port)
	if err := fiberApp.Listen(":" + port); err != nil {
		log.Fatalf("[Sports] Server failed: %v", err)
	}
}
