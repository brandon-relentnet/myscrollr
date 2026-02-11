package main

import (
	"context"
	"encoding/json"
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
	// CacheKeyFinance is the Redis key for cached trade data (all trades).
	CacheKeyFinance = "cache:finance"

	// CacheKeyFinancePrefix is the Redis key prefix for per-user trade caches.
	CacheKeyFinancePrefix = "cache:finance:"

	// CacheKeyFinanceCatalog is the Redis key for the cached symbol catalog.
	CacheKeyFinanceCatalog = "cache:finance:catalog"

	// FinanceCacheTTL is how long trade data is cached.
	FinanceCacheTTL = 30 * time.Second

	// FinanceCatalogCacheTTL is how long the symbol catalog is cached.
	FinanceCatalogCacheTTL = 5 * time.Minute

	// RedisFinanceSubscribersPrefix is the Redis key prefix for per-symbol
	// subscriber sets (e.g. "finance:subscribers:AAPL").
	RedisFinanceSubscribersPrefix = "finance:subscribers:"

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

// getSymbolCatalog returns all enabled tracked symbols for the dashboard
// symbol browser.
func (a *App) getSymbolCatalog(c *fiber.Ctx) error {
	var catalog []TrackedSymbol
	if GetCache(a.rdb, CacheKeyFinanceCatalog, &catalog) {
		c.Set("X-Cache", "HIT")
		return c.JSON(catalog)
	}

	rows, err := a.db.Query(context.Background(),
		"SELECT symbol, COALESCE(name, symbol), COALESCE(category, 'Other') FROM tracked_symbols WHERE is_enabled = true ORDER BY category, symbol")
	if err != nil {
		log.Printf("[Finance] Catalog query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to fetch symbol catalog",
		})
	}
	defer rows.Close()

	catalog = make([]TrackedSymbol, 0)
	for rows.Next() {
		var s TrackedSymbol
		if err := rows.Scan(&s.Symbol, &s.Name, &s.Category); err != nil {
			log.Printf("[Finance] Catalog scan error: %v", err)
			continue
		}
		catalog = append(catalog, s)
	}

	SetCache(a.rdb, CacheKeyFinanceCatalog, catalog, FinanceCatalogCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(catalog)
}

// healthHandler proxies a health check to the internal Rust finance service.
func (a *App) healthHandler(c *fiber.Ctx) error {
	return ProxyInternalHealth(c, os.Getenv("INTERNAL_FINANCE_URL"))
}

// =============================================================================
// Internal Routes (called by core gateway)
// =============================================================================

// handleInternalCDC receives CDC records from the core gateway and returns the
// list of users who should receive these records.
//
// Finance uses per-symbol routing: for each CDC record, we extract the symbol
// field and look up which users are subscribed to that specific symbol via the
// Redis set finance:subscribers:{symbol}. The returned user list is the union
// of all subscribers across all symbols in the batch.
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
	userSet := make(map[string]bool)

	for _, rec := range req.Records {
		symbol, ok := rec.Record["symbol"].(string)
		if !ok || symbol == "" {
			continue
		}
		subs, err := GetSubscribers(a.rdb, ctx, RedisFinanceSubscribersPrefix+symbol)
		if err != nil {
			log.Printf("[Finance CDC] Failed to get subscribers for %s: %v", symbol, err)
			continue
		}
		for _, sub := range subs {
			userSet[sub] = true
		}
	}

	users := make([]string, 0, len(userSet))
	for sub := range userSet {
		users = append(users, sub)
	}

	return c.JSON(fiber.Map{"users": users})
}

// handleInternalDashboard returns finance data for a user's dashboard.
// Query param: user={logto_sub}
func (a *App) handleInternalDashboard(c *fiber.Ctx) error {
	userSub := c.Query("user")
	if userSub == "" {
		return c.JSON(fiber.Map{"finance": []Trade{}})
	}

	// Check per-user cache first
	cacheKey := CacheKeyFinancePrefix + userSub
	var trades []Trade
	if GetCache(a.rdb, cacheKey, &trades) {
		return c.JSON(fiber.Map{"finance": trades})
	}

	// Get user's selected symbols from their stream config
	symbols := a.getUserFinanceSymbols(userSub)
	if len(symbols) == 0 {
		return c.JSON(fiber.Map{"finance": []Trade{}})
	}

	trades = a.queryTradesBySymbols(symbols)
	if trades == nil {
		trades = make([]Trade, 0)
	}

	SetCache(a.rdb, cacheKey, trades, FinanceCacheTTL)
	return c.JSON(fiber.Map{"finance": trades})
}

// handleInternalHealth is a simple liveness check for the core gateway.
func (a *App) handleInternalHealth(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "healthy"})
}

// =============================================================================
// Stream Lifecycle
// =============================================================================

