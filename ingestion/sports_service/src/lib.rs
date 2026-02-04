use std::{fs, sync::Arc};
use chrono::NaiveDateTime;
use reqwest::Client;
use tokio::sync::Mutex;
use crate::log::{info, warn};
use crate::database::{PgPool, LeagueConfigs, CleanedData, Team, clear_tables, create_tables, get_live_games, upsert_game};

use crate::types::ScoreboardResponse;

mod types;
pub mod log;
pub mod database;

pub use types::SportsHealth;

pub async fn start_sports_service(pool: Arc<PgPool>, health_state: Arc<Mutex<SportsHealth>>) {
    info!("Starting sports service...");

    info!("Creating sports tables...");
    create_tables(&pool).await;

    let file_contents = fs::read_to_string("./configs/leagues.json").unwrap();
    let leagues_to_ingest: Vec<LeagueConfigs> = serde_json::from_str(&file_contents).unwrap();

    info!("Beginning league ingest");
    ingest_data(leagues_to_ingest, &pool, health_state).await;

    let live_games = get_live_games(&pool).await;
    info!("Current live games by league: {}", live_games);
}

pub async fn poll_sports(leagues: Vec<LeagueConfigs>, pool: &Arc<PgPool>, health_state: Arc<Mutex<SportsHealth>>) {
    info!("Frequent poll called for: {:?}", leagues);
    ingest_data(leagues, pool, health_state).await;
}

async fn ingest_data(leagues: Vec<LeagueConfigs>, pool: &Arc<PgPool>, health_state: Arc<Mutex<SportsHealth>>) {
    clear_tables(pool.clone(), leagues.clone()).await;

    let client = Client::new();
    let mut total_games = 0u64;
    let league_names: Vec<String> = leagues.iter().map(|l| l.name.clone()).collect();

    for league in leagues {
        let (name, slug) = (league.name, league.slug);

        let url = format!("https://site.api.espn.com/apis/site/v2/sports/{slug}/scoreboard");
        info!("Fetching data for {name} ({slug})");

        let request_result = client.get(url).build();

        match request_result {
            Ok(request) => {
                match client.execute(request).await {
                    Ok(res) => {
                        match res.json::<ScoreboardResponse>().await {
                            Ok(scoreboard) => {
                                let games = scoreboard.events;
                                info!("Fetched {} games for {name}", games.len());

                                let cleaned_data: Result<Vec<CleanedData>, String> = games.iter().map(|game| {
                                    let competition = &game.competitions[0];
                                    let team_one = &competition.competitors[0];
                                    let team_two = &competition.competitors[1];
                                    let format = "%Y-%m-%dT%H:%M%Z";

                                    let datetime_utc = NaiveDateTime::parse_from_str(&game.date, format)
                                        .map_err(|e| format!("Date parse error for game {}: {}", game.id, e))?
                                        .and_utc();

                                    let score_one = team_one.score.parse::<i32>()
                                        .map_err(|e| format!("Score parse error for team {}: {}", team_one.team.short_display_name, e))?;
                                    let score_two = team_two.score.parse::<i32>()
                                        .map_err(|e| format!("Score parse error for team {}: {}", team_two.team.short_display_name, e))?;

                                    Ok(CleanedData {
                                        league: name.clone(),
                                        external_game_id: game.id.clone(),
                                        link: game.links[0].href.clone(),
                                        home_team: Team {
                                            name: team_one.team.short_display_name.clone(),
                                            logo: team_one.team.logo.clone(),
                                            score: score_one
                                        },
                                        away_team: Team {
                                            name: team_two.team.short_display_name.clone(),
                                            logo: team_two.team.logo.clone(),
                                            score: score_two,
                                        },
                                        start_time: datetime_utc,
                                        short_detail: game.status.status_type.short_detail.clone(),
                                        state: game.status.status_type.state.clone(),
                                    })
                                }).collect();

                                match cleaned_data {
                                    Ok(data) => {
                                        let data_len = data.len();
                                        for game in data {
                                            upsert_game(pool.clone(), game).await;
                                        }
                                        total_games += data_len as u64;
                                        info!("Upserted {} games for league {name}.", data_len);
                                    }
                                    Err(e) => {
                                        warn!("Error processing games for {name}: {}", e);
                                        health_state.lock().await.record_error(format!("Processing error for {}: {}", name, e));
                                    }
                                }
                            }
                            Err(e) => {
                                warn!("Failed to parse response for {name}: {}", e);
                                health_state.lock().await.record_error(format!("Parse error for {}: {}", name, e));
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Failed to execute request for {name}: {}", e);
                        health_state.lock().await.record_error(format!("Request error for {}: {}", name, e));
                    }
                }
            }
            Err(e) => {
                warn!("Failed to build request for {name}: {}", e);
                health_state.lock().await.record_error(format!("Build error for {}: {}", name, e));
            }
        }
    }

    // Update health after successful poll
    health_state.lock().await.update_poll(total_games, league_names);
}


