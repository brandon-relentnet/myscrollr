use std::{sync::Arc, fs};
use reqwest::Client;
use tokio::sync::Mutex;
use crate::log::{error, info};
use crate::database::{PgPool, create_tables, get_tracked_leagues, seed_tracked_leagues, LeagueConfigs, upsert_game};
pub use crate::types::SportsHealth;

pub mod log;
pub mod database;
pub mod types;

pub async fn start_sports_service(pool: Arc<PgPool>, health_state: Arc<Mutex<SportsHealth>>) {
    info!("Starting sports service...");
    create_tables(&pool).await;

    // Seed from JSON if database is empty
    let existing = get_tracked_leagues(pool.clone()).await;
    let leagues = if existing.is_empty() {
        info!("Database tracked_leagues is empty, seeding from local config...");
        if let Ok(file_contents) = fs::read_to_string("./configs/leagues.json") {
            if let Ok(config) = serde_json::from_str::<Vec<LeagueConfigs>>(&file_contents) {
                seed_tracked_leagues(pool.clone(), config.clone()).await;
                config
            } else { Vec::new() }
        } else { Vec::new() }
    } else {
        existing
    };

    if leagues.is_empty() {
        error!("No leagues to track. Sports service idling.");
        return;
    }

    info!("Polling sports data for {} leagues...", leagues.len());
    let client = Client::new();

    for league in leagues {
        match poll_league(&client, &league).await {
            Ok(games) => {
                for game in games {
                    upsert_game(pool.clone(), game).await;
                }
                health_state.lock().await.record_success();
            }
            Err(e) => {
                error!("Error polling league {}: {}", league.name, e);
                health_state.lock().await.record_error(e.to_string());
            }
        }
    }
}

async fn poll_league(client: &Client, league: &LeagueConfigs) -> anyhow::Result<Vec<crate::database::CleanedData>> {
    let url = format!("https://site.api.espn.com/apis/site/v2/sports/{}/{}/scoreboard", league.slug.split('/').next().unwrap_or("football"), league.slug.split('/').last().unwrap_or("nfl"));
    let resp = client.get(url).send().await?.json::<serde_json::Value>().await?;
    
    let mut cleaned_games = Vec::new();
    if let Some(events) = resp.get("events").and_then(|e| e.as_array()) {
        for event in events {
            if let Some(game) = parse_espn_game(event, &league.name) {
                cleaned_games.push(game);
            }
        }
    }
    Ok(cleaned_games)
}

fn parse_espn_game(event: &serde_json::Value, league_name: &str) -> Option<crate::database::CleanedData> {
    let competition = event.get("competitions")?.get(0)?;
    let home_team_node = competition.get("competitors")?.get(0)?;
    let away_team_node = competition.get("competitors")?.get(1)?;

    Some(crate::database::CleanedData {
        league: league_name.to_string(),
        external_game_id: event.get("id")?.as_str()?.to_string(),
        link: event.get("links")?.get(0)?.get("href")?.as_str()?.to_string(),
        home_team: crate::database::Team {
            name: home_team_node.get("team")?.get("displayName")?.as_str()?.to_string(),
            logo: home_team_node.get("team")?.get("logo")?.as_str()?.to_string(),
            score: home_team_node.get("score")?.as_str()?.parse().unwrap_or(0),
        },
        away_team: crate::database::Team {
            name: away_team_node.get("team")?.get("displayName")?.as_str()?.to_string(),
            logo: away_team_node.get("team")?.get("logo")?.as_str()?.to_string(),
            score: away_team_node.get("score")?.as_str()?.parse().unwrap_or(0),
        },
        start_time: chrono::DateTime::parse_from_rfc3339(event.get("date")?.as_str()?).ok()?.with_timezone(&chrono::Utc),
        short_detail: competition.get("status")?.get("type")?.get("shortDetail")?.as_str()?.to_string(),
        state: competition.get("status")?.get("type")?.get("state")?.as_str()?.to_string(),
    })
}
