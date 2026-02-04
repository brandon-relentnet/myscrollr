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
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"status": "unknown", "error": "Internal URL not configured"})
	}

	targetURL := buildHealthURL(internalURL)
	httpClient := &http.Client{Timeout: 5 * time.Second} // Increased timeout for DNS
	resp, err := httpClient.Get(targetURL)
	if err != nil {
		log.Printf("[Health Error] Failed to reach %s: %v", targetURL, err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"status": "down", 
			"error": err.Error(), 
			"target": targetURL,
			"hint": "Check if the hostname is correct and the service is on the same Docker network.",
		})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	
	// Check if response is actually JSON
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "application/json") && !strings.HasPrefix(string(body), "{") {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"status": "error", 
			"error": "Internal service returned non-JSON response. Check if you are hitting the correct PORT.",
			"body": string(body),
		})
	}

	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(body)
}

func SportsHealth(c *fiber.Ctx) error {
	return proxyInternalHealth(c, os.Getenv("INTERNAL_SPORTS_URL"))
}

func FinanceHealth(c *fiber.Ctx) error {
	return proxyInternalHealth(c, os.Getenv("INTERNAL_FINANCE_URL"))
}

func YahooHealth(c *fiber.Ctx) error {
	return proxyInternalHealth(c, os.Getenv("INTERNAL_YAHOO_URL"))
}

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

// --- Data Handlers ---

func GetSports(c *fiber.Ctx) error {
	rows, err := dbPool.Query(context.Background(),
		"SELECT id, league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state FROM games ORDER BY start_time DESC LIMIT 50")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var games []Game
	for rows.Next() {
		var g Game
		err := rows.Scan(&g.ID, &g.League, &g.ExternalGameID, &g.Link, &g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore, &g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore, &g.StartTime, &g.ShortDetail, &g.State)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		games = append(games, g)
	}

	return c.JSON(games)
}

func GetFinance(c *fiber.Ctx) error {
	rows, err := dbPool.Query(context.Background(),
		"SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated FROM trades ORDER BY symbol ASC")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var trades []Trade
	for rows.Next() {
		var t Trade
		err := rows.Scan(&t.Symbol, &t.Price, &t.PreviousClose, &t.PriceChange, &t.PercentageChange, &t.Direction, &t.LastUpdated)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		trades = append(trades, t)
	}

	return c.JSON(trades)
}
