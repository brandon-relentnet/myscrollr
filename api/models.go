package main

import (
	"time"
)

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

type Trade struct {
	Symbol           string    `json:"symbol"`
	Price            float64   `json:"price"`
	PreviousClose    float64   `json:"previous_close"`
	PriceChange      float64   `json:"price_change"`
	PercentageChange float64   `json:"percentage_change"`
	Direction        string    `json:"direction"`
	LastUpdated      time.Time `json:"last_updated"`
}

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

type TrackedFeed struct {
	URL       string `json:"url"`
	Name      string `json:"name"`
	Category  string `json:"category"`
	IsDefault bool   `json:"is_default"`
}

type DashboardResponse struct {
	Finance     []Trade          `json:"finance"`
	Sports      []Game           `json:"sports"`
	Rss         []RssItem        `json:"rss"`
	Yahoo       *FantasyContent  `json:"yahoo,omitempty"`
	Preferences *UserPreferences `json:"preferences,omitempty"`
	Streams     []Stream         `json:"streams,omitempty"`
}
