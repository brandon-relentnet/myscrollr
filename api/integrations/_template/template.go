// Package _template is a scaffold for creating new Scrollr integrations.
//
// To create a new integration:
//  1. Copy this directory to api/integrations/<yourname>/
//  2. Rename the package from "_template" to your integration name
//  3. Find/replace "example" with your integration's short name
//  4. Implement the Core Interface methods (required)
//  5. Uncomment and implement only the optional interfaces you need
//  6. Register in main.go (see bottom of this file)
//
// See api/INTEGRATIONS.md for the full developer guide.
package _template

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/brandon-relentnet/myscrollr/api/core"
	"github.com/brandon-relentnet/myscrollr/api/integration"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	// Uncomment if you need direct Redis access (e.g. cache invalidation):
	// "github.com/redis/go-redis/v9"
)

// =============================================================================
// Struct & Constructor
// =============================================================================

// Integration holds the dependencies for the example integration.
// Include only the dependencies you actually need.
type Integration struct {
	db *pgxpool.Pool

	// For CDC routing: pick ONE of these depending on your routing strategy.
	//
	// Use sendToUser when you route CDC events to a SPECIFIC user
	// (e.g. fantasy resolves a guid to a logto_sub, then sends directly).
	sendToUser integration.SendToUserFunc

	// Use routeToSub when you broadcast CDC events to ALL users in a
	// Redis subscription set (e.g. finance/sports broadcast to
	// "stream:subscribers:<type>").
	routeToSub integration.RouteToStreamSubscribersFunc

	// Uncomment if you need direct Redis access:
	// rdb *redis.Client
}

// New creates a new example integration.
// Adjust the parameter list to match the dependencies you need.
func New(
	db *pgxpool.Pool,
	sendToUser integration.SendToUserFunc,
	routeToSub integration.RouteToStreamSubscribersFunc,
) *Integration {
	return &Integration{
		db:         db,
		sendToUser: sendToUser,
		routeToSub: routeToSub,
	}
}

// =============================================================================
// Core Interface (REQUIRED — every integration must implement these)
// =============================================================================

// Name returns the short identifier used in stream types, routing, and the
// dashboard response key. Must be unique across all integrations.
// Convention: lowercase, no spaces (e.g. "finance", "sports", "rss", "fantasy").
func (e *Integration) Name() string { return "example" }

// DisplayName returns a human-readable label shown in logs and admin UIs.
func (e *Integration) DisplayName() string { return "Example" }

// RegisterRoutes mounts your HTTP endpoints onto the Fiber app.
// Use authMiddleware for any route that requires authentication.
func (e *Integration) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	// Health endpoint (convention: /<name>/health)
	router.Get("/example/health", e.healthHandler)

	// Public routes (no auth)
	// router.Get("/example/public-data", e.publicHandler)

	// Protected routes (with auth)
	router.Get("/example", authMiddleware, e.getData)
}

// =============================================================================
// CDCHandler (OPTIONAL — uncomment if your integration processes CDC events)
// =============================================================================
// Implement this if your integration owns database tables whose changes
// should be pushed to users in real time via Sequin CDC.

// HandlesTable returns true if this integration should process CDC events
// for the given database table.
func (e *Integration) HandlesTable(tableName string) bool {
	// TODO: Replace with your table name(s)
	return tableName == "example_items"
}

// RouteCDCRecord routes a CDC event to the correct users.
//
// Common patterns:
//
// Pattern A — Broadcast to all subscribers of this stream type:
//
//	e.routeToSub(ctx, core.RedisStreamSubscribersPrefix+"example", payload)
//
// Pattern B — Route to a specific user by record field:
//
//	core.RouteToRecordOwner(record.Record, "logto_sub", payload)
//
// Pattern C — Route to users subscribed to a specific resource (like RSS per-feed):
//
//	resourceID := record.Record["resource_id"].(string)
//	subs, _ := core.GetSubscribers(ctx, "example:subscribers:"+resourceID)
//	for _, sub := range subs { e.sendToUser(sub, payload) }
func (e *Integration) RouteCDCRecord(ctx context.Context, record integration.CDCRecord, payload []byte) error {
	// TODO: Choose a routing pattern from above
	e.routeToSub(ctx, core.RedisStreamSubscribersPrefix+"example", payload)
	return nil
}

// =============================================================================
// DashboardProvider (OPTIONAL — uncomment if your integration provides dashboard data)
// =============================================================================
// Implement this if your integration should contribute data to the
// aggregated GET /dashboard response.

