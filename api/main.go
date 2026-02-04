package main

import (
	"context"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/swagger"
	"github.com/joho/godotenv"

	// Import generated docs
	_ "github.com/brandon-relentnet/myscrollr/api/docs"
)

// @title Scrollr API
// @version 1.0
// @description High-performance data API for Scrollr finance and sports.
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.email admin@relentnet.com

// @license.name Apache 2.0
// @license.url http://www.apache.org/licenses/LICENSE-2.0.html

// @host localhost:8080
// @BasePath /
func main() {
	// Load .env if present
	_ = godotenv.Load()

	// Initialize database connection
	ConnectDB()
	defer dbPool.Close()

	// Initialize Fiber app
	app := fiber.New(fiber.Config{
		AppName: "Scrollr API",
	})

	// Middleware
	app.Use(logger.New())
	app.Use(cors.New())

	// Swagger Route
	app.Get("/swagger/*", swagger.HandlerDefault)

	// Routes
	app.Get("/health", HealthCheck)
	app.Get("/sports", GetSports)
	app.Get("/finance", GetFinance)

	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString("Welcome to Scrollr API. Visit /swagger for documentation.")
	})

	// Start server
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
// @Summary Show the status of server.
// @Description get the status of server.
// @Tags General
// @Accept json
// @Produce json
// @Success 200 {object} map[string]string
// @Router /health [get]
func HealthCheck(c *fiber.Ctx) error {
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"status": "healthy",
	})
}

// GetSports godoc
// @Summary Get latest sports games.
// @Description fetch the latest 50 sports games from the database.
// @Tags Sports
// @Accept json
// @Produce json
// @Success 200 {array} Game
// @Router /sports [get]
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

// GetFinance godoc
// @Summary Get latest market data.
// @Description fetch all tracked market data (trades) from the database.
// @Tags Finance
// @Accept json
// @Produce json
// @Success 200 {array} Trade
// @Router /finance [get]
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
