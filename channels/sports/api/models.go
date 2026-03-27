package main

import "time"

// Game represents a sports game from the api-sports.io ingestion service.
type Game struct {
	ID             int       `json:"id"`
	League         string    `json:"league"`
	Sport          string    `json:"sport"`
	ExternalGameID string    `json:"external_game_id"`
	Link           string    `json:"link"`
	HomeTeamName   string    `json:"home_team_name"`
	HomeTeamLogo   string    `json:"home_team_logo"`
	HomeTeamScore  string    `json:"home_team_score"`
	HomeTeamCode   string    `json:"home_team_code"`
	AwayTeamName   string    `json:"away_team_name"`
	AwayTeamLogo   string    `json:"away_team_logo"`
	AwayTeamScore  string    `json:"away_team_score"`
	AwayTeamCode   string    `json:"away_team_code"`
	StartTime      time.Time `json:"start_time"`
	ShortDetail    string    `json:"short_detail"`
	State          string    `json:"state"`
	StatusShort    string    `json:"status_short,omitempty"`
	StatusLong     string    `json:"status_long,omitempty"`
	Timer          string    `json:"timer,omitempty"`
	Venue          string    `json:"venue,omitempty"`
	Season         string    `json:"season,omitempty"`
}

// TrackedLeague represents a league entry from the catalog, enriched with
// current game activity counts for the dashboard league browser.
type TrackedLeague struct {
	Name            string     `json:"name"`
	SportAPI        string     `json:"sport_api"`
	Category        string     `json:"category"`
	Country         string     `json:"country"`
	LogoURL         string     `json:"logo_url"`
	GameCount       int        `json:"game_count"`
	LiveCount       int        `json:"live_count"`
	NextGame        *time.Time `json:"next_game,omitempty"`
	IsOffseason     bool       `json:"is_offseason"`
	OffseasonMonths []int32    `json:"-"` // internal, not serialized
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

// Standing represents a league standing entry.
type Standing struct {
	League      string `json:"league"`
	TeamName    string `json:"team_name"`
	TeamCode    string `json:"team_code"`
	TeamLogo    string `json:"team_logo"`
	Rank        int    `json:"rank"`
	Wins        int    `json:"wins"`
	Losses      int    `json:"losses"`
	Draws       int    `json:"draws"`
	Points      int    `json:"points"`
	GamesPlayed int    `json:"games_played"`
	GoalDiff    int    `json:"goal_diff"`
	Description string `json:"description,omitempty"`
	Form        string `json:"form,omitempty"`
	GroupName   string `json:"group_name,omitempty"`
}

// TeamInfo represents a team entry from the teams table.
type TeamInfo struct {
	League     string `json:"league"`
	ExternalID int    `json:"external_id"`
	Name       string `json:"name"`
	Code       string `json:"code"`
	Logo       string `json:"logo"`
	Country    string `json:"country,omitempty"`
}
