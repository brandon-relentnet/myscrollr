package main

import "encoding/xml"

// --- Leagues ---

type FantasyContent struct {
	XMLName xml.Name `xml:"fantasy_content" json:"-"`
	Users   *Users   `xml:"users,omitempty" json:"users,omitempty"`
	League  *YahooLeague `xml:"league,omitempty" json:"league,omitempty"`
	Team    *YahooTeam   `xml:"team,omitempty" json:"team,omitempty"`
}

type Users struct {
	User []User `xml:"user" json:"user"`
}

type User struct {
	Guid  string `xml:"guid" json:"guid"`
	Games Games  `xml:"games" json:"games"`
}

type Games struct {
	Game []YahooGame `xml:"game" json:"game"`
}

type YahooGame struct {
	GameKey string   `xml:"game_key" json:"game_key"`
	GameID  string   `xml:"game_id" json:"game_id"`
	Name    string   `xml:"name" json:"name"`
	Code    string   `xml:"code" json:"code"`
	Leagues *Leagues `xml:"leagues,omitempty" json:"leagues,omitempty"`
}

type Leagues struct {
	League []YahooLeague `xml:"league" json:"league"`
}

type YahooLeague struct {
	LeagueKey      string          `xml:"league_key" json:"league_key"`
	LeagueID       uint32          `xml:"league_id" json:"league_id"`
	Name           string          `xml:"name" json:"name"`
	URL            string          `xml:"url" json:"url"`
	LogoURL        string          `xml:"logo_url" json:"logo_url"`
	DraftStatus    string          `xml:"draft_status" json:"draft_status"`
	NumTeams       uint8           `xml:"num_teams" json:"num_teams"`
	ScoringType    string          `xml:"scoring_type" json:"scoring_type"`
	LeagueType     string          `xml:"league_type" json:"league_type"`
	CurrentWeek    *uint8          `xml:"current_week" json:"current_week,omitempty"`
	StartWeek      *uint8          `xml:"start_week" json:"start_week,omitempty"`
	EndWeek        *uint8          `xml:"end_week" json:"end_week,omitempty"`
	Season         uint16          `xml:"season" json:"season"`
	GameCode       string          `xml:"game_code" json:"game_code"`
	Standings      *Standings      `xml:"standings,omitempty" json:"standings,omitempty"`
}

// --- Standings ---

type Standings struct {
	Teams Teams `xml:"teams" json:"teams"`
}

type Teams struct {
	Team []YahooTeam `xml:"team" json:"team"`
}

type YahooTeam struct {
	TeamKey       string         `xml:"team_key" json:"team_key"`
	TeamID        uint8          `xml:"team_id" json:"team_id"`
	Name          string         `xml:"name" json:"name"`
	URL           string         `xml:"url" json:"url"`
	TeamLogos     TeamLogos      `xml:"team_logos" json:"team_logos"`
	TeamStandings *TeamStandings `xml:"team_standings,omitempty" json:"team_standings,omitempty"`
	Matchups      *Matchups      `xml:"matchups,omitempty" json:"matchups,omitempty"`
	Roster        *Roster        `xml:"roster,omitempty" json:"roster,omitempty"`
}

type TeamLogos struct {
	TeamLogo []TeamLogo `xml:"team_logo" json:"team_logo"`
}

type TeamLogo struct {
	URL string `xml:"url" json:"url"`
}

type TeamStandings struct {
	GamesBack     *string       `xml:"games_back" json:"games_back,omitempty"`
	OutcomeTotals *OutcomeTotals `xml:"outcome_totals" json:"outcome_totals,omitempty"`
	PointsFor     *string       `xml:"points_for" json:"points_for,omitempty"`
	PointsAgainst *string       `xml:"points_against" json:"points_against,omitempty"`
}

type OutcomeTotals struct {
	Wins       uint8   `xml:"wins" json:"wins"`
	Losses     uint8   `xml:"losses" json:"losses"`
	Ties       uint8   `xml:"ties" json:"ties"`
	Percentage *string `xml:"percentage" json:"percentage,omitempty"`
}

// --- Matchups ---

type Matchups struct {
	Matchup []Matchup `xml:"matchup" json:"matchup"`
}

type Matchup struct {
	Week                string `xml:"week" json:"week"`
	WeekStart           string `xml:"week_start" json:"week_start"`
	WeekEnd             string `xml:"week_end" json:"week_end"`
	Status              string `xml:"status" json:"status"`
	IsPlayoffs          string `xml:"is_playoffs" json:"is_playoffs"`
	IsConsolation       string `xml:"is_consolation" json:"is_consolation"`
	IsMatchupOfTheWeek  string `xml:"is_matchup_of_the_week" json:"is_matchup_of_the_week"`
	IsTied              *string `xml:"is_tied" json:"is_tied,omitempty"`
	WinnerTeamKey       *string `xml:"winner_team_key" json:"winner_team_key,omitempty"`
	Teams               Teams   `xml:"teams" json:"teams"`
}

// --- Roster ---

type Roster struct {
	Players Players `xml:"players" json:"players"`
}

type Players struct {
	Player []Player `xml:"player" json:"player"`
}

type Player struct {
	PlayerKey             string            `xml:"player_key" json:"player_key"`
	PlayerID              uint32            `xml:"player_id" json:"player_id"`
	Name                  PlayerName        `xml:"name" json:"name"`
	EditorialTeamAbbr     string            `xml:"editorial_team_abbr" json:"editorial_team_abbr"`
	EditorialTeamFullName string            `xml:"editorial_team_full_name" json:"editorial_team_full_name"`
	UniformNumber         *string           `xml:"uniform_number" json:"uniform_number,omitempty"`
	DisplayPosition       string            `xml:"display_position" json:"display_position"`
	SelectedPosition      SelectedPosition  `xml:"selected_position" json:"selected_position"`
	EligiblePositions     EligiblePositions `xml:"eligible_positions" json:"eligible_positions"`
	ImageURL              string            `xml:"image_url" json:"image_url"`
	IsUndroppable         bool              `xml:"is_undroppable" json:"is_undroppable"`
	PositionType          string            `xml:"position_type" json:"position_type"`
	PlayerPoints          *PlayerPoints     `xml:"player_points,omitempty" json:"player_points,omitempty"`
}

type PlayerName struct {
	Full  string `xml:"full" json:"full"`
	First string `xml:"first" json:"first"`
	Last  string `xml:"last" json:"last"`
}

type SelectedPosition struct {
	Position string `xml:"position" json:"position"`
}

type EligiblePositions struct {
	Position []string `xml:"position" json:"position"`
}

type PlayerPoints struct {
	CoverageType string  `xml:"coverage_type" json:"coverage_type"`
	Week         *uint8  `xml:"week" json:"week,omitempty"`
	Date         *string `xml:"date" json:"date,omitempty"`
	Total        float32 `xml:"total" json:"total"`
}
