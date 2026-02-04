use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct FantasyContent {
    pub users: Users,
}

#[derive(Debug, Deserialize)]
pub struct Users {
    pub user: Vec<User>
}

#[derive(Debug, Deserialize, Clone)]
pub struct User {
    pub games: Games
}

#[derive(Debug, Deserialize, Clone)]
pub struct Games {
    pub game: Vec<Game>
}

#[derive(Debug, Deserialize, Clone)]
pub struct Game {
    pub leagues: Option<Leagues>
}

#[derive(Debug, Deserialize, Clone)]
pub struct Leagues {
    pub league: Vec<League>
}

#[derive(Debug, Deserialize, Clone)]
pub struct League {
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
    pub season: u16,
    pub game_code: String,
}