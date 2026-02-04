use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use log::{info, error, warn};
use secrecy::SecretString;
use crate::database::{PgPool, YahooUser, get_all_yahoo_users, update_user_sync_time};
use yahoo_fantasy::{api as yahoo_api, types::Tokens};

pub mod log;
pub mod database;
pub mod types;

#[derive(Clone)]
pub struct YahooWorkerState {
    pub db_pool: Arc<PgPool>,
    pub health: Arc<Mutex<yahoo_fantasy::types::YahooHealth>>,
}

impl YahooWorkerState {
    pub async fn new() -> Self {
        let pool = database::initialize_pool().await.expect("Failed to initialize database pool");
        Self {
            db_pool: Arc::new(pool),
            health: Arc::new(Mutex::new(yahoo_fantasy::types::YahooHealth::new())),
        }
    }
}

pub async fn start_active_sync(state: YahooWorkerState) {
    info!("Starting Yahoo Active Sync worker...");
    
    // Ensure tables exist
    if let Err(e) = database::create_tables(&state.db_pool).await {
        error!("Failed to create database tables: {}", e);
        return;
    }

    let client_id = std::env::var("YAHOO_CLIENT_ID").expect("YAHOO_CLIENT_ID must be set");
    let client_secret = std::env::var("YAHOO_CLIENT_SECRET").expect("YAHOO_CLIENT_SECRET must be set");
    let callback_url = std::env::var("YAHOO_CALLBACK_URL").unwrap_or_else(|_| "https://api.myscrollr.relentnet.dev/yahoo/callback".to_string());

    loop {
        match get_all_yahoo_users(&state.db_pool).await {
            Ok(users) => {
                info!("Syncing {} Yahoo users...", users.len());
                for user in users {
                    if let Err(e) = sync_user_data(&user, &state, &client_id, &client_secret, &callback_url).await {
                        error!("Failed to sync user {}: {}", user.guid, e);
                    }
                }
            }
            Err(e) => {
                error!("Failed to fetch users from DB: {}", e);
            }
        }

        // Wait before next sync cycle (e.g., 15 minutes)
        tokio::time::sleep(Duration::from_secs(900)).await;
    }
}

async fn sync_user_data(
    user: &YahooUser, 
    state: &YahooWorkerState,
    client_id: &str,
    client_secret: &str,
    callback_url: &str
) -> anyhow::Result<()> {
    info!("Syncing data for user {}...", user.guid);

    let tokens = Tokens {
        access_token: SecretString::new("".to_string().into_boxed_str()), // Will be refreshed
        refresh_token: Some(SecretString::new(user.refresh_token.clone().into_boxed_str())),
        client_id: client_id.to_string(),
        client_secret: SecretString::new(client_secret.to_string().into_boxed_str()),
        callback_url: callback_url.to_string(),
        access_type: "".to_string(),
    };

    let http_client = yahoo_api::Client::new();

    // 1. Get User Leagues (this also handles token refresh if needed)
    let (leagues, opt_new_tokens) = yahoo_api::get_user_leagues(&tokens, http_client.clone()).await?;
    
    if let Some((_new_access, new_refresh)) = opt_new_tokens {
        database::upsert_yahoo_user(&state.db_pool, user.guid.clone(), new_refresh).await?;
    }

    let all_leagues = [leagues.nba, leagues.nfl, leagues.nhl].concat();
    
    for league in all_leagues {
        let league_key = league.league_key.clone();
        
        // Save league metadata
        database::upsert_yahoo_league(
            &state.db_pool, 
            &user.guid, 
            &league_key, 
            &league.name, 
            &league.game_code, 
            &league.season.to_string(),
            serde_json::to_value(&league)?
        ).await?;

        // 2. Get Standings
        match yahoo_api::get_league_standings(&league_key, http_client.clone(), &tokens).await {
            Ok((standings, _)) => {
                database::upsert_yahoo_standings(&state.db_pool, &league_key, serde_json::to_value(&standings)?).await?;
                info!("Synced standings for league {}", league_key);
                
                // 3. Get Matchups for all teams in the league
                for team in standings {
                    let team_key = team.team_key.clone();
                    match yahoo_api::get_matchups(&team_key, http_client.clone(), &tokens).await {
                        Ok((matchups, _)) => {
                            database::upsert_yahoo_matchups(&state.db_pool, &team_key, serde_json::to_value(&matchups)?).await?;
                        }
                        Err(e) => {
                            warn!("Failed to fetch matchups for team {}: {}", team_key, e);
                        }
                    }
                }
            }
            Err(e) => {
                warn!("Failed to fetch standings for league {}: {}", league_key, e);
            }
        }
    }

    update_user_sync_time(&state.db_pool, user.guid.clone()).await?;
    state.health.lock().await.record_successful_call();
    
    Ok(())
}