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
	// CacheKeyFinance is the Redis key for cached trade data.
	CacheKeyFinance = "cache:finance"

	// FinanceCacheTTL is how long trade data is cached.
	FinanceCacheTTL = 30 * time.Second

	// FinanceSubscribersKey is the Redis set tracking finance stream subscribers.
	FinanceSubscribersKey = "stream:subscribers:finance"

	// DashboardTradesLimit caps the number of trades returned for dashboard.
	DashboardTradesLimit = 50

	// TradesQuery is the SQL used to fetch all trades.
	TradesQuery = "SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated FROM trades ORDER BY symbol ASC"
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

// getFinance retrieves the latest financial trades.
// The core gateway adds X-User-Sub header for authenticated requests.
func (a *App) getFinance(c *fiber.Ctx) error {
	var trades []Trade
	if GetCache(a.rdb, CacheKeyFinance, &trades) {
		c.Set("X-Cache", "HIT")
		return c.JSON(trades)
	}

	trades, err := a.queryTrades(context.Background())
	if err != nil {
		log.Printf("[Finance] getFinance query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Internal server error",
		})
	}

	SetCache(a.rdb, CacheKeyFinance, trades, FinanceCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(trades)
}

// healthHandler proxies a health check to the internal Rust finance service.
func (a *App) healthHandler(c *fiber.Ctx) error {
	return ProxyInternalHealth(c, os.Getenv("INTERNAL_FINANCE_URL"))
}

// =============================================================================
// Internal Routes (called by core gateway)
// =============================================================================

// handleInternalCDC receives CDC records from the core gateway and returns the
// list of users who should receive these records. For finance, all CDC records
// are for the trades table and are broadcast to all finance subscribers.
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
	subs, err := GetSubscribers(a.rdb, ctx, FinanceSubscribersKey)
	if err != nil {
		log.Printf("[Finance CDC] Failed to get subscribers: %v", err)
		return c.JSON(fiber.Map{"users": []string{}})
	}

	return c.JSON(fiber.Map{"users": subs})
}

// handleInternalDashboard returns finance data for a user's dashboard.
// Query param: user={logto_sub}
func (a *App) handleInternalDashboard(c *fiber.Ctx) error {
	// The user query param is available but finance data is the same for all
	// users — it's a shared market data feed. We still respect the cache.
	var trades []Trade
	if GetCache(a.rdb, CacheKeyFinance, &trades) {
		return c.JSON(fiber.Map{"finance": trades})
	}

	trades, err := a.queryTrades(context.Background())
	if err != nil {
		log.Printf("[Finance] Dashboard query failed: %v", err)
		return c.JSON(fiber.Map{"finance": []Trade{}})
	}

	SetCache(a.rdb, CacheKeyFinance, trades, FinanceCacheTTL)
	return c.JSON(fiber.Map{"finance": trades})
}

// handleInternalHealth is a simple liveness check for the core gateway.
func (a *App) handleInternalHealth(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "healthy"})
}

// =============================================================================
// Database Helpers
// =============================================================================

// queryTrades fetches all trades from PostgreSQL.
func (a *App) queryTrades(ctx context.Context) ([]Trade, error) {
	rows, err := a.db.Query(ctx, TradesQuery)
	if err != nil {
		return nil, fmt.Errorf("finance query failed: %w", err)
	}
	defer rows.Close()

	trades := make([]Trade, 0)
	for rows.Next() {
		var t Trade
		if err := rows.Scan(&t.Symbol, &t.Price, &t.PreviousClose, &t.PriceChange, &t.PercentageChange, &t.Direction, &t.LastUpdated); err != nil {
			log.Printf("[Finance] Row scan failed: %v", err)
			continue
		}
		trades = append(trades, t)
	}

	return trades, nil
}
