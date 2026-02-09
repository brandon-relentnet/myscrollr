package core

import (
	"time"
)

// Game represents a sports game from the ESPN ingestion service.
type Game struct {
	ID             int       `json:"id"`
	League         string    `json:"league"`
	ExternalGameID string    `json:"external_game_id"`
	Link           string    `json:"link"`
	HomeTeamName   string    `json:"home_team_name"`
	HomeTeamLogo   string    `json:"home_team_logo"`
	HomeTeamScore  int       `json:"home_team_score"`
	AwayTeamName   string    `json:"away_team_name"`
	AwayTeamLogo   string    `json:"away_team_logo"`
	AwayTeamScore  int       `json:"away_team_score"`
	StartTime      time.Time `json:"start_time"`
	ShortDetail    string    `json:"short_detail"`
	State          string    `json:"state"`
}

// Trade represents a financial trade from the Finnhub ingestion service.
type Trade struct {
	Symbol           string    `json:"symbol"`
	Price            float64   `json:"price"`
	PreviousClose    float64   `json:"previous_close"`
	PriceChange      float64   `json:"price_change"`
	PercentageChange float64   `json:"percentage_change"`
	Direction        string    `json:"direction"`
	LastUpdated      time.Time `json:"last_updated"`
}

// UserPreferences represents a user's extension display preferences.
type UserPreferences struct {
	LogtoSub      string   `json:"-"`
	FeedMode      string   `json:"feed_mode"`
	FeedPosition  string   `json:"feed_position"`
	FeedBehavior  string   `json:"feed_behavior"`
	FeedEnabled   bool     `json:"feed_enabled"`
	EnabledSites  []string `json:"enabled_sites"`
	DisabledSites []string `json:"disabled_sites"`
	UpdatedAt     string   `json:"updated_at"`
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

// RssItem represents an RSS feed article.
type RssItem struct {
	ID          int        `json:"id"`
	FeedURL     string     `json:"feed_url"`
	GUID        string     `json:"guid"`
	Title       string     `json:"title"`
	Link        string     `json:"link"`
	Description string     `json:"description"`
	SourceName  string     `json:"source_name"`
	PublishedAt *time.Time `json:"published_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// TrackedFeed represents an RSS feed in the catalog.
type TrackedFeed struct {
	URL       string `json:"url"`
	Name      string `json:"name"`
	Category  string `json:"category"`
	IsDefault bool   `json:"is_default"`
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
