package finance

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/brandon-relentnet/myscrollr/api/core"
	"github.com/brandon-relentnet/myscrollr/api/integration"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Integration implements the core Integration interface plus CDCHandler,
// DashboardProvider, and HealthChecker for finance/market data.
type Integration struct {
	db         *pgxpool.Pool
	sendToUser integration.SendToUserFunc
	routeToSub integration.RouteToStreamSubscribersFunc
}

// New creates a new Finance integration.
func New(db *pgxpool.Pool, sendToUser integration.SendToUserFunc, routeToSub integration.RouteToStreamSubscribersFunc) *Integration {
	return &Integration{
		db:         db,
		sendToUser: sendToUser,
		routeToSub: routeToSub,
	}
}

// --- Core Interface ---

func (f *Integration) Name() string       { return "finance" }
func (f *Integration) DisplayName() string { return "Finance" }

func (f *Integration) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	router.Get("/finance/health", f.healthHandler)
	router.Get("/finance", authMiddleware, f.getFinance)
}

// --- CDCHandler ---

func (f *Integration) HandlesTable(tableName string) bool {
	return tableName == "trades"
}

func (f *Integration) RouteCDCRecord(ctx context.Context, record integration.CDCRecord, payload []byte) error {
	f.routeToSub(ctx, core.RedisStreamSubscribersPrefix+"finance", payload)
	return nil
}

// --- DashboardProvider ---

func (f *Integration) GetDashboardData(ctx context.Context, userSub string, stream integration.StreamInfo) (interface{}, error) {
	var trades []core.Trade
	if core.GetCache(core.CacheKeyFinance, &trades) {
		return trades, nil
	}

	rows, err := f.db.Query(ctx, "SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated FROM trades ORDER BY symbol ASC")
	if err != nil {
		return nil, fmt.Errorf("finance query failed: %w", err)
	}
	defer rows.Close()

	trades = make([]core.Trade, 0)
	for rows.Next() {
		var t core.Trade
		if err := rows.Scan(&t.Symbol, &t.Price, &t.PreviousClose, &t.PriceChange, &t.PercentageChange, &t.Direction, &t.LastUpdated); err != nil {
			log.Printf("[Finance] Dashboard scan failed: %v", err)
			continue
		}
		trades = append(trades, t)
	}

	core.SetCache(core.CacheKeyFinance, trades, core.FinanceCacheTTL)
	return trades, nil
}

// --- HealthChecker ---

func (f *Integration) InternalServiceURL() string { return os.Getenv("INTERNAL_FINANCE_URL") }

// --- HTTP Handlers ---

func (f *Integration) healthHandler(c *fiber.Ctx) error {
	return core.ProxyInternalHealth(c, f.InternalServiceURL())
}

// getFinance retrieves the latest financial trades.
// @Summary Get latest finance trades
// @Description Fetches latest stock/crypto trades with 30s caching
// @Tags Data
// @Produce json
// @Success 200 {array} core.Trade
// @Security LogtoAuth
// @Router /finance [get]
func (f *Integration) getFinance(c *fiber.Ctx) error {
	var trades []core.Trade
	if core.GetCache(core.CacheKeyFinance, &trades) {
		c.Set("X-Cache", "HIT")
		return c.JSON(trades)
	}

	rows, err := f.db.Query(context.Background(),
		"SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated FROM trades ORDER BY symbol ASC")
	if err != nil {
		log.Printf("[Database Error] GetFinance query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{Status: "error", Error: "Internal server error"})
	}
	defer rows.Close()

	trades = make([]core.Trade, 0)
	for rows.Next() {
		var t core.Trade
		if err := rows.Scan(&t.Symbol, &t.Price, &t.PreviousClose, &t.PriceChange, &t.PercentageChange, &t.Direction, &t.LastUpdated); err != nil {
			log.Printf("[Database Error] GetFinance scan failed: %v", err)
			continue
		}
		trades = append(trades, t)
	}

	core.SetCache(core.CacheKeyFinance, trades, core.FinanceCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(trades)
}
