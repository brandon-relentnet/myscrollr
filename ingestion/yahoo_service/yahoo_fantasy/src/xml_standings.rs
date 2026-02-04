use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct FantasyContent {
    pub league: League,
}

#[derive(Debug, Deserialize)]
pub struct League {
    pub standings: Standings,
}

#[derive(Debug, Deserialize)]
pub struct Standings {
    pub teams: Teams,
}

#[derive(Debug, Deserialize)]
pub struct Teams {
    pub team: Vec<Team>,
}

#[derive(Debug, Deserialize)]
pub struct Team {
    pub team_key: String,
    pub team_id: u8,
    pub name: String,
    pub url: String,
    pub team_logos: TeamLogos, 
    pub team_standings: TeamStandings,
}

#[derive(Debug, Deserialize)]
pub struct TeamLogos {
    pub team_logo: Vec<TeamLogo>,
}

#[derive(Debug, Deserialize)]
pub struct TeamLogo {
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct TeamStandings {
    #[serde(default)]
    pub games_back: Option<String>,
    pub outcome_totals: Option<OutcomeTotals>,
    pub points_for: Option<String>,
    pub points_against: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OutcomeTotals {
    pub wins: u8,
    pub losses: u8,
    pub ties: u8,

    #[serde(default)]
    pub percentage: Option<String>,
}