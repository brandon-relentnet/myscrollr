use chrono::{DateTime, Utc};
use secrecy::SecretString;
use serde::Serialize;

use crate::{
    stats::StatDecode,
    xml_roster::{self, PlayerPoints},
};

#[derive(Clone)]
pub struct Tokens {
    pub access_token: SecretString,
    pub refresh_token: Option<SecretString>,
    pub client_id: String,
    pub client_secret: SecretString,
    pub callback_url: String,
    pub access_type: String,
}

#[derive(Serialize, Clone)]
pub struct Leagues {
    pub nba: Vec<UserLeague>,
    pub nfl: Vec<UserLeague>,
    pub nhl: Vec<UserLeague>,
    pub mlb: Vec<UserLeague>,
}

#[derive(Serialize, Debug, Clone)]
pub struct UserLeague {
    pub league_key: String,
    pub league_id: u32,
    pub name: String,
    pub url: String,
    pub logo_url: String,
    pub draft_status: String,
    pub num_teams: u8,
    pub scoring_type: String,
    pub league_type: String,
    pub current_week: Option<u8>,
    pub start_week: Option<u8>,
    pub end_week: Option<u8>,
    pub is_finished: bool,
    pub season: u16,
    pub game_code: String,
}

#[derive(Serialize, Debug)]
pub struct LeagueStandings {
    pub team_key: String,
    pub team_id: u8,
    pub name: String,
    pub url: String,
    pub team_logo: String,
    pub wins: u8,
    pub losses: u8,
    pub ties: u8,
    pub percentage: String,
    pub games_back: String,
    pub points_for: String,
    pub points_against: String,
}

#[derive(Serialize, Debug)]
pub struct Roster<T>
where
    T: StatDecode + std::fmt::Display,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    pub id: u32,
    pub key: String,
    pub name: String,
    #[serde(rename = "firstName")]
    pub first_name: String,
    #[serde(rename = "lastName")]
    pub last_name: String,
    #[serde(rename = "teamAbbr")]
    pub team_abbreviation: String,
    #[serde(rename = "teamFullName")]
    pub team_full_name: String,
    #[serde(rename = "uniformNumber")]
    pub uniform_number: String,
    pub position: String,
    #[serde(rename = "selectedPosition")]
    pub selected_position: String,
    #[serde(rename = "eligiblePositions")]
    pub eligible_positions: Vec<String>,
    #[serde(rename = "imageUrl")]
    pub image_url: String,
    pub headshot: String,
    #[serde(rename = "isUndroppable")]
    pub is_undroppable: bool,
    #[serde(rename = "positionType")]
    pub position_type: String,
    pub stats: Vec<xml_roster::Stat<T>>,
    #[serde(rename = "playerPoints")]
    pub player_points: Option<PlayerPoints>,
}

#[derive(Serialize, Debug)]
pub struct Matchups {
    pub completed_matches: Vec<Matchup>,
    pub active_matches: Vec<Matchup>,
    pub future_matches: Vec<Matchup>,
}

#[derive(Serialize, Debug)]
pub struct Matchup {
    pub teams: Vec<MatchupTeam>,
}

#[derive(Serialize, Debug)]
pub struct MatchupTeam {
    pub team_key: String,
    pub team_name: String,
    pub team_points: f32,
}

#[derive(Serialize, Clone)]
pub struct YahooHealth {
    pub status: String,
    pub oauth_status: String,
    pub last_api_call: Option<DateTime<Utc>>,
    pub successful_calls: u64,
    pub error_count: u64,
    pub last_error: Option<String>,
}

impl YahooHealth {
    pub fn new() -> Self {
        Self {
            status: String::from("healthy"),
            oauth_status: String::from("no_token"),
            last_api_call: None,
            successful_calls: 0,
            error_count: 0,
            last_error: None,
        }
    }

    pub fn update_oauth_status(&mut self, has_token: bool) {
        self.oauth_status = if has_token {
            String::from("authenticated")
        } else {
            String::from("no_token")
        };
    }

    pub fn record_successful_call(&mut self) {
        self.last_api_call = Some(Utc::now());
        self.successful_calls += 1;
    }

    pub fn record_error(&mut self, error: String) {
        self.error_count += 1;
        self.last_error = Some(error);
    }

    pub fn get_health(&self) -> Self {
        self.clone()
    }
}
