package main

import "encoding/json"
import "encoding/xml"

// =============================================================================
// Yahoo Fantasy XML Types (used ONLY for OAuth GUID resolution)
// =============================================================================

// FantasyContent is the top-level XML wrapper for /users;use_login=1 only.
// We no longer parse league/standings/matchups/roster XML — that's all in Postgres.
type FantasyContent struct {
	XMLName xml.Name `xml:"fantasy_content" json:"-"`
	Users   *Users   `xml:"users,omitempty" json:"users,omitempty"`
}

type Users struct {
	User []User `xml:"user" json:"user"`
}

type User struct {
	Guid string `xml:"guid" json:"guid"`
}

// =============================================================================
// API Response Types — Postgres-backed (new)
// =============================================================================

// YahooStatusResponse returns whether user has Yahoo connected.
type YahooStatusResponse struct {
	Connected bool `json:"connected"`
	Synced    bool `json:"synced"`
}

// LeagueResponse is a single league with all associated data.
type LeagueResponse struct {
	LeagueKey string          `json:"league_key"`
	Name      string          `json:"name"`
	GameCode  string          `json:"game_code"`
	Season    string          `json:"season"`
	TeamKey   *string         `json:"team_key"`
	TeamName  *string         `json:"team_name"`
	Data      json.RawMessage `json:"data"`
	Standings json.RawMessage `json:"standings,omitempty"`
	Matchups  json.RawMessage `json:"matchups,omitempty"`
	Rosters   json.RawMessage `json:"rosters,omitempty"`
}

// MyLeaguesResponse is the response for GET /users/me/yahoo-leagues.
type MyLeaguesResponse struct {
	Leagues []LeagueResponse `json:"leagues"`
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
