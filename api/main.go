package main

import (
	"context"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
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

// ErrorResponse represents a standard API error
type ErrorResponse struct {
	Status  string `json:"status"`
	Error   string `json:"error"`
	Hint    string `json:"hint,omitempty"`
	Target  string `json:"target,omitempty"`
}

// @title Scrollr API
// @version 1.0
// @description High-performance data API for Scrollr finance and sports.
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.email admin@relentnet.com

// @license.name Apache 2.0
// @license.url http://www.apache.org/licenses/LICENSE-2.0.html

// @host api.myscrollr.relentnet.dev
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

	// --- Health Routes ---
	app.Get("/health", HealthCheck)
	app.Get("/sports/health", SportsHealth)
	app.Get("/finance/health", FinanceHealth)
	app.Get("/yahoo/health", YahooHealth)

	// --- Data Routes ---
	app.Get("/sports", GetSports)
	app.Get("/finance", GetFinance)

	// --- Yahoo OAuth & Data ---
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

// --- Health Handlers ---

func buildHealthURL(baseURL string) string {
	url := strings.TrimSuffix(baseURL, "/")
	if !strings.HasSuffix(url, "/health") {
		url = url + "/health"
	}
	return url
}

func proxyInternalHealth(c *fiber.Ctx, internalURL string) error {
	if internalURL == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{Status: "unknown", Error: "Internal URL not configured"})
	}

	targetURL := buildHealthURL(internalURL)
	httpClient := &http.Client{Timeout: 5 * time.Second}
	resp, err := httpClient.Get(targetURL)
	if err != nil {
		log.Printf("[Health Error] Failed to reach %s: %v", targetURL, err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Status: "down", 
			Error: err.Error(), 
			Target: targetURL,
			Hint: "Check if the hostname is correct and the service is on the same Docker network.",
		})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "application/json") && !strings.HasPrefix(string(body), "{") {
		return c.Status(fiber.StatusBadGateway).JSON(ErrorResponse{
			Status: "error", 
			Error: "Internal service returned non-JSON response. Check if you are hitting the correct PORT.",
		})
	}

	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(body)
}

// SportsHealth godoc
// @Summary Check sports ingestion health.
// @Description Proxies the internal health check from the Sports Rust worker.
// @Tags Health
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 503 {object} ErrorResponse
// @Router /sports/health [get]
func SportsHealth(c *fiber.Ctx) error {
	return proxyInternalHealth(c, os.Getenv("INTERNAL_SPORTS_URL"))
}

// FinanceHealth godoc
// @Summary Check finance ingestion health.
// @Description Proxies the internal health check from the Finance Rust worker.
// @Tags Health
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 503 {object} ErrorResponse
// @Router /finance/health [get]
func FinanceHealth(c *fiber.Ctx) error {
	return proxyInternalHealth(c, os.Getenv("INTERNAL_FINANCE_URL"))
}

// YahooHealth godoc
// @Summary Check yahoo worker health.
// @Description Proxies the internal health check from the Yahoo Rust worker.
// @Tags Health
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 503 {object} ErrorResponse
// @Router /yahoo/health [get]
func YahooHealth(c *fiber.Ctx) error {
	return proxyInternalHealth(c, os.Getenv("INTERNAL_YAHOO_URL"))
}

// HealthCheck godoc
// @Summary Check system health.
// @Description returns status of API, DB, Redis, and background workers.
// @Tags Health
// @Produce json
// @Success 200 {object} HealthResponse
// @Router /health [get]
func HealthCheck(c *fiber.Ctx) error {
	res := HealthResponse{
		Status:   "healthy",
		Services: make(map[string]string),
	}

	if err := dbPool.Ping(context.Background()); err != nil {
		res.Database = "unhealthy"
		res.Status = "degraded"
	} else {
		res.Database = "healthy"
	}

	if err := rdb.Ping(context.Background()).Err(); err != nil {
		res.Redis = "unhealthy"
		res.Status = "degraded"
	} else {
		res.Redis = "healthy"
	}

	services := map[string]string{
		"finance": os.Getenv("INTERNAL_FINANCE_URL"),
		"sports":  os.Getenv("INTERNAL_SPORTS_URL"),
		"yahoo":   os.Getenv("INTERNAL_YAHOO_URL"),
	}

	httpClient := &http.Client{Timeout: 2 * time.Second}
	for name, baseURL := range services {
		if baseURL == "" {
			res.Services[name] = "not configured"
			continue
		}
		
		targetURL := buildHealthURL(baseURL)
		resp, err := httpClient.Get(targetURL)
		if err != nil || resp.StatusCode != http.StatusOK {
			res.Services[name] = "down"
			res.Status = "degraded"
		} else {
			res.Services[name] = "healthy"
		}
	}

	return c.JSON(res)
}

// GetSports godoc
// @Summary Get latest sports games.
// @Description fetch the latest 50 sports games from the database.
// @Tags Sports
// @Accept json
// @Produce json
// @Success 200 {array} Game
// @Failure 500 {object} ErrorResponse
// @Router /sports [get]
func GetSports(c *fiber.Ctx) error {
	rows, err := dbPool.Query(context.Background(),
		"SELECT id, league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state FROM games ORDER BY start_time DESC LIMIT 50")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: err.Error()})
	}
	defer rows.Close()

	var games []Game
	for rows.Next() {
		var g Game
		err := rows.Scan(&g.ID, &g.League, &g.ExternalGameID, &g.Link, &g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore, &g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore, &g.StartTime, &g.ShortDetail, &g.State)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: err.Error()})
		}
		games = append(games, g)
	}

	return c.JSON(games)
}

// GetFinance godoc
// @Summary Get latest market data.
// @Description fetch all tracked market data (trades) from the database.
// @Tags Finance
// @Accept json
// @Produce json
// @Success 200 {array} Trade
// @Failure 500 {object} ErrorResponse
// @Router /finance [get]
func GetFinance(c *fiber.Ctx) error {
	rows, err := dbPool.Query(context.Background(),
		"SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated FROM trades ORDER BY symbol ASC")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: err.Error()})
	}
	defer rows.Close()

	var trades []Trade
	for rows.Next() {
		var t Trade
		err := rows.Scan(&t.Symbol, &t.Price, &t.PreviousClose, &t.PriceChange, &t.PercentageChange, &t.Direction, &t.LastUpdated)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: err.Error()})
		}
		trades = append(trades, t)
	}

	return c.JSON(trades)
}