package main

import (
	"context"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
)

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

	// Routes
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status": "healthy",
		})
	})

	// GET /sports - Fetch all recent/live games
	app.Get("/sports", func(c *fiber.Ctx) error {
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
	})

	// GET /finance - Fetch all tracked market data
	app.Get("/finance", func(c *fiber.Ctx) error {
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
	})

	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString("Welcome to Scrollr API")
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