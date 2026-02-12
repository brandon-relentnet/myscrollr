package core

import (
	"time"
)

// UserPreferences represents a user's extension display preferences.
type UserPreferences struct {
	LogtoSub         string   `json:"-"`
	FeedMode         string   `json:"feed_mode"`
	FeedPosition     string   `json:"feed_position"`
	FeedBehavior     string   `json:"feed_behavior"`
	FeedEnabled      bool     `json:"feed_enabled"`
	EnabledSites     []string `json:"enabled_sites"`
	DisabledSites    []string `json:"disabled_sites"`
	SubscriptionTier string   `json:"subscription_tier"`
	UpdatedAt        string   `json:"updated_at"`
}

// Stream represents a user's subscription to a data integration.
type Stream struct {
	ID         int                    `json:"id"`
	LogtoSub   string                 `json:"-"`
	StreamType string                 `json:"stream_type"`
	Enabled    bool                   `json:"enabled"`
	Visible    bool                   `json:"visible"`
	Config     map[string]interface{} `json:"config"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
}

// DashboardResponse is the aggregated response for the /dashboard endpoint.
// Data is a generic map keyed by integration name (e.g. "finance", "sports").
type DashboardResponse struct {
	Data        map[string]interface{} `json:"data"`
	Preferences *UserPreferences       `json:"preferences,omitempty"`
	Streams     []Stream               `json:"streams,omitempty"`
}

// HealthResponse represents the aggregated health status.
type HealthResponse struct {
	Status   string            `json:"status"`
	Database string            `json:"database"`
	Redis    string            `json:"redis"`
	Services map[string]string `json:"services"`
}

// ErrorResponse represents a standard API error.
type ErrorResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}
