package main

import "time"

// Game represents a sports game from the ESPN ingestion service.
type Game struct {
	ID             int       `json:"id"`
	League         string    `json:"league"`
	ExternalGameID string    `json:"external_game_id"`
	Link           string    `json:"link"`
	HomeTeamName   string    `json:"home_team_name"`
	HomeTeamLogo   string    `json:"home_team_logo"`
	HomeTeamScore  string    `json:"home_team_score"`
	AwayTeamName   string    `json:"away_team_name"`
	AwayTeamLogo   string    `json:"away_team_logo"`
	AwayTeamScore  string    `json:"away_team_score"`
	StartTime      time.Time `json:"start_time"`
	ShortDetail    string    `json:"short_detail"`
	State          string    `json:"state"`
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
