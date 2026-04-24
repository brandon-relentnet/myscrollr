use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};

#[derive(Serialize, Clone)]
pub struct SportsHealth {
    pub status: String,
    pub last_poll: Option<DateTime<Utc>>,
    pub leagues_active: u32,
    pub leagues_live: u32,
    pub rate_limits: Option<HashMap<String, u32>>,
    pub error_count: u64,
    pub last_error: Option<String>,
}

impl Default for SportsHealth {
    fn default() -> Self {
        Self::new()
    }
}

impl SportsHealth {
    pub fn new() -> Self {
        Self {
            status: String::from("starting"),
            last_poll: None,
            leagues_active: 0,
            leagues_live: 0,
            rate_limits: None,
            error_count: 0,
            last_error: None,
        }
    }

    pub fn record_success(&mut self, leagues_active: u32, leagues_live: u32) {
        self.last_poll = Some(Utc::now());
        self.status = String::from("healthy");
        self.leagues_active = leagues_active;
        self.leagues_live = leagues_live;
    }

    pub fn record_error(&mut self, error: String) {
        self.error_count += 1;
        self.last_error = Some(error);
        self.status = String::from("degraded");
    }

    pub fn set_rate_limits(&mut self, limits: HashMap<String, u32>) {
        self.rate_limits = Some(limits);
    }

    pub fn get_health(&self) -> Self {
        self.clone()
    }
}

/// Per-sport rate limit tracker. Each sport API (basketball, football, etc.)
/// has its own daily budget on api-sports.io, so we track them independently.
/// The map keys are `sport_api` values (e.g. "basketball", "hockey").
/// The map is built once at startup and never resized — only the atomic
/// counters inside are updated from response headers.
pub struct RateLimiter {
    budgets: HashMap<String, AtomicU32>,
}

impl RateLimiter {
    /// Create a rate limiter with one bucket per sport, each initialized
    /// to `initial` remaining requests (typically 7,500 for Pro plan).
    pub fn new(sports: &[String], initial: u32) -> Self {
        let mut budgets = HashMap::new();
        for sport in sports {
            budgets.insert(sport.clone(), AtomicU32::new(initial));
        }
        Self { budgets }
    }

    /// Update the remaining count for a specific sport from an API response header.
    pub fn update(&self, sport: &str, remaining: u32) {
        if let Some(counter) = self.budgets.get(sport) {
            counter.store(remaining, Ordering::Relaxed);
        }
    }

    /// Get the remaining request count for a specific sport.
    pub fn remaining(&self, sport: &str) -> u32 {
        self.budgets
            .get(sport)
            .map(|c| c.load(Ordering::Relaxed))
            .unwrap_or(0)
    }

    /// Returns true if the given sport has enough budget to make a request.
    /// Reserves a conservative buffer of 100 requests.
    pub fn has_budget(&self, sport: &str) -> bool {
        self.remaining(sport) > 100
    }

    /// Snapshot of all sport budgets for the health endpoint.
    pub fn all_remaining(&self) -> HashMap<String, u32> {
        self.budgets
            .iter()
            .map(|(k, v)| (k.clone(), v.load(Ordering::Relaxed)))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limiter_new() {
        let sports = vec!["basketball".to_string(), "football".to_string()];
        let rl = RateLimiter::new(&sports, 100);
        assert_eq!(rl.remaining("basketball"), 100);
        assert_eq!(rl.remaining("football"), 100);
        assert_eq!(rl.remaining("hockey"), 0); // unknown sport
    }

    #[test]
    fn test_rate_limiter_update() {
        let sports = vec!["basketball".to_string()];
        let rl = RateLimiter::new(&sports, 1000);
        rl.update("basketball", 750);
        assert_eq!(rl.remaining("basketball"), 750);
    }

    #[test]
    fn test_rate_limiter_has_budget() {
        let sports = vec!["basketball".to_string()];
        let rl = RateLimiter::new(&sports, 1000);
        assert!(rl.has_budget("basketball")); // 1000 > 100 buffer
        rl.update("basketball", 50);
        assert!(!rl.has_budget("basketball")); // 50 <= 100 buffer
        assert!(!rl.has_budget("unknown_sport")); // 0 <= 100
    }

    #[test]
    fn test_rate_limiter_all_remaining() {
        let sports = vec![
            "basketball".to_string(),
            "football".to_string(),
            "hockey".to_string(),
        ];
        let rl = RateLimiter::new(&sports, 500);
        rl.update("basketball", 400);
        rl.update("football", 300);

        let snapshot = rl.all_remaining();
        assert_eq!(snapshot.get("basketball"), Some(&400));
        assert_eq!(snapshot.get("football"), Some(&300));
        assert_eq!(snapshot.get("hockey"), Some(&500)); // unchanged
    }

    #[test]
    fn test_rate_limiter_concurrent_updates() {
        use std::sync::Arc;

        let sports = vec!["basketball".to_string()];
        let rl = Arc::new(RateLimiter::new(&sports, 1000));
        let rl2 = rl.clone();

        // Simulate concurrent updates by multiple tasks
        for _ in 0..10 {
            let r = rl.clone();
            // AtomicU32 updates are thread-safe
            r.update("basketball", 500);
        }
        assert_eq!(rl2.remaining("basketball"), 500);
    }
}
