/**
 * Fantasy channel types — mirrors the Go API's MyLeaguesResponse shape.
 */

export interface MatchupTeam {
  team_key: string;
  name: string;
  points: number;
  projected_points: number;
  team_logo: string;
  manager_name: string;
}

export interface Matchup {
  week: number;
  status: string;
  teams: MatchupTeam[];
  winner_team_key: string;
  is_playoffs: boolean;
}

export interface StandingsEntry {
  team_key: string;
  name: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  streak_type: string;
  streak_value: number;
  playoff_seed: number;
  clinched_playoffs: boolean;
  manager_name: string;
  waiver_priority: number;
  team_logo: string;
}

export interface RosterPlayer {
  player_key: string;
  name: { full: string; first: string; last: string };
  display_position: string;
  selected_position: string;
  status: string;
  status_full: string;
  injury_note: string;
  player_points: number;
  editorial_team_abbr: string;
  image_url: string;
}

export interface RosterEntry {
  team_key: string;
  data: {
    team_key: string;
    team_name: string;
    players: RosterPlayer[];
  };
}

export interface LeagueData {
  num_teams: number;
  is_finished: boolean;
  current_week: number;
  scoring_type: string;
}

export interface LeagueResponse {
  league_key: string;
  name: string;
  game_code: string;
  season: string;
  team_key: string;
  team_name: string;
  data: LeagueData;
  standings: StandingsEntry[];
  matchups: Matchup[];
  rosters: RosterEntry[];
}

export interface MyLeaguesResponse {
  leagues: LeagueResponse[];
}
