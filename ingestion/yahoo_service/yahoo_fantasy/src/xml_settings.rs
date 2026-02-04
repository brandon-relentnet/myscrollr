use serde::{Deserialize, Serialize};


#[derive(Debug, Deserialize)]
pub struct FantasyContent {
    pub league: League
}

#[derive(Debug, Deserialize)]
pub struct League {
    pub game_code: String,
    pub settings: Settings
}

#[derive(Debug, Deserialize)]
pub struct Settings {
    pub stat_categories: StatCategories
}

#[derive(Debug, Deserialize)]
pub struct StatCategories {
    pub stats: Stats
}

#[derive(Debug, Deserialize)]
pub struct Stats {
    pub stat: Vec<Stat>
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Stat {
   pub stat_id: u32,
   pub name: String, 
}