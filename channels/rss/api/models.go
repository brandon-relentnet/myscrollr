package main

import "time"

// RssItem represents an RSS article from the ingestion service.
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
	URL                 string     `json:"url"`
	Name                string     `json:"name"`
	Category            string     `json:"category"`
	IsDefault           bool       `json:"is_default"`
	ConsecutiveFailures int        `json:"consecutive_failures"`
	LastError           *string    `json:"last_error,omitempty"`
	LastSuccessAt       *time.Time `json:"last_success_at,omitempty"`
}

// CDCRecord represents a Change Data Capture record from Sequin.
type CDCRecord struct {
	Action   string                 `json:"action"`
	Record   map[string]interface{} `json:"record"`
	Changes  map[string]interface{} `json:"changes"`
	Metadata struct {
		TableSchema string `json:"table_schema"`
		TableName   string `json:"table_name"`
	} `json:"metadata"`
}

// ErrorResponse represents a standard API error.
type ErrorResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}
