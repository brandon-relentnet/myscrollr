use serde::Serialize;
use chrono::{DateTime, Utc};

#[derive(Serialize, Clone)]
pub struct YahooWorkerHealth {
    pub status: String,
    pub last_sync: Option<DateTime<Utc>>,
    pub successful_syncs: u64,
    pub error_count: u64,
    pub last_error: Option<String>,
}

impl YahooWorkerHealth {
    pub fn new() -> Self {
        Self {
            status: String::from("healthy"),
            last_sync: None,
            successful_syncs: 0,
            error_count: 0,
            last_error: None,
        }
    }

    pub fn record_success(&mut self) {
        self.last_sync = Some(Utc::now());
        self.successful_syncs += 1;
        self.status = String::from("healthy");
    }

    pub fn record_error(&mut self, error: String) {
        self.error_count += 1;
        self.last_error = Some(error);
        self.status = String::from("degraded");
    }
}
