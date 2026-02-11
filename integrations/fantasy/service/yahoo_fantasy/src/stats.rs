use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};

pub trait StatDecode: TryFrom<u32> + Debug + Sized {
    fn expected_sport() -> &'static str;
}

// Global cache for stat mappings
static HOCKEY_STATS: RwLock<Option<HashMap<u32, String>>> = RwLock::new(None);
static BASKETBALL_STATS: RwLock<Option<HashMap<u32, String>>> = RwLock::new(None);
static FOOTBALL_STATS: RwLock<Option<HashMap<u32, String>>> = RwLock::new(None);
static BASEBALL_STATS: RwLock<Option<HashMap<u32, String>>> = RwLock::new(None);

#[derive(Deserialize, Serialize, Debug)]
struct StatPair {
    stat_id: u32,
    name: String,
}

fn load_stat_mappings(game_code: &str) -> HashMap<u32, String> {
    let filename = format!("./configs/stat_pairs_{}.json", game_code);

    let content = std::fs::read_to_string(&filename).unwrap_or_else(|_| {
        eprintln!(
            "Warning: Could not load stat pairs for {}, using empty mappings",
            game_code
        );
        "[]".to_string()
    });

    let stats: Vec<StatPair> = serde_json::from_str(&content).unwrap_or_default();

    stats
        .into_iter()
        .map(|s| {
            // Remove all spaces from the stat name
            let cleaned_name = s.name.replace(" ", "");
            (s.stat_id, cleaned_name)
        })
        .collect()
}

fn get_or_load_stats(
    cache: &RwLock<Option<HashMap<u32, String>>>,
    game_code: &str,
) -> HashMap<u32, String> {
    // Try to read from cache first
    {
        let read_guard = cache.read().unwrap();
        if let Some(ref mappings) = *read_guard {
            return mappings.clone();
        }
    }

    // Cache miss, load the mappings
    let mut write_guard = cache.write().unwrap();

    // Double-check in case another thread loaded it
    if let Some(ref mappings) = *write_guard {
        return mappings.clone();
    }

    // Load and cache
    let mappings = load_stat_mappings(game_code);
    *write_guard = Some(mappings.clone());
    mappings
}

/// Clears the stat cache for a specific sport, forcing a reload on next access
pub fn invalidate_stat_cache(sport: &str) {
    match sport {
        "hockey" | "nhl" => {
            *HOCKEY_STATS.write().unwrap() = None;
        }
        "basketball" | "nba" => {
            *BASKETBALL_STATS.write().unwrap() = None;
        }
        "football" | "nfl" => {
            *FOOTBALL_STATS.write().unwrap() = None;
        }
        "baseball" | "mlb" => {
            *BASEBALL_STATS.write().unwrap() = None;
        }
        _ => {}
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicStat {
    pub id: u32,
    pub name: String,
    pub sport: String,
}

// Hockey Stats - Dynamic implementation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HockeyStats(DynamicStat);

impl StatDecode for HockeyStats {
    fn expected_sport() -> &'static str {
        "hockey"
    }
}

impl TryFrom<u32> for HockeyStats {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        let mappings = get_or_load_stats(&HOCKEY_STATS, "nhl");

        mappings
            .get(&value)
            .map(|name| {
                HockeyStats(DynamicStat {
                    id: value,
                    name: name.clone(),
                    sport: String::from("hockey"),
                })
            })
            .ok_or_else(|| format!("TryFrom not implemented for Hockey Stat ID({value})"))
    }
}

impl std::fmt::Display for HockeyStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0.name.to_lowercase())
    }
}

// Basketball Stats - Dynamic implementation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BasketballStats(DynamicStat);

impl StatDecode for BasketballStats {
    fn expected_sport() -> &'static str {
        "basketball"
    }
}

impl TryFrom<u32> for BasketballStats {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        let mappings = get_or_load_stats(&BASKETBALL_STATS, "nba");

        mappings
            .get(&value)
            .map(|name| {
                BasketballStats(DynamicStat {
                    id: value,
                    name: name.clone(),
                    sport: String::from("basketball"),
                })
            })
            .ok_or_else(|| format!("TryFrom not implemented for Basketball Stat ID({value})"))
    }
}

impl std::fmt::Display for BasketballStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0.name.to_lowercase())
    }
}

// Football Stats - Dynamic implementation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FootballStats(DynamicStat);

impl StatDecode for FootballStats {
    fn expected_sport() -> &'static str {
        "football"
    }
}

impl TryFrom<u32> for FootballStats {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        let mappings = get_or_load_stats(&FOOTBALL_STATS, "nfl");

        mappings
            .get(&value)
            .map(|name| {
                FootballStats(DynamicStat {
                    id: value,
                    name: name.clone(),
                    sport: String::from("football"),
                })
            })
            .ok_or_else(|| format!("TryFrom not implemented for Football Stat ID({value})"))
    }
}

impl std::fmt::Display for FootballStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0.name.to_lowercase())
    }
}

// Baseball Stats - Dynamic implementation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaseballStats(DynamicStat);

impl StatDecode for BaseballStats {
    fn expected_sport() -> &'static str {
        "baseball"
    }
}

impl TryFrom<u32> for BaseballStats {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        let mappings = get_or_load_stats(&BASEBALL_STATS, "mlb");

        mappings
            .get(&value)
            .map(|name| {
                BaseballStats(DynamicStat {
                    id: value,
                    name: name.clone(),
                    sport: String::from("baseball"),
                })
            })
            .ok_or_else(|| format!("TryFrom not implemented for Baseball Stat ID({value})"))
    }
}

impl std::fmt::Display for BaseballStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0.name.to_lowercase())
    }
}
