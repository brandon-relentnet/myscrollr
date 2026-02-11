use chrono::{DateTime, Utc};
use secrecy::SecretString;
use serde::Serialize;

#[derive(Clone)]
pub struct Tokens {
    pub access_token: SecretString,
    pub refresh_token: Option<SecretString>,
    pub client_id: String,
    pub client_secret: SecretString,
    pub callback_url: String,
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

    pub fn record_successful_call(&mut self) {
        self.last_api_call = Some(Utc::now());
        self.successful_calls += 1;
    }

    pub fn get_health(&self) -> Self {
        self.clone()
    }
}
