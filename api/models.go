package main

import "time"

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
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Trade struct {
	ID               int       `json:"id"`
	Symbol           string    `json:"symbol"`
	Price            float64   `json:"price"`
	PreviousClose    float64   `json:"previous_close"`
	PriceChange      float64   `json:"price_change"`
	PercentageChange float64   `json:"percentage_change"`
	Direction        string    `json:"direction"`
	LastUpdated      time.Time `json:"last_updated"`
}

type DashboardResponse struct {
	Finance []Trade         `json:"finance"`
	Sports  []Game          `json:"sports"`
	Yahoo   *FantasyContent `json:"yahoo,omitempty"`
}