// GetDashboardData returns this integration's data for the user's dashboard.
// Return nil if there's no data to contribute.
//
// Common pattern: check cache first, then query DB, then cache the result.
func (e *Integration) GetDashboardData(ctx context.Context, userSub string, stream integration.StreamInfo) (interface{}, error) {
	cacheKey := "cache:example"
	var items []interface{}
	if core.GetCache(cacheKey, &items) {
		return items, nil
	}

	// TODO: Query your data from the database
	rows, err := e.db.Query(ctx, "SELECT id, name FROM example_items ORDER BY created_at DESC LIMIT 50")
	if err != nil {
		return nil, fmt.Errorf("example query failed: %w", err)
	}
	defer rows.Close()

	items = make([]interface{}, 0)
	// TODO: Scan rows into your model structs
	_ = rows // placeholder

	core.SetCache(cacheKey, items, core.SportsCacheTTL) // TODO: Use an appropriate TTL
	return items, nil
}

// =============================================================================
// StreamLifecycle (OPTIONAL — uncomment if your integration needs stream hooks)
// =============================================================================
// Implement this if you need to react when users create, update, or delete
// streams of your type. Common use cases:
//   - Syncing external resources (like RSS feed URLs to tracked_feeds)
//   - Managing per-resource Redis subscription sets
//   - Invalidating per-user caches
//
// If your integration does simple broadcast CDC routing (like finance/sports),
// you do NOT need StreamLifecycle — the core handles basic Redis subscription
// set management automatically.

/*
func (e *Integration) OnStreamCreated(ctx context.Context, userSub string, config map[string]interface{}) error {
	// TODO: Perform setup when a user creates an "example" stream
	return nil
}

func (e *Integration) OnStreamUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) error {
	// TODO: Handle config changes (diff old vs new, update subscriptions, invalidate caches)
	return nil
}

func (e *Integration) OnStreamDeleted(ctx context.Context, userSub string, config map[string]interface{}) error {
	// TODO: Clean up when a user deletes their "example" stream
	return nil
}

func (e *Integration) OnSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) error {
	// TODO: Rebuild Redis subscription sets for this user during warm-up
	// This is called on every dashboard load to ensure sets are in sync with DB.
	return nil
}
*/

// =============================================================================
// HealthChecker (OPTIONAL — uncomment if your integration has a backing service)
// =============================================================================
// Implement this if your integration has an ingestion service whose health
// should appear on GET /health and have a dedicated /<name>/health proxy.

// InternalServiceURL returns the base URL of the backing ingestion service.
// The core health check will append /health and proxy the response.
func (e *Integration) InternalServiceURL() string {
	return os.Getenv("INTERNAL_EXAMPLE_URL") // e.g. "http://example:3005"
}

// =============================================================================
// Configurable (OPTIONAL — uncomment if your integration has a config schema)
// =============================================================================
// Implement this if you want to advertise a JSON Schema for your stream
// config. The frontend can use this for form generation and validation.

/*
func (e *Integration) ConfigSchema() json.RawMessage {
	schema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"items": map[string]interface{}{
				"type": "array",
				"items": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"url":  map[string]string{"type": "string"},
						"name": map[string]string{"type": "string"},
					},
				},
			},
		},
	}
	data, _ := json.Marshal(schema)
	return data
}
*/

// =============================================================================
// Init (OPTIONAL — only if your integration needs explicit initialisation)
// =============================================================================
// Some integrations need to run setup logic AFTER infrastructure is connected
// but BEFORE the server starts. If so, add an Init() method and call it
// from main.go between New() and RegisterIntegration().
//
// Example: Fantasy calls Init() to configure Yahoo OAuth and create the
// yahoo_users table.

/*
func (e *Integration) Init() {
	// Setup OAuth config, create tables, etc.
	e.ensureTables()
}

func (e *Integration) ensureTables() {
	_, err := e.db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS example_items (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		log.Printf("Warning: Failed to create example_items table: %v", err)
	}
}
*/

// =============================================================================
// HTTP Handlers
// =============================================================================

func (e *Integration) healthHandler(c *fiber.Ctx) error {
	return core.ProxyInternalHealth(c, e.InternalServiceURL())
}

// getData retrieves the latest example data.
// @Summary Get example data
// @Description Fetches latest example items
// @Tags Data
// @Produce json
// @Success 200 {array} object
// @Security LogtoAuth
// @Router /example [get]
func (e *Integration) getData(c *fiber.Ctx) error {
	// TODO: Implement your data endpoint
	return c.JSON(fiber.Map{"items": []interface{}{}})
}

// =============================================================================
// Registration (add to main.go)
// =============================================================================
//
// Simple integration (no Init):
//
//   srv.RegisterIntegration(example.New(core.DBPool, core.SendToUser, core.RouteToStreamSubscribers))
//
// Integration with Init:
//
//   exampleIntg := example.New(core.DBPool, core.SendToUser, core.RouteToStreamSubscribers)
//   exampleIntg.Init()
//   srv.RegisterIntegration(exampleIntg)
//

// Ensure unused imports don't cause build errors in the template.
// Remove these once you've implemented the relevant functionality.
var (
	_ = context.Background
	_ = json.Marshal
	_ = fmt.Sprintf
	_ = log.Printf
	_ = os.Getenv
)
