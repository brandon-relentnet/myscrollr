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

// Integration defines the contract every integration package must satisfy
// in order to plug into the Scrollr platform.
type Integration interface {
	// Name returns the short identifier used in stream types and routing
	// (e.g. "finance", "sports", "rss", "fantasy").
	Name() string

	// DisplayName returns a human-readable label for the integration.
	DisplayName() string

	// RegisterRoutes mounts the integration's HTTP routes onto the Fiber app.
	// The authMiddleware parameter is the LogtoAuth middleware.
	RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler)

	// HandlesTable returns true if this integration should process CDC events
	// for the given database table name.
	HandlesTable(tableName string) bool

	// RouteCDCRecord routes a CDC event to the correct users. The payload
	// is the pre-serialised envelope that clients expect.
	RouteCDCRecord(ctx context.Context, record CDCRecord, payload []byte) error

	// GetDashboardData returns the integration's portion of the dashboard response.
	// The config comes from the user's stream config JSONB. Returns nil if there
	// is no data to contribute.
	GetDashboardData(ctx context.Context, userSub string, stream StreamInfo) (interface{}, error)

	// OnStreamCreated is called after a new stream of this integration's type is inserted.
	OnStreamCreated(ctx context.Context, userSub string, config map[string]interface{}) error

	// OnStreamUpdated is called after a stream of this integration's type is updated.
	// oldConfig may be nil if the config was not changed.
	OnStreamUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) error

	// OnStreamDeleted is called after a stream of this integration's type is deleted.
	OnStreamDeleted(ctx context.Context, userSub string, config map[string]interface{}) error

	// OnSyncSubscriptions is called during the subscription warm-up pass for
	// a single stream belonging to this integration type.
	OnSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) error

	// HealthCheck returns the current health status of the backing service.
	HealthCheck(ctx context.Context) (*HealthStatus, error)

	// InternalServiceURL returns the base URL of the integration's internal
	// ingestion service (e.g. "http://finance:3001"). Empty string means no
	// backing service.
	InternalServiceURL() string

	// ConfigSchema returns a JSON Schema describing the expected structure of
	// the stream config for this integration. Can return nil.
	ConfigSchema() json.RawMessage
}

// StreamInfo is a lightweight view of a user stream passed to GetDashboardData.
type StreamInfo struct {
	StreamType string
	Enabled    bool
	Config     map[string]interface{}
}
