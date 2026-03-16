/**
 * Fantasy channel types — canonical source of truth.
 *
 * Mirrors the Go API's MyLeaguesResponse shape. Fields are nullable
 * where the API may omit them (e.g. during discovery, before import,
 * or for finished leagues with no active matchups/rosters).
 */

// ── Constants ────────────────────────────────────────────────────

export const SPORT_EMOJI: Record<string, string> = {
  nfl: "\u{1F3C8}",
  nba: "\u{1F3C0}",
  nhl: "\u{1F3D2}",
  mlb: "\u26BE",
};

export const GAME_CODE_LABELS: Record<string, string> = {
  nfl: "Football",
  nba: "Basketball",
  nhl: "Hockey",
  mlb: "Baseball",
};

// ── Types ────────────────────────────────────────────────────────

export interface MatchupTeam {
  team_key: string;
  team_id?: number;
  name: string;
  team_logo: string;
  manager_name: string;
  points: number | null;
  projected_points: number | null;
}

export interface Matchup {
  week: number;
  week_start?: string;
  week_end?: string;
  status: string;
  is_playoffs: boolean;
  is_consolation?: boolean;
  is_tied?: boolean;
  winner_team_key: string | null;
  teams: MatchupTeam[];
}

export interface StandingsEntry {
  team_key: string;
  team_id?: number;
  name: string;
  url?: string;
  team_logo: string;
  manager_name: string;
  rank: number | null;
  wins: number;
  losses: number;
  ties: number;
  percentage?: string;
  games_back?: string;
  points_for: number | string;
  points_against?: string;
  streak_type: string;
  streak_value: number;
  playoff_seed: number | null;
  clinched_playoffs: boolean;
  waiver_priority: number | null;
}

export interface RosterPlayer {
  player_key: string;
  player_id?: number;
  name: { full: string; first: string; last: string };
  editorial_team_abbr: string;
  display_position: string;
  selected_position: string;
  image_url: string;
  status: string | null;
  status_full: string | null;
  injury_note: string | null;
  player_points: number | null;
}

export interface RosterEntry {
  team_key: string;
  data: {
    team_key: string;
    team_name: string;
    players: RosterPlayer[];
  };
}

export interface LeagueResponse {
  league_key: string;
  name: string;
  game_code: string;
  season: string;
  team_key: string | null;
  team_name: string | null;
  data: {
    num_teams: number;
    is_finished: boolean;
    current_week: number | null;
    scoring_type: string;
    [k: string]: unknown;
  };
  standings: StandingsEntry[] | null;
  matchups: Matchup[] | null;
  rosters: RosterEntry[] | null;
}

export interface MyLeaguesResponse {
  leagues: LeagueResponse[];
}

// ── Matchup status helpers ───────────────────────────────────────

export function isMatchupLive(matchup: Matchup): boolean {
  return matchup.status === "midevent";
}

export function isMatchupFinal(matchup: Matchup): boolean {
  return matchup.status === "postevent";
}

export interface DiscoveredLeague {
  league_key: string;
  name: string;
  game_code: string;
  season: number;
  num_teams: number;
  is_finished: boolean;
  logo_url?: string;
  url?: string;
}
