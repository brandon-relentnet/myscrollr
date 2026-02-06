// Matching Go struct: FantasyContent
export interface FantasyContent {
  users?: Users
  league?: YahooLeague
  team?: YahooTeam
}

export interface Users {
  user: Array<User>
}

export interface User {
  guid: string
  games: Games
}

export interface Games {
  game: Array<YahooGame>
}

export interface YahooGame {
  game_key: string
  game_id: string
  name: string
  code: string
  leagues?: Leagues
}

export interface Leagues {
  league: Array<YahooLeague>
}

export interface YahooLeague {
  league_key: string
  league_id: number
  name: string
  url: string
  logo_url?: string
  draft_status?: string
  num_teams: number
  scoring_type?: string
  league_type?: string
  season?: number
  game_code?: string
  standings?: Standings
}

export interface Standings {
  teams: Teams
}

export interface Teams {
  team: Array<YahooTeam>
}

export interface YahooTeam {
  team_key: string
  team_id: number
  name: string
  url?: string
  team_logos?: TeamLogos
  team_standings?: TeamStandings
  matchups?: Matchups
  roster?: Roster
}

export interface TeamLogos {
  team_logo: Array<TeamLogo>
}

export interface TeamLogo {
  url: string
}

export interface TeamStandings {
  games_back?: string
  outcome_totals?: OutcomeTotals
  points_for?: string
  points_against?: string
}

export interface OutcomeTotals {
  wins: number
  losses: number
  ties: number
  percentage?: string
}

export interface Matchups {
  matchup: Array<Matchup>
}

export interface Matchup {
  week: string
  week_start?: string
  week_end?: string
  status?: string
  is_tied?: string
  winner_team_key?: string
  teams: Teams
}

export interface Roster {
  players: Players
}

export interface Players {
  player: Array<Player>
}

export interface Player {
  player_key: string
  player_id: number
  name: PlayerName
  editorial_team_abbr?: string
  editorial_team_full_name?: string
  display_position?: string
  selected_position?: SelectedPosition
  image_url?: string
  position_type?: string
  player_points?: PlayerPoints
}

export interface PlayerName {
  full: string
  first: string
  last: string
}

export interface SelectedPosition {
  position: string
}

export interface PlayerPoints {
  coverage_type: string
  week?: number
  total: number
}
