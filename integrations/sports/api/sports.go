package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// =============================================================================
// Constants
// =============================================================================

const (
	// CacheKeySports is the Redis key for cached game data.
	CacheKeySports = "cache:sports"

	// SportsCacheTTL is how long game data is cached.
	SportsCacheTTL = 30 * time.Second

	// SportsSubscribersKey is the Redis set tracking sports stream subscribers.
	SportsSubscribersKey = "stream:subscribers:sports"

	// DefaultSportsLimit caps the number of games returned for the public route.
	DefaultSportsLimit = 50

	// DashboardSportsLimit caps the number of games returned for dashboard.
	DashboardSportsLimit = 20
)

// =============================================================================
// App
// =============================================================================

// App holds the shared dependencies for all handlers.
type App struct {
	db  *pgxpool.Pool
	rdb *redis.Client
}

// =============================================================================
// Public Routes (proxied by core gateway)
// =============================================================================

// getSports retrieves the latest sports games.
// The core gateway adds X-User-Sub header for authenticated requests.
func (a *App) getSports(c *fiber.Ctx) error {
	var games []Game
	if GetCache(a.rdb, CacheKeySports, &games) {
		c.Set("X-Cache", "HIT")
		return c.JSON(games)
	}

	games, err := a.queryGames(context.Background(), DefaultSportsLimit)
	if err != nil {
		log.Printf("[Sports] getSports query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Internal server error",
		})
	}

	SetCache(a.rdb, CacheKeySports, games, SportsCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(games)
}

// healthHandler proxies a health check to the internal Rust sports service.
func (a *App) healthHandler(c *fiber.Ctx) error {
	return ProxyInternalHealth(c, os.Getenv("INTERNAL_SPORTS_URL"))
}

// =============================================================================
// Internal Routes (called by core gateway)
// =============================================================================

// handleInternalCDC receives CDC records from the core gateway and returns the
// list of users who should receive these records. For sports, all CDC records
// are for the games table and are broadcast to all sports subscribers.
func (a *App) handleInternalCDC(c *fiber.Ctx) error {
	var req struct {
		Records []CDCRecord `json:"records"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	ctx := context.Background()
	subs, err := GetSubscribers(a.rdb, ctx, SportsSubscribersKey)
	if err != nil {
		log.Printf("[Sports CDC] Failed to get subscribers: %v", err)
		return c.JSON(fiber.Map{"users": []string{}})
	}

	return c.JSON(fiber.Map{"users": subs})
}

// handleInternalDashboard returns sports data for a user's dashboard.
// Query param: user={logto_sub}
func (a *App) handleInternalDashboard(c *fiber.Ctx) error {
	// The user query param is available but sports data is the same for all
	// users — it's a shared sports scores feed. We still respect the cache.
	var games []Game
	if GetCache(a.rdb, CacheKeySports, &games) {
		return c.JSON(fiber.Map{"sports": games})
	}

	games, err := a.queryGames(context.Background(), DashboardSportsLimit)
	if err != nil {
		log.Printf("[Sports] Dashboard query failed: %v", err)
		return c.JSON(fiber.Map{"sports": []Game{}})
	}

	SetCache(a.rdb, CacheKeySports, games, SportsCacheTTL)
	return c.JSON(fiber.Map{"sports": games})
}

// handleInternalHealth is a simple liveness check for the core gateway.
func (a *App) handleInternalHealth(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "healthy"})
}

// =============================================================================
// Database Helpers
// =============================================================================

// queryGames fetches games from PostgreSQL ordered by start_time descending.
func (a *App) queryGames(ctx context.Context, limit int) ([]Game, error) {
	rows, err := a.db.Query(ctx, fmt.Sprintf("SELECT id, league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state FROM games ORDER BY start_time DESC LIMIT %d", limit))
	if err != nil {
		return nil, fmt.Errorf("sports query failed: %w", err)
	}
	defer rows.Close()

	games := make([]Game, 0)
	for rows.Next() {
		var g Game
		if err := rows.Scan(&g.ID, &g.League, &g.ExternalGameID, &g.Link, &g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore, &g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore, &g.StartTime, &g.ShortDetail, &g.State); err != nil {
			log.Printf("[Sports] Row scan failed: %v", err)
			continue
		}
		games = append(games, g)
	}

	return games, nil
}
