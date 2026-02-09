package integration

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
)

// CDCRecord represents a single Sequin CDC event. Shared by core webhook
// handler and every integration's RouteCDCRecord implementation.
type CDCRecord struct {
	Action   string                 `json:"action"`
	Record   map[string]interface{} `json:"record"`
	Changes  map[string]interface{} `json:"changes"`
	Metadata struct {
		TableSchema string `json:"table_schema"`
		TableName   string `json:"table_name"`
	} `json:"metadata"`
}

// HealthStatus represents the health state of an integration's backing service.
type HealthStatus struct {
	Status string `json:"status"` // "healthy" | "down" | "unknown"
}

// SendToUserFunc is the signature the core event hub exposes for publishing
// a pre-serialised message to a specific user's Redis channel.
type SendToUserFunc func(sub string, msg []byte)

// RouteToStreamSubscribersFunc sends a payload to all users in a Redis subscription set.
type RouteToStreamSubscribersFunc func(ctx context.Context, setKey string, payload []byte)

// StreamInfo is a lightweight view of a user stream passed to GetDashboardData.
type StreamInfo struct {
	StreamType string
	Enabled    bool
	Config     map[string]interface{}
}

// =============================================================================
// Core Interface (required)
// =============================================================================

// Integration defines the minimal contract every integration must satisfy.
// Only three methods are required — all other behaviour is opt-in via the
// optional capability interfaces below.
type Integration interface {
	// Name returns the short identifier used in stream types and routing
	// (e.g. "finance", "sports", "rss", "fantasy").
	Name() string

	// DisplayName returns a human-readable label for the integration.
	DisplayName() string

	// RegisterRoutes mounts the integration's HTTP routes onto the Fiber app.
	// The authMiddleware parameter is the LogtoAuth middleware.
	RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler)
}

// =============================================================================
// Optional Capability Interfaces
// =============================================================================
// The core server checks for these via Go type assertions (if h, ok :=
// intg.(CDCHandler); ok { ... }). Only implement the interfaces your
// integration actually needs — no stubs required.

// CDCHandler enables an integration to receive and route Sequin CDC events.
// Implement this if your integration owns one or more database tables whose
// changes should be pushed to users in real time.
type CDCHandler interface {
	// HandlesTable returns true if this integration should process CDC events
	// for the given database table name.
	HandlesTable(tableName string) bool

	// RouteCDCRecord routes a CDC event to the correct users. The payload
	// is the pre-serialised envelope that clients expect.
	RouteCDCRecord(ctx context.Context, record CDCRecord, payload []byte) error
}

// DashboardProvider enables an integration to contribute data to the
// aggregated /dashboard endpoint.
type DashboardProvider interface {
	// GetDashboardData returns the integration's portion of the dashboard
	// response. The stream info comes from the user's enabled stream.
	// Return nil if there is no data to contribute.
	GetDashboardData(ctx context.Context, userSub string, stream StreamInfo) (interface{}, error)
}

// StreamLifecycle enables an integration to react to stream CRUD events.
// Implement this if you need to manage Redis subscription sets, sync
// external resources, invalidate caches, or perform other side effects
// when a user creates, updates, or deletes a stream of your type.
type StreamLifecycle interface {
	// OnStreamCreated is called after a new stream of this type is inserted.
	OnStreamCreated(ctx context.Context, userSub string, config map[string]interface{}) error

	// OnStreamUpdated is called after a stream of this type is updated.
	// oldConfig may be nil if the config was not changed.
	OnStreamUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) error

	// OnStreamDeleted is called after a stream of this type is deleted.
	OnStreamDeleted(ctx context.Context, userSub string, config map[string]interface{}) error

	// OnSyncSubscriptions is called during the subscription warm-up pass
	// for a single stream belonging to this integration type.
	OnSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) error
}

// HealthChecker indicates the integration has a backing ingestion service
// whose health can be monitored. The core health endpoint will proxy a
// health check to the returned URL.
type HealthChecker interface {
	// InternalServiceURL returns the base URL of the integration's internal
	// ingestion service (e.g. "http://finance:3001"). Empty string means
	// no backing service to monitor.
	InternalServiceURL() string
}

// Configurable enables an integration to advertise a JSON Schema for its
// stream config. This can be used by the frontend for form generation or
// validation.
type Configurable interface {
	// ConfigSchema returns a JSON Schema describing the expected structure
	// of the stream config for this integration. Can return nil.
	ConfigSchema() json.RawMessage
}
