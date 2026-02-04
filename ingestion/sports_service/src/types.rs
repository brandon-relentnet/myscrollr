use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Deserialize)]
pub(crate) struct ScoreboardResponse {
    pub events: Vec<Event>
}

#[derive(Deserialize, Debug)]
pub(crate) struct Event {
    pub id: String,
    pub competitions: Vec<Competition>,
    pub links: Vec<Link>,
    pub date: String,
    pub status: Status
}

#[derive(Deserialize, Debug)]
pub(crate) struct Status {
    #[serde(rename = "type")]
    pub status_type: StatusType
}

#[derive(Deserialize, Debug)]
pub(crate) struct StatusType {
    #[serde(rename = "shortDetail")]
    pub short_detail: String,
    pub state: String,
}

#[derive(Deserialize, Debug)]
pub(crate) struct Link {
    pub href: String,
}

#[derive(Deserialize, Debug)]
pub(crate) struct Competition {
    pub competitors: Vec<Competitor>
}

#[derive(Deserialize, Debug)]
pub(crate) struct Competitor {
    pub team: RTeam,
    pub score: String,
}

#[derive(Deserialize, Debug)]
pub(crate) struct RTeam {
    #[serde(rename = "shortDisplayName")]
    pub short_display_name: String,
    pub logo: String,
}

#[derive(Serialize, Clone)]
pub struct SportsHealth {
    pub status: String,
    pub last_poll_time: Option<DateTime<Utc>>,
    pub polls_completed: u64,
    pub games_ingested: u64,
    pub error_count: u64,
    pub last_error: Option<String>,
    pub last_error_time: Option<DateTime<Utc>>,
    pub active_leagues: Vec<String>,
}

impl SportsHealth {
    pub fn new() -> Self {
        Self {
            status: String::from("healthy"),
            last_poll_time: None,
            polls_completed: 0,
            games_ingested: 0,
            error_count: 0,
            last_error: None,
            last_error_time: None,
            active_leagues: Vec::new(),
        }
    }

    pub(crate) fn update_poll(&mut self, games_count: u64, leagues: Vec<String>) {
        self.last_poll_time = Some(Utc::now());
        self.polls_completed += 1;
        self.games_ingested += games_count;
        self.active_leagues = leagues;
    }

    pub(crate) fn record_error(&mut self, error: String) {
        self.error_count += 1;
        self.last_error = Some(error);
        self.last_error_time = Some(Utc::now());
    }

    pub fn get_health(&self) -> Self {
        self.clone()
    }
}