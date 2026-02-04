use serde::Serialize;

use crate::xml_settings::Stat;

#[derive(Serialize)]
pub struct LeagueStats {
    pub nfl: Vec<Vec<Stat>>,
    pub nba: Vec<Vec<Stat>>,
    pub nhl: Vec<Vec<Stat>>,
}