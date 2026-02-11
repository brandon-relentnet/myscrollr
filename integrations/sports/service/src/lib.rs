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
    if let Err(e) = create_tables(&pool).await {
        error!("Failed to create database tables: {}", e);
        return;
    }

    // Seed from JSON if database is empty
    let existing = get_tracked_leagues(pool.clone()).await;
    let leagues = if existing.is_empty() {
        info!("Database tracked_leagues is empty, seeding from local config...");
        if let Ok(file_contents) = fs::read_to_string("./configs/leagues.json") {
            if let Ok(config) = serde_json::from_str::<Vec<LeagueConfigs>>(&file_contents) {
                let _ = seed_tracked_leagues(pool.clone(), config.clone()).await;
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

    for league in &leagues {
        match poll_league(&client, league).await {
            Ok(games) => {
                let total = games.len();
                let mut upserted = 0;
                let mut failed = 0;
                for game in games {
                    let game_id = game.external_game_id.clone();
                    match upsert_game(pool.clone(), game).await {
                        Ok(_) => upserted += 1,
                        Err(e) => {
                            error!("[{}] Failed to upsert game {}: {}", league.name, game_id, e);
                            failed += 1;
                        }
                    }
                }
                info!("[{}] Poll complete: {} games found, {} upserted, {} failed", league.name, total, upserted, failed);
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
    let base_url = format!("https://site.api.espn.com/apis/site/v2/sports/{}/scoreboard", league.slug);
    let url = match league.slug.as_str() {
        s if s.contains("college") => {
            format!("{}?groups=80", base_url)
        }
        _ => base_url,
    };
    
    let resp = client.get(&url).send().await?.json::<serde_json::Value>().await?;
    
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
    // --- Required fields: bail with a log message if any are missing ---

    let id = match event.get("id").and_then(|v| v.as_str()) {
        Some(id) if id.len() <= 50 => id,
        Some(id) => {
            error!("[{}] Skipping game: id too long ({})", league_name, id.len());
            return None;
        }
        None => {
            error!("[{}] Skipping game: missing 'id' field", league_name);
            return None;
        }
    };

    let competition = match event.get("competitions").and_then(|c| c.get(0)) {
        Some(c) => c,
        None => {
            error!("[{}] Skipping game {}: missing 'competitions[0]'", league_name, id);
            return None;
        }
    };

    let competitors = match competition.get("competitors").and_then(|c| c.as_array()) {
        Some(c) if c.len() >= 2 => c,
        _ => {
            error!("[{}] Skipping game {}: missing or insufficient 'competitors'", league_name, id);
            return None;
        }
    };

    let home_team_node = &competitors[0];
    let away_team_node = &competitors[1];

    let home_name = match home_team_node.get("team").and_then(|t| t.get("displayName")).and_then(|n| n.as_str()) {
        Some(name) if name.len() <= 100 => name.to_string(),
        Some(name) => {
            error!("[{}] Skipping game {}: home team name too long ({})", league_name, id, name.len());
            return None;
        }
        None => {
            error!("[{}] Skipping game {}: missing home team displayName", league_name, id);
            return None;
        }
    };

    let away_name = match away_team_node.get("team").and_then(|t| t.get("displayName")).and_then(|n| n.as_str()) {
        Some(name) if name.len() <= 100 => name.to_string(),
        Some(name) => {
            error!("[{}] Skipping game {}: away team name too long ({})", league_name, id, name.len());
            return None;
        }
        None => {
            error!("[{}] Skipping game {}: missing away team displayName", league_name, id);
            return None;
        }
    };

    let date_str = event.get("date").and_then(|d| d.as_str());
    let start_time = match date_str.and_then(|d| parse_espn_date(d)) {
        Some(dt) => dt,
        None => {
            error!("[{}] Skipping game {}: missing or unparseable 'date' (raw: {:?})", league_name, id, date_str);
            return None;
        }
    };

    let state = match competition.get("status").and_then(|s| s.get("type")).and_then(|t| t.get("state")).and_then(|s| s.as_str()) {
        Some(s) => s.to_string(),
        None => {
            error!("[{}] Skipping game {}: missing 'status.type.state'", league_name, id);
            return None;
        }
    };

    // --- Optional fields: use None/defaults and warn if missing ---

    let link = event.get("links")
        .and_then(|l| l.get(0))
        .and_then(|l| l.get("href"))
        .and_then(|h| h.as_str())
        .map(|s| s.to_string());

    let home_logo = home_team_node.get("team")
        .and_then(|t| t.get("logo"))
        .and_then(|l| l.as_str())
        .map(|s| s.to_string());

    let home_score = home_team_node.get("score")
        .and_then(|s| s.as_str())
        .and_then(|s| s.parse::<i32>().ok());

    let away_logo = away_team_node.get("team")
        .and_then(|t| t.get("logo"))
        .and_then(|l| l.as_str())
        .map(|s| s.to_string());

    let away_score = away_team_node.get("score")
        .and_then(|s| s.as_str())
        .and_then(|s| s.parse::<i32>().ok());

    let short_detail = competition.get("status")
        .and_then(|s| s.get("type"))
        .and_then(|t| t.get("shortDetail"))
        .and_then(|d| d.as_str())
        .map(|s| s.to_string());

    Some(crate::database::CleanedData {
        league: league_name.to_string(),
        external_game_id: id.to_string(),
        link,
        home_team: crate::database::Team {
            name: home_name,
            logo: home_logo,
            score: home_score,
        },
        away_team: crate::database::Team {
            name: away_name,
            logo: away_logo,
            score: away_score,
        },
        start_time,
        short_detail,
        state,
    })
}

/// Parse ESPN date strings which may omit seconds (e.g. "2026-02-08T23:30Z").
/// `parse_from_rfc3339` requires seconds, so we try that first and fall back
/// to `NaiveDateTime::parse_from_str` with formats ESPN is known to use.
fn parse_espn_date(s: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    // Try strict RFC 3339 first (e.g. "2026-02-08T23:30:00Z")
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&chrono::Utc));
    }

    // ESPN often sends "2026-02-08T23:30Z" (no seconds)
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%MZ") {
        return Some(dt.and_utc());
    }

    // Also handle offset variant without seconds: "2026-02-08T23:30+00:00"
    if let Ok(dt) = chrono::DateTime::parse_from_str(s, "%Y-%m-%dT%H:%M%:z") {
        return Some(dt.with_timezone(&chrono::Utc));
    }

    None
}
