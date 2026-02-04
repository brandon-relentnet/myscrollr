use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct FantasyContent {
    pub team: Team,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Team {
    pub matchups: Matchups,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Matchups {
    pub matchup: Vec<Matchup>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Matchup {
    week: String,
    week_start: String,
    week_end: String,
    pub status: String,
    is_playoffs: String,
    is_consolation: String,
    is_matchup_of_the_week: String,
    is_tied: Option<String>,
    winner_team_key: Option<String>,
    pub teams: Teams,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Teams {
    pub team: Vec<MatchTeam>
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MatchTeam {
    pub team_key: String,
    pub name: String,
    pub team_points: TeamPoints
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TeamPoints {
    pub total: f32,
}