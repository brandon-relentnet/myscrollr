use serde::Serialize;
use chrono::{DateTime, Utc};

#[derive(Serialize, Clone)]
pub struct SportsHealth {
    pub status: String,
    pub last_poll: Option<DateTime<Utc>>,
    pub error_count: u64,
    pub last_error: Option<String>,
}

impl SportsHealth {
    pub fn new() -> Self {
        Self {
            status: String::from("healthy"),
            last_poll: None,
            error_count: 0,
            last_error: None,
        }
    }

    pub fn record_success(&mut self) {
        self.last_poll = Some(Utc::now());
        self.status = String::from("healthy");
    }

    pub fn record_error(&mut self, error: String) {
        self.error_count += 1;
        self.last_error = Some(error);
        self.status = String::from("degraded");
    }

    pub fn get_health(&self) -> Self {
        self.clone()
    }
}
