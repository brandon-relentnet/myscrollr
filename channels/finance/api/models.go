package main

import "time"

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

// TrackedSymbol represents a symbol entry from the catalog.
type TrackedSymbol struct {
	Symbol   string `json:"symbol"`
	Name     string `json:"name"`
	Category string `json:"category"`
}

// ErrorResponse represents a standard API error.
type ErrorResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}
