package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/swagger"
	"github.com/joho/godotenv"

	// Import generated docs
	_ "github.com/brandon-relentnet/myscrollr/api/docs"
)

// HealthResponse represents the aggregated health status
type HealthResponse struct {
	Status   string            `json:"status"`
	Database string            `json:"database"`
	Redis    string            `json:"redis"`
	Services map[string]string `json:"services"`
}

// @title Scrollr API
// @version 1.0
// @description High-performance data API for Scrollr finance and sports.
// @host localhost:8080
// @BasePath /
func main() {
	_ = godotenv.Load()

	ConnectDB()
	defer dbPool.Close()

	ConnectRedis()
	defer rdb.Close()

	InitYahoo()

	app := fiber.New(fiber.Config{
		AppName: "Scrollr API",
	})

	app.Use(logger.New())
	app.Use(cors.New())

	app.Get("/swagger/*", swagger.HandlerDefault)

	// Aggregated Health Route
	app.Get("/health", HealthCheck)

	app.Get("/sports", GetSports)
	app.Get("/finance", GetFinance)

	app.Get("/yahoo/start", YahooStart)
	app.Get("/yahoo/callback", YahooCallback)
	app.Get("/yahoo/leagues", YahooLeagues)
	app.Get("/yahoo/league/:league_key/standings", YahooStandings)
	app.Get("/yahoo/team/:team_key/matchups", YahooMatchups)
	app.Get("/yahoo/team/:team_key/roster", YahooRoster)

	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString("Welcome to Scrollr API. Visit /swagger for documentation.")
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting server on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}

// HealthCheck godoc
// @Summary Check system health.
// @Description returns status of API, DB, Redis, and background workers. Use ?service=finance to filter.
// @Tags General
// @Param service query string false "Specific service to check (finance, sports, yahoo)"
// @Produce json
// @Success 200 {object} HealthResponse
// @Router /health [get]
func HealthCheck(c *fiber.Ctx) error {
	specificService := c.Query("service")

	res := HealthResponse{
		Status:   "healthy",
		Services: make(map[string]string),
	}

	// 1. Check DB
	if err := dbPool.Ping(context.Background()); err != nil {
		res.Database = "unhealthy: " + err.Error()
		res.Status = "degraded"
	} else {
		res.Database = "healthy"
	}

	// 2. Check Redis
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		res.Redis = "unhealthy: " + err.Error()
		res.Status = "degraded"
	} else {
		res.Redis = "healthy"
	}

	// 3. Internal Workers
	services := map[string]string{
		"finance": os.Getenv("INTERNAL_FINANCE_URL"),
		"sports":  os.Getenv("INTERNAL_SPORTS_URL"),
		"yahoo":   os.Getenv("INTERNAL_YAHOO_URL"),
	}

	httpClient := &http.Client{Timeout: 2 * time.Second}

	for name, url := range services {
		// Skip if we only want one specific service and this isn't it
		if specificService != "" && specificService != name {
			continue
		}

		if url == "" {
			res.Services[name] = "unknown: URL not set"
			continue
		}

		resp, err := httpClient.Get(url + "/health")
		if err != nil || resp.StatusCode != http.StatusOK {
			res.Services[name] = "down"
			res.Status = "degraded"
		} else {
			res.Services[name] = "healthy"
		}
	}

	// If a specific service was requested and it's down, return 503
	if specificService != "" && res.Services[specificService] != "healthy" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(res)
	}

	return c.JSON(res)
}