// handleStreamLifecycle handles stream lifecycle events dispatched by the core
// gateway. Events: created, updated, deleted, sync.
func (a *App) handleStreamLifecycle(c *fiber.Ctx) error {
	var req struct {
		Event     string                 `json:"event"`
		User      string                 `json:"user"`
		Config    map[string]interface{} `json:"config"`
		OldConfig map[string]interface{} `json:"old_config"`
		Enabled   bool                   `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	ctx := context.Background()

	switch req.Event {
	case "created":
		// No special action needed on create — sync event handles subscriber sets
		log.Printf("[Finance Lifecycle] Stream created for user %s", req.User)

	case "updated":
		a.onStreamUpdated(ctx, req.User, req.OldConfig, req.Config)

	case "deleted":
		a.onStreamDeleted(ctx, req.User, req.Config)

	case "sync":
		a.onSyncSubscriptions(ctx, req.User, req.Config, req.Enabled)

	default:
		log.Printf("[Finance Lifecycle] Unknown event: %s", req.Event)
	}

	return c.JSON(fiber.Map{"ok": true})
}

// onStreamUpdated handles symbol list changes when a stream is updated.
// 1. Diffs old vs new symbols, removes user from stale subscriber sets
// 2. Invalidates per-user cache
func (a *App) onStreamUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) {
	if newConfig == nil {
		return
	}

	oldSymbols := extractSymbolsFromStreamConfig(oldConfig)
	newSymbols := extractSymbolsFromStreamConfig(newConfig)
	newSet := make(map[string]bool, len(newSymbols))
	for _, s := range newSymbols {
		newSet[s] = true
	}
	for _, s := range oldSymbols {
		if !newSet[s] {
			RemoveSubscriber(a.rdb, ctx, RedisFinanceSubscribersPrefix+s, userSub)
		}
	}

	// Invalidate per-user cache
	a.rdb.Del(ctx, CacheKeyFinancePrefix+userSub)
}

// onStreamDeleted removes the user from all symbol subscriber sets and
// invalidates per-user cache when a stream is removed.
func (a *App) onStreamDeleted(ctx context.Context, userSub string, config map[string]interface{}) {
	symbols := extractSymbolsFromStreamConfig(config)
	for _, s := range symbols {
		RemoveSubscriber(a.rdb, ctx, RedisFinanceSubscribersPrefix+s, userSub)
	}
	a.rdb.Del(ctx, CacheKeyFinancePrefix+userSub)
}

// onSyncSubscriptions adds or removes the user from per-symbol subscriber
// sets based on the enabled flag. Called on dashboard load to warm sets.
func (a *App) onSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) {
	symbols := extractSymbolsFromStreamConfig(config)
	for _, s := range symbols {
		if enabled {
			AddSubscriber(a.rdb, ctx, RedisFinanceSubscribersPrefix+s, userSub)
		} else {
			RemoveSubscriber(a.rdb, ctx, RedisFinanceSubscribersPrefix+s, userSub)
		}
	}
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

// queryTradesBySymbols fetches trades for a specific set of symbols.
func (a *App) queryTradesBySymbols(symbols []string) []Trade {
	if len(symbols) == 0 {
		return nil
	}

	rows, err := a.db.Query(context.Background(), `
		SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated
		FROM trades
		WHERE symbol = ANY($1)
		ORDER BY symbol ASC
	`, symbols)
	if err != nil {
		log.Printf("[Finance] Trades by symbols query failed: %v", err)
		return nil
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
	return trades
}

// getUserFinanceSymbols extracts the symbol list from a user's finance stream config.
func (a *App) getUserFinanceSymbols(logtoSub string) []string {
	var configJSON []byte
	err := a.db.QueryRow(context.Background(), `
		SELECT config FROM user_streams
		WHERE logto_sub = $1 AND stream_type = 'finance'
	`, logtoSub).Scan(&configJSON)
	if err != nil {
		return nil
	}
	return extractSymbolsFromConfig(configJSON)
}

// =============================================================================
// Config Parsing Helpers
// =============================================================================

// extractSymbolsFromStreamConfig extracts symbols from a stream's config map.
func extractSymbolsFromStreamConfig(config map[string]interface{}) []string {
	if config == nil {
		return nil
	}
	configJSON, err := json.Marshal(config)
	if err != nil {
		return nil
	}
	return extractSymbolsFromConfig(configJSON)
}

// extractSymbolsFromConfig parses a config JSONB blob and returns symbol strings.
func extractSymbolsFromConfig(configJSON []byte) []string {
	var config struct {
		Symbols []string `json:"symbols"`
	}
	if err := json.Unmarshal(configJSON, &config); err != nil {
		return nil
	}

	symbols := make([]string, 0, len(config.Symbols))
	for _, s := range config.Symbols {
		if s != "" {
			symbols = append(symbols, s)
		}
	}
	return symbols
}
