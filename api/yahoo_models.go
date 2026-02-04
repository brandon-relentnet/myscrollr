package main

import "encoding/xml"

// FantasyContent matches the top-level Yahoo XML
type FantasyContent struct {
	XMLName xml.Name `xml:"fantasy_content" json:"-"`
	Users   Users    `xml:"users" json:"users"`
}

type Users struct {
	User []User `xml:"user" json:"user"`
}

type User struct {
	Games Games `xml:"games" json:"games"`
}

type Games struct {
	Game []YahooGame `xml:"game" json:"game"`
}

type YahooGame struct {
	GameKey string  `xml:"game_key" json:"game_key"`
	GameID  string  `xml:"game_id" json:"game_id"`
	Name    string  `xml:"name" json:"name"`
	Code    string  `xml:"code" json:"code"`
	Leagues Leagues `xml:"leagues" json:"leagues"`
}

type Leagues struct {
	League []YahooLeague `xml:"league" json:"league"`
}

type YahooLeague struct {
	LeagueKey      string `xml:"league_key" json:"league_key"`
	LeagueID       uint32 `xml:"league_id" json:"league_id"`
	Name           string `xml:"name" json:"name"`
	URL            string `xml:"url" json:"url"`
	LogoURL        string `xml:"logo_url" json:"logo_url"`
	DraftStatus    string `xml:"draft_status" json:"draft_status"`
	NumTeams       uint8  `xml:"num_teams" json:"num_teams"`
	ScoringType    string `xml:"scoring_type" json:"scoring_type"`
	LeagueType     string `xml:"league_type" json:"league_type"`
	CurrentWeek    uint8  `xml:"current_week" json:"current_week"`
	StartWeek      uint8  `xml:"start_week" json:"start_week"`
	EndWeek        uint8  `xml:"end_week" json:"end_week"`
	Season         uint16 `xml:"season" json:"season"`
	GameCode       string `xml:"game_code" json:"game_code"`
}
